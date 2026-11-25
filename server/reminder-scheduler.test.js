import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPair, SignJWT } from 'jose'
import { authorizeScheduler } from './reminder-scheduler.js'
import { validSubscription } from './push-notifications.js'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

test('scheduler accepts only signed, recent tokens from the exact workflow on main', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const trusted = { repository_id: '1442280260', repository: 'albertgsmu/apptecnolservicios', ref: 'refs/heads/main', workflow_ref: 'albertgsmu/apptecnolservicios/.github/workflows/report-reminders.yml@refs/heads/main', event_name: 'schedule' }
  const token = (claims = {}, audience = 'jp-report-reminders', expiration = '5m') => new SignJWT({ ...trusted, ...claims }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://token.actions.githubusercontent.com').setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey)
  assert.equal((await authorizeScheduler(await token(), publicKey)).event_name, 'schedule')
  for (const claims of [{ repository_id: '1' }, { repository: 'someone/other' }, { ref: 'refs/heads/other' }, { event_name: 'pull_request' }, { workflow_ref: 'albertgsmu/apptecnolservicios/.github/workflows/other.yml@refs/heads/main' }]) await assert.rejects(authorizeScheduler(await token(claims), publicKey))
  await assert.rejects(authorizeScheduler(await token({}, 'other'), publicKey))
  await assert.rejects(authorizeScheduler(await token({}, 'jp-report-reminders', '-1m'), publicKey))
  await assert.rejects(authorizeScheduler('not-a-token', publicKey))
  const other = await generateKeyPair('RS256')
  await assert.rejects(authorizeScheduler(await token(), other.publicKey))
})

test('push endpoints are restricted to trusted providers, without credentials or custom ports', () => {
  const keys = { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) }
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x', 'https://web.push.apple.com/x', 'https://updates.push.services.mozilla.com/x', 'https://wns1.notify.windows.com/x']) assert.equal(validSubscription({ endpoint, keys }), true)
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8888/x', 'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x', 'https://127.0.0.1/x', 'file:///etc/passwd']) assert.equal(validSubscription({ endpoint, keys }), false)
  assert.equal(validSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { ...keys, auth: 'bad' } }), false)
})

test('service worker shows a notification and restricts clicks to this application', async () => {
  const handlers = {}, shown = [], opened = []
  const self = { addEventListener: (kind, handler) => { handlers[kind] = handler }, location: { origin: 'https://jp-mantenimiento.onrender.com' }, registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } }
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL })
  let completion
  handlers.push({ data: { json: () => ({ title: 'Prueba', body: 'Aviso', url: '/?work=work1', tag: 'report-1' }) }, waitUntil: promise => { completion = promise } })
  await completion
  assert.equal(shown[0][0], 'Prueba')
  assert.equal(shown[0][1].data.url, '/?work=work1')
  handlers.notificationclick({ notification: { close() {}, data: { url: 'https://evil.example/steal' } }, waitUntil: promise => { completion = promise } })
  await completion
  assert.deepEqual(opened, ['https://jp-mantenimiento.onrender.com/'])
  handlers.push({ data: { json: () => { throw new Error('Malformed') } }, waitUntil: promise => { completion = promise } })
  await completion
  assert.equal(shown.length, 2, 'Even malformed pushes produce a visible notice')
})
