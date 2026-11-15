export async function migrateOrderMedia(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS order_attachments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS order_attachments_order_idx ON order_attachments(order_id)')
  await dbRun(`INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)
    ON CONFLICT (version) DO NOTHING`, ['003-order-media', new Date().toISOString()])
}
