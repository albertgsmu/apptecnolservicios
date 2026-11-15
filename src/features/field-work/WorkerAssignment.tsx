import type { WorkOrder } from '../../types'
import { OrderSiteInfo } from '../orders/OrderSiteInfo'
import { OrderAttachments } from '../orders/OrderAttachments'

export function WorkerAssignment({ order, count }: { order?: WorkOrder; count: number }) {
  if (!order) return <div className="panel"><h2>Tu trabajo asignado</h2><p>No tienes una orden abierta disponible. Secretaría o Supervisor te indicarán tu próxima asignación.</p></div>
  const { geofence: _zone, ...site } = order.site
  return <article className="panel worker-assignment"><p className="eyebrow">Tu destino y trabajo asignado</p><h2>{order.client}</h2><p>{order.area} · {order.priority} · {order.status}</p><p>Fecha prevista: {order.date || 'Por coordinar'}</p>
    <OrderSiteInfo site={site} /><h3>Qué debes hacer</h3><p className="field-text">{order.observations || 'Consulta las indicaciones de los archivos adjuntos. Si faltan instrucciones, solicita aclaración al equipo responsable.'}</p>
    <OrderAttachments attachments={order.attachments} />
    {count > 1 && <p className="metric-explanation">Tienes {count} órdenes abiertas. Se muestra primero la que está en ejecución y luego las asignadas por fecha. Los reportes y fotos de esta pantalla corresponden a este trabajo.</p>}
  </article>
}
