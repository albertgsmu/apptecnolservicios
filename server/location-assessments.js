import { assessLocation } from '../shared/geofence.js'

export async function migrateLocationAssessments(dbRun) {
  await dbRun('CREATE TABLE IF NOT EXISTS location_assessments (event_id TEXT PRIMARY KEY, assessments TEXT NOT NULL)')
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['009-location-assessments', new Date().toISOString()])
}

export async function saveAssessments(tx, eventId, location, orders) {
  const assessments = orders.map(order => ({ orderId: order.id, client: order.client,
    ...assessLocation(location, JSON.parse(order.site_details || '{}')) }))
  await tx.run('INSERT INTO location_assessments (event_id,assessments) VALUES ($1,$2) ON CONFLICT (event_id) DO UPDATE SET assessments=excluded.assessments', [eventId, JSON.stringify(assessments)])
}

export async function readAssessments(dbQuery, ids) {
  if (!ids.length) return new Map()
  const rows = await dbQuery(`SELECT event_id,assessments FROM location_assessments WHERE event_id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')})`, ids)
  return new Map(rows.map(row => [row.event_id, JSON.parse(row.assessments)]))
}
