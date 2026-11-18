import { createHash, randomUUID } from 'node:crypto'
import { registerWorkerPhotos } from './worker-photos.js'
import { saveAssessments, readAssessments } from './location-assessments.js'
import { permissionRoles } from '../shared/access-policy.js'
import { currentWorkerOrder } from './worker-assignment.js'
import { validateMaterialRequest } from '../shared/material-request.js'

const categories = ['Avance', 'Necesidad', 'Solicitud de material', 'Problema', 'Seguridad']
const urgencies = ['Normal', 'Alta', 'Crítica']
const cleanText = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
const publicSite = text => {
  try { const site = JSON.parse(text || '{}'); return { address: site.address || '', city: site.city || '', unit: site.unit || '' } }
  catch { return { address: '', city: '', unit: '' } }
}

export function registerFieldWork(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction, io }) {
  const readPhotos = registerWorkerPhotos(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction })
  const workerOnly = allowRoles('Trabajador')
  const readers = allowRoles(...permissionRoles.readFieldReports)

  const employeeFor = async userId => dbGet(`SELECT e.id FROM user_employees ue
    JOIN employees e ON e.id=ue.employee_id WHERE ue.user_id=$1 AND e.status='Activo'`, [userId])

  app.get('/api/field-work', authRequired, readers, asyncRoute(async (req, res) => {
    const worker = req.user.role === 'Trabajador'
    const orderId = req.query.orderId
    if (orderId !== undefined && (typeof orderId !== 'string' || !orderId || orderId.length > 100)) return res.status(400).json({ message: 'Selecciona una obra válida.' })
    if (worker && orderId) return res.status(403).json({ message: 'Consulta tus registros desde Mi jornada.' })
    if (orderId && !await dbGet('SELECT id FROM work_orders WHERE id=$1', [orderId])) return res.status(404).json({ message: 'La obra ya no está disponible.' })
    const reportId = req.query.reportId
    if (reportId !== undefined && (typeof reportId !== 'string' || !reportId || reportId.length > 100 || !orderId)) return res.status(400).json({ message: 'Selecciona un reporte y su obra.' })
    if (reportId && !await dbGet('SELECT id FROM worker_reports WHERE id=$1 AND order_id=$2', [reportId, orderId])) return res.status(404).json({ message: 'El reporte ya no está disponible en esta obra.' })
    const scope = worker ? ' WHERE r.user_id=$1' : orderId ? ' WHERE r.order_id=$1' : ''
    const params = worker ? [req.user.id] : orderId ? [orderId] : []
    const reports = await dbQuery(`SELECT r.*, e.name AS employee_name, o.client, o.site_details, u.name AS reviewer_name,u.role AS reviewer_role
      FROM worker_reports r JOIN employees e ON e.id=r.employee_id
      JOIN work_orders o ON o.id=r.order_id LEFT JOIN users u ON u.id=r.reviewed_by${scope}${reportId ? ' AND r.id=$2' : ''}
      ORDER BY r.created_at DESC, r.id LIMIT 100`, reportId ? [...params, reportId] : params)
    const locationAccess = req.user.role === 'Gerente'
    const checkIns = locationAccess ? await dbQuery(`SELECT r.id,r.employee_id,r.order_id,r.kind,r.location_status,r.latitude,r.longitude,r.accuracy,
      r.captured_at,r.notes,r.created_at,e.name AS employee_name,o.client,o.site_details
      FROM worker_check_ins r JOIN employees e ON e.id=r.employee_id
      LEFT JOIN work_orders o ON o.id=r.order_id${orderId ? " WHERE r.order_id=$1 AND r.kind='arrival'" : ''} ORDER BY r.created_at DESC,r.id LIMIT 100`, params) : []
    const totals = await dbGet(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status <> 'Resuelto' THEN 1 ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN status <> 'Resuelto' AND urgency='Crítica' THEN 1 ELSE 0 END),0) AS critical
      FROM worker_reports${worker ? ' WHERE user_id=$1' : orderId ? ' WHERE order_id=$1' : ''}`, params)
    const assessments = await readAssessments(dbQuery, checkIns.map(row => row.id))
    const notifications = worker ? await dbQuery('SELECT * FROM worker_report_notifications WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 100', [req.user.id]) : []
    const unread = worker ? await dbGet('SELECT COUNT(*) AS total FROM worker_report_notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]) : { total: 0 }
    res.set('Cache-Control', 'private, no-store')
    return res.json({
      ...((locationAccess || worker) ? await readPhotos(req.user, orderId) : { photos: [], dailyPhotos: { day: new Date().toISOString().slice(0, 10), required: 3, workers: [] } }),
      currentOrderId: worker ? await currentWorkerOrder(dbQuery, req.user.id) : null,
      unreadNotifications: Number(unread.total),
      notifications: notifications.map(n => ({ id: n.id, reportId: n.report_id, title: n.title, reply: n.reply, status: n.status, reviewerName: n.reviewer_name, reviewerRole: n.reviewer_role, createdAt: n.created_at, readAt: n.read_at })),
      reports: reports.map(row => ({ id: row.id, orderId: row.order_id, employeeName: row.employee_name, client: row.client,
        site: publicSite(row.site_details), category: row.category, urgency: row.urgency, title: row.title,
        details: row.details, materials: JSON.parse(row.material_request || '[]'), requestedAction: row.requested_action, status: row.status, managerReply: row.manager_reply,
        reviewerName: row.reviewer_name, reviewerRole: row.reviewer_role, reviewedAt: row.reviewed_at, createdAt: row.created_at, version: row.version })),
      checkIns: checkIns.map(row => ({ id: row.id, employeeId: row.employee_id, orderId: row.order_id, employeeName: row.employee_name, client: row.client,
        site: publicSite(row.site_details), kind: row.kind, locationStatus: row.location_status, latitude: row.latitude,
        longitude: row.longitude, accuracy: row.accuracy, capturedAt: row.captured_at, notes: row.notes, createdAt: row.created_at, assessments: assessments.get(row.id) ?? [] })),
      totals: { total: Number(totals.total), pending: Number(totals.pending), critical: Number(totals.critical) }, generatedAt: new Date().toISOString(),
    })
  }))

  app.post('/api/field-work/check-ins', authRequired, workerOnly, asyncRoute(async (req, res) => {
    const { kind, orderId = null, location, notes = '' } = req.body ?? {}
    if (!['login', 'arrival'].includes(kind) || !cleanText(notes, 2000) ||
        !location || !['captured', 'denied', 'unavailable', 'timeout'].includes(location.status)) {
      return res.status(400).json({ message: 'Revisa el tipo de registro, la ubicación y las observaciones.' })
    }
    const captured = location.status === 'captured'
    if (captured && (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 ||
        !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 ||
        !Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 100000 ||
        typeof location.capturedAt !== 'string' || !Number.isFinite(Date.parse(location.capturedAt)) ||
        Math.abs(Date.now() - Date.parse(location.capturedAt)) > 300000)) {
      return res.status(400).json({ message: 'La ubicación no es válida o es antigua. Solicita una nueva lectura.' })
    }
    if (kind === 'login' && orderId !== null) return res.status(400).json({ message: 'La ubicación de inicio de sesión no confirma llegada a una obra.' })
    const employee = await employeeFor(req.user.id)
    if (!employee) return res.status(403).json({ message: 'Tu cuenta no está vinculada a un trabajador activo.' })
    if (kind === 'arrival' && (typeof orderId !== 'string' || !await dbGet("SELECT id FROM work_orders WHERE id=$1 AND assigned_to=$2 AND status <> 'Cerrada'", [orderId, employee.id]))) {
      return res.status(404).json({ message: 'Selecciona una orden abierta que tengas asignada.' })
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    const sessionKey = createHash('sha256').update(req.authSession.token_hash).digest('hex')
    const actualStatus = await withTransaction(async tx => {
      const candidates = kind === 'arrival'
        ? [await tx.get('SELECT id,client,site_details FROM work_orders WHERE id=$1', [orderId])]
        : await dbQuery("SELECT id,client,site_details FROM work_orders WHERE assigned_to=$1 AND status <> 'Cerrada'", [employee.id])
      if (kind === 'login') {
        const existing = await tx.get("SELECT id,location_status FROM worker_check_ins WHERE user_id=$1 AND session_key=$2 AND kind='login'", [req.user.id, sessionKey])
        if (existing) {
          if (existing.location_status !== 'captured' && captured) {
            const updated = await tx.run("UPDATE worker_check_ins SET location_status=$1,latitude=$2,longitude=$3,accuracy=$4,captured_at=$5,created_at=$6 WHERE id=$7 AND location_status <> 'captured'", [location.status, location.latitude, location.longitude, location.accuracy, location.capturedAt, now, existing.id])
            if ((updated.rowCount ?? updated.changes) === 1) await saveAssessments(tx, existing.id, location, candidates)
            return 'captured'
          }
          return existing.location_status
        }
      }
      await tx.run(`INSERT INTO worker_check_ins (id,user_id,employee_id,order_id,kind,location_status,latitude,longitude,accuracy,captured_at,notes,created_at,session_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [id, req.user.id, employee.id, orderId, kind, location.status, captured ? location.latitude : null,
        captured ? location.longitude : null, captured ? location.accuracy : null, captured ? location.capturedAt : null, notes.trim(), now, sessionKey])
      if (await tx.get('SELECT id FROM worker_check_ins WHERE id=$1', [id])) await saveAssessments(tx, id, location, candidates)
      return location.status
    })
    return res.status(201).json({ message: actualStatus === 'captured' ? kind === 'arrival' ? 'Llegada declarada guardada con ubicación para el Gerente.' : 'La sesión tiene una ubicación registrada y compartida con el Gerente.' : 'Registro guardado sin coordenadas. No se confirma ubicación.' })
  }))

  app.post('/api/field-work/reports', authRequired, workerOnly, asyncRoute(async (req, res) => {
    const { orderId: requestedOrder, category, urgency, title, details, requestedAction = '' } = req.body ?? {}
    const materials = validateMaterialRequest(category, req.body?.materials)
    if (materials.error) return res.status(400).json({ message: materials.error })
    const orderId = await currentWorkerOrder(dbQuery, req.user.id)
    if (requestedOrder && requestedOrder !== orderId) return res.status(409).json({ message: 'Tu asignación cambió. Actualiza para reportar sobre el trabajo actual.' })
    if (typeof orderId !== 'string' || !categories.includes(category) || !urgencies.includes(urgency) ||
        !cleanText(title, 160, true) || !cleanText(details, 4000, true) || !cleanText(requestedAction, 2000)) {
      return res.status(400).json({ message: 'Selecciona la obra, el tipo y la prioridad, y completa título y descripción.' })
    }
    const employee = await employeeFor(req.user.id)
    if (!employee || !await dbGet("SELECT id FROM work_orders WHERE id=$1 AND assigned_to=$2 AND status <> 'Cerrada'", [orderId, employee.id])) {
      return res.status(404).json({ message: 'Solo puedes reportar sobre una orden abierta asignada a ti.' })
    }
    const id = randomUUID(), now = new Date().toISOString()
    await withTransaction(async tx => {
      await tx.run(`INSERT INTO worker_reports (id,user_id,employee_id,order_id,category,urgency,title,details,requested_action,created_at,material_request)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, req.user.id, employee.id, orderId, category, urgency, title.trim(), details.trim(), requestedAction.trim(), now, JSON.stringify(materials.value)])
      await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, `field_report_created:${id}`, now])
    })
    io?.to('reports:review').emit('field-report-updated', { reportId: id })
    io?.to('reports:review').emit('report-alerts-updated', { kind: 'created', reportId: id })
    return res.status(201).json({ id, message: 'Reporte enviado.' })
  }))

  app.post('/api/field-work/notifications/read-all', authRequired, workerOnly, asyncRoute(async (req, res) => {
    await withTransaction(tx => tx.run('UPDATE worker_report_notifications SET read_at=$1 WHERE user_id=$2 AND read_at IS NULL', [new Date().toISOString(), req.user.id]))
    return res.json({ message: 'Respuestas marcadas como leídas.' })
  }))
  app.patch('/api/field-work/notifications/:id/read', authRequired, workerOnly, asyncRoute(async (req, res) => {
    const changed = await withTransaction(tx => tx.run('UPDATE worker_report_notifications SET read_at=COALESCE(read_at,$1) WHERE id=$2 AND user_id=$3', [new Date().toISOString(), req.params.id, req.user.id]))
    return (changed.rowCount ?? changed.changes) === 1 ? res.json({ message: 'Respuesta leída.' }) : res.status(404).json({ message: 'Notificación no encontrada.' })
  }))

  app.patch('/api/field-work/reports/:id', authRequired, allowRoles(...permissionRoles.reviewFieldReports), asyncRoute(async (req, res) => {
    const { status, reply = '', version } = req.body ?? {}
    if (!['Pendiente', 'En atención', 'Resuelto'].includes(status) || !cleanText(reply, 2000) || !Number.isInteger(version)) return res.status(400).json({ message: 'Revisa el estado y la respuesta.' })
    const now = new Date().toISOString()
    let reportOwner = null
    const changed = await withTransaction(async tx => {
      const report = await tx.get('SELECT user_id,title FROM worker_reports WHERE id=$1', [req.params.id])
      const result = await tx.run(`UPDATE worker_reports SET status=$1,manager_reply=$2,reviewed_by=$3,reviewed_at=$4,version=version+1
        WHERE id=$5 AND version=$6`, [status, reply.trim(), req.user.id, now, req.params.id, version])
      if ((result.rowCount ?? result.changes) !== 1) return false
      reportOwner = report.user_id
      await tx.run(`INSERT INTO worker_report_notifications (id,user_id,report_id,report_version,title,reply,status,reviewer_name,reviewer_role,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), report.user_id, req.params.id, version + 1, report.title, reply.trim(), status, req.user.name, req.user.role, now])
      await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, `field_report_reviewed:${req.params.id}`, now])
      return true
    })
    if (changed) io?.to(`user:${reportOwner}`).emit('field-report-updated', { reportId: req.params.id })
    if (changed) {
      io?.to('reports:review').emit('field-report-updated', { reportId: req.params.id })
      io?.to('reports:review').emit('report-alerts-updated', { kind: 'updated', reportId: req.params.id })
    }
    return changed ? res.json({ message: 'Seguimiento actualizado.' }) : res.status(409).json({ message: 'El reporte cambió o no existe. Actualiza los datos.' })
  }))
}
