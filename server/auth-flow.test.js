import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'

const root = process.cwd()

const getAvailablePort = async () => {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

const runCommand = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.once('error', reject)
  child.once('exit', (code) => {
    if (code === 0) {
      resolve(output)
    } else {
      reject(new Error(`Command failed with exit code ${code}: ${output}`))
    }
  })
})

test('manager must rotate the bootstrap password, enroll TOTP, and use one-time recovery codes', async (t) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'jp-auth-flow-'))
  const databasePath = path.join(temporaryDirectory, 'auth.sqlite')
  const bootstrapFile = path.join(temporaryDirectory, 'manager-bootstrap.txt')
  const port = await getAvailablePort()
  const encryptionKey = randomBytes(32).toString('base64')
  const testEmail = 'manager.auth-flow@example.test'
  const env = {
    ...process.env,
    DATABASE_URL: '',
    MFA_ENCRYPTION_KEY: encryptionKey,
    SQLITE_DB_PATH: databasePath,
    ORDER_UPLOAD_DIR: path.join(temporaryDirectory, 'uploads'),
    INITIAL_ADMIN_EMAIL: testEmail,
    INITIAL_ADMIN_NAME: 'Test Manager',
    INITIAL_ADMIN_PASSWORD: 'initial-test-password-that-is-long-enough',
    PORT: String(port),
    ALLOWED_ORIGINS: 'http://localhost:5173',
    NODE_ENV: 'test',
    MANAGER_MFA_REQUIRED: 'true',
    BOOTSTRAP_FILE: bootstrapFile,
  }
  const serverProcess = spawn(process.execPath, ['server/server.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  serverProcess.stdout.on('data', (chunk) => { output += chunk })
  serverProcess.stderr.on('data', (chunk) => { output += chunk })
  t.after(async () => {
    if (serverProcess.exitCode === null) {
      serverProcess.kill()
      await new Promise((resolve) => serverProcess.once('exit', resolve))
    }
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  const baseUrl = `http://127.0.0.1:${port}/api`
  let healthy = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Auth test server exited before becoming ready: ${output}`)
    }
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) {
        healthy = true
        break
      }
    } catch {
      await delay(100)
    }
  }
  assert.equal(healthy, true, `Auth test server did not start: ${output}`)

  await runCommand(process.execPath, ['scripts/migrate-auth-security.mjs', '--target=sqlite'], env)
  await runCommand(process.execPath, ['scripts/bootstrap-manager.mjs', '--target=sqlite'], env)
  const bootstrapContent = await readFile(bootstrapFile, 'utf8')
  const bootstrapPassword = bootstrapContent.match(/Contraseña temporal: (.+)/)?.[1]?.trim()
  assert.ok(bootstrapPassword)

  const cookies = new Map()
  const request = async (route, { method = 'GET', body, includeCsrf = true, origin = 'http://localhost:5173' } = {}) => {
    const headers = { Origin: origin }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (cookies.size) {
      headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    }
    if (includeCsrf && method !== 'GET' && cookies.has('jp_csrf')) {
      headers['X-CSRF-Token'] = cookies.get('jp_csrf')
    }

    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? '']
    for (const header of setCookies) {
      const match = header.match(/(?:^|,\s*)(jp_session|jp_csrf)=([^;,]*)/)
      if (match) {
        if (match[2]) {
          cookies.set(match[1], match[2])
        } else {
          cookies.delete(match[1])
        }
      }
    }
    const text = await response.text()
    return { response, body: text ? JSON.parse(text) : null }
  }

  const blockedOrigin = await request('/auth/login', {
    method: 'POST',
    origin: 'https://untrusted.example',
    body: { email: testEmail, password: bootstrapPassword },
  })
  assert.equal(blockedOrigin.response.status, 403)

  const failedLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: 'incorrect-password' },
  })
  assert.equal(failedLogin.response.status, 401)
  const throttledLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: bootstrapPassword },
  })
  assert.equal(throttledLogin.response.status, 429)
  await delay((throttledLogin.body.retryAfterSeconds + 0.1) * 1000)

  const initialLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: bootstrapPassword },
  })
  assert.equal(initialLogin.body.nextStep, 'change-password')

  const changedPassword = 'A new secure manager passphrase 2026!'
  const passwordChange = await request('/auth/change-password', {
    method: 'POST',
    body: { password: changedPassword, confirmPassword: changedPassword },
  })
  assert.equal(passwordChange.response.status, 200)

  const setup = await request('/auth/mfa/setup', { method: 'POST', body: {} })
  assert.equal(setup.response.status, 200)
  assert.match(setup.body.qrCodeDataUrl, /^data:image\/png;base64,/)

  process.env.MFA_ENCRYPTION_KEY = encryptionKey
  const { createTotpToken } = await import('./auth-security.js')
  const manualSecret = setup.body.manualEntryKey
  let enrollmentCounter = Math.floor(Date.now() / 30_000)
  const enabled = await request('/auth/mfa/enable', {
    method: 'POST',
    body: { code: createTotpToken(manualSecret, enrollmentCounter) },
  })
  assert.equal(enabled.response.status, 200, JSON.stringify(enabled.body))
  assert.equal(enabled.body.recoveryCodes.length, 10)

  const authenticatedCookies = [...cookies]
  cookies.clear()
  const unauthenticated = await request('/dashboard/overview')
  assert.equal(unauthenticated.response.status, 401)
  for (const [name, value] of authenticatedCookies) {
    cookies.set(name, value)
  }
  const missingCsrf = await request('/auth/logout', { method: 'POST', includeCsrf: false })
  assert.equal(missingCsrf.response.status, 403)
  const managerDashboard = await request('/dashboard/overview')
  assert.equal(managerDashboard.response.status, 200)

  // Order workflow uses an isolated SQLite database, never the user's records.
  const { open } = await import('sqlite')
  const sqlite3 = (await import('sqlite3')).default
  const fixture = await open({ filename: databasePath, driver: sqlite3.Database })
  try {
    await fixture.run("INSERT INTO employees (id,name,area,title,status,shift,lastEntry) VALUES ('test-tech','Técnico de prueba','Electricidad','Técnico','Activo','Día','')")
    const csrf = await request('/auth/csrf')
    assert.equal(csrf.response.status, 200)
    assert.equal(csrf.body.csrfToken, cookies.get('jp_csrf'))
    const draft = { client: 'Cliente de prueba', area: 'Electricidad', priority: 'Alta', date: '2026-11-11', observations: 'Prueba aislada', site: { address: 'Calle de prueba 123', city: 'Bogotá' } }
    const missingToken = await request('/orders', { method: 'POST', includeCsrf: false, body: draft })
    assert.equal(missingToken.response.status, 403)
    const invalid = await request('/orders', { method: 'POST', body: { ...draft, assignedTo: 'missing' } })
    assert.equal(invalid.response.status, 400)
    const created = await request('/orders', { method: 'POST', body: draft })
    assert.equal(created.response.status, 201)
    assert.equal(created.body.progress, 0)
    assert.equal(created.body.status, 'Programada')
    const id = created.body.id
    const assign = await request('/orders/' + id, { method: 'PATCH', body: { assignedTo: 'test-tech', progress: 0, status: 'Asignada', version: 1 } })
    assert.equal(assign.response.status, 200)
    const stale = await request('/orders/' + id, { method: 'PATCH', body: { assignedTo: 'test-tech', progress: 20, status: 'En ejecución', version: 1 } })
    assert.equal(stale.response.status, 409)
    const advance = await request('/orders/' + id, { method: 'PATCH', body: { assignedTo: 'test-tech', progress: 60, status: 'En ejecución', version: 2 } })
    assert.equal(advance.response.status, 200)
    const earlyClose = await request('/orders/' + id, { method: 'PATCH', body: { assignedTo: 'test-tech', progress: 60, status: 'Cerrada', version: 3 } })
    assert.equal(earlyClose.response.status, 400)
    const close = await request('/orders/' + id, { method: 'PATCH', body: { assignedTo: 'test-tech', progress: 100, status: 'Cerrada', version: 3 } })
    assert.equal(close.response.status, 200)
    const reopen = await request('/orders/' + id, { method: 'PATCH', body: { assignedTo: 'test-tech', progress: 100, status: 'Cerrada', version: 4 } })
    assert.equal(reopen.response.status, 409)
    const saved = await fixture.get('SELECT * FROM work_orders WHERE id = ?', [id])
    assert.equal(saved.status, 'Cerrada')
    assert.equal(saved.progress, 100)
    const overview = await request('/dashboard/overview')
    assert.deepEqual(overview.body.orders, { total: 1, open: 0, closed: 1, averageProgress: 100 })
    const reloaded = await request('/orders')
    assert.equal(reloaded.body[0].assignedName, 'Técnico de prueba')
    await fixture.run("UPDATE users SET role = 'RRHH' WHERE email = ?", [testEmail])
    const forbidden = await request('/orders', { method: 'POST', body: draft })
    assert.equal(forbidden.response.status, 403)
    await fixture.run("UPDATE users SET role = 'Gerente' WHERE email = ?", [testEmail])
  } finally { await fixture.close() }

  const firstRecoveryCode = enabled.body.recoveryCodes[0]
  const logoutAfterEnrollment = await request('/auth/logout', { method: 'POST' })
  assert.equal(logoutAfterEnrollment.response.status, 204)

  const mfaLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: changedPassword },
  })
  assert.equal(mfaLogin.body.nextStep, 'verify-mfa')
  while (Math.floor(Date.now() / 30_000) <= enrollmentCounter) {
    await delay(100)
  }
  enrollmentCounter = Math.floor(Date.now() / 30_000)
  const verified = await request('/auth/mfa/verify', {
    method: 'POST',
    body: { code: createTotpToken(manualSecret, enrollmentCounter) },
  })
  assert.equal(verified.response.status, 200)
  assert.equal(verified.body.nextStep, 'authenticated')

  await request('/auth/logout', { method: 'POST' })
  const recoveryLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: changedPassword },
  })
  assert.equal(recoveryLogin.body.nextStep, 'verify-mfa')
  const recovered = await request('/auth/mfa/verify', {
    method: 'POST',
    body: { recoveryCode: firstRecoveryCode },
  })
  assert.equal(recovered.response.status, 200)

  await request('/auth/logout', { method: 'POST' })
  await request('/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: changedPassword },
  })
  const replayedRecoveryCode = await request('/auth/mfa/verify', {
    method: 'POST',
    body: { recoveryCode: firstRecoveryCode },
  })
  assert.equal(replayedRecoveryCode.response.status, 401)
})
