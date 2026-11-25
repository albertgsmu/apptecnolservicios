import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { createPushService } from './push-notifications.js'
import { collectReminders } from './report-followups.js'
import * as webpush from 'web-push'

test('report owners, deadlines, persistent reminders, subscriptions and safe push delivery', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jp-user-access-'))
  const databasePath = path.join(directory, 'access.sqlite')
  const listener = net.createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const password = randomBytes(24).toString('hex')
  const encryptionKey = randomBytes(32).toString('base64')
  process.env.MFA_ENCRYPTION_KEY = encryptionKey
  const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env,
    NODE_ENV: 'test', DATABASE_URL: '', SQLITE_DB_PATH: databasePath,
    ORDER_UPLOAD_DIR: path.join(directory, 'uploads'),
    MFA_ENCRYPTION_KEY: encryptionKey, MANAGER_MFA_REQUIRED: 'false',
    INITIAL_ADMIN_EMAIL: 'manager@example.test', INITIAL_ADMIN_PASSWORD: password,
    INITIAL_ADMIN_NAME: 'Test manager', PORT: String(port), ALLOWED_ORIGINS: 'http://localhost:5173',
  }, stdio: 'ignore' })
  let db
  t.after(async () => {
    if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited }
    await db?.close()
    await rm(directory, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${port}/api`
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break } } catch { /* Wait for API. */ }
    await delay(100)
  }
  assert.ok(ready, 'API starts')
  const client = () => {
    const cookies = new Map()
    return async (route, method = 'GET', body, extraHeaders = {}) => {
      const multipart = body instanceof FormData
      const response = await fetch(base + route, { method, headers: {
        Origin: 'http://localhost:5173', ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(cookies.has('jp_csrf') ? { 'X-CSRF-Token': cookies.get('jp_csrf') } : {}),
        ...extraHeaders,
      }, ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) })
      for (const header of response.headers.getSetCookie()) {
        const match = header.match(/^(jp_session|jp_csrf)=([^;]*)/)
        if (match) cookies.set(match[1], match[2])
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      return { status: response.status, headers: response.headers, body: bytes.length ? response.headers.get('Content-Type')?.includes('application/json') ? JSON.parse(bytes.toString('utf8')) : bytes : null }
    }
  }
  const manager = client()
  assert.equal((await manager('/auth/login', 'POST', { email: 'manager@example.test', password })).body.nextStep, 'authenticated')
  db = await open({ filename: databasePath, driver: sqlite3.Database })
  const query = sql => sql.replace(/\$(\d+)/g, '?$1')
  const dbGet = (sql, params = []) => db.get(query(sql), params)
  const dbRun = (sql, params = []) => db.run(query(sql), params)
  const dbQuery = (sql, params = []) => db.all(query(sql), params)
  const withTransaction = async fn => { await db.run('BEGIN IMMEDIATE'); try { const result = await fn({ get: dbGet, run: dbRun }); await db.run('COMMIT'); return result } catch (e) { await db.run('ROLLBACK'); throw e } }
  const managerId = (await db.get("SELECT id FROM users WHERE role='Gerente'")).id
  const secretaryCreated = await manager('/users', 'POST', { name: 'Secretaria prueba', email: 'secretary.followups@example.test', password, role: 'Secretaria' })
  const secretaryId = secretaryCreated.body.user.id
  const supervisorCreated = await manager('/users', 'POST', { name: 'Supervisor prueba', email: 'supervisor.followups@example.test', password, role: 'Supervisor' })
  const supervisorId = supervisorCreated.body.user.id
  const secretary = client(), supervisor = client(), worker = client()
  await secretary('/auth/login', 'POST', { email: 'secretary.followups@example.test', password })
  await supervisor('/auth/login', 'POST', { email: 'supervisor.followups@example.test', password })
  await db.run('INSERT INTO employees (id,name,area,title,status,shift,lastEntry) VALUES (?,?,?,?,?,?,?)', ['followup-worker', 'Trabajador', 'Obras', 'Tecnico', 'Activo', 'Diurno', ''])
  const workerCreated = await manager('/users', 'POST', { name: 'Trabajador', email: 'worker.followups@example.test', password, role: 'Trabajador', employeeId: 'followup-worker' })
  const workerId = workerCreated.body.user.id
  const site = { address: 'Calle 72 # 10-34', city: 'Bogotá', contactName: 'Contacto', contactPhone: '3001234567' }
  const order = await manager('/orders', 'POST', { client: 'Obra seguimiento', area: 'Obras', priority: 'Alta', date: '2999-01-01', assignedTo: 'followup-worker', site })
  assert.equal(order.status, 201, JSON.stringify(order.body))
  await worker('/auth/login', 'POST', { email: 'worker.followups@example.test', password })
  assert.equal((await worker('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() } })).status, 200)
  const report = await worker('/field-work/reports', 'POST', { orderId: order.body.id, category: 'Problema', urgency: 'Crítica', title: 'Trabajo detenido', details: 'Falta una pieza.' })
  assert.equal(report.status, 201)
  const id = report.body.id
  const followup = () => manager(`/report-followups/${id}`)
  let data = (await followup()).body
  assert.equal(data.followup.assignee_id, secretaryId, 'Secretariat owns new reports')
  assert.ok(Date.parse(data.followup.due_at) > Date.now() + 29 * 60000)
  assert.equal((await worker(`/report-followups/${id}`)).status, 403)
  assert.equal((await client()('/push/public-key')).status, 401)
  const dueAt = new Date(Date.now() + 3600000).toISOString()
  const assignment = { assigneeId: supervisorId, dueAt, version: data.followup.version }
  assert.equal((await secretary(`/report-followups/${id}`, 'PATCH', assignment, { 'X-CSRF-Token': '' })).status, 403)
  assert.equal((await manager(`/report-followups/${id}`, 'PATCH', { ...assignment, assigneeId: workerId })).status, 400)
  assert.equal((await secretary(`/report-followups/${id}`, 'PATCH', assignment)).status, 200)
  assert.equal((await manager(`/report-followups/${id}`, 'PATCH', assignment)).status, 409)
  assert.equal((await followup()).body.followup.assignee_id, supervisorId)
  const publicKey = (await manager('/push/public-key')).body.publicKey
  assert.equal(publicKey.length, 87)
  assert.equal((await manager('/push/public-key')).body.publicKey, publicKey)
  const subscription = suffix => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${suffix}`, keys: { p256dh: webpush.generateVAPIDKeys().publicKey, auth: randomBytes(16).toString('base64url') } })
  const managerSub = subscription('manager'), supervisorSub = subscription('supervisor'), workerSub = subscription('worker')
  assert.equal((await manager('/push/subscribe', 'POST', { ...managerSub, endpoint: 'http://127.0.0.1/private' })).status, 400, 'Push endpoint cannot target an internal server')
  assert.equal((await manager('/push/subscribe', 'POST', { ...managerSub, endpoint: 'https://evil.example.test/push' })).status, 400)
  assert.equal((await manager('/push/subscribe', 'POST', managerSub, { 'X-CSRF-Token': '' })).status, 403)
  assert.equal((await manager('/push/subscribe', 'POST', managerSub)).status, 200)
  assert.equal((await supervisor('/push/subscribe', 'POST', supervisorSub)).status, 200)
  assert.equal((await worker('/push/subscribe', 'POST', workerSub)).status, 200)
  assert.equal((await manager('/push/status', 'POST', { endpoint: managerSub.endpoint })).body.active, true)
  assert.equal((await secretary('/push/status', 'POST', { endpoint: managerSub.endpoint })).body.active, false)
  const stored = await db.get('SELECT subscription FROM push_subscriptions WHERE endpoint=?', [managerSub.endpoint])
  assert.equal(stored.subscription.includes(managerSub.keys.auth), false, 'Subscription credentials are encrypted at rest')
  await db.run('UPDATE push_jobs SET sent_at=?', [new Date().toISOString()])
  await db.run('UPDATE report_followups SET due_at=? WHERE report_id=?', [new Date(Date.now() - 60000).toISOString(), id])
  const services = { dbGet, dbRun, dbQuery, withTransaction }
  await collectReminders(services)
  await collectReminders(services)
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM push_jobs WHERE kind='overdue'")).n, 2, 'One reminder per responsible person and manager, without duplicate polling')
  const overdueAlerts = (await manager('/report-alerts')).body
  assert.equal(overdueAlerts.totals.overdue, 1)
  assert.equal(overdueAlerts.reports[0].assigneeId, supervisorId)
  const delivered = []
  const service = createPushService({ ...services, send: async (sub, payload, options) => { delivered.push({ sub, payload: JSON.parse(payload), options }); return { statusCode: 201 } } })
  await service.tick()
  assert.equal(delivered.length, 2)
  assert.ok(delivered.every(entry => entry.payload.title.includes('vencido')))
  assert.ok(delivered.every(entry => !entry.payload.body.includes('Falta una pieza')), 'Lock screen does not expose report details')
  assert.ok(delivered.every(entry => entry.payload.url.includes(encodeURIComponent(order.body.id))))
  assert.ok(delivered.every(entry => entry.options.vapidDetails.publicKey === publicKey))
  assert.equal((await supervisor(`/field-work/reports/${id}`, 'PATCH', { status: 'Resuelto', reply: 'Solucionado.', version: 1 })).status, 200)
  assert.equal((await manager(`/report-followups/${id}`, 'PATCH', { assigneeId: secretaryId, dueAt, version: 2 })).status, 409)
  const before = delivered.length
  await db.run('UPDATE report_followups SET last_reminded_at=NULL WHERE report_id=?', [id])
  await service.tick()
  assert.equal(delivered.length, before + 1, 'Only worker reply notice is sent after resolving')
  assert.equal(delivered.at(-1).sub.endpoint, workerSub.endpoint)
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM push_jobs WHERE kind='overdue'")).n, 2, 'Resolved reports stop reminders')
  assert.equal((await manager('/push/test', 'POST')).status, 200)
  assert.equal((await manager('/push/test', 'POST')).status, 429)
  const expired = createPushService({ ...services, send: async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }) } })
  await expired.tick()
  assert.equal(await db.get('SELECT endpoint FROM push_subscriptions WHERE endpoint=?', [managerSub.endpoint]), undefined, 'Expired subscriptions are removed')
  assert.equal((await supervisor('/push/subscribe', 'POST', supervisorSub)).status, 200)
  const version = (await manager('/users')).body.find(user => user.id === supervisorId).version
  assert.equal((await supervisor(`/field-work/reports/${id}`, 'PATCH', { status: 'Pendiente', reply: 'Se requiere nueva revisión.', version: 2 })).status, 200)
  await db.run('UPDATE report_followups SET due_at=? WHERE report_id=?', [new Date(Date.now() + 3600000).toISOString(), id])
  await service.tick()
  await manager(`/users/${supervisorId}/access`, 'POST', { action: 'block', version })
  const now = new Date().toISOString()
  await db.run("INSERT INTO push_jobs (id,user_id,kind,created_at,available_at) VALUES (?,?, 'test',?,?)", [randomUUID(), supervisorId, now, now])
  const lastCount = delivered.length
  await service.tick()
  assert.equal(delivered.length, lastCount, 'Blocked accounts receive no notices')
  assert.equal((await followup()).body.followup.assignee_id, secretaryId, 'Blocked owner is replaced without waiting for the deadline')
  await worker('/auth/logout', 'POST', { pushEndpoint: workerSub.endpoint })
  assert.equal(await db.get('SELECT endpoint FROM push_subscriptions WHERE endpoint=?', [workerSub.endpoint]), undefined, 'Logout detaches this browser')
  const scheduler = await fetch(base + '/reminders/tick', { method: 'POST' })
  assert.equal(scheduler.status, 401, 'Only an authenticated scheduler can wake reminder processing')
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM security_events WHERE event LIKE ?', [`report_assigned:${id}:%`])).n, 1)
  assert.ok(managerId)
})
