import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import dotenv from 'dotenv'
import pg from 'pg'
import { migrateReportFollowups, createReportFollowup, collectReminders } from '../server/report-followups.js'
import { createPushService } from '../server/push-notifications.js'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
const schema = `verify_followups_${randomBytes(6).toString('hex')}`
let connected = false
try {
  await client.connect(); connected = true
  await client.query('BEGIN')
  await client.query(`CREATE SCHEMA "${schema}"`)
  await client.query(`SET LOCAL search_path TO "${schema}"`)
  for (const table of ['users', 'worker_reports', 'schema_migrations']) await client.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
  const dbGet = async (sql, params = []) => (await client.query(sql, params)).rows[0] ?? null
  const dbRun = (sql, params = []) => client.query(sql, params)
  const dbQuery = async (sql, params = []) => (await client.query(sql, params)).rows
  const withTransaction = async fn => { await client.query('SAVEPOINT test_operation'); try { const result = await fn({ get: dbGet, run: dbRun }); await client.query('RELEASE SAVEPOINT test_operation'); return result } catch (e) { await client.query('ROLLBACK TO SAVEPOINT test_operation'); throw e } }
  await dbRun("INSERT INTO users (id,email,password_hash,name,role) VALUES ('verify-manager','verify-manager@example.test','unused','Gerente prueba','Gerente'),('verify-secretary','verify-secretary@example.test','unused','Secretaria prueba','Secretaria')")
  const services = { dbRun, dbGet, dbQuery, withTransaction }
  await migrateReportFollowups(services)
  await migrateReportFollowups(services)
  const now = new Date().toISOString()
  await dbRun("INSERT INTO worker_reports (id,user_id,employee_id,order_id,category,urgency,title,details,created_at) VALUES ('verify-report','verify-worker','verify-employee','verify-order','Problema','Crítica','Reporte de prueba','Solo esquema temporal',$1)", [now])
  await withTransaction(tx => createReportFollowup(tx, { id: 'verify-report', urgency: 'Crítica', now }))
  assert.equal((await dbGet("SELECT assignee_id FROM report_followups WHERE report_id='verify-report'")).assignee_id, 'verify-secretary')
  await dbRun("UPDATE report_followups SET due_at=$1 WHERE report_id='verify-report'", [new Date(Date.now() - 60000).toISOString()])
  await collectReminders(services)
  await collectReminders(services)
  assert.equal(Number((await dbGet("SELECT COUNT(*) AS n FROM push_jobs WHERE kind='overdue'")).n), 2)
  const service = createPushService({ ...services, autoWake: false })
  assert.equal((await service.keys()).publicKey.length, 87)
  console.log('PostgreSQL: migración repetible, asignación, plazos, recordatorios sin duplicados y claves persistentes verificados. Todos los cambios se revierten; no se alteran registros reales.')
} finally {
  if (connected) await client.query('ROLLBACK')
  await client.end()
}
