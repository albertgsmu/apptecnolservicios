import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { webAllowedOrigins } from './web-hosting.js'

test('Render and custom domains are exact allowed origins', () => {
  assert.deepEqual(webAllowedOrigins({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://app-test.onrender.com' }), ['https://app-test.onrender.com'])
  assert.deepEqual(webAllowedOrigins({ NODE_ENV: 'production', APP_ORIGIN: 'https://empresa.test/', ALLOWED_ORIGINS: 'https://empresa.test' }), ['https://empresa.test'])
  assert.throws(() => webAllowedOrigins({ ALLOWED_ORIGINS: '*' }))
  assert.throws(() => webAllowedOrigins({ APP_ORIGIN: 'https://empresa.test/subruta' }))
  assert.throws(() => webAllowedOrigins({ APP_ORIGIN: 'https://user:secret@empresa.test' }))
})

test('PostgreSQL startup never loads the SQLite native driver', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jp-postgres-startup-'))
  const hook = path.join(directory, 'block-sqlite.mjs')
  await writeFile(hook, `import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === 'sqlite' || specifier === 'sqlite3') throw new Error('SQLITE_MUST_NOT_LOAD');
      return nextResolve(specifier, context);
    } });`)
  const listener = net.createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const closedPort = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const api = spawn(process.execPath, ['--import', pathToFileURL(hook).href, 'server/server.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    NODE_ENV: 'production', DATABASE_URL: `postgresql://test:unused@127.0.0.1:${closedPort}/test`,
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'), SERVE_FRONTEND: 'false',
    ALLOWED_ORIGINS: 'https://mantenimiento-test.onrender.com', APP_ORIGIN: '', RENDER_EXTERNAL_URL: '',
  } })
  t.after(async () => {
    if (api.exitCode === null) { const exited = new Promise(resolve => api.once('exit', resolve)); api.kill(); await exited }
    await rm(directory, { recursive: true, force: true })
  })
  let output = ''
  api.stdout.on('data', chunk => { output += chunk })
  api.stderr.on('data', chunk => { output += chunk })
  const exitCode = await new Promise(resolve => api.once('exit', resolve))
  assert.equal(exitCode, 1)
  assert.ok(output.includes('No se pudo iniciar la API:'), output)
  assert.ok(/ECONNREFUSED|connect|Connection/i.test(output), 'Startup reaches PostgreSQL connection validation')
  assert.ok(!output.includes('SQLITE_MUST_NOT_LOAD'), output)
})

test('built web, API and authentication work under one hosting origin', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jp-web-hosting-'))
  const listener = net.createServer()
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const password = randomBytes(24).toString('hex')
  const origin = 'https://mantenimiento-test.onrender.com'
  const api = spawn(process.execPath, ['server/server.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    NODE_ENV: 'test', DATABASE_URL: '', SQLITE_DB_PATH: path.join(directory, 'app.sqlite'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'), MANAGER_MFA_REQUIRED: 'false',
    ALLOWED_ORIGINS: '', APP_ORIGIN: '', RENDER_EXTERNAL_URL: origin, SERVE_FRONTEND: 'true', PORT: String(port),
    INITIAL_ADMIN_EMAIL: 'manager.hosting@example.test', INITIAL_ADMIN_PASSWORD: password, INITIAL_ADMIN_NAME: 'Gerente de prueba',
  } })
  let output = ''
  api.stdout.on('data', chunk => { output += chunk })
  api.stderr.on('data', chunk => { output += chunk })
  t.after(async () => {
    if (api.exitCode === null) { const exited = new Promise(resolve => api.once('exit', resolve)); api.kill(); await exited }
    await rm(directory, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break } } catch { /* Wait for startup. */ }
    await delay(100)
  }
  assert.ok(ready, output)
  const home = await fetch(base)
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.ok(html.includes('<div id="root">'))
  assert.ok(home.headers.get('Content-Security-Policy').includes('blob:'))
  assert.ok(home.headers.get('Content-Security-Policy').includes('wss://mantenimiento-test.onrender.com'))
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
  assert.ok(asset)
  const bundle = await fetch(base + asset)
  assert.equal(bundle.status, 200)
  assert.ok(bundle.headers.get('Cache-Control').includes('immutable'))
  assert.ok(!(await bundle.text()).includes('http://localhost:3003'), 'Hosted phones must not call localhost')
  const deepLink = await fetch(`${base}/ordenes`, { headers: { Accept: 'text/html' } })
  assert.equal(deepLink.status, 200)
  assert.equal((await fetch(`${base}/api/not-a-route`)).status, 404)
  assert.equal((await fetch(`${base}/.env.local`)).status, 404)
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404)
  const blocked = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://untrusted.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager.hosting@example.test', password }) })
  assert.equal(blocked.status, 403)
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager.hosting@example.test', password }) })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).nextStep, 'authenticated')
  assert.ok(login.headers.getSetCookie().some(cookie => cookie.startsWith('jp_session=') && cookie.includes('HttpOnly')))
  assert.ok((await readFile('dist/index.html', 'utf8')).includes(asset))
})
