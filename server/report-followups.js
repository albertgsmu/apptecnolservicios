import { randomUUID } from 'node:crypto'

export const staffPredicate = "u.role IN ('Gerente','Secretaria','Supervisor') AND u.access_blocked=FALSE AND u.archived_at IS NULL"
export const deadlineHours = urgency => urgency === 'Crítica' ? .5 : urgency === 'Alta' ? 4 : 24
export const defaultOwner = tx => tx.get(`SELECT u.id FROM users u WHERE ${staffPredicate} ORDER BY CASE role WHEN 'Secretaria' THEN 0 WHEN 'Supervisor' THEN 1 ELSE 2 END,u.created_at,u.id LIMIT 1`)
export async function queueNotice(tx, { key, userId, reportId, kind }) {
  const now = new Date().toISOString()
  await tx.run(`INSERT INTO push_jobs (id,user_id,report_id,kind,created_at,available_at) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT (id) DO NOTHING`, [key, userId, reportId, kind, now])
}
export async function createReportFollowup(tx, { id, urgency, now }) {
  const owner = await defaultOwner(tx)
  const dueAt = new Date(Date.parse(now) + deadlineHours(urgency) * 3600000).toISOString()
  await tx.run('INSERT INTO report_followups (report_id,assignee_id,due_at,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (report_id) DO NOTHING', [id, owner?.id ?? null, dueAt, now])
  if (owner) await queueNotice(tx, { key: `new:${id}:${owner.id}`, userId: owner.id, reportId: id, kind: 'new' })
  if (urgency === 'Crítica' || !owner) {
    const managers = await tx.get("SELECT id FROM users u WHERE role='Gerente' AND access_blocked=FALSE AND archived_at IS NULL ORDER BY id LIMIT 1")
    if (managers && managers.id !== owner?.id) await queueNotice(tx, { key: `new:${id}:${managers.id}`, userId: managers.id, reportId: id, kind: 'new' })
  }
}

export async function migrateReportFollowups({ dbRun, dbQuery, withTransaction }) {
  await dbRun(`CREATE TABLE IF NOT EXISTS report_followups (
    report_id TEXT PRIMARY KEY REFERENCES worker_reports(id) ON DELETE CASCADE,
    assignee_id TEXT REFERENCES users(id), due_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL, updated_by TEXT REFERENCES users(id), last_reminded_at TEXT
  )`)
  await dbRun(`CREATE TABLE IF NOT EXISTS push_settings (id TEXT PRIMARY KEY, public_key TEXT NOT NULL, private_key TEXT NOT NULL)`)
  await dbRun(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),account_version INTEGER NOT NULL,
    subscription TEXT NOT NULL,created_at TEXT NOT NULL
  )`)
  await dbRun(`CREATE TABLE IF NOT EXISTS push_jobs (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),report_id TEXT REFERENCES worker_reports(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,created_at TEXT NOT NULL,available_at TEXT NOT NULL,lease_until TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,sent_at TEXT,last_error TEXT
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS push_jobs_pending_idx ON push_jobs(sent_at,available_at)')
  await dbRun('CREATE INDEX IF NOT EXISTS report_followups_due_idx ON report_followups(due_at)')
  const missing = await dbQuery("SELECT r.id,r.urgency FROM worker_reports r LEFT JOIN report_followups f ON f.report_id=r.id WHERE f.report_id IS NULL AND r.status <> 'Resuelto'")
  for (const report of missing) await withTransaction(tx => createReportFollowup(tx, { ...report, now: new Date().toISOString() }))
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['016-report-followups-push', new Date().toISOString()])
}

