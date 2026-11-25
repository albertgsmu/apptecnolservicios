export async function migrateReportAlerts(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS report_alert_reads (
    user_id TEXT NOT NULL REFERENCES users(id), report_id TEXT NOT NULL REFERENCES worker_reports(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL, PRIMARY KEY(user_id,report_id)
  )`)
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['014-report-alerts', new Date().toISOString()])
}

export function registerReportAlerts(app, { authRequired, allowRoles, asyncRoute, dbQuery, dbGet, withTransaction, io }) {
  const reviewers = allowRoles('Gerente', 'Secretaria', 'Supervisor')
  app.get('/api/report-alerts', authRequired, reviewers, asyncRoute(async (req, res) => {
    const totals = await dbGet(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN a.read_at IS NULL THEN 1 ELSE 0 END),0) AS unread,
      COALESCE(SUM(CASE WHEN r.status='Pendiente' THEN 1 ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN r.urgency='Crítica' THEN 1 ELSE 0 END),0) AS critical,
      COALESCE(SUM(CASE WHEN r.urgency='Alta' THEN 1 ELSE 0 END),0) AS high
      FROM worker_reports r LEFT JOIN report_alert_reads a ON a.report_id=r.id AND a.user_id=$1 WHERE r.status <> 'Resuelto'`, [req.user.id])
    const now = new Date().toISOString()
    const overdue = await dbGet("SELECT COUNT(*) AS total FROM report_followups f JOIN worker_reports r ON r.id=f.report_id WHERE r.status <> 'Resuelto' AND f.due_at <= $1", [now])
    const rows = await dbQuery(`SELECT r.id,r.order_id,r.title,r.category,r.urgency,r.status,r.created_at,e.name AS employee_name,o.client,a.read_at,f.assignee_id,f.due_at,u.name AS assignee_name
      FROM worker_reports r JOIN employees e ON e.id=r.employee_id JOIN work_orders o ON o.id=r.order_id
      LEFT JOIN report_followups f ON f.report_id=r.id LEFT JOIN users u ON u.id=f.assignee_id
      LEFT JOIN report_alert_reads a ON a.report_id=r.id AND a.user_id=$1 WHERE r.status <> 'Resuelto'
      ORDER BY CASE r.urgency WHEN 'Crítica' THEN 0 WHEN 'Alta' THEN 1 ELSE 2 END,
      CASE WHEN a.read_at IS NULL THEN 0 ELSE 1 END,r.created_at DESC,r.id LIMIT 50`, [req.user.id])
    res.set('Cache-Control', 'private, no-store')
    res.json({ totals: { ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value)])), overdue: Number(overdue.total) }, reports: rows.map(row => ({ id: row.id, orderId: row.order_id, title: row.title, category: row.category, urgency: row.urgency, status: row.status, createdAt: row.created_at, employeeName: row.employee_name, client: row.client, unread: !row.read_at, assigneeId: row.assignee_id, assigneeName: row.assignee_name, dueAt: row.due_at, overdue: Boolean(row.due_at && row.due_at <= now) })) })
  }))
  app.patch('/api/report-alerts/:id/read', authRequired, reviewers, asyncRoute(async (req, res) => {
    const report = await dbGet('SELECT id FROM worker_reports WHERE id=$1', [req.params.id])
    if (!report) return res.status(404).json({ message: 'El reporte ya no está disponible.' })
    await withTransaction(tx => tx.run('INSERT INTO report_alert_reads (user_id,report_id,read_at) VALUES ($1,$2,$3) ON CONFLICT (user_id,report_id) DO NOTHING', [req.user.id, report.id, new Date().toISOString()]))
    io.to(`user:${req.user.id}`).emit('report-alerts-updated', { kind: 'read', reportId: report.id })
    res.json({ message: 'Aviso leído. El reporte sigue abierto hasta que se resuelva.' })
  }))
}
