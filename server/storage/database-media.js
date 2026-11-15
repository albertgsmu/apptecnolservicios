function byteRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return null
  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]))
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < size && end >= start
    ? { start, end, partial: true } : null
}

function waitForDrain(res) {
  return new Promise(resolve => {
    const finish = () => { res.off('drain', finish); res.off('close', finish); resolve() }
    res.once('drain', finish)
    res.once('close', finish)
    if (res.destroyed) finish()
  })
}

export async function streamDatabaseMedia(req, res, attachment, dbGet) {
  const range = byteRange(req.get('range'), attachment.size_bytes)
  res.set('Accept-Ranges', 'bytes')
  if (!range) return res.status(416).set('Content-Range', `bytes */${attachment.size_bytes}`).end()
  const length = range.end - range.start + 1
  res.status(range.partial ? 206 : 200).set('Content-Length', String(length))
  if (range.partial) res.set('Content-Range', `bytes ${range.start}-${range.end}/${attachment.size_bytes}`)
  if (req.method === 'HEAD') return res.end()

  // Fetch only the requested chunks: lists and metadata queries never load the binary.
  for (let offset = range.start; offset <= range.end && !res.destroyed;) {
    const count = Math.min(1024 * 1024, range.end - offset + 1)
    const row = await dbGet('SELECT substr(content, $2, $3) AS chunk FROM order_attachments WHERE id=$1', [attachment.id, offset + 1, count])
    if (!row?.chunk || row.chunk.length !== count) throw new Error('El contenido del adjunto está incompleto.')
    offset += row.chunk.length
    if (!res.write(row.chunk)) await waitForDrain(res)
  }
  res.end()
}
