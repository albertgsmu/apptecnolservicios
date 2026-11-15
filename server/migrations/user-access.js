export async function migrateUserAccess(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS user_employees (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    employee_id TEXT UNIQUE NOT NULL REFERENCES employees(id)
  )`)
  await dbRun(`INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)
    ON CONFLICT (version) DO NOTHING`, ['002-user-employee-access', new Date().toISOString()])
}
