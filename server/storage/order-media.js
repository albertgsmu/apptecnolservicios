import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import multer from 'multer'
import { fileTypeFromFile } from 'file-type'
import { ORDER_MEDIA_LIMITS, ORDER_MEDIA_TYPES } from '../../shared/order-media.js'

function safeOriginalName(name) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  const value = decoded.includes('\ufffd') ? name : decoded
  const safe = Array.from(value, character => character === '/' || character === '\\' || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character)
  return safe.slice(0, 160).join('') || 'adjunto'
}

export function createOrderMediaStorage(env = process.env) {
  const directory = path.resolve(env.ORDER_UPLOAD_DIR || 'server/data/uploads/orders')
  const temporaryDirectory = env.ORDER_UPLOAD_DIR ? path.join(directory, 'pending') : path.join(os.tmpdir(), 'jp-order-uploads')
  const upload = multer({
    storage: multer.diskStorage({
      destination: temporaryDirectory,
      filename: (_req, _file, callback) => callback(null, `${randomUUID()}.bin`),
    }),
    limits: { fileSize: ORDER_MEDIA_LIMITS.videoBytes, fields: 1, fieldSize: 1024 * 1024 },
  }).array('attachments')

  const filePath = key => {
    if (!/^[a-f0-9-]{36}\.bin$/.test(key)) throw new Error('Invalid media storage key')
    return path.join(directory, key)
  }

  const discard = async req => {
    await Promise.all((req.files ?? []).map(async file => {
      try { await unlink(file.path) }
      catch (error) { if (error.code !== 'ENOENT') console.error('No se pudo limpiar un adjunto pendiente:', error.code) }
    }))
  }

  const middleware = (req, res, next) => {
    if (!req.is('multipart/form-data')) return next()
    mkdir(temporaryDirectory, { recursive: true }).then(() => upload(req, res, async error => {
      try {
        if (error) throw error
        if (typeof req.body?.order !== 'string') throw Object.assign(new Error('Faltan los datos de la orden.'), { status: 400 })
        let payload
        try { payload = JSON.parse(req.body.order) }
        catch { throw Object.assign(new Error('Los datos de la orden no son válidos.'), { status: 400 }) }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('Los datos de la orden no son válidos.'), { status: 400 })
        req.body = payload
        const instructions = payload.attachmentInstructions ?? []
        if (!Array.isArray(instructions) || (instructions.length && instructions.length !== (req.files ?? []).length) ||
          instructions.some(text => typeof text !== 'string' || text.length > ORDER_MEDIA_LIMITS.instructionCharacters)) {
          throw Object.assign(new Error('Revisa las indicaciones de los archivos: hasta 2.000 caracteres por adjunto.'), { status: 400 })
        }
        for (const [index, file] of (req.files ?? []).entries()) {
          const detected = await fileTypeFromFile(file.path).catch(() => undefined)
          if (!detected || !ORDER_MEDIA_TYPES.includes(detected.mime)) throw Object.assign(new Error('Adjunta únicamente imágenes JPG, PNG, WEBP o videos MP4 y WEBM válidos.'), { status: 415 })
          const limit = detected.mime.startsWith('image/') ? ORDER_MEDIA_LIMITS.imageBytes : ORDER_MEDIA_LIMITS.videoBytes
          if (file.size > limit) throw Object.assign(new Error('Cada imagen admite hasta 10 MB y cada video hasta 25 MB.'), { status: 413 })
          file.media = { id: path.parse(file.filename).name, name: safeOriginalName(file.originalname), mimeType: detected.mime, size: file.size, storageKey: file.filename, instructions: instructions[index]?.trim() ?? '' }
        }
        next()
      } catch (cause) {
        await discard(req)
        const tooLarge = cause.code === 'LIMIT_FILE_SIZE'
        const status = tooLarge ? 413 : cause.status ?? (cause instanceof multer.MulterError ? 400 : 500)
        const message = tooLarge ? 'Cada video admite hasta 25 MB.' : cause instanceof multer.MulterError ? 'Revisa el formato y el tamaño de los datos enviados.' : cause.status ? cause.message : 'No se pudieron preparar los adjuntos.'
        res.status(status).json({ message })
      }
    })).catch(next)
  }

  const persist = async (req, tx, orderId) => {
    for (const file of req.files ?? []) {
      const media = file.media
      const content = await readFile(file.path)
      const checksum = createHash('sha256').update(content).digest('hex')
      await tx.run(`INSERT INTO order_attachments (id, order_id, original_name, mime_type, size_bytes, storage_key, created_at, content, content_sha256, instructions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [media.id, orderId, media.name, media.mimeType, media.size, media.storageKey, new Date().toISOString(), content, checksum, media.instructions ?? ''])
    }
  }

  const cleanupAfter = handler => async (req, res) => {
    try { await handler(req, res) }
    finally { await discard(req) }
  }

  const importLegacy = async ({ dbQuery, dbGet, dbRun }) => {
    const pending = await dbQuery('SELECT id, storage_key, size_bytes FROM order_attachments WHERE content IS NULL')
    let migrated = 0, missing = 0
    for (const attachment of pending) {
      let bytes
      try { bytes = await readFile(filePath(attachment.storage_key)) }
      catch (error) { if (error.code === 'ENOENT') { missing++; continue }; throw error }
      if (bytes.length !== attachment.size_bytes) throw new Error('Un adjunto local tiene un tamaño diferente al registrado. Se conservó el archivo original.')
      const checksum = createHash('sha256').update(bytes).digest('hex')
      await dbRun('UPDATE order_attachments SET content=$1, content_sha256=$2 WHERE id=$3 AND content IS NULL', [bytes, checksum, attachment.id])
      const saved = await dbGet('SELECT content FROM order_attachments WHERE id=$1', [attachment.id])
      if (!saved?.content || createHash('sha256').update(saved.content).digest('hex') !== checksum) throw new Error('No se pudo verificar el traslado del adjunto a la base de datos.')
      migrated++
    }
    if (pending.length) console.log(`Adjuntos en base de datos: ${migrated} trasladados y verificados; ${missing} archivos locales no encontrados. Se conservaron las copias del disco.`)
    return { migrated, missing }
  }

  return { middleware, persist, cleanupAfter, filePath, importLegacy }
}
