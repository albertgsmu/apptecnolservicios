import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { managedRoleNames } from '../shared/access-policy.js'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
export const revokeAccountSockets = (io, id) => { io.to(`user:${id}`).emit('session-revoked'); io.in(`user:${id}`).disconnectSockets(true) }
export const auditAccountAction = (tx, actor, target, action) => tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), actor, `account_${action}:${target}`, new Date().toISOString()])

export function registerAccountManagement(app, { authRequired, allowRoles, asyncRoute, dbQuery, withTransaction, io }) {
  const manager = allowRoles('Gerente')
  const route = handler => asyncRoute(async (req, res) => {
    try { return await handler(req, res) }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message })
      if (error.code === '23505' || String(error.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ message: 'El correo ya está registrado o los datos cambiaron. Actualiza antes de continuar.' })
      throw error
    }
  })
  const getTarget = async (tx, req) => {
    if (!Number.isInteger(req.body?.version)) fail('Actualiza los datos antes de continuar.')
    const user = await tx.get('SELECT * FROM users WHERE id=$1', [req.params.id])
    if (!user) fail('Cuenta no encontrada.', 404)
    if (!managedRoleNames.includes(user.role) || user.id === req.user.id) fail('Esta cuenta de Gerencia está protegida.', 403)
    const locked = await tx.run('UPDATE users SET account_version=account_version+1 WHERE id=$1 AND account_version=$2', [user.id, req.body.version])
    if ((locked.rowCount ?? locked.changes) !== 1) fail('La cuenta cambió. Actualiza antes de continuar.', 409)
    return user
  }
  app.get('/api/users', authRequired, manager, route(async (_req, res) => {
    const rows = await dbQuery(`SELECT u.id,u.name,u.email,u.role,u.access_blocked,u.archived_at,u.account_version,
      e.id AS employee_id,e.area,e.title,e.shift,e.status AS employee_status FROM users u
      LEFT JOIN user_employees ue ON ue.user_id=u.id LEFT JOIN employees e ON e.id=ue.employee_id
      WHERE u.role <> 'Gerente' ORDER BY u.name,u.id`)
    res.set('Cache-Control', 'private, no-store')
    res.json(rows.map(row => ({ id: row.id, name: row.name, email: row.email, role: row.role, blocked: Boolean(row.access_blocked), archivedAt: row.archived_at, version: row.account_version,
      employeeId: row.employee_id ?? null, area: row.area ?? '', title: row.title ?? '', shift: row.shift ?? '', employeeStatus: row.employee_status ?? null })))
  }))
  app.patch('/api/users/:id', authRequired, manager, route(async (req, res) => {
    const { name, email, area, title, shift } = req.body ?? {}
    if (!isText(name, 120) || name.trim().length < 2 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fail('Revisa nombre y correo.')
    if (req.body.role !== undefined) fail('El perfil no se modifica desde esta pantalla.')
    await withTransaction(async tx => {
      const user = await getTarget(tx, req)
      if (user.archived_at) fail('Reactiva la cuenta antes de editarla.', 409)
      const duplicate = await tx.get('SELECT id FROM users WHERE lower(email)=$1 AND id <> $2', [email.trim().toLowerCase(), user.id])
      if (duplicate) fail('Ese correo ya pertenece a otra cuenta.', 409)
      if (user.role === 'Trabajador') {
        if (!isText(area, 120) || !isText(title, 120) || !['Diurno', 'Nocturno', 'Rotativo'].includes(shift)) fail('Completa área, cargo y turno.')
        await tx.run('UPDATE employees SET name=$1,area=$2,title=$3,shift=$4,record_version=record_version+1,"updatedAt"=$5 WHERE id IN (SELECT employee_id FROM user_employees WHERE user_id=$6)', [name.trim(), area.trim(), title.trim(), shift, new Date().toISOString(), user.id])
      }
      await tx.run('UPDATE users SET name=$1,email=$2 WHERE id=$3', [name.trim(), email.trim().toLowerCase(), user.id])
      await tx.run('DELETE FROM auth_sessions WHERE user_id=$1', [user.id])
      await auditAccountAction(tx, req.user.id, user.id, 'edited')
    })
    revokeAccountSockets(io, req.params.id)
    res.json({ message: 'Datos actualizados. La persona debe iniciar sesión de nuevo.' })
  }))
  app.post('/api/users/:id/access', authRequired, manager, route(async (req, res) => {
    const { action } = req.body ?? {}
    if (!['block', 'unblock', 'retire', 'restore', 'logout'].includes(action)) fail('Acción no válida.')
    await withTransaction(async tx => {
      const user = await getTarget(tx, req)
      const employee = await tx.get('SELECT e.id,e.status FROM employees e JOIN user_employees ue ON ue.employee_id=e.id WHERE ue.user_id=$1', [user.id])
      if (action === 'unblock' && (user.archived_at || employee?.status === 'Inactivo')) fail('Reactiva la ficha o la cuenta antes de habilitar el acceso.', 409)
      if (action === 'block' || action === 'unblock') await tx.run('UPDATE users SET access_blocked=$1 WHERE id=$2', [action === 'block', user.id])
      if (action === 'retire' || action === 'restore') {
        await tx.run('UPDATE users SET access_blocked=$1,archived_at=$2 WHERE id=$3', [action === 'retire', action === 'retire' ? new Date().toISOString() : null, user.id])
        if (employee) await tx.run('UPDATE employees SET status=$1,record_version=record_version+1,"updatedAt"=$2 WHERE id=$3', [action === 'retire' ? 'Inactivo' : 'Activo', new Date().toISOString(), employee.id])
      }
      await tx.run('DELETE FROM auth_sessions WHERE user_id=$1', [user.id])
      await auditAccountAction(tx, req.user.id, user.id, action)
    })
    revokeAccountSockets(io, req.params.id)
    res.json({ message: action === 'retire' ? 'Baja registrada. Acceso bloqueado e historial conservado.' : action === 'restore' ? 'Cuenta reactivada. La persona puede iniciar sesión.' : action === 'unblock' ? 'Acceso habilitado.' : action === 'logout' ? 'Todas las sesiones de esta cuenta fueron cerradas.' : 'Acceso bloqueado y sesiones cerradas.' })
  }))
  app.post('/api/users/:id/reset-password', authRequired, manager, route(async (req, res) => {
    const temporaryPassword = randomBytes(18).toString('base64url')
    const hash = await bcrypt.hash(temporaryPassword, 12)
    await withTransaction(async tx => {
      const user = await getTarget(tx, req)
      if (user.archived_at) fail('Reactiva la cuenta antes de restablecer la contraseña.', 409)
      await tx.run('UPDATE users SET password_hash=$1,must_change_password=TRUE WHERE id=$2', [hash, user.id])
      await tx.run('DELETE FROM auth_sessions WHERE user_id=$1', [user.id])
      await auditAccountAction(tx, req.user.id, user.id, 'password_reset')
    })
    revokeAccountSockets(io, req.params.id)
    res.set('Cache-Control', 'no-store')
    res.json({ temporaryPassword, message: 'Contraseña temporal generada. Se exigirá cambiarla al ingresar.' })
  }))
  app.patch('/api/employees/:id', authRequired, manager, route(async (req, res) => {
    const { name, area, title, shift, version } = req.body ?? {}
    if (!isText(name, 120) || !isText(area, 120) || !isText(title, 120) || !['Diurno', 'Nocturno', 'Rotativo'].includes(shift) || !Number.isInteger(version)) fail('Revisa nombre, área, cargo y turno.')
    await withTransaction(async tx => {
      if (await tx.get('SELECT user_id FROM user_employees WHERE employee_id=$1', [req.params.id])) fail('Edita la cuenta vinculada para mantener sus datos sincronizados.', 409)
      const result = await tx.run('UPDATE employees SET name=$1,area=$2,title=$3,shift=$4,record_version=record_version+1,"updatedAt"=$5 WHERE id=$6 AND record_version=$7', [name.trim(), area.trim(), title.trim(), shift, new Date().toISOString(), req.params.id, version])
      if ((result.rowCount ?? result.changes) !== 1) fail('La ficha cambió o no existe. Actualiza los datos.', 409)
      await auditAccountAction(tx, req.user.id, req.params.id, 'employee_edited')
    })
    res.json({ message: 'Ficha actualizada.' })
  }))
}
