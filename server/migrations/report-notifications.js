export async function migrateReportNotifications(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS worker_report_notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), report_id TEXT NOT NULL REFERENCES worker_reports(id),
    report_version INTEGER NOT NULL, title TEXT NOT NULL, reply TEXT NOT NULL, status TEXT NOT NULL,
    reviewer_name TEXT NOT NULL, reviewer_role TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
    UNIQUE(report_id,report_version)
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS worker_report_notification_user_idx ON worker_report_notifications(user_id,created_at)')
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['011-report-notifications', new Date().toISOString()])
}
