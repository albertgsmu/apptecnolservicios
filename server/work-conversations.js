import { permissionRoles } from '../shared/access-policy.js'
import { currentWorkerOrder } from './worker-assignment.js'

const timeline = `SELECT '0-report-' || r.id AS event_id,r.id AS report_id,'report' AS kind,r.created_at,
  e.name AS author_name,'Trabajador' AS author_role,r.details AS body,r.title,r.category,r.urgency,r.status,
  r.material_request,r.requested_action,NULL AS notification_id,NULL AS recipient_id
  FROM worker_reports r JOIN employees e ON e.id=r.employee_id WHERE r.order_id=$1
  UNION ALL SELECT '1-reply-' || n.id,n.report_id,'reply',n.created_at,n.reviewer_name,n.reviewer_role,n.reply,n.title,
  r.category,r.urgency,n.status,'[]','',n.id,n.user_id FROM worker_report_notifications n JOIN worker_reports r ON r.id=n.report_id WHERE r.order_id=$1
  UNION ALL SELECT '2-legacy-' || r.id,r.id,'reply',COALESCE(r.reviewed_at,r.created_at),COALESCE(u.name,'Equipo responsable'),
  COALESCE(u.role,'Gerente'),r.manager_reply,r.title,r.category,r.urgency,r.status,'[]','',NULL,NULL
  FROM worker_reports r LEFT JOIN users u ON u.id=r.reviewed_by WHERE r.order_id=$1 AND r.manager_reply <> ''
  AND NOT EXISTS (SELECT 1 FROM worker_report_notifications n WHERE n.report_id=r.id AND n.report_version=r.version)`
const serialize = (row, userId) => ({ id: row.event_id, reportId: row.report_id, kind: row.kind, createdAt: row.created_at,
  authorName: row.author_name, role: row.author_role, body: row.body, title: row.title, category: row.category,
  urgency: row.urgency, status: row.status, materials: JSON.parse(row.material_request || '[]'), requestedAction: row.requested_action,
  notificationId: row.notification_id, canMarkRead: row.recipient_id === userId })

export async function notifyWorkConversation(io, dbQuery, orderId) {
  if (!io) return
  const participants = await dbQuery(`SELECT DISTINCT u.id FROM users u WHERE u.role='Trabajador' AND (
    EXISTS (SELECT 1 FROM worker_reports r WHERE r.order_id=$1 AND r.user_id=u.id)
    OR EXISTS (SELECT 1 FROM user_employees ue JOIN work_orders o ON o.assigned_to=ue.employee_id WHERE o.id=$1 AND ue.user_id=u.id))`, [orderId])
  for (const user of participants) io.to(`user:${user.id}`).emit('field-report-updated', { orderId })
}

