export async function migrateAccountManagement({ dbRun, dbQuery, dbGet, dbMode }) {
  const version = '015-account-management'
  if (await dbGet('SELECT version FROM schema_migrations WHERE version=$1', [version])) return
  const additions = {
    users: [['access_blocked', 'BOOLEAN NOT NULL DEFAULT FALSE'], ['archived_at', 'TEXT'], ['account_version', 'INTEGER NOT NULL DEFAULT 1']],
    auth_sessions: [['account_version', 'INTEGER NOT NULL DEFAULT 1']],
    employees: [['record_version', 'INTEGER NOT NULL DEFAULT 1']],
  }
  for (const [table, columns] of Object.entries(additions)) {
    const existing = dbMode === 'sqlite' ? new Set((await dbQuery(`PRAGMA table_info(${table})`)).map(column => column.name)) : null
    for (const [name, type] of columns) {
      if (existing?.has(name)) continue
      await dbRun(`ALTER TABLE ${table} ADD COLUMN ${dbMode === 'postgres' ? 'IF NOT EXISTS ' : ''}${name} ${type}`)
    }
  }
  await dbRun("UPDATE users SET access_blocked=TRUE WHERE id IN (SELECT ue.user_id FROM user_employees ue JOIN employees e ON e.id=ue.employee_id WHERE e.status='Inactivo')")
  await dbRun('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE access_blocked=TRUE)')
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', [version, new Date().toISOString()])
}