export function registerReportFollowups(app, { authRequired, allowRoles, asyncRoute, dbQuery, dbGet, withTransaction, io, wake }) {
  const reviewers = allowRoles('Gerente', 'Secretaria', 'Supervisor')
  app.get('/api/report-followups/:id', authRequired, reviewers, asyncRoute(async (req, res) => {
    const followup = await dbGet('SELECT f.*,u.name AS assignee_name,r.status FROM report_followups f JOIN worker_reports r ON r.id=f.report_id LEFT JOIN users u ON u.id=f.assignee_id WHERE f.report_id=$1', [req.params.id])
    if (!followup) return res.status(404).json({ message: 'Seguimiento no disponible.' })
    const people = await dbQuery(`SELECT u.id,u.name,u.role FROM users u WHERE ${staffPredicate} ORDER BY u.name,u.id`)
    res.set('Cache-Control', 'no-store').json({ followup, people, overdue: followup.status !== 'Resuelto' && followup.due_at <= new Date().toISOString() })
  }))
  app.patch('/api/report-followups/:id', authRequired, reviewers, asyncRoute(async (req, res) => {
    const { assigneeId, dueAt, version } = req.body ?? {}
    const deadline = typeof dueAt === 'string' ? Date.parse(dueAt) : NaN
    if (typeof assigneeId !== 'string' || !Number.isInteger(version) || !Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now() + 90 * 86400000) return res.status(400).json({ message: 'Selecciona responsable y un plazo futuro de hasta 90 días.' })
    const result = await withTransaction(async tx => {
      const owner = await tx.get(`SELECT u.id FROM users u WHERE u.id=$1 AND ${staffPredicate}`, [assigneeId])
      if (!owner) return 400
      const report = await tx.get('SELECT status,order_id FROM worker_reports WHERE id=$1', [req.params.id])
      if (!report || report.status === 'Resuelto') return 409
      const now = new Date().toISOString()
      const changed = await tx.run('UPDATE report_followups SET assignee_id=$1,due_at=$2,version=version+1,updated_by=$3,updated_at=$4,last_reminded_at=NULL WHERE report_id=$5 AND version=$6', [assigneeId, new Date(deadline).toISOString(), req.user.id, now, req.params.id, version])
      if ((changed.rowCount ?? changed.changes) !== 1) return 409
      await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, `report_assigned:${req.params.id}:${assigneeId}:${new Date(deadline).toISOString()}`, now])
      await queueNotice(tx, { key: `assigned:${req.params.id}:${version + 1}:${assigneeId}`, userId: assigneeId, reportId: req.params.id, kind: 'assigned' })
      return 200
    })
    if (result !== 200) return res.status(result).json({ message: result === 400 ? 'El responsable debe tener una cuenta activa de Secretaría, Supervisor o Gerente.' : 'El reporte cambió o ya está resuelto. Actualiza el seguimiento.' })
    io.to('reports:review').emit('report-alerts-updated', { kind: 'assigned', reportId: req.params.id })
    io.to('reports:review').emit('field-report-updated', { reportId: req.params.id })
    wake()
    res.json({ message: 'Responsable y plazo guardados.' })
  }))
}

export async function collectReminders({ dbQuery, withTransaction, io, now = new Date() }) {
  const nowIso = now.toISOString()
  const unavailable = await dbQuery(`SELECT f.report_id,f.assignee_id,f.version FROM report_followups f JOIN worker_reports r ON r.id=f.report_id LEFT JOIN users u ON u.id=f.assignee_id
    WHERE r.status <> 'Resuelto' AND (u.id IS NULL OR u.access_blocked=TRUE OR u.archived_at IS NOT NULL) LIMIT 100`)
  for (const row of unavailable) await withTransaction(async tx => {
    const owner = await defaultOwner(tx)
    if ((owner?.id ?? null) === row.assignee_id) return
    const updated = await tx.run('UPDATE report_followups SET assignee_id=$1,version=version+1,updated_at=$2 WHERE report_id=$3 AND version=$4', [owner?.id ?? null, nowIso, row.report_id, row.version])
    if ((updated.rowCount ?? updated.changes) !== 1) return
    if (owner) await queueNotice(tx, { key: `assigned:${row.report_id}:${row.version + 1}:${owner.id}`, userId: owner.id, reportId: row.report_id, kind: 'assigned' })
    await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), owner?.id ?? null, `report_auto_assigned:${row.report_id}`, nowIso])
  })
  const due = await dbQuery(`SELECT f.*,r.urgency FROM report_followups f JOIN worker_reports r ON r.id=f.report_id WHERE r.status <> 'Resuelto' AND f.due_at <= $1 ORDER BY f.due_at LIMIT 100`, [nowIso])
  for (const row of due) {
    const interval = row.urgency === 'Crítica' ? 30 : row.urgency === 'Alta' ? 60 : 240
    if (row.last_reminded_at && Date.parse(row.last_reminded_at) + interval * 60000 > now.getTime()) continue
    await withTransaction(async tx => {
      const lease = await tx.run('UPDATE report_followups SET last_reminded_at=$1 WHERE report_id=$2 AND version=$3 AND (last_reminded_at IS NULL OR last_reminded_at <= $4)', [nowIso, row.report_id, row.version, new Date(now.getTime() - interval * 60000).toISOString()])
      if ((lease.rowCount ?? lease.changes) !== 1) return
      let owner = row.assignee_id ? await tx.get(`SELECT u.id FROM users u WHERE u.id=$1 AND ${staffPredicate}`, [row.assignee_id]) : null
      if (!owner) {
        owner = await defaultOwner(tx)
        await tx.run('UPDATE report_followups SET assignee_id=$1,version=version+1,updated_at=$2 WHERE report_id=$3', [owner?.id ?? null, nowIso, row.report_id])
      }
      const bucket = Math.floor(now.getTime() / (interval * 60000))
      if (owner) await queueNotice(tx, { key: `due:${row.report_id}:${bucket}:${owner.id}`, userId: owner.id, reportId: row.report_id, kind: 'overdue' })
      const manager = await tx.get("SELECT u.id FROM users u WHERE u.role='Gerente' AND u.access_blocked=FALSE AND u.archived_at IS NULL ORDER BY u.id LIMIT 1")
      if (manager && manager.id !== owner?.id) await queueNotice(tx, { key: `due:${row.report_id}:${bucket}:${manager.id}`, userId: manager.id, reportId: row.report_id, kind: 'overdue' })
    })
  }
  if (due.length || unavailable.length) io?.to('reports:review').emit('report-alerts-updated', { kind: 'reminder' })
}
