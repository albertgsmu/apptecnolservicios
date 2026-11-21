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
import { io } from 'socket.io-client'

test('manager manages staff access, mandatory password rotation, revocation and retained history', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jp-user-access-'))
  const databasePath = path.join(directory, 'access.sqlite')
  const listener = net.createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const password = randomBytes(24).toString('hex')
  const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env,
    NODE_ENV: 'test', DATABASE_URL: '', SQLITE_DB_PATH: databasePath,
    ORDER_UPLOAD_DIR: path.join(directory, 'uploads'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'), MANAGER_MFA_REQUIRED: 'false',
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
  const secretaryEmail = 'secretary.accounts@example.test'
  const created = await manager('/users', 'POST', { name: 'Secretaria prueba', email: secretaryEmail, password, role: 'Secretaria' })
  assert.equal(created.status, 201)
  const id = created.body.user.id
  const secretary = client()
  const login = await secretary('/auth/login', 'POST', { email: secretaryEmail, password })
  assert.equal(login.body.nextStep, 'authenticated')
  assert.equal((await secretary('/users')).status, 403)
  assert.equal((await secretary(`/users/${id}/access`, 'POST', { action: 'block', version: 1 })).status, 403)
  const rows = async () => (await manager('/users')).body
  const target = async () => (await rows()).find(row => row.id === id)
  assert.equal((await rows()).some(row => 'password_hash' in row || row.role === 'Gerente'), false)
  const managerId = (await db.get("SELECT id FROM users WHERE role='Gerente'")).id
  assert.equal((await manager(`/users/${managerId}/access`, 'POST', { action: 'retire', version: 1 })).status, 403)
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, reconnection: false })
  t.after(() => socket.disconnect())
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
  const revoked = new Promise(resolve => socket.once('session-revoked', resolve))
  const version = (await target()).version
  assert.equal((await manager(`/users/${id}/access`, 'POST', { action: 'block', version }, { 'X-CSRF-Token': '' })).status, 403)
  assert.equal((await manager(`/users/${id}/access`, 'POST', { action: 'block', version })).status, 200)
  await revoked
  assert.equal((await secretary('/dashboard/overview')).status, 401, 'Existing HTTP session is revoked')
  assert.equal((await client()('/auth/login', 'POST', { email: secretaryEmail, password })).status, 401, 'Blocked account cannot sign in')
  assert.equal((await manager(`/users/${id}/access`, 'POST', { action: 'unblock', version })).status, 409, 'Stale modifications cannot overwrite newer ones')
  assert.equal((await manager(`/users/${id}/access`, 'POST', { action: 'unblock', version: (await target()).version })).status, 200)
  const reset = await manager(`/users/${id}/reset-password`, 'POST', { version: (await target()).version })
  assert.equal(reset.status, 200)
  assert.ok(reset.body.temporaryPassword.length >= 15)
  assert.match(reset.headers.get('Cache-Control'), /no-store/)
  await db.run('DELETE FROM login_attempts')
  assert.equal((await client()('/auth/login', 'POST', { email: secretaryEmail, password })).status, 401, 'Old password no longer works')
  await db.run('DELETE FROM login_attempts')
  const rotated = client()
  assert.equal((await rotated('/auth/login', 'POST', { email: secretaryEmail, password: reset.body.temporaryPassword })).body.nextStep, 'change-password')
  assert.equal((await rotated('/dashboard/overview')).status, 401, 'Temporary password cannot enter the application before rotation')
  const nextPassword = 'new-private-password-for-test-12345'
  const changed = await rotated('/auth/change-password', 'POST', { password: nextPassword, confirmPassword: nextPassword })
  assert.equal(changed.status, 200)
  assert.equal(changed.body.nextStep, 'authenticated', 'Staff does not enter manager QR enrollment')
  assert.equal((await rotated('/dashboard/overview')).status, 200)
  assert.equal((await manager(`/users/${id}`, 'PATCH', { name: 'Nombre actualizado', email: 'changed.accounts@example.test', version: (await target()).version })).status, 200)
  assert.equal((await rotated('/dashboard/overview')).status, 401)
  assert.equal((await client()('/auth/login', 'POST', { email: 'changed.accounts@example.test', password: nextPassword })).status, 200)
  const staffCount = (await db.get('SELECT COUNT(*) AS n FROM users')).n
  await db.run('INSERT INTO direct_messages (id,sender_id,recipient_id,client_id,body,created_at) VALUES (?,?,?,?,?,?)', [randomUUID(), managerId, id, randomUUID(), 'Conservar historial', new Date().toISOString()])
  assert.equal((await manager(`/users/${id}/access`, 'POST', { action: 'retire', version: (await target()).version })).status, 200)
  assert.ok((await target()).archivedAt)
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM users')).n, staffCount)
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM direct_messages WHERE recipient_id=?', [id])).n, 1)
  assert.equal((await manager(`/users/${id}/reset-password`, 'POST', { version: (await target()).version })).status, 409)
  assert.equal((await manager(`/users/${id}/access`, 'POST', { action: 'restore', version: (await target()).version })).status, 200)
  assert.equal((await target()).blocked, false)
  await db.run('INSERT INTO employees (id,name,area,title,status,shift,lastEntry) VALUES (?,?,?,?,?,?,?)', ['worker-edit', 'Trabajador', 'Obras', 'Tecnico', 'Activo', 'Diurno', ''])
  const workerCreated = await manager('/users', 'POST', { name: 'Trabajador', email: 'worker.accounts@example.test', password, role: 'Trabajador', employeeId: 'worker-edit' })
  const workerId = workerCreated.body.user.id
  const workerTarget = async () => (await rows()).find(row => row.id === workerId)
  const worker = client()
  assert.equal((await worker('/auth/login', 'POST', { email: 'worker.accounts@example.test', password })).body.nextStep, 'location-required')
  const workerReset = await manager(`/users/${workerId}/reset-password`, 'POST', { version: (await workerTarget()).version })
  const workerNew = client()
  assert.equal((await workerNew('/auth/login', 'POST', { email: 'worker.accounts@example.test', password: workerReset.body.temporaryPassword })).body.nextStep, 'change-password')
  assert.equal((await workerNew('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.6, longitude: -74.1, accuracy: 10, capturedAt: new Date().toISOString() } })).status, 403, 'Location cannot bypass mandatory password change')
  assert.equal((await workerNew('/auth/change-password', 'POST', { password: nextPassword, confirmPassword: nextPassword })).body.nextStep, 'location-required')
  assert.equal((await workerNew('/dashboard/overview')).status, 401)
  assert.equal((await workerNew('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.6, longitude: -74.1, accuracy: 10, capturedAt: new Date().toISOString() } })).status, 200)
  assert.equal((await manager(`/users/${workerId}`, 'PATCH', { name: 'Trabajador actualizado', email: 'worker.accounts@example.test', area: 'Electricidad', title: 'Oficial', shift: 'Rotativo', version: (await workerTarget()).version })).status, 200)
  assert.equal((await db.get('SELECT title FROM employees WHERE id=?', ['worker-edit'])).title, 'Oficial')
  assert.equal((await workerNew('/orders')).status, 401)
  assert.equal((await manager(`/users/${workerId}/access`, 'POST', { action: 'retire', version: (await workerTarget()).version })).status, 200)
  assert.equal((await db.get('SELECT status FROM employees WHERE id=?', ['worker-edit'])).status, 'Inactivo')
  assert.equal((await manager(`/users/${workerId}/access`, 'POST', { action: 'restore', version: (await workerTarget()).version })).status, 200)
  assert.equal((await manager('/employees/worker-edit/status', 'PATCH', { status: 'Inactivo' })).status, 200)
  assert.equal((await workerTarget()).blocked, true, 'Legacy inactive selector also blocks access')
  assert.equal((await client()('/auth/login', 'POST', { email: 'worker.accounts@example.test', password: nextPassword })).status, 401)
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM security_events WHERE event LIKE ?', [`%${reset.body.temporaryPassword}%`])).n, 0, 'Temporary password never enters audit logs')
})
