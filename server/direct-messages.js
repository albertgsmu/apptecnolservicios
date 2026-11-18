import { randomUUID } from 'node:crypto'

export async function migrateDirectMessages(dbRun) {
  await dbRun(`CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id),
    client_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
    UNIQUE(sender_id,client_id)
  )`)
  await dbRun('CREATE INDEX IF NOT EXISTS direct_messages_thread_idx ON direct_messages(sender_id,recipient_id,created_at,id)')
  await dbRun('CREATE INDEX IF NOT EXISTS direct_messages_unread_idx ON direct_messages(recipient_id,read_at)')
  await dbRun('INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', ['013-direct-messages', new Date().toISOString()])
}

export function registerDirectMessages(app, { authRequired, allowRoles, asyncRoute, dbQuery, dbGet, withTransaction, io }) {
  const allowed = allowRoles('Gerente', 'Secretaria')
  const opposite = role => role === 'Gerente' ? 'Secretaria' : 'Gerente'
  const contactFor = (req) => dbGet('SELECT id,name,role FROM users WHERE id=$1 AND role=$2', [req.params.contactId, opposite(req.user.role)])
  const notify = (sender, recipient) => io.to(`user:${sender}`).to(`user:${recipient}`).emit('direct-message-updated')
  const serialize = (message, me) => ({ id: message.id, body: message.body, own: message.sender_id === me, createdAt: message.created_at, readAt: message.read_at })
  const pair = '((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1))'

  app.get('/api/messages', authRequired, allowed, asyncRoute(async (req, res) => {
    const contacts = await dbQuery(`SELECT u.id,u.name,u.role,
      (SELECT COUNT(*) FROM direct_messages m WHERE m.sender_id=u.id AND m.recipient_id=$1 AND m.read_at IS NULL) AS unread,
      (SELECT m.body FROM direct_messages m WHERE (m.sender_id=u.id AND m.recipient_id=$1) OR (m.sender_id=$1 AND m.recipient_id=u.id) ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_message,
      (SELECT m.created_at FROM direct_messages m WHERE (m.sender_id=u.id AND m.recipient_id=$1) OR (m.sender_id=$1 AND m.recipient_id=u.id) ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_at
      FROM users u WHERE u.role=$2 ORDER BY u.name,u.id`, [req.user.id, opposite(req.user.role)])
    res.set('Cache-Control', 'private, no-store')
    res.json(contacts.map(row => ({ id: row.id, name: row.name, role: row.role, unread: Number(row.unread), lastMessage: row.last_message ?? '', lastAt: row.last_at })))
  }))
  app.get('/api/messages/:contactId', authRequired, allowed, asyncRoute(async (req, res) => {
    const contact = await contactFor(req)
    if (!contact) return res.status(404).json({ message: 'Este contacto no está disponible.' })
    const params = [req.user.id, contact.id]
    let cursor = ''
    if (req.query.before !== undefined) {
      if (typeof req.query.before !== 'string') return res.status(400).json({ message: 'Referencia de historial inválida.' })
      const anchor = await dbGet(`SELECT created_at,id FROM direct_messages WHERE ${pair} AND id=$3`, [...params, req.query.before])
      if (!anchor) return res.status(404).json({ message: 'El mensaje de referencia no está disponible.' })
      cursor = ' AND (created_at < $3 OR (created_at=$3 AND id < $4))'
      params.push(anchor.created_at, anchor.id)
    }
    const rows = await dbQuery(`SELECT * FROM direct_messages WHERE ${pair}${cursor} ORDER BY created_at DESC,id DESC LIMIT 51`, params)
    res.set('Cache-Control', 'private, no-store')
    res.json({ contact, messages: rows.slice(0, 50).reverse().map(row => serialize(row, req.user.id)), hasMore: rows.length > 50 })
  }))
  app.post('/api/messages/:contactId', authRequired, allowed, asyncRoute(async (req, res) => {
    const contact = await contactFor(req)
    if (!contact) return res.status(404).json({ message: 'Este contacto no está disponible.' })
    const { body, clientId } = req.body ?? {}
    if (typeof body !== 'string' || !body.trim() || body.length > 4000 || typeof clientId !== 'string' || !/^[a-f0-9-]{36}$/i.test(clientId)) return res.status(400).json({ message: 'Escribe un mensaje de hasta 4.000 caracteres.' })
    const message = await withTransaction(async tx => {
      await tx.run('INSERT INTO direct_messages (id,sender_id,recipient_id,client_id,body,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sender_id,client_id) DO NOTHING', [randomUUID(), req.user.id, contact.id, clientId, body.trim(), new Date().toISOString()])
      return tx.get('SELECT * FROM direct_messages WHERE sender_id=$1 AND client_id=$2', [req.user.id, clientId])
    })
    if (message.recipient_id !== contact.id || message.body !== body.trim()) return res.status(409).json({ message: 'No se pudo confirmar este envío. Revisa la conversación y vuelve a intentar.' })
    notify(req.user.id, contact.id)
    return res.status(201).json(serialize(message, req.user.id))
  }))
  app.patch('/api/messages/:contactId/read', authRequired, allowed, asyncRoute(async (req, res) => {
    const contact = await contactFor(req)
    if (!contact) return res.status(404).json({ message: 'Este contacto no está disponible.' })
    const ids = req.body?.ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || id.length > 100)) return res.status(400).json({ message: 'Selecciona los mensajes recibidos.' })
    const now = new Date().toISOString()
    const result = await withTransaction(tx => tx.run(`UPDATE direct_messages SET read_at=$1 WHERE recipient_id=$2 AND sender_id=$3 AND read_at IS NULL AND id IN (${ids.map((_, i) => '$' + (i + 4)).join(',')})`, [now, req.user.id, contact.id, ...ids]))
    if ((result.rowCount ?? result.changes) > 0) notify(req.user.id, contact.id)
    return res.json({ readAt: now })
  }))
}
