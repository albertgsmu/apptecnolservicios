import * as webpush from 'web-push'
import { randomUUID } from 'node:crypto'
import { encryptMfaSecret, decryptMfaSecret } from './auth-security.js'
import { collectReminders } from './report-followups.js'

export function validSubscription(value) {
  try {
    const url = new URL(value.endpoint)
    const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname) || /^[a-z0-9.-]+\.notify\.windows\.com$/.test(url.hostname)
    return allowed && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash && value.endpoint.length <= 2048 && /^B[A-Za-z0-9_-]{86}$/.test(value.keys?.p256dh) && /^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth)
  } catch { return false }
}

export function createPushService({ dbGet, dbRun, dbQuery, withTransaction, io, autoWake = true, send = webpush.sendNotification.bind(webpush) }) {
  let keyPromise
  const keys = () => keyPromise ??= (async () => {
    const generated = webpush.generateVAPIDKeys()
    await dbRun('INSERT INTO push_settings (id,public_key,private_key) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING', ['vapid', generated.publicKey, encryptMfaSecret(generated.privateKey)])
    const row = await dbGet("SELECT public_key,private_key FROM push_settings WHERE id='vapid'")
    return { publicKey: row.public_key, privateKey: decryptMfaSecret(row.private_key) }
  })().catch(error => { keyPromise = undefined; throw error })
  let running = null
  const tick = () => running ??= (async () => {
    await collectReminders({ dbQuery, withTransaction, io })
    const now = new Date().toISOString()
    // Sent notices are not the history: the work conversation keeps that history.
    await dbRun('DELETE FROM push_jobs WHERE sent_at IS NOT NULL AND created_at < $1', [new Date(Date.now() - 7 * 86400000).toISOString()])
    const jobs = await dbQuery('SELECT * FROM push_jobs WHERE sent_at IS NULL AND available_at <= $1 AND (lease_until IS NULL OR lease_until <= $1) ORDER BY created_at LIMIT 10', [now])
    for (const job of jobs) {
      const claimed = await dbRun('UPDATE push_jobs SET lease_until=$1,attempts=attempts+1 WHERE id=$2 AND sent_at IS NULL AND (lease_until IS NULL OR lease_until <= $3)', [new Date(Date.now() + 120000).toISOString(), job.id, now])
      if ((claimed.rowCount ?? claimed.changes) !== 1) continue
      const report = job.report_id ? await dbGet('SELECT id,order_id,status FROM worker_reports WHERE id=$1', [job.report_id]) : null
      if (job.report_id && (!report || (report.status === 'Resuelto' && job.kind !== 'reply'))) {
        await dbRun('UPDATE push_jobs SET sent_at=$1 WHERE id=$2', [now, job.id]); continue
      }
      if (['assigned', 'overdue'].includes(job.kind)) {
        const current = await dbGet('SELECT f.assignee_id,f.due_at,u.role FROM report_followups f JOIN users u ON u.id=$2 WHERE f.report_id=$1', [job.report_id, job.user_id])
        if (!current || (job.kind === 'assigned' && current.assignee_id !== job.user_id) || (job.kind === 'overdue' && (current.due_at > now || (current.assignee_id !== job.user_id && current.role !== 'Gerente')))) {
          await dbRun('UPDATE push_jobs SET sent_at=$1 WHERE id=$2', [now, job.id]); continue
        }
      }
      const subscriptions = await dbQuery(`SELECT p.endpoint,p.subscription FROM push_subscriptions p JOIN users u ON u.id=p.user_id
        WHERE p.user_id=$1 AND p.account_version=u.account_version AND u.access_blocked=FALSE AND u.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM user_employees ue JOIN employees e ON e.id=ue.employee_id WHERE ue.user_id=u.id AND e.status='Inactivo')`, [job.user_id])
      let retry = false
      await Promise.all(subscriptions.map(async entry => {
        // Recheck delivery eligibility immediately before contacting a provider.
        if (!await dbGet('SELECT p.endpoint FROM push_subscriptions p JOIN users u ON u.id=p.user_id WHERE p.endpoint=$1 AND p.user_id=$2 AND p.account_version=u.account_version AND u.access_blocked=FALSE AND u.archived_at IS NULL', [entry.endpoint, job.user_id])) return
        try {
          const pair = await keys()
          const titles = { new: 'Nuevo reporte de obra', assigned: 'Tienes un reporte asignado', overdue: 'Reporte con plazo vencido', reply: 'Respuesta en tu obra', test: 'Notificaciones activadas' }
          const payload = { title: titles[job.kind] ?? 'JP Mantenimiento', body: job.kind === 'test' ? 'Este celular puede recibir avisos de la aplicación.' : 'Entra a la aplicación para consultar el seguimiento.', tag: job.report_id ? `report-${job.report_id}` : job.id, url: report ? `/?work=${encodeURIComponent(report.order_id)}&report=${encodeURIComponent(report.id)}` : '/' }
          await send(JSON.parse(decryptMfaSecret(entry.subscription)), JSON.stringify(payload), { vapidDetails: { subject: 'https://jp-mantenimiento.onrender.com', ...pair }, TTL: 300, urgency: 'high', timeout: 10000 })
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) await dbRun('DELETE FROM push_subscriptions WHERE endpoint=$1', [entry.endpoint])
          else retry = true
        }
      }))
      if (retry && job.attempts < 4) await dbRun('UPDATE push_jobs SET lease_until=NULL,available_at=$1,last_error=$2 WHERE id=$3', [new Date(Date.now() + 60000 * 2 ** job.attempts).toISOString(), 'delivery_retry', job.id])
      else await dbRun('UPDATE push_jobs SET sent_at=$1,lease_until=NULL,last_error=$2 WHERE id=$3', [new Date().toISOString(), retry ? 'delivery_failed' : null, job.id])
    }
    return { processed: jobs.length }
  })().finally(() => { running = null })
  const wake = () => { if (autoWake) void tick().catch(() => console.error('No se pudo completar la revisión de avisos. Se reintentará.')) }
  return { keys, tick, wake }
}

