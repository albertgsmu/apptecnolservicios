import { permissionRoles } from '../shared/access-policy.js'
import { streamDatabaseMedia } from './storage/database-media.js'

export const serializeAttachment = row => ({
  id: row.id, name: row.original_name, mimeType: row.mime_type, size: row.size_bytes,
  instructions: row.instructions,
  url: `/api/orders/${row.order_id}/attachments/${row.id}`,
})

export async function hydrateOrderMedia(orders, dbQuery) {
  if (!orders.length) return []
  const placeholders = orders.map((_order, index) => `$${index + 1}`).join(',')
  const rows = await dbQuery(`SELECT id, order_id, original_name, mime_type, size_bytes, instructions
    FROM order_attachments WHERE order_id IN (${placeholders}) ORDER BY created_at, id`, orders.map(order => order.id))
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.order_id)) grouped.set(row.order_id, [])
    grouped.get(row.order_id).push(serializeAttachment(row))
  }
  return orders.map(order => ({ ...order, attachments: grouped.get(order.id) ?? [] }))
}

export function registerOrderAttachments(app, { authRequired, allowRoles, asyncRoute, dbGet, mediaStorage }) {
  app.get('/api/orders/:orderId/attachments/:attachmentId', authRequired, allowRoles(...permissionRoles.readOrders), asyncRoute(async (req, res) => {
    const attachment = await dbGet(`SELECT a.id, a.original_name, a.mime_type, a.size_bytes, a.storage_key,
      (a.content IS NOT NULL) AS has_content, o.assigned_to FROM order_attachments a
      JOIN work_orders o ON o.id = a.order_id WHERE a.id = $1 AND a.order_id = $2`, [req.params.attachmentId, req.params.orderId])
    if (!attachment) return res.status(404).json({ message: 'Adjunto no encontrado.' })
    if (req.user.role === 'Trabajador') {
      const employee = await dbGet('SELECT employee_id FROM user_employees WHERE user_id = $1', [req.user.id])
      if (!employee || employee.employee_id !== attachment.assigned_to) return res.status(404).json({ message: 'Adjunto no encontrado.' })
    }
    res.set({
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.original_name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    if (attachment.has_content) return streamDatabaseMedia(req, res, attachment, dbGet)
    return new Promise(resolve => {
      res.sendFile(mediaStorage.filePath(attachment.storage_key), { acceptRanges: true }, error => {
        if (error && !res.headersSent) res.status(error.code === 'ENOENT' ? 410 : 500).json({ message: 'El archivo no está disponible.' })
        else if (error && !res.writableEnded) res.end()
        resolve()
      })
    })
  }))
}
