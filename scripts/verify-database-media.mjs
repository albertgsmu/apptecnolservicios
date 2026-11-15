import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import dotenv from 'dotenv'
import pg from 'pg'
import { createOrderMediaStorage } from '../server/storage/order-media.js'
import { streamDatabaseMedia } from '../server/storage/database-media.js'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })
if (process.env.ALLOW_MEDIA_VERIFICATION !== 'non-production-branch') throw new Error('Verifica la rama de desarrollo y configura ALLOW_MEDIA_VERIFICATION=non-production-branch.')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
const directory = await mkdtemp(path.join(os.tmpdir(), 'jp-pg-media-'))
let connected = false

class Response extends Writable {
  constructor() { super(); this.chunks = []; this.headers = {}; this.code = 200 }
  _write(chunk, _encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback() }
  set(key, value) { this.headers[key] = value; return this }
  status(code) { this.code = code; return this }
}

try {
  await client.connect()
  connected = true
  await client.query('BEGIN')
  // Shadows the real table for this connection only; rolled back at the end.
  await client.query('CREATE TEMP TABLE order_attachments (LIKE public.order_attachments INCLUDING ALL) ON COMMIT DROP')
  const store = createOrderMediaStorage({ ORDER_UPLOAD_DIR: directory })
  const content = randomBytes(1024 * 1024 + 257)
  const id = randomUUID()
  const filename = `${id}.bin`
  const temporaryPath = path.join(directory, filename)
  await writeFile(temporaryPath, content)
  const req = { files: [{ path: temporaryPath, media: { id, name: 'verification.bin', mimeType: 'video/mp4', size: content.length, storageKey: filename } }] }
  await store.cleanupAfter(async () => store.persist(req, { run: (...args) => client.query(...args) }, 'temporary-verification-order'))(req, {})
  const stored = (await client.query('SELECT id,size_bytes,content_sha256 FROM order_attachments WHERE id=$1', [id])).rows[0]
  assert.equal(stored.content_sha256, createHash('sha256').update(content).digest('hex'))
  const dbGet = async (...args) => (await client.query(...args)).rows[0]
  for (const range of [undefined, 'bytes=1048500-1048700']) {
    const response = new Response()
    await streamDatabaseMedia({ method: 'GET', get: () => range }, response, stored, dbGet)
    await finished(response)
    assert.deepEqual(Buffer.concat(response.chunks), range ? content.subarray(1048500, 1048701) : content)
    assert.equal(response.code, range ? 206 : 200)
  }
  console.log('PostgreSQL: BYTEA upload, SHA-256, full download across 1 MiB chunks, and byte ranges passed. Temporary table rolled back; no test orders persisted.')
} finally {
  if (connected) await client.query('ROLLBACK')
  await client.end()
  await rm(directory, { recursive: true, force: true })
}
