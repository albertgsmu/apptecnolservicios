import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { createOrderMediaStorage } from './storage/order-media.js'

test('only manager creates accounts; worker sees and updates only own orders; secretary cannot approve or assign', { timeout: 30000 }, async t => {
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
  t.after(async () => {
    if (server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited }
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
  const emptyOverview = await manager('/dashboard/overview')
  assert.deepEqual(emptyOverview.body.orders, { total: 0, open: 0, closed: 0, averageProgress: 0 })
  assert.equal(emptyOverview.body.operations.openAverageProgress, null, 'No open work means no average, not zero performance')
  assert.equal(emptyOverview.body.employees.total, 0)
  assert.equal(emptyOverview.body.availability.attendance, false)
  const db = await open({ filename: databasePath, driver: sqlite3.Database })
  try {
    for (const id of ['tech-own', 'tech-other']) await db.run('INSERT INTO employees (id,name,area,title,status,shift,lastEntry) VALUES (?,?,?,?,?,?,?)', [id, id, 'Electricidad', 'Tecnico', 'Activo', 'Dia', ''])
    const baseAccount = { name: 'Test user', email: 'user@example.test', password, role: 'Secretaria' }
    assert.equal((await manager('/users', 'POST', { ...baseAccount, password: 'short' })).status, 400)
    assert.equal((await manager('/users', 'POST', { ...baseAccount, role: 'Gerente' })).status, 400)
    assert.equal((await manager('/users', 'POST', { ...baseAccount, role: 'Trabajador', employeeId: 'missing' })).status, 400)
    assert.equal(await db.get('SELECT id FROM users WHERE email = ?', [baseAccount.email]), undefined, 'Failed linking does not create a partial account')
    const accounts = [
      { role: 'Secretaria', email: 'secretary@example.test' },
      { role: 'Trabajador', email: 'worker@example.test', employeeId: 'tech-own' },
    ]
    let workerRequest
    let fieldReportId
    for (const account of accounts) {
      const result = await manager('/users', 'POST', { ...baseAccount, ...account })
      assert.equal(result.status, 201, JSON.stringify(result.body))
      assert.equal(result.body.user.password, undefined)
      assert.equal(result.body.user.password_hash, undefined)
    }
    assert.equal((await manager('/users', 'POST', { ...baseAccount, email: 'worker2@example.test', role: 'Trabajador', employeeId: 'tech-own' })).status, 409)
    assert.equal((await manager('/users', 'POST', { ...baseAccount, email: 'secretary@example.test' })).status, 409)
    const stored = await db.get('SELECT password_hash FROM users WHERE email = ?', ['worker@example.test'])
    assert.notEqual(stored.password_hash, password)
    assert.equal((await manager('/users/employees')).body.length, 1, 'Already linked employees are excluded')
    assert.equal((await db.get("SELECT COUNT(*) AS total FROM security_events WHERE event LIKE 'account_created:%'")).total, 2)
    for (const role of ['RRHH', 'Administración']) {
      assert.equal((await manager('/users', 'POST', { ...baseAccount, role })).status, 400, 'Retired profiles cannot be created')
      const legacyEmail = `${role.length}.legacy@example.test`
      await db.run('INSERT INTO users (id,email,password_hash,name,role) VALUES (?,?,?,?,?)', [`legacy-${role}`, legacyEmail, stored.password_hash, 'Legacy user', role])
      assert.equal((await client()('/auth/login', 'POST', { email: legacyEmail, password })).status, 403, 'Retired accounts cannot authenticate')
    }
    const draft = { client: 'Test client', area: 'Electricidad', priority: 'Alta', date: '2999-01-01', site: { address: 'Calle 72 # 10-34', city: 'Bogotá', neighborhood: 'Quinta Camacho', building: 'Torre 2', unit: 'Apto. 503', contactName: 'Contacto de prueba', contactPhone: '+57 300 123 4567', accessHours: '8:00 a 17:00', accessInstructions: 'Ingresar por portería norte.', workRequirements: 'Llevar escalera y protección para el piso.' } }
    assert.equal((await manager('/orders', 'POST', { ...draft, site: undefined })).status, 400)
    assert.equal((await manager('/orders', 'POST', { ...draft, site: { ...draft.site, city: '' } })).status, 400)
    assert.equal((await manager('/orders', 'POST', { ...draft, site: { ...draft.site, address: 'x'.repeat(241) } })).status, 400)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF2kAAAAASUVORK5CYII=', 'base64')
    const mediaOrder = (assignedTo, content = png, filename = 'referencia.png', mime = 'image/png') => {
      const form = new FormData()
      form.append('order', JSON.stringify({ ...draft, assignedTo, attachmentInstructions: ['Reparar la fisura y pintar la pared.'] }))
      form.append('attachments', new Blob([content], { type: mime }), filename)
      return form
    }
    const initialCount = (await db.get('SELECT COUNT(*) AS total FROM work_orders')).total
    const invalidMedia = await manager('/orders', 'POST', mediaOrder('tech-own', Buffer.from('<script>bad</script>')))
    assert.equal(invalidMedia.status, 415, 'Do not trust extensions or client MIME types')
    const invalidOrder = mediaOrder('missing')
    assert.equal((await manager('/orders', 'POST', invalidOrder)).status, 400)
    const wrongInstructions = mediaOrder('tech-own')
    wrongInstructions.set('order', JSON.stringify({ ...draft, attachmentInstructions: ['one', 'two'] }))
    assert.equal((await manager('/orders', 'POST', wrongInstructions)).status, 400)
    const oversized = mediaOrder('tech-own', Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)]))
    assert.equal((await manager('/orders', 'POST', oversized)).status, 413)
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM work_orders')).total, initialCount, 'Rejected media does not leave an order')
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM order_attachments')).total, 0)
    for (let i = 0; i < 20 && (await readdir(path.join(directory, 'uploads', 'pending'))).length; i++) await delay(25)
    assert.deepEqual(await readdir(path.join(directory, 'uploads', 'pending')), [], 'Rejected uploads are removed from disk')
    const several = new FormData()
    const instructions = Array.from({ length: 8 }, (_unused, index) => `Trabajar en la zona ${index + 1}.`)
    several.append('order', JSON.stringify({ ...draft, attachmentInstructions: instructions }))
    for (let i = 0; i < 8; i++) several.append('attachments', new Blob([png], { type: 'image/png' }), `zona-${i + 1}.png`)
    const bulk = await manager('/orders', 'POST', several)
    assert.equal(bulk.status, 201, 'More than six attachments are accepted')
    assert.equal(bulk.body.attachments.length, 8)
    for (const attachment of bulk.body.attachments) {
      const number = Number(attachment.name.match(/\d+/)[0])
      assert.equal(attachment.instructions, instructions[number - 1], 'Instructions stay with their file')
    }
    const own = await manager('/orders', 'POST', mediaOrder('tech-own'))
    const other = await manager('/orders', 'POST', mediaOrder('tech-other'))
    assert.equal(own.status, 201)
    assert.equal(other.status, 201)
    assert.equal(own.body.attachments.length, 1)
    assert.deepEqual(own.body.site, draft.site, 'Site details are stored with the order')
    assert.equal(own.body.attachments[0].instructions, 'Reparar la fisura y pintar la pared.')
    const storedMedia = await db.get('SELECT content,content_sha256 FROM order_attachments WHERE id = ?', [own.body.attachments[0].id])
    assert.deepEqual(storedMedia.content, png, 'Binary is stored in the database')
    assert.equal(storedMedia.content_sha256, createHash('sha256').update(png).digest('hex'))
    const ownUrl = own.body.attachments[0].url.replace('/api', '')
    const otherUrl = other.body.attachments[0].url.replace('/api', '')
    assert.equal((await client()(ownUrl)).status, 401, 'Files require a session')
    const image = await manager(ownUrl)
    assert.equal(image.headers.get('Content-Type'), 'image/png')
    assert.deepEqual(image.body, png)
    assert.equal(image.headers.get('Cache-Control'), 'private, no-store')
    const ranged = await manager(ownUrl, 'GET', undefined, { Range: 'bytes=0-7' })
    assert.equal(ranged.status, 206, 'Media endpoint supports ranged playback')
    assert.deepEqual(ranged.body, png.subarray(0, 8))
    const suffix = await manager(ownUrl, 'GET', undefined, { Range: 'bytes=-8' })
    assert.equal(suffix.status, 206)
    assert.deepEqual(suffix.body, png.subarray(png.length - 8))
    assert.equal((await manager(ownUrl, 'GET', undefined, { Range: 'bytes=999999-1000000' })).status, 416)
    const legacyOrder = await manager('/orders', 'POST', draft)
    const legacyId = randomUUID()
    const legacyKey = `${legacyId}.bin`
    const legacyPath = path.join(directory, 'uploads', legacyKey)
    await writeFile(legacyPath, png)
    await db.run(`INSERT INTO order_attachments (id,order_id,original_name,mime_type,size_bytes,storage_key,created_at)
      VALUES (?,?,?,?,?,?,?)`, [legacyId, legacyOrder.body.id, 'legacy.png', 'image/png', png.length, legacyKey, new Date().toISOString()])
    const mediaStore = createOrderMediaStorage({ ORDER_UPLOAD_DIR: path.join(directory, 'uploads') })
    const normalize = sql => sql.replace(/\$(\d+)/g, '?$1')
    const imported = await mediaStore.importLegacy({
      dbQuery: (sql, params = []) => db.all(normalize(sql), params),
      dbGet: (sql, params = []) => db.get(normalize(sql), params),
      dbRun: (sql, params = []) => db.run(normalize(sql), params),
    })
    assert.equal(imported.migrated, 1)
    assert.deepEqual((await db.get('SELECT content FROM order_attachments WHERE id=?', [legacyId])).content, png)
    assert.deepEqual(await readFile(legacyPath), png, 'Original files are preserved during import')
    assert.equal((await manager(ownUrl.replace(own.body.id, other.body.id))).status, 404, 'An attachment must belong to the URL order')
    for (const account of accounts) {
      const request = client()
      assert.equal((await request('/auth/login', 'POST', { email: account.email, password })).status, 200)
      if (account.role === 'Trabajador') {
        workerRequest = request;
        assert.equal((await request('/auth/me')).status, 401, 'Password alone cannot open worker panel')
        assert.equal((await request('/orders')).status, 401)
        assert.equal((await request('/auth/worker-location', 'POST', { location: { status: 'denied' } })).status, 400)
        assert.equal((await request('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: '2000-01-01' } })).status, 400)
        assert.equal((await request('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() } }, { 'X-CSRF-Token': '' })).status, 403)
        assert.equal((await request('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() } })).status, 200)
        assert.equal((await request('/auth/me')).status, 200)
        assert.equal((await request('/auth/worker-location', 'POST', { location: { status: 'denied' } })).status, 401, 'The pending challenge cannot be replayed after promotion')
      }
      assert.equal((await request('/users', 'POST', { ...baseAccount, role: 'Gerente' })).status, 403, `${account.role} cannot create accounts`)
      assert.equal((await request('/users/employees')).status, 403)
      if (account.role === 'Secretaria') {
        assert.equal((await request('/field-work')).status, 200)
        assert.deepEqual((await request('/field-work')).body.checkIns, [], 'Secretary does not receive GPS records')
        assert.deepEqual((await request('/field-work')).body.photos, [], 'Secretary receives reports without daily photo locations')
        assert.equal((await request('/orders', 'POST', draft)).status, 201)
        assert.equal((await request('/orders', 'POST', { ...draft, assignedTo: 'tech-own' })).status, 403)
        assert.equal((await request('/orders/' + own.body.id, 'PATCH', { assignedTo: 'tech-own', progress: 60, status: 'En ejecución', version: 1 })).status, 403)
        assert.equal((await request('/applicants/missing/status', 'PATCH', { status: 'Aprobado' })).status, 403)
      }
      if (account.role === 'Trabajador') {
        draft.site.geofence = { latitude: 4.65, longitude: -74.06, radius: 100 }
        await db.run('UPDATE work_orders SET site_details=? WHERE id=?', [JSON.stringify(draft.site), own.body.id])
        assert.equal((await request(`/orders/${own.body.id}/location`, 'PATCH', { geofence: draft.site.geofence, version: 1 })).status, 403)
        const reportDraft = { orderId: own.body.id, category: 'Solicitud de material', materials: [{ name: 'Tubo PVC de media pulgada', quantity: 2.5, unit: 'metro' }, { name: 'Unión PVC', quantity: 4, unit: 'unidad' }], urgency: 'Alta', title: 'Faltan materiales', details: 'Necesito dos tubos para continuar.', requestedAction: 'Enviar los materiales a la obra.' }
        assert.equal((await request('/field-work/reports', 'POST', { ...reportDraft, materials: [] })).status, 400)
        assert.equal((await request('/field-work/reports', 'POST', { ...reportDraft, materials: [{ name: '', quantity: 1, unit: 'unidad' }] })).status, 400)
        assert.equal((await request('/field-work/reports', 'POST', { ...reportDraft, materials: [{ name: 'Tubo', quantity: -1, unit: 'metro' }] })).status, 400)
        assert.equal((await request('/field-work/reports', 'POST', { ...reportDraft, materials: [{ name: 'Tubo', quantity: 1.0001, unit: 'metro' }] })).status, 400)
        assert.equal((await request('/field-work/reports', 'POST', { ...reportDraft, category: 'Avance' })).status, 400)
        assert.equal((await request('/field-work/reports', 'POST', { ...reportDraft, orderId: other.body.id })).status, 409)
        assert.equal((await request('/field-work/reports', 'POST', reportDraft, { 'X-CSRF-Token': '' })).status, 403)
        const report = await request('/field-work/reports', 'POST', reportDraft)
        assert.equal(report.status, 201)
        fieldReportId = report.body.id
        assert.equal((await request('/report-alerts')).status, 403, 'Workers cannot browse staff alerts')
        const reportAlerts = (await manager('/report-alerts')).body
        assert.deepEqual(reportAlerts.totals, { total: 1, unread: 1, pending: 1, critical: 0, high: 1 })
        assert.equal(reportAlerts.reports[0].id, fieldReportId)
        assert.equal(reportAlerts.reports[0].orderId, own.body.id)
        assert.equal(reportAlerts.reports[0].latitude, undefined, 'Alert payload does not expose location')
        assert.equal((await manager(`/report-alerts/${fieldReportId}/read`, 'PATCH', undefined, { 'X-CSRF-Token': '' })).status, 403)
        assert.equal((await manager(`/report-alerts/${fieldReportId}/read`, 'PATCH')).status, 200)
        assert.deepEqual((await manager('/report-alerts')).body.totals, { total: 1, unread: 0, pending: 1, critical: 0, high: 1 }, 'Reading an alert does not resolve the problem')
        assert.equal((await manager('/report-alerts/missing/read', 'PATCH')).status, 404)
        assert.equal((await request(`/report-alerts/${fieldReportId}/read`, 'PATCH')).status, 403)
        assert.deepEqual((await request('/field-work')).body.reports[0].materials, reportDraft.materials)
        assert.equal((await db.get('SELECT COUNT(*) AS total FROM inventory_movements')).total, 0, 'A material request does not move stock')
        assert.equal((await request(`/field-work/reports/${fieldReportId}`, 'PATCH', { status: 'Resuelto', version: 1 })).status, 403)
        assert.equal((await request('/field-work/check-ins', 'POST', { kind: 'login', location: { status: 'denied' } })).status, 201)
        const location = { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() }
        const evidence = (orderId = own.body.id, gps = location, bytes = png) => {
          const body = new FormData()
          body.set('orderId', orderId); body.set('caption', 'Avance documentado en obra')
          body.set('location', JSON.stringify(gps)); body.set('photo', new Blob([bytes], { type: 'image/png' }), 'avance.png')
          return body
        }
        assert.equal((await request('/field-work/photos', 'POST', evidence(own.body.id, { status: 'denied' }))).status, 400)
        assert.equal((await request('/field-work/photos', 'POST', evidence(own.body.id, { ...location, capturedAt: '2000-01-01' }))).status, 400)
        assert.equal((await request('/field-work/photos', 'POST', evidence(other.body.id))).status, 409)
        assert.equal((await request('/field-work/photos', 'POST', evidence(own.body.id, location, Buffer.from('fake photo')))).status, 415)
        assert.equal((await request('/field-work/photos', 'POST', evidence(), { 'X-CSRF-Token': '' })).status, 403)
        const firstPhoto = await request('/field-work/photos', 'POST', evidence())
        assert.equal(firstPhoto.status, 201, JSON.stringify(firstPhoto.body))
        assert.equal((await request('/field-work/photos', 'POST', evidence())).status, 409, 'Retries cannot inflate daily count')
        for (let i = 1; i <= 3; i++) assert.equal((await request('/field-work/photos', 'POST', evidence(own.body.id, location, Buffer.concat([png, Buffer.from([i])])))).status, 201)
        const evidenceWork = (await request('/field-work')).body
        assert.equal(evidenceWork.dailyPhotos.workers[0].count, 4, 'Three is a minimum, not a maximum')
        assert.equal(evidenceWork.dailyPhotos.workers[0].missing, 0)
        assert.equal(evidenceWork.photos[0].latitude, undefined, 'Worker does not receive GPS metadata')
        assert.equal((await manager('/field-work')).body.photos[0].assessments[0].status, 'inside')
        assert.deepEqual((await request(`/field-work/photos/${firstPhoto.body.id}/content`)).body, png)
        assert.deepEqual((await manager(`/field-work/photos/${firstPhoto.body.id}/content`)).body, png)
        const secretaryPhotos = client()
        await secretaryPhotos('/auth/login', 'POST', { email: 'secretary@example.test', password })
        assert.equal((await secretaryPhotos(`/field-work/photos/${firstPhoto.body.id}/content`)).status, 403)
        assert.equal((await request('/field-work/check-ins', 'POST', { kind: 'login', location: { ...location, latitude: 1000 } })).status, 400)
        assert.equal((await request('/field-work/check-ins', 'POST', { kind: 'arrival', orderId: other.body.id, location })).status, 404)
        assert.equal((await request('/field-work/check-ins', 'POST', { kind: 'login', location })).status, 201)
        await request('/field-work/check-ins', 'POST', { kind: 'login', location })
        assert.equal((await request('/field-work/check-ins', 'POST', { kind: 'arrival', orderId: own.body.id, location })).status, 201)
        assert.deepEqual((await request('/field-work')).body.checkIns, [])
        const work = (await manager('/field-work')).body
        assert.equal(work.reports.length, 1)
        assert.equal(work.checkIns.length, 2, 'One login record per session, plus explicit arrival')
        assert.ok(work.checkIns.every(item => item.locationStatus === 'captured'))
        assert.ok(work.checkIns.every(item => !('session_key' in item)))
        assert.ok(work.checkIns.some(item => item.kind === 'arrival' && item.assessments.some(assessment => assessment.orderId === own.body.id && assessment.status === 'inside')))
        const scoped = await manager(`/field-work?orderId=${own.body.id}`)
        assert.equal(scoped.status, 200)
        assert.equal(scoped.body.reports.length, 1)
        assert.equal(scoped.body.photos.length, 4)
        assert.equal(scoped.body.checkIns.length, 1)
        assert.ok(scoped.body.checkIns.every(item => item.kind === 'arrival' && item.orderId === own.body.id && item.employeeId === 'tech-own'), 'Login positions stay separate from work arrivals')
        const otherRecords = (await manager(`/field-work?orderId=${other.body.id}`)).body
        assert.deepEqual(otherRecords.reports, [])
        assert.deepEqual(otherRecords.photos, [])
        assert.deepEqual(otherRecords.checkIns, [])
        assert.equal((await manager('/field-work?orderId=missing')).status, 404)
        assert.equal((await request(`/field-work?orderId=${own.body.id}`)).status, 403)
        const orders = await request('/orders')
        assert.deepEqual(orders.body.map(order => order.id), [own.body.id])
        assert.deepEqual(orders.body[0].site, draft.site, 'Worker receives only the site of the assigned order')
        assert.equal(orders.body[0].attachments.length, 1)
        assert.equal(orders.body[0].attachments[0].instructions, 'Reparar la fisura y pintar la pared.')
        assert.equal((await request(ownUrl)).status, 200)
        assert.equal((await request(otherUrl)).status, 404, 'Worker cannot download another employee attachment')
        assert.equal((await request('/orders', 'POST', mediaOrder('tech-own'))).status, 403, 'Workers cannot upload orders')
        assert.equal((await request('/employees')).status, 403)
        assert.equal((await request('/applicants')).status, 403)
        assert.equal((await request('/dashboard/overview')).status, 403)
        assert.equal((await request('/orders', 'POST', draft)).status, 403)
        assert.equal((await request('/orders/' + other.body.id, 'PATCH', { assignedTo: 'tech-other', progress: 20, status: 'En ejecución', version: 1 })).status, 404)
        assert.equal((await request('/orders/' + own.body.id, 'PATCH', { assignedTo: 'tech-other', progress: 20, status: 'En ejecución', version: 1 })).status, 403)
        assert.equal((await request('/orders/' + own.body.id, 'PATCH', { assignedTo: 'tech-own', progress: 100, status: 'Cerrada', version: 1 })).status, 403)
        assert.equal((await request('/orders/' + own.body.id, 'PATCH', { assignedTo: 'tech-own', progress: 50, status: 'En ejecución', version: 1 })).status, 200)
      }
    }
    const allWork = (await manager('/field-work')).body
    const supervisor = client()
    assert.equal((await manager('/users', 'POST', { name: 'Supervisor de prueba', email: 'supervisor@example.test', password, role: 'Supervisor' })).status, 201)
    assert.equal((await supervisor('/auth/login', 'POST', { email: 'supervisor@example.test', password })).body.nextStep, 'authenticated')
    assert.equal((await supervisor('/users', 'POST', { name: 'Otra persona', email: 'other@example.test', password, role: 'Secretaria' })).status, 403)
    assert.equal((await supervisor('/orders/assignees')).status, 200)
    assert.equal((await supervisor('/employees')).status, 403)
    assert.equal((await supervisor('/dashboard/overview')).status, 200)
    const supervisedOrder = (await supervisor('/orders')).body.find(order => order.id === own.body.id)
    assert.equal((await supervisor(`/orders/${own.body.id}`, 'PATCH', { assignedTo: 'tech-own', progress: 100, status: 'Cerrada', version: supervisedOrder.version })).status, 403)
    assert.deepEqual((await supervisor('/field-work')).body.checkIns, [])
    assert.equal((await supervisor('/report-alerts')).body.totals.unread, 1, 'A supervisor has independent unread state')
    assert.deepEqual((await supervisor(`/field-work?orderId=${own.body.id}`)).body.photos, [], 'Scoped queries preserve location privacy')
    assert.deepEqual((await supervisor(`/field-work?orderId=${own.body.id}`)).body.checkIns, [])
    const siteEvidence = new FormData()
    siteEvidence.set('order', JSON.stringify({ version: supervisedOrder.version, observations: 'Reparar la zona señalada por el supervisor.', attachmentInstructions: ['Cambiar la pieza indicada.'] }))
    siteEvidence.set('attachments', new Blob([png], { type: 'image/png' }), 'visita.png')
    assert.equal((await supervisor(`/orders/${own.body.id}/evidence`, 'POST', siteEvidence)).status, 200)
    const updatedVisit = (await supervisor('/orders')).body.find(order => order.id === own.body.id)
    assert.equal(updatedVisit.attachments.length, 2)
    assert.equal(updatedVisit.observations, 'Reparar la zona señalada por el supervisor.')
    assert.equal((await supervisor(`/orders/${own.body.id}`, 'PATCH', { assignedTo: 'tech-own', progress: 50, status: 'Revisión', version: updatedVisit.version })).status, 200)
    assert.equal((await supervisor(`/orders/${own.body.id}/location`, 'PATCH', { geofence: null, version: updatedVisit.version })).status, 403)
    assert.equal((await manager(`/orders/${own.body.id}/location`, 'PATCH', { geofence: { latitude: 5, longitude: -74, radius: 150 }, version: updatedVisit.version + 1 })).status, 200)
    assert.equal((await manager(`/orders/${own.body.id}/location`, 'PATCH', { geofence: null, version: 2 })).status, 409)
    assert.equal((await manager(`/orders/${own.body.id}/location`, 'PATCH', { geofence: { latitude: 200, longitude: 0, radius: 100 }, version: 3 })).status, 400)
    assert.equal((await manager('/field-work')).body.photos[0].assessments[0].status, 'inside', 'Changing the work site does not rewrite old evidence')
    assert.equal(allWork.totals.pending, 1)
    assert.equal(allWork.checkIns.length, 2)
    assert.equal((await manager(`/field-work/reports/${fieldReportId}`, 'PATCH', { status: 'En atención', reply: 'Materiales autorizados.', version: 1 })).status, 200)
    assert.equal((await manager(`/field-work/reports/${fieldReportId}`, 'PATCH', { status: 'Resuelto', version: 1 })).status, 409)
    const review = await manager('/orders', 'POST', { ...draft, assignedTo: 'tech-other', priority: 'Crítica', date: '2000-01-01' })
    await manager(`/orders/${review.body.id}`, 'PATCH', { assignedTo: 'tech-other', progress: 40, status: 'Revisión', version: 1 })
    const closed = await manager('/orders', 'POST', { ...draft, assignedTo: 'tech-other' })
    await manager(`/orders/${closed.body.id}`, 'PATCH', { assignedTo: 'tech-other', progress: 100, status: 'Cerrada', version: 1 })
    await manager('/employees/tech-other/status', 'PATCH', { status: 'Vacaciones' })
    for (const status of ['Pendiente', 'Aprobado', 'Rechazado']) {
      await db.run(`INSERT INTO applicants (id,"fullName",email,phone,"birthDate",gender,address,city,"identityNumber",education,area,experience,availability,"emergencyContact","emergencyPhone",status,"createdAt")
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [`candidate-${status}`, 'Test candidate', 'candidate@example.test', '3000000000', '1990-01-01', 'Sin especificar', 'Address', 'Bogota', status, 'Test', 'Electricidad', 'Test', 'Full time', 'Contact', '3000000001', status, new Date().toISOString()])
    }
    const metrics = (await manager('/dashboard/overview')).body
    assert.deepEqual(metrics.orders, { total: 7, open: 6, closed: 1, averageProgress: 27 })
    assert.deepEqual(metrics.operations, { openAverageProgress: 15, review: 2, unassigned: 3, critical: 1, overdue: 1 })
    assert.deepEqual(metrics.employees, { total: 2, active: 1, vacation: 1, leave: 0, inactive: 0 })
    assert.deepEqual(metrics.applicants, { total: 3, pending: 1, approved: 1, rejected: 1 })
    assert.deepEqual(metrics.media, { files: 12, bytes: 12 * png.length })
    const secretary = client()
    await secretary('/auth/login', 'POST', { email: 'secretary@example.test', password })
    assert.equal((await secretary('/report-alerts')).body.totals.unread, 1, 'Secretary sees existing outstanding reports after login')
    assert.equal((await secretary(`/report-alerts/${fieldReportId}/read`, 'PATCH')).status, 200)
    assert.equal((await secretary('/report-alerts')).body.totals.unread, 0)
    assert.equal((await supervisor('/report-alerts')).body.totals.unread, 1, 'Reading in one account does not dismiss another account alert')
    const focusedReport = await secretary(`/field-work?orderId=${own.body.id}&reportId=${fieldReportId}`)
    assert.equal(focusedReport.status, 200)
    assert.equal(focusedReport.body.reports[0].id, fieldReportId)
    assert.deepEqual(focusedReport.body.checkIns, [])
    assert.equal((await secretary(`/field-work?orderId=${other.body.id}&reportId=${fieldReportId}`)).status, 404)
    assert.equal((await secretary(`/field-work?reportId=${fieldReportId}`)).status, 400)
    assert.equal((await secretary(`/field-work/reports/${fieldReportId}`, 'PATCH', { status: 'En atención', reply: 'Secretaría coordina el envío de materiales.', version: 2 })).status, 200)
    const messages = (await workerRequest('/field-work')).body
    assert.equal(messages.unreadNotifications, 2, 'Each committed review creates a persistent notification')
    assert.ok(messages.notifications.some(n => n.reviewerRole === 'Secretaria' && n.reply === 'Secretaría coordina el envío de materiales.'))
    assert.equal((await workerRequest(`/field-work/notifications/${messages.notifications[0].id}/read`, 'PATCH')).status, 200)
    assert.equal((await workerRequest('/field-work')).body.unreadNotifications, 1)
    assert.equal((await workerRequest('/field-work/notifications/read-all', 'POST')).status, 200)
    assert.equal((await workerRequest('/field-work')).body.unreadNotifications, 0)
    assert.equal((await secretary(`/orders/${own.body.id}/evidence`, 'POST', {})).status, 403)
    assert.equal((await secretary('/dashboard/overview')).body.employees, null, 'Staff counts stay manager-only')
    const newWorkerPayload = { name: 'Nuevo trabajador', email: 'new-worker@example.test', password, role: 'Trabajador', employeeDetails: { area: 'Plomería', title: 'Técnico', shift: 'Diurno' } }
    assert.equal((await secretary('/users', 'POST', newWorkerPayload)).status, 403)
    const staffBefore = (await db.get('SELECT COUNT(*) AS total FROM employees')).total
    assert.equal((await manager('/users', 'POST', { ...newWorkerPayload, employeeDetails: { area: '', title: 'Técnico', shift: 'Diurno' } })).status, 400)
    const newWorker = await manager('/users', 'POST', newWorkerPayload)
    assert.equal(newWorker.status, 201, JSON.stringify(newWorker.body))
    const employee = await db.get('SELECT * FROM employees WHERE id=?', [newWorker.body.user.employeeId])
    assert.equal(employee.name, newWorkerPayload.name)
    assert.equal(employee.status, 'Activo')
    assert.equal(employee.area, 'Plomería')
    assert.equal((await db.get('SELECT employee_id FROM user_employees WHERE user_id=?', [newWorker.body.user.id])).employee_id, employee.id)
    assert.equal((await manager('/users', 'POST', newWorkerPayload)).status, 409)
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM employees')).total, staffBefore + 1, 'Duplicate accounts do not leave extra employee records')
    const newSession = client()
    assert.equal((await newSession('/auth/login', 'POST', { email: newWorkerPayload.email, password })).body.nextStep, 'location-required')
    assert.equal((await newSession('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() } })).status, 200)
    assert.deepEqual((await newSession('/orders')).body, [], 'New worker does not inherit other orders')
    const privateWork = (await newSession('/field-work')).body
    assert.deepEqual(privateWork.notifications, [])
    assert.equal((await newSession(`/field-work/notifications/${messages.notifications[0].id}/read`, 'PATCH')).status, 404)
    assert.deepEqual(privateWork.reports, [])
    assert.equal(privateWork.checkIns.length, 0, 'Worker does not receive location history')
    const sameDay = await newSession('/auth/login', 'POST', { email: newWorkerPayload.email, password })
    assert.equal(sameDay.body.locationNoticeRequired, false, 'Daily notice is remembered by the server')
    assert.equal((await newSession('/orders')).status, 401, 'Skipping the notice still requires a fresh location')
    assert.equal((await newSession('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() } })).status, 200)
    await db.run("UPDATE worker_check_ins SET created_at='2000-01-01T12:00:00.000Z' WHERE user_id=?", [newWorker.body.user.id])
    const nextDay = await newSession('/auth/login', 'POST', { email: newWorkerPayload.email, password })
    assert.equal(nextDay.body.locationNoticeRequired, true, 'An old record does not skip today notice')
    await newSession('/auth/worker-location', 'POST', { location: { status: 'captured', latitude: 4.65, longitude: -74.06, accuracy: 12, capturedAt: new Date().toISOString() } })
    assert.deepEqual(privateWork.photos, [], 'Another worker cannot access photo metadata')
    assert.equal((await newSession(`/field-work/photos/${allWork.photos[0].id}/content`)).status, 404)
    assert.ok((await manager('/orders/assignees')).body.some(person => person.id === employee.id), 'New employee can receive orders immediately')
    assert.equal((await newSession('/inventory')).status, 403, 'Workers cannot browse the warehouse')
    assert.equal((await secretary('/inventory')).status, 200, 'Secretary has read-only stock visibility')
    assert.equal((await secretary('/inventory', 'POST', { kind: 'Herramienta', name: 'No permitido' })).status, 403)
    const tool = await supervisor('/inventory', 'POST', { kind: 'Herramienta', code: '00012345', name: 'Taladro de prueba', brand: 'Marca', serial: 'SERIE-01' })
    assert.equal(tool.status, 201, JSON.stringify(tool.body))
    assert.equal(tool.body.code, '00012345', 'Leading zeros are preserved')
    assert.equal((await manager('/inventory', 'POST', { kind: 'Herramienta', code: '00012345', name: 'Duplicado' })).status, 409)
    const move = async (request, itemId, action, values = {}) => {
      const item = (await request('/inventory')).body.items.find(item => item.id === itemId)
      return request(`/inventory/${itemId}/movements`, 'POST', { action, version: item.version, requestId: randomUUID(), notes: 'Movimiento verificado', ...values })
    }
    const loan = { action: 'Préstamo', version: 1, requestId: randomUUID(), employeeId: 'tech-own', orderId: own.body.id, dueDate: '2999-01-01', notes: 'Entrega completa con accesorios.' }
    const simultaneous = await Promise.all([
      supervisor(`/inventory/${tool.body.id}/movements`, 'POST', loan),
      supervisor(`/inventory/${tool.body.id}/movements`, 'POST', { ...loan, requestId: randomUUID() }),
    ])
    assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 409], 'Only one concurrent loan succeeds')
    const successfulRequest = simultaneous[0].status === 200 ? loan : null
    if (successfulRequest) assert.equal((await supervisor(`/inventory/${tool.body.id}/movements`, 'POST', successfulRequest)).status, 200, 'Network retry is idempotent')
    let warehouse = (await manager('/inventory')).body
    let borrowed = warehouse.items.find(item => item.id === tool.body.id)
    assert.equal(borrowed.employeeId, 'tech-own')
    assert.equal(borrowed.client, draft.client)
    assert.equal(borrowed.status, 'Prestada')
    assert.equal((await move(supervisor, tool.body.id, 'Préstamo', { employeeId: 'tech-own', orderId: own.body.id })).status, 409)
    assert.equal((await move(supervisor, tool.body.id, 'Devolución con daño')).status, 200)
    assert.equal((await move(supervisor, tool.body.id, 'Préstamo', { employeeId: 'tech-own', orderId: own.body.id })).status, 409)
    assert.equal((await move(supervisor, tool.body.id, 'Disponible')).status, 200)
    assert.equal((await move(supervisor, tool.body.id, 'Baja')).status, 403)
    const qr = await manager(`/inventory/${tool.body.id}/qr.png`)
    assert.equal(qr.status, 200)
    assert.equal(qr.headers.get('Content-Type'), 'image/png')
    assert.equal(qr.body.readUInt32BE(16), 360)
    const material = await manager('/inventory', 'POST', { kind: 'Material', name: 'Cable de prueba', code: '00054321', unit: 'metro', initial: 10.5, minimum: 5 })
    assert.equal(material.status, 201)
    assert.equal((await move(supervisor, material.body.id, 'Entrada', { quantity: 5.25 })).status, 200)
    assert.equal((await move(supervisor, material.body.id, 'Entrega a obra', { quantity: 8.125, employeeId: 'tech-own', orderId: own.body.id })).status, 200)
    assert.equal((await move(supervisor, material.body.id, 'Entrega a obra', { quantity: 100, employeeId: 'tech-own', orderId: own.body.id })).status, 409)
    warehouse = (await manager('/inventory')).body
    assert.equal(warehouse.items.find(item => item.id === material.body.id).warehouse, 7.625)
    assert.equal(warehouse.allocations.find(a => a.itemId === material.body.id).quantity, 8.125)
    assert.equal((await move(supervisor, material.body.id, 'Consumo', { quantity: 3.125, employeeId: 'tech-own', orderId: own.body.id })).status, 200)
    assert.equal((await move(supervisor, material.body.id, 'Retorno a bodega', { quantity: 2.5, employeeId: 'tech-own', orderId: own.body.id })).status, 200)
    warehouse = (await manager('/inventory')).body
    assert.equal(warehouse.items.find(item => item.id === material.body.id).warehouse, 10.125, 'Only returned surplus is available to another work site')
    assert.equal(warehouse.allocations.find(a => a.itemId === material.body.id).quantity, 2.5)
    assert.equal((await move(supervisor, material.body.id, 'Retorno a bodega', { quantity: 3, employeeId: 'tech-own', orderId: own.body.id })).status, 409)
    assert.equal((await move(supervisor, material.body.id, 'Entrada', { quantity: -1 })).status, 400)
    assert.equal((await move(supervisor, material.body.id, 'Ajuste negativo', { quantity: 1 })).status, 403)
    assert.equal((await move(manager, material.body.id, 'Ajuste negativo', { quantity: 1 })).status, 200)
    const itemVersion = (await manager('/inventory')).body.items.find(item => item.id === material.body.id).version
    assert.equal((await manager(`/inventory/${material.body.id}`, 'PATCH', { name: 'Cable corregido', minimum: 10, version: itemVersion })).status, 200)
    assert.equal((await supervisor(`/inventory/${material.body.id}`, 'PATCH', { name: 'No permitido', version: itemVersion + 1 })).status, 403)
    const history = await manager(`/inventory/${tool.body.id}/history`)
    assert.equal(history.body.filter(m => m.action === 'Préstamo').length, 1)
    assert.equal(history.body.find(m => m.action === 'Devolución con daño').employeeName, 'tech-own')
    assert.ok(history.body.every(m => m.actorName && m.createdAt))
    const deletionVersion = (await manager('/orders')).body.find(order => order.id === own.body.id).version
    const storedReport = await db.get('SELECT user_id,employee_id,version FROM worker_reports WHERE id=?', [fieldReportId])
    const criticalId = randomUUID()
    await db.run('INSERT INTO worker_reports (id,user_id,employee_id,order_id,category,urgency,title,details,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [criticalId, storedReport.user_id, storedReport.employee_id, own.body.id, 'Problema', 'Crítica', 'Bloqueo urgente', 'El trabajo no puede continuar.', new Date().toISOString()])
    assert.equal((await secretary('/report-alerts')).body.reports[0].id, criticalId, 'Critical reports are prioritized')
    assert.equal((await secretary('/report-alerts')).body.totals.critical, 1)
    await db.run('DELETE FROM worker_reports WHERE id=?', [criticalId])
    assert.equal((await secretary(`/field-work/reports/${fieldReportId}`, 'PATCH', { status: 'Resuelto', reply: 'Materiales entregados. Continúa el trabajo.', version: storedReport.version })).status, 200)
    for (const request of [manager, secretary, supervisor]) assert.equal((await request('/report-alerts')).body.totals.total, 0, 'Resolving clears the outstanding alert for all reviewers')
    for (const request of [secretary, supervisor, workerRequest]) {
      assert.equal((await request(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion })).status, 403, 'Only Gerente may delete an order')
    }
    assert.equal((await client()(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion })).status, 401)
    assert.equal((await manager(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion }, { 'X-CSRF-Token': '' })).status, 403)
    assert.equal((await manager(`/orders/${own.body.id}`, 'DELETE', {})).status, 400)
    assert.equal((await manager(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion - 1 })).status, 409, 'Do not delete a changed order')
    const pendingDeletion = await manager(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion })
    assert.equal(pendingDeletion.status, 409, JSON.stringify(pendingDeletion.body))
    assert.ok(await db.get('SELECT id FROM worker_reports WHERE id=?', [fieldReportId]), 'Rejected delete preserves reports')
    assert.equal((await manager(ownUrl)).status, 200, 'Rejected delete preserves media')
    assert.equal((await move(supervisor, material.body.id, 'Retorno a bodega', { quantity: 2.5, employeeId: 'tech-own', orderId: own.body.id })).status, 200)
    const movementsBefore = (await db.get('SELECT COUNT(*) AS total FROM inventory_movements')).total
    const removed = await manager(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion })
    assert.equal(removed.status, 200, JSON.stringify(removed.body))
    for (const table of ['work_orders', 'order_attachments', 'worker_reports', 'worker_photos', 'worker_check_ins', 'inventory_allocations']) {
      const column = table === 'work_orders' ? 'id' : 'order_id'
      assert.equal((await db.get(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column}=?`, [own.body.id])).total, 0, `${table} cleaned up`)
    }
    assert.equal((await manager(ownUrl)).status, 404, 'Deleted attachments are inaccessible')
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM inventory_movements')).total, movementsBefore, 'Stock history is retained')
    assert.ok((await manager(`/inventory/${tool.body.id}/history`)).body.some(m => m.notes.includes(`Orden eliminada: ${own.body.id}`)))
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM security_events WHERE event=?', [`order_deleted:${own.body.id}`])).total, 1)
    assert.equal((await manager(`/orders/${own.body.id}`, 'DELETE', { version: deletionVersion })).status, 404)
    assert.equal((await manager(`/orders/${closed.body.id}`, 'DELETE', { version: 2 })).status, 200, 'Closed orders can be deleted')
    assert.equal((await manager(`/orders/${legacyOrder.body.id}`, 'DELETE', { version: legacyOrder.body.version })).status, 200)
    await assert.rejects(readFile(legacyPath), { code: 'ENOENT' }, 'Legacy disk attachment is removed after commit')
    const secretContact = (await manager('/messages')).body.find(contact => contact.role === 'Secretaria')
    const managerContact = (await secretary('/messages')).body.find(contact => contact.role === 'Gerente')
    assert.ok(secretContact && managerContact)
    assert.equal((await client()('/messages')).status, 401)
    assert.equal((await supervisor('/messages')).status, 403)
    assert.equal((await supervisor(`/messages/${managerContact.id}`, 'POST', { body: 'No permitido', clientId: randomUUID() })).status, 403)
    const messageDraft = { body: 'Coordinar los trabajos de mañana.', clientId: randomUUID() }
    assert.equal((await manager(`/messages/${secretContact.id}`, 'POST', messageDraft, { 'X-CSRF-Token': '' })).status, 403)
    assert.equal((await manager(`/messages/${secretContact.id}`, 'POST', { ...messageDraft, body: ' ' })).status, 400)
    const sent = await manager(`/messages/${secretContact.id}`, 'POST', messageDraft)
    assert.equal(sent.status, 201)
    assert.equal((await manager(`/messages/${secretContact.id}`, 'POST', messageDraft)).body.id, sent.body.id, 'Retry cannot duplicate a message')
    assert.equal((await manager(`/messages/${secretContact.id}`, 'POST', { ...messageDraft, body: 'Changed retry' })).status, 409)
    assert.equal((await secretary('/messages')).body.find(contact => contact.id === managerContact.id).unread, 1)
    const inbox = (await secretary(`/messages/${managerContact.id}`)).body
    assert.equal(inbox.messages[0].body, messageDraft.body)
    assert.equal(inbox.messages[0].own, false)
    assert.equal(inbox.messages[0].readAt, null)
    assert.equal((await secretary(`/messages/${managerContact.id}/read`, 'PATCH', { ids: [sent.body.id] })).status, 200)
    assert.equal((await secretary('/messages')).body[0].unread, 0)
    assert.ok((await manager(`/messages/${secretContact.id}`)).body.messages[0].readAt)
    const reply = await secretary(`/messages/${managerContact.id}`, 'POST', { body: 'Confirmado, gerente.', clientId: randomUUID() })
    assert.equal(reply.status, 201)
    assert.equal((await manager('/messages')).body.find(contact => contact.id === secretContact.id).unread, 1)
    await manager('/users', 'POST', { name: 'Segunda secretaria', email: 'second.secretary@example.test', password, role: 'Secretaria' })
    const secondSecretary = client()
    await secondSecretary('/auth/login', 'POST', { email: 'second.secretary@example.test', password })
    assert.deepEqual((await secondSecretary(`/messages/${managerContact.id}`)).body.messages, [], 'Other secretaries cannot read this private conversation')
    assert.equal((await secondSecretary(`/messages/${managerContact.id}?before=${sent.body.id}`)).status, 404, 'History cursors are private')
    assert.equal((await secondSecretary(`/messages/${secretContact.id}`)).status, 404, 'Same-role messaging is excluded')
    for (let i = 0; i < 53; i++) await db.run('INSERT INTO direct_messages (id,sender_id,recipient_id,client_id,body,created_at) VALUES (?,?,?,?,?,?)', [randomUUID(), managerContact.id, secretContact.id, randomUUID(), `Historial ${i}`, new Date(Date.UTC(2000, 0, 1, 0, 0, i)).toISOString()])
    const latest = (await manager(`/messages/${secretContact.id}`)).body
    assert.equal(latest.messages.length, 50)
    assert.equal(latest.hasMore, true)
    const older = (await manager(`/messages/${secretContact.id}?before=${latest.messages[0].id}`)).body
    assert.equal(older.messages.length, 5)
    assert.equal(older.hasMore, false)
    assert.equal(new Set([...latest.messages, ...older.messages].map(message => message.id)).size, 55, 'History pagination has no duplicates or omissions')
  } finally { await db.close() }
})
