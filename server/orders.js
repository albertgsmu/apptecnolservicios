import { randomUUID } from 'node:crypto'
import { permissionRoles } from '../shared/access-policy.js'
import { hydrateOrderMedia } from './order-attachments.js'
import { emptyOrderSite, validateOrderSite } from '../shared/order-site.js'
import { validGeofence } from '../shared/geofence.js'

export async function initializeOrders(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY, client TEXT NOT NULL, area TEXT NOT NULL,
    priority TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
    assigned_to TEXT REFERENCES employees(id), scheduled_date TEXT NOT NULL,
    observations TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
  )`)
}

const selectOrders = `SELECT o.*, e.name AS assigned_name FROM work_orders o
  LEFT JOIN employees e ON e.id = o.assigned_to`
const serialize = (row) => ({
  id: row.id, client: row.client, area: row.area, priority: row.priority,
  status: row.status, progress: row.progress, assignedTo: row.assigned_to ?? '',
  assignedName: row.assigned_name ?? '', date: row.scheduled_date,
  observations: row.observations, createdAt: row.created_at,
  updatedAt: row.updated_at, version: row.version,
  site: { ...emptyOrderSite(), ...JSON.parse(row.site_details || '{}') },
})

export function registerOrders(app, { dbRun, dbGet, dbQuery, authRequired, allowRoles, asyncRoute, withTransaction, mediaStorage }) {
  const writers = allowRoles(...permissionRoles.manageOrders)
  const readers = allowRoles(...permissionRoles.readOrders)
  app.delete('/api/orders/:id', authRequired, allowRoles(...permissionRoles.deleteOrders), asyncRoute(async (req, res) => {
    const { version } = req.body ?? {}
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ message: 'Actualiza las órdenes antes de borrar.' })
    const files = await dbQuery('SELECT storage_key FROM order_attachments WHERE order_id=$1', [req.params.id])
    try {
      const result = await withTransaction(async tx => {
        // Lock the version displayed in the confirmation before changing related records.
        const locked = await tx.run('UPDATE work_orders SET version=version WHERE id=$1 AND version=$2', [req.params.id, version])
        if ((locked.rowCount ?? locked.changes) !== 1) {
          const exists = await tx.get('SELECT id FROM work_orders WHERE id=$1', [req.params.id])
          return { status: exists ? 409 : 404, message: exists ? 'La orden cambió. Actualiza los datos y vuelve a confirmar.' : 'La orden ya no existe. Actualiza las órdenes.' }
        }
        const order = await tx.get('SELECT id,client FROM work_orders WHERE id=$1', [req.params.id])
        const outstanding = await tx.get(`SELECT id FROM inventory_items WHERE order_id=$1
          UNION ALL SELECT id FROM inventory_allocations WHERE order_id=$1 AND quantity > 0 LIMIT 1`, [order.id])
        if (outstanding) return { status: 409, message: 'Esta orden tiene herramientas o materiales pendientes. Registra la devolución o el consumo en Bodega antes de borrarla.' }
        // Keep stock accounting and its actor/date history after the work order is removed.
        await tx.run('UPDATE inventory_movements SET order_id=NULL,notes=notes || $1 WHERE order_id=$2', [`\nOrden eliminada: ${order.id} · ${order.client}`, order.id])
        await tx.run('DELETE FROM inventory_allocations WHERE order_id=$1', [order.id])
        await tx.run('DELETE FROM worker_report_notifications WHERE report_id IN (SELECT id FROM worker_reports WHERE order_id=$1)', [order.id])
        await tx.run('DELETE FROM location_assessments WHERE event_id IN (SELECT id FROM worker_photos WHERE order_id=$1 UNION ALL SELECT id FROM worker_check_ins WHERE order_id=$1)', [order.id])
        await tx.run('DELETE FROM worker_reports WHERE order_id=$1', [order.id])
        await tx.run('DELETE FROM worker_photos WHERE order_id=$1', [order.id])
        await tx.run('DELETE FROM worker_check_ins WHERE order_id=$1', [order.id])
        await tx.run('DELETE FROM order_attachments WHERE order_id=$1', [order.id])
        await tx.run('DELETE FROM work_orders WHERE id=$1 AND version=$2', [order.id, version])
        await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, `order_deleted:${order.id}`, new Date().toISOString()])
        return { status: 200, message: 'Orden borrada correctamente.' }
      })
      if (result.status === 200) await mediaStorage.removeFiles(files.map(file => file.storage_key))
      return res.status(result.status).json({ message: result.message })
    } catch (error) {
      if (error.code === '23503' || String(error.message).includes('FOREIGN KEY constraint failed')) return res.status(409).json({ message: 'La orden recibió registros relacionados mientras se borraba. Actualiza los datos y vuelve a intentar.' })
      throw error
    }
  }))
  app.post('/api/orders/:id/evidence', authRequired, writers, mediaStorage.middleware, asyncRoute(mediaStorage.cleanupAfter(async (req, res) => {
    const { version, observations } = req.body ?? {}
    if (!Number.isInteger(version) || typeof observations !== 'string' || observations.length > 4000) return res.status(400).json({ message: 'Revisa las instrucciones de trabajo y la versión de la orden.' })
    const saved = await withTransaction(async tx => {
      const updated = await tx.run("UPDATE work_orders SET observations=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4 AND status <> 'Cerrada'", [observations.trim(), new Date().toISOString(), req.params.id, version])
      if ((updated.rowCount ?? updated.changes) !== 1) return false
      await mediaStorage.persist(req, tx, req.params.id)
      await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, `order_site_evidence_updated:${req.params.id}`, new Date().toISOString()])
      return true
    })
    if (!saved) return res.status(409).json({ message: 'La orden cambió, está cerrada o no existe. Actualiza los datos.' })
    return res.json({ message: 'Instrucciones y evidencias guardadas.' })
  })))
  app.patch('/api/orders/:id/location', authRequired, allowRoles('Gerente'), asyncRoute(async (req, res) => {
    const { geofence, version } = req.body ?? {}
    if (!Number.isInteger(version) || (geofence !== null && !validGeofence(geofence))) return res.status(400).json({ message: 'Revisa coordenadas, radio (25 a 2.000 m) y versión.' })
    const current = await dbGet('SELECT * FROM work_orders WHERE id=$1', [req.params.id])
    if (!current) return res.status(404).json({ message: 'Orden no encontrada.' })
    if (current.status === 'Cerrada') return res.status(409).json({ message: 'La orden está cerrada.' })
    const site = { ...JSON.parse(current.site_details || '{}'), geofence: geofence === null ? null : { latitude: geofence.latitude, longitude: geofence.longitude, radius: geofence.radius } }
    const saved = await withTransaction(async tx => {
      const result = await tx.run("UPDATE work_orders SET site_details=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4 AND status <> 'Cerrada'", [JSON.stringify(site), new Date().toISOString(), current.id, version])
      if ((result.rowCount ?? result.changes) === 1) await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, `order_arrival_zone_updated:${current.id}`, new Date().toISOString()])
      return (result.rowCount ?? result.changes) === 1
    })
    if (!saved) return res.status(409).json({ message: 'La orden cambió. Actualiza antes de guardar.' })
    return res.json({ message: 'Ubicación y radio de llegada guardados.' })
  }))
  app.get('/api/orders', authRequired, readers, asyncRoute(async (req, res) => {
    const ownOnly = req.user.role === 'Trabajador'
    const scope = ownOnly ? ' WHERE o.assigned_to IN (SELECT employee_id FROM user_employees WHERE user_id = $1)' : ''
    const orders = (await dbQuery(`${selectOrders}${scope} ORDER BY o.created_at DESC`, ownOnly ? [req.user.id] : [])).map(serialize)
    res.json(await hydrateOrderMedia(orders, dbQuery))
  }))
  app.get('/api/orders/assignees', authRequired, writers, asyncRoute(async (_req, res) => {
    res.json(await dbQuery("SELECT id, name FROM employees WHERE status = 'Activo' ORDER BY name"))
  }))
  app.post('/api/orders', authRequired, allowRoles(...permissionRoles.createOrders), mediaStorage.middleware, asyncRoute(mediaStorage.cleanupAfter(async (req, res) => {
    const { client, area, priority, assignedTo = '', date = '', observations = '' } = req.body ?? {}
    const site = validateOrderSite(req.body?.site)
    if (site.error) return res.status(400).json({ message: site.error })
    if (req.user.role !== 'Gerente' && site.value.geofence) return res.status(403).json({ message: 'Solo Gerencia configura el radio de llegada.' })
    if (req.user.role === 'Secretaria' && assignedTo) return res.status(403).json({ message: 'Secretaría registra la orden; el Gerente asigna el técnico.' })
    if (typeof client !== 'string' || !client.trim() || client.length > 200 ||
        typeof area !== 'string' || !area.trim() || area.length > 120 ||
        !['Alta', 'Media', 'Baja', 'Crítica'].includes(priority) ||
        typeof assignedTo !== 'string' || typeof date !== 'string' ||
        (date !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) ||
        typeof observations !== 'string' || observations.length > 4000) {
      return res.status(400).json({ message: 'Revisa cliente, área, prioridad, fecha y observaciones.' })
    }
    if (assignedTo && !await dbGet("SELECT id FROM employees WHERE id = $1 AND status = 'Activo'", [assignedTo])) {
      return res.status(400).json({ message: 'Selecciona un empleado activo.' })
    }
    const id = `OT-${randomUUID()}`
    const now = new Date().toISOString()
    await withTransaction(async tx => {
      await tx.run(`INSERT INTO work_orders (id, client, area, priority, status, progress, assigned_to, scheduled_date, observations, created_at, updated_at, site_details)
        VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$9,$10)`,
      [id, client.trim(), area.trim(), priority, assignedTo ? 'Asignada' : 'Programada', assignedTo || null, date, observations.trim(), now, JSON.stringify(site.value)])
      await mediaStorage.persist(req, tx, id)
    })
    const orders = await hydrateOrderMedia([serialize(await dbGet(`${selectOrders} WHERE o.id = $1`, [id]))], dbQuery)
    res.status(201).json(orders[0])
  })))
  app.patch('/api/orders/:id', authRequired, allowRoles(...permissionRoles.updateOrders), asyncRoute(async (req, res) => {
    if (req.user.role !== 'Gerente' && (req.body?.status === 'Cerrada' || req.body?.progress === 100)) return res.status(403).json({ message: 'El cierre final de la orden es exclusivo del Gerente.' })
    const current = await dbGet('SELECT * FROM work_orders WHERE id = $1', [req.params.id])
    if (!current) return res.status(404).json({ message: 'Orden no encontrada.' })
    if (req.user.role === 'Trabajador') {
      const link = await dbGet('SELECT employee_id FROM user_employees WHERE user_id = $1', [req.user.id])
      if (!link || link.employee_id !== current.assigned_to) return res.status(404).json({ message: 'Orden no encontrada.' })
      const payload = req.body ?? {}
      if (payload.assignedTo !== current.assigned_to || !['En ejecución', 'Revisión'].includes(payload.status) || payload.progress >= 100) {
        return res.status(403).json({ message: 'Puedes reportar avance y enviar a revisión. La asignación y el cierre corresponden al Gerente.' })
      }
    }
    if (current.status === 'Cerrada') return res.status(409).json({ message: 'La orden está cerrada y no admite cambios.' })
    const { assignedTo, progress, status, version } = req.body ?? {}
    if (!Number.isInteger(version) || version !== current.version) return res.status(409).json({ message: 'La orden cambió. Recarga los datos antes de guardar.' })
    if (typeof assignedTo !== 'string' || !Number.isInteger(progress) || progress < current.progress || progress > 100 ||
        !['Programada', 'Asignada', 'En ejecución', 'Revisión', 'Cerrada'].includes(status)) {
      return res.status(400).json({ message: 'El avance debe estar entre el actual y 100; verifica el estado.' })
    }
    if (assignedTo && !await dbGet("SELECT id FROM employees WHERE id = $1 AND status = 'Activo'", [assignedTo])) {
      return res.status(400).json({ message: 'Selecciona un empleado activo.' })
    }
    if ((!assignedTo && (status !== 'Programada' || progress !== 0)) ||
        (assignedTo && status === 'Programada') ||
        (status === 'Asignada' && progress !== 0) ||
        (status === 'Cerrada' && progress !== 100) || (status !== 'Cerrada' && progress === 100)) {
      return res.status(400).json({ message: 'Asigna un técnico para trabajar. Para cerrar, selecciona Cerrada y avance 100 %.' })
    }
    const result = await dbRun(`UPDATE work_orders SET assigned_to=$1, progress=$2, status=$3, updated_at=$4, version=version+1
      WHERE id=$5 AND version=$6 AND status <> 'Cerrada'`, [assignedTo || null, progress, status, new Date().toISOString(), current.id, version])
    if ((result.rowCount ?? result.changes) !== 1) return res.status(409).json({ message: 'La orden cambió. Recarga antes de guardar.' })
    const orders = await hydrateOrderMedia([serialize(await dbGet(`${selectOrders} WHERE o.id=$1`, [current.id]))], dbQuery)
    res.json(orders[0])
  }))
}