export function registerPushNotifications(app, { authRequired, asyncRoute, dbGet, dbRun, dbQuery, service }) {
  app.get('/api/push/public-key', authRequired, asyncRoute(async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ publicKey: (await service.keys()).publicKey })
  }))
  app.post('/api/push/subscribe', authRequired, asyncRoute(async (req, res) => {
    if (!validSubscription(req.body)) return res.status(400).json({ message: 'Suscripción de notificaciones no válida.' })
    const current = await dbGet('SELECT user_id FROM push_subscriptions WHERE endpoint=$1', [req.body.endpoint])
    const count = await dbGet('SELECT COUNT(*) AS total FROM push_subscriptions WHERE user_id=$1', [req.user.id])
    if (!current && Number(count.total) >= 10) return res.status(409).json({ message: 'Ya tienes 10 dispositivos registrados. Desactiva uno antes de agregar otro.' })
    const clean = { endpoint: req.body.endpoint, keys: { p256dh: req.body.keys.p256dh, auth: req.body.keys.auth } }
    await dbRun(`INSERT INTO push_subscriptions (endpoint,user_id,account_version,subscription,created_at) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (endpoint) DO UPDATE SET user_id=excluded.user_id,account_version=excluded.account_version,subscription=excluded.subscription,created_at=excluded.created_at`, [clean.endpoint, req.user.id, req.authSession.account_version, encryptMfaSecret(JSON.stringify(clean)), new Date().toISOString()])
    res.json({ message: 'Notificaciones activadas en este dispositivo.' })
  }))
  app.post('/api/push/status', authRequired, asyncRoute(async (req, res) => {
    const row = typeof req.body?.endpoint === 'string' ? await dbGet('SELECT endpoint FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2 AND account_version=$3', [req.body.endpoint, req.user.id, req.authSession.account_version]) : null
    res.json({ active: Boolean(row) })
  }))
  app.post('/api/push/unsubscribe', authRequired, asyncRoute(async (req, res) => {
    if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ message: 'Indica el dispositivo.' })
    await dbRun('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [req.body.endpoint, req.user.id])
    res.json({ message: 'Notificaciones desactivadas en este dispositivo.' })
  }))
  app.post('/api/push/test', authRequired, asyncRoute(async (req, res) => {
    const devices = await dbQuery('SELECT endpoint FROM push_subscriptions WHERE user_id=$1 AND account_version=$2', [req.user.id, req.authSession.account_version])
    if (!devices.length) return res.status(400).json({ message: 'Activa primero las notificaciones.' })
    const recent = await dbGet("SELECT id FROM push_jobs WHERE user_id=$1 AND kind='test' AND created_at > $2", [req.user.id, new Date(Date.now() - 60000).toISOString()])
    if (recent) return res.status(429).json({ message: 'Espera un minuto antes de otra prueba.' })
    const now = new Date().toISOString()
    await dbRun("INSERT INTO push_jobs (id,user_id,kind,created_at,available_at) VALUES ($1,$2,'test',$3,$3)", [randomUUID(), req.user.id, now])
    service.wake()
    res.json({ message: 'Prueba puesta en envío. Comprueba el aviso en tu celular.' })
  }))
}
