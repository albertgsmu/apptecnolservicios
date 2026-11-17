import type { WorkOrder } from '../../types'

export function AgendaSection({ orders, error, onViewOrders }: { orders: WorkOrder[]; error: string; onViewOrders: () => void }) {
  const agenda = orders.filter(order => order.date && order.status !== 'Cerrada').sort((a, b) => a.date.localeCompare(b.date))
  return <section className="content-block"><div className="panel">
    <div className="panel-header"><h2>Agenda de órdenes</h2><button className="text-button" onClick={onViewOrders}>Ver órdenes</button></div>
    <p className="metric-explanation">Trabajos abiertos por fecha prevista.</p>
    {error ? <p role="alert">No se pudo consultar la agenda.</p> : !agenda.length ? <p>No hay trabajos programados.</p> : <ul className="simple-list">{agenda.map(order => <li key={order.id}><div><strong>{order.client}</strong><span>{order.area} · {order.assignedName || 'Sin técnico'}</span><span>{order.status}</span></div><time>{order.date}</time></li>)}</ul>}
  </div></section>
}