export function registerWorkConversations(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction }) {
  const readers = allowRoles(...permissionRoles.readFieldReports)
  const membership = `EXISTS (SELECT 1 FROM user_employees ue WHERE ue.user_id=$1 AND ue.employee_id=o.assigned_to)
    OR EXISTS (SELECT 1 FROM worker_reports r WHERE r.order_id=o.id AND r.user_id=$1)`
  const findOrder = (req) => dbGet(`SELECT o.*,e.name AS assigned_name FROM work_orders o LEFT JOIN employees e ON e.id=o.assigned_to
    WHERE o.id=$${req.user.role === 'Trabajador' ? 2 : 1}${req.user.role === 'Trabajador' ? ` AND (${membership})` : ''}`,
  req.user.role === 'Trabajador' ? [req.user.id, req.params.orderId] : [req.params.orderId])
  app.get('/api/work-conversations', authRequired, readers, asyncRoute(async (req, res) => {
    const worker = req.user.role === 'Trabajador'
    const rows = await dbQuery(`SELECT o.id,o.client,o.area,o.status,o.site_details FROM work_orders o
      ${worker ? `WHERE (${membership})` : ''} ORDER BY o.created_at DESC,o.id`, worker ? [req.user.id] : [])
    res.set('Cache-Control', 'private, no-store')
    res.json(rows.map(row => ({ id: row.id, client: row.client, area: row.area, status: row.status, address: JSON.parse(row.site_details || '{}').address ?? '' })))
  }))
  app.get('/api/work-conversations/:orderId', authRequired, readers, asyncRoute(async (req, res) => {
    const order = await findOrder(req)
    if (!order) return res.status(404).json({ message: 'Esta obra no está disponible para tu cuenta.' })
    const before = req.query.before, focusReportId = req.query.focusReportId
    if ((before !== undefined && (typeof before !== 'string' || before.length > 160)) || (focusReportId !== undefined && (typeof focusReportId !== 'string' || focusReportId.length > 100))) return res.status(400).json({ message: 'Referencia de conversación inválida.' })
    let cursor = '', params = [order.id]
    if (before) {
      const anchor = await dbGet(`WITH events AS (${timeline}) SELECT created_at,event_id FROM events WHERE event_id=$2`, [order.id, before])
      if (!anchor) return res.status(404).json({ message: 'El mensaje de referencia no pertenece a esta obra.' })
      cursor = ' WHERE created_at < $2 OR (created_at=$2 AND event_id < $3)'; params = [...params, anchor.created_at, anchor.event_id]
    }
    const rows = await dbQuery(`WITH events AS (${timeline}) SELECT * FROM events${cursor} ORDER BY created_at DESC,event_id DESC LIMIT 51`, params)
    const reports = await dbQuery('SELECT id,title,status,version FROM worker_reports WHERE order_id=$1 ORDER BY created_at DESC,id DESC', [order.id])
    const focus = focusReportId ? await dbGet(`WITH events AS (${timeline}) SELECT * FROM events WHERE kind='report' AND report_id=$2`, [order.id, focusReportId]) : null
    if (focusReportId && !focus) return res.status(404).json({ message: 'El reporte no pertenece a esta obra.' })
    const unread = req.user.role === 'Trabajador' ? await dbGet('SELECT COUNT(*) AS total FROM worker_report_notifications n JOIN worker_reports r ON r.id=n.report_id WHERE r.order_id=$1 AND n.user_id=$2 AND n.read_at IS NULL', [order.id, req.user.id]) : { total: 0 }
    const assigned = req.user.role === 'Trabajador' ? await dbGet("SELECT e.id FROM user_employees ue JOIN employees e ON e.id=ue.employee_id WHERE ue.user_id=$1 AND e.id=$2 AND e.status='Activo'", [req.user.id, order.assigned_to]) : null
    res.set('Cache-Control', 'private, no-store')
    res.json({ order: { id: order.id, client: order.client, area: order.area, address: JSON.parse(order.site_details || '{}').address ?? '', status: order.status, assignedName: order.assigned_name ?? '' },
      events: rows.slice(0, 50).reverse().map(row => serialize(row, req.user.id)), hasMore: rows.length > 50, reports,
      focus: focus ? serialize(focus, req.user.id) : null, unread: Number(unread.total), canReport: Boolean(assigned) && order.status !== 'Cerrada' && await currentWorkerOrder(dbQuery, req.user.id) === order.id })
  }))
  app.patch('/api/work-conversations/:orderId/read', authRequired, allowRoles('Trabajador'), asyncRoute(async (req, res) => {
    const order = await findOrder(req)
    if (!order) return res.status(404).json({ message: 'Esta obra no está disponible para tu cuenta.' })
    const ids = req.body?.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || id.length > 100)) return res.status(400).json({ message: 'Selecciona las respuestas de la conversación.' })
    await withTransaction(tx => tx.run(`UPDATE worker_report_notifications SET read_at=COALESCE(read_at,$1) WHERE user_id=$2
      AND report_id IN (SELECT id FROM worker_reports WHERE order_id=$3) AND id IN (${ids.map((_, i) => '$'+(i+4)).join(',')})`, [new Date().toISOString(), req.user.id, order.id, ...ids]))
    res.json({ message: 'Respuestas leídas en esta obra.' })
  }))
}
