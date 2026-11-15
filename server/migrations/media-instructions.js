export async function migrateMediaInstructions({ dbRun, dbQuery, dbMode }) {
  if (dbMode === 'postgres') {
    await dbRun("ALTER TABLE order_attachments ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT ''")
  } else {
    const columns = await dbQuery('PRAGMA table_info(order_attachments)')
    if (!columns.some(column => column.name === 'instructions')) await dbRun("ALTER TABLE order_attachments ADD COLUMN instructions TEXT NOT NULL DEFAULT ''")
  }
  await dbRun(`INSERT INTO schema_migrations (version, applied_at) VALUES ($1,$2)
    ON CONFLICT (version) DO NOTHING`, ['005-media-instructions', new Date().toISOString()])
}
