import { migrateWorkerPhotos } from '../worker-photos.js'
import { migrateLocationAssessments } from '../location-assessments.js'

export async function migrateFieldWork(dbRun) {
  await migrateWorkerPhotos(dbRun)
  await migrateLocationAssessments(dbRun)
  await dbRun(`CREATE TABLE IF NOT EXISTS worker_check_ins (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    employee_id TEXT NOT NULL REFERENCES employees(id), order_id TEXT REFERENCES work_orders(id),
    kind TEXT NOT NULL, location_status TEXT NOT NULL, latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION, accuracy DOUBLE PRECISION, captured_at TEXT,
    notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, session_key TEXT NOT NULL
  )`)
  await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS worker_login_location_once ON worker_check_ins(user_id, session_key) WHERE kind='login'")
  await dbRun('CREATE INDEX IF NOT EXISTS worker_check_ins_user_idx ON worker_check_ins(user_id, created_at)')
  await dbRun(`CREATE TABLE IF NOT EXISTS worker_reports (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    employee_id TEXT NOT NULL REFERENCES employees(id), order_id TEXT NOT NULL REFERENCES work_orders(id),
    category TEXT NOT NULL, urgency TEXT NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL,
    requested_action TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pendiente',
    manager_reply TEXT NOT NULL DEFAULT '', reviewed_by TEXT REFERENCES users(id),
    reviewed_at TEXT, created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS worker_reports_user_idx ON worker_reports(user_id, created_at)')
  await dbRun('CREATE INDEX IF NOT EXISTS worker_reports_status_idx ON worker_reports(status, urgency)')
  await dbRun(`INSERT INTO schema_migrations (version, applied_at) VALUES ($1,$2)
    ON CONFLICT (version) DO NOTHING`, ['007-field-work', new Date().toISOString()])
}
