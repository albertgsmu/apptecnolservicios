export async function migrateDatabaseMedia({ dbRun, dbQuery, dbMode }) {
  if (dbMode === 'postgres') {
    await dbRun('ALTER TABLE order_attachments ADD COLUMN IF NOT EXISTS content BYTEA')
    await dbRun('ALTER TABLE order_attachments ADD COLUMN IF NOT EXISTS content_sha256 TEXT')
  } else {
    const columns = await dbQuery('PRAGMA table_info(order_attachments)')
    if (!columns.some(column => column.name === 'content')) await dbRun('ALTER TABLE order_attachments ADD COLUMN content BLOB')
    if (!columns.some(column => column.name === 'content_sha256')) await dbRun('ALTER TABLE order_attachments ADD COLUMN content_sha256 TEXT')
  }
  await dbRun(`INSERT INTO schema_migrations (version, applied_at) VALUES ($1,$2)
    ON CONFLICT (version) DO NOTHING`, ['004-database-media', new Date().toISOString()])
}
