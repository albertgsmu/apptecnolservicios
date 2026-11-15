import type { WorkOrder } from '../../types'

export function SecretarySection({ orders, error, onViewOrders }: { orders: WorkOrder[]; error: string; onViewOrders: () => void }) {
  const agenda = orders.filter(order => order.date && order.status !== 'Cerrada').sort((a, b) => a.date.localeCompare(b.date))
  return <section className="content-block"><div className="split-grid">
    <div className="panel"><div className="panel-header"><h2>Agenda del gerente</h2><button className="text-button" onClick={onViewOrders}>Ver órdenes</button></div><p className="metric-explanation">Fechas previstas de las órdenes abiertas, de la más antigua a la más reciente. No incluye reuniones ni citas externas.</p>
      {error ? <p role="alert">No se pudo consultar la agenda de órdenes.</p> : !agenda.length ? <p>No hay órdenes abiertas con fecha prevista registrada.</p> : <ul className="simple-list">{agenda.map(order => <li key={order.id}><div><strong>{order.client}</strong><span>{order.area} · {order.assignedName || 'Sin técnico'}</span><span>{order.status}</span></div><time>{order.date}</time></li>)}</ul>}
    </div>
    <div className="panel"><h2>Documentación</h2><p>Las fotos, videos e indicaciones del servicio se consultan dentro de cada orden. No se ha conectado un archivo corporativo de actas o comunicados.</p><button className="ghost-button" onClick={onViewOrders}>Consultar órdenes</button></div>
  </div></section>
}
