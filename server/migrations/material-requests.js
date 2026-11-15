export async function migrateMaterialRequests({ dbRun, dbQuery, dbMode }) {
  if (dbMode === 'postgres') {
    await dbRun("ALTER TABLE worker_reports ADD COLUMN IF NOT EXISTS material_request TEXT NOT NULL DEFAULT '[]'")
  } else {
    const columns = await dbQuery('PRAGMA table_info(worker_reports)')
    if (!columns.some(column => column.name === 'material_request')) await dbRun("ALTER TABLE worker_reports ADD COLUMN material_request TEXT NOT NULL DEFAULT '[]'")
  }
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['012-material-requests', new Date().toISOString()])
}
