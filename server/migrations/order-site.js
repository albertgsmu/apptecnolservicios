export async function migrateOrderSite({ dbRun, dbQuery, dbMode }) {
  if (dbMode === 'postgres') {
    await dbRun("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS site_details TEXT NOT NULL DEFAULT '{}'")
  } else {
    const columns = await dbQuery('PRAGMA table_info(work_orders)')
    if (!columns.some(column => column.name === 'site_details')) await dbRun("ALTER TABLE work_orders ADD COLUMN site_details TEXT NOT NULL DEFAULT '{}'")
  }
  await dbRun(`INSERT INTO schema_migrations (version, applied_at) VALUES ($1,$2)
    ON CONFLICT (version) DO NOTHING`, ['006-order-site-details', new Date().toISOString()])
}
