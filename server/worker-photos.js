import { createHash, randomUUID } from 'node:crypto'
import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import { saveAssessments, readAssessments } from './location-assessments.js'
import { currentWorkerOrder } from './worker-assignment.js'

export const workDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export const validLocation = location => location?.status === 'captured' &&
  Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
  Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180 &&
  Number.isFinite(location.accuracy) && location.accuracy >= 0 && location.accuracy <= 100000 &&
  typeof location.capturedAt === 'string' && Number.isFinite(Date.parse(location.capturedAt)) &&
  Math.abs(Date.now() - Date.parse(location.capturedAt)) <= 300000

export async function migrateWorkerPhotos(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS worker_photos (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), employee_id TEXT NOT NULL REFERENCES employees(id),
    order_id TEXT NOT NULL REFERENCES work_orders(id), work_day TEXT NOT NULL, caption TEXT NOT NULL,
    mime_type TEXT NOT NULL, content BYTEA NOT NULL, checksum TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, accuracy DOUBLE PRECISION NOT NULL,
    captured_at TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(user_id, work_day, checksum)
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS worker_photos_day_idx ON worker_photos(work_day, employee_id)')
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['008-worker-photos', new Date().toISOString()])
}

export function registerWorkerPhotos(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction }) {
  const readers = allowRoles('Gerente', 'Trabajador')
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, fieldSize: 8000 } }).single('photo')
  app.post('/api/field-work/photos', authRequired, allowRoles('Trabajador'), (req, res, next) => {
    upload(req, res, error => error ? res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Envía una foto JPG, PNG o WEBP de hasta 10 MB con sus datos.' }) : next())
  }, asyncRoute(async (req, res) => {
    let location
    try { location = JSON.parse(req.body?.location) } catch { /* Validation below. */ }
    if (!validLocation(location)) return res.status(400).json({ message: 'Cada foto requiere una ubicación actual. Activa el permiso y vuelve a intentar.' })
    const { orderId: requestedOrder, caption = '' } = req.body ?? {}
    const orderId = await currentWorkerOrder(dbQuery, req.user.id)
    if (requestedOrder && requestedOrder !== orderId) return res.status(409).json({ message: 'Tu asignación cambió. Actualiza antes de enviar la foto.' })
    if (!req.file || typeof orderId !== 'string' || typeof caption !== 'string' || !caption.trim() || caption.length > 2000) return res.status(400).json({ message: 'Selecciona una obra, una foto y describe el trabajo mostrado.' })
    const type = await fileTypeFromBuffer(req.file.buffer).catch(() => null)
    if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) return res.status(415).json({ message: 'El archivo debe ser una imagen JPG, PNG o WEBP válida.' })
    const employee = await dbGet("SELECT e.id FROM employees e JOIN user_employees ue ON ue.employee_id=e.id WHERE ue.user_id=$1 AND e.status='Activo'", [req.user.id])
    if (!employee || !await dbGet("SELECT id FROM work_orders WHERE id=$1 AND assigned_to=$2 AND status <> 'Cerrada'", [orderId, employee.id])) return res.status(404).json({ message: 'Selecciona una orden abierta asignada a ti.' })
    const id = randomUUID(), now = new Date().toISOString(), day = workDay()
    const checksum = createHash('sha256').update(req.file.buffer).digest('hex')
    const result = await withTransaction(async tx => {
      const order = await tx.get('SELECT id,client,site_details FROM work_orders WHERE id=$1', [orderId])
      const inserted = await tx.run(`INSERT INTO worker_photos
      (id,user_id,employee_id,order_id,work_day,caption,mime_type,content,checksum,latitude,longitude,accuracy,captured_at,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (user_id,work_day,checksum) DO NOTHING`,
    [id, req.user.id, employee.id, orderId, day, caption.trim(), type.mime, req.file.buffer, checksum, location.latitude, location.longitude, location.accuracy, location.capturedAt, now])
      if ((inserted.rowCount ?? inserted.changes) === 1) await saveAssessments(tx, id, location, [order])
      return inserted
    })
    if ((result.rowCount ?? result.changes) !== 1) return res.status(409).json({ message: 'Esta foto ya fue registrada hoy. Envía otra evidencia.' })
    return res.status(201).json({ id, message: 'Foto y ubicación guardadas juntas.' })
  }))
  app.get('/api/field-work/photos/:id/content', authRequired, readers, asyncRoute(async (req, res) => {
    const photo = await dbGet(`SELECT content,mime_type FROM worker_photos WHERE id=$1${req.user.role === 'Trabajador' ? ' AND user_id=$2' : ''}`, req.user.role === 'Trabajador' ? [req.params.id, req.user.id] : [req.params.id])
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada.' })
    res.set({ 'Content-Type': photo.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(photo.content))
  }))
  return async user => {
    const worker = user.role === 'Trabajador', day = workDay()
    const photos = await dbQuery(`SELECT p.id,p.order_id,p.caption,p.latitude,p.longitude,p.accuracy,p.captured_at,p.created_at,p.work_day,e.name AS employee_name,o.client
      FROM worker_photos p JOIN employees e ON e.id=p.employee_id JOIN work_orders o ON o.id=p.order_id
      ${worker ? 'WHERE p.user_id=$1' : ''} ORDER BY p.created_at DESC,p.id LIMIT 100`, worker ? [user.id] : [])
    const daily = await dbQuery(`SELECT e.id,e.name,COUNT(p.id) AS count FROM employees e JOIN user_employees ue ON ue.employee_id=e.id
      JOIN users u ON u.id=ue.user_id LEFT JOIN worker_photos p ON p.employee_id=e.id AND p.work_day=$1
      WHERE e.status='Activo' AND u.role='Trabajador' ${worker ? 'AND u.id=$2' : ''}
      AND EXISTS (SELECT 1 FROM work_orders o WHERE o.assigned_to=e.id AND o.status <> 'Cerrada')
      GROUP BY e.id,e.name ORDER BY e.name`, worker ? [day, user.id] : [day])
    const assessments = await readAssessments(dbQuery, photos.map(p => p.id))
    return { photos: photos.map(p => ({ id: p.id, orderId: p.order_id, caption: p.caption, ...(worker ? {} : { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, capturedAt: p.captured_at }), createdAt: p.created_at, day: p.work_day, employeeName: p.employee_name, client: p.client, assessments: worker ? [] : assessments.get(p.id) ?? [] })), dailyPhotos: { day, required: 3, workers: daily.map(e => ({ employeeId: e.id, name: e.name, count: Number(e.count), missing: Math.max(0, 3 - Number(e.count)) })) } }
  }
}
