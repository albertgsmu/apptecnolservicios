function bogotaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = type => parts.find(part => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export async function getDashboardOverview(dbGet, role) {
  const today = bogotaDate()
  // One statement gives every aggregate the same database snapshot, without reading media binaries.
  const row = await dbGet(`WITH orders AS (
    SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status <> 'Cerrada' THEN 1 ELSE 0 END),0) AS open,
      COALESCE(SUM(CASE WHEN status = 'Cerrada' THEN 1 ELSE 0 END),0) AS closed,
      COALESCE(AVG(progress),0) AS average,
      AVG(CASE WHEN status <> 'Cerrada' THEN progress END) AS open_average,
      COALESCE(SUM(CASE WHEN status = 'Revisión' THEN 1 ELSE 0 END),0) AS review,
      COALESCE(SUM(CASE WHEN status <> 'Cerrada' AND assigned_to IS NULL THEN 1 ELSE 0 END),0) AS unassigned,
      COALESCE(SUM(CASE WHEN status <> 'Cerrada' AND priority = 'Crítica' THEN 1 ELSE 0 END),0) AS critical,
      COALESCE(SUM(CASE WHEN status <> 'Cerrada' AND scheduled_date <> '' AND scheduled_date < $1 THEN 1 ELSE 0 END),0) AS overdue
    FROM work_orders
  ), staff AS (
    SELECT COUNT(*) AS staff_total,
      COALESCE(SUM(CASE WHEN status='Activo' THEN 1 ELSE 0 END),0) AS staff_active,
      COALESCE(SUM(CASE WHEN status='Vacaciones' THEN 1 ELSE 0 END),0) AS staff_vacation,
      COALESCE(SUM(CASE WHEN status='Licencia' THEN 1 ELSE 0 END),0) AS staff_leave,
      COALESCE(SUM(CASE WHEN status='Inactivo' THEN 1 ELSE 0 END),0) AS staff_inactive FROM employees
  ), candidates AS (
    SELECT COUNT(*) AS candidates_total,
      COALESCE(SUM(CASE WHEN status='Pendiente' THEN 1 ELSE 0 END),0) AS candidates_pending,
      COALESCE(SUM(CASE WHEN status='Aprobado' THEN 1 ELSE 0 END),0) AS candidates_approved,
      COALESCE(SUM(CASE WHEN status='Rechazado' THEN 1 ELSE 0 END),0) AS candidates_rejected FROM applicants
  ), media AS (
    SELECT COUNT(*) AS media_total, COALESCE(SUM(size_bytes),0) AS media_bytes FROM order_attachments WHERE content IS NOT NULL
  ), field_work AS (
    SELECT COALESCE(SUM(CASE WHEN status <> 'Resuelto' THEN 1 ELSE 0 END),0) AS field_pending,
      COALESCE(SUM(CASE WHEN status <> 'Resuelto' AND urgency='Crítica' THEN 1 ELSE 0 END),0) AS field_critical FROM worker_reports
  ) SELECT * FROM orders CROSS JOIN staff CROSS JOIN candidates CROSS JOIN media CROSS JOIN field_work`, [today])
  const number = key => Number(row[key])
  return {
    generatedAt: new Date().toISOString(), today, timeZone: 'America/Bogota',
    orders: { total: number('total'), open: number('open'), closed: number('closed'), averageProgress: Math.round(number('average')) },
    operations: { openAverageProgress: row.open_average === null ? null : Math.round(number('open_average')), review: number('review'), unassigned: number('unassigned'), critical: number('critical'), overdue: number('overdue') },
    employees: role === 'Gerente' ? { total: number('staff_total'), active: number('staff_active'), vacation: number('staff_vacation'), leave: number('staff_leave'), inactive: number('staff_inactive') } : null,
    applicants: { total: number('candidates_total'), pending: number('candidates_pending'), approved: number('candidates_approved'), rejected: number('candidates_rejected') },
    media: { files: number('media_total'), bytes: number('media_bytes') },
    fieldWork: role === 'Gerente' ? { pending: number('field_pending'), critical: number('field_critical') } : null,
    availability: { attendance: false, contracts: false, financialResults: false },
  }
}

export function registerDashboard(app, { authRequired, allowRoles, asyncRoute, dbGet }) {
  app.get('/api/dashboard/overview', authRequired, allowRoles('Gerente', 'Secretaria', 'Supervisor'), asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'private, no-store')
    return res.json(await getDashboardOverview(dbGet, req.user.role))
  }))
}
