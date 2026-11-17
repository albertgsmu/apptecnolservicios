import { StatCard } from '../../components/StatCard'
import type { DashboardOverview, WorkOrder } from '../../types'
import { formatMediaSize } from '../orders/mediaUtils'

type Props = { orders: WorkOrder[]; data: DashboardOverview | null; ordersError: string; onViewOrders?: () => void }

export function DashboardSection({ orders, data, ordersError, onViewOrders }: Props) {
  const stats = data ? [
    { label: 'Órdenes abiertas', value: String(data.orders.open), delta: 'Todas las órdenes que no están cerradas', tone: 'blue' },
    { label: 'Órdenes cerradas', value: String(data.orders.closed), delta: 'Trabajos cerrados por el Gerente', tone: 'green' },
    { label: 'Pendientes de revisión', value: String(data.operations.review), delta: 'Órdenes en estado Revisión', tone: 'amber' },
    { label: 'Sin técnico asignado', value: String(data.operations.unassigned), delta: 'Órdenes abiertas por asignar', tone: 'red' },
    { label: 'Avance del trabajo abierto', value: data.operations.openAverageProgress === null ? '—' : `${data.operations.openAverageProgress}%`, delta: 'Promedio de avance; excluye órdenes cerradas', tone: 'blue' },
    { label: 'Candidatos pendientes', value: String(data.applicants.pending), delta: 'Solicitudes pendientes de decisión', tone: 'amber' },
    ...(data.employees ? [{ label: 'Empleados activos', value: String(data.employees.active), delta: `De ${data.employees.total} fichas de empleados registradas`, tone: 'green' }] : []),
    { label: 'Fotos y videos guardados', value: String(data.media.files), delta: `${formatMediaSize(data.media.bytes)} de contenido en la base`, tone: 'blue' },
    ...(data.fieldWork ? [{ label: 'Reportes de obra sin resolver', value: String(data.fieldWork.pending), delta: `${data.fieldWork.critical} críticos. Consulta Reportes de obra para responder.`, tone: 'red' }] : []),
  ] : []
  return <section className="content-block">
    <div className="section-explanation"><h2>Resumen de la empresa</h2><p>Totales de todos los registros actuales, sin filtro de fechas. Se consultan automáticamente cada 30 segundos mientras esta ventana está visible.</p></div>
    {!data ? <div className="panel"><p>Los indicadores aparecerán cuando se complete la consulta de la base de datos.</p></div> : <>
      <div className="stats-grid">{stats.slice(0, 4).map(stat => <StatCard key={stat.label} {...stat} />)}</div>
      <div className="panel"><h2>Atención pendiente</h2><ul className="manager-alerts">
        <li><strong>{data.operations.critical}</strong> órdenes críticas abiertas.</li>
        <li><strong>{data.operations.overdue}</strong> órdenes abiertas con fecha prevista anterior a hoy ({data.today}).</li>
        <li><strong>{data.operations.unassigned}</strong> órdenes necesitan un técnico.</li>
        <li><strong>{data.operations.review}</strong> órdenes esperan revisión.</li>
      </ul><p className="metric-explanation">Una fecha prevista vencida no equivale a una medición de incumplimiento contractual.</p>
      <p>{data.orders.total ? `${data.orders.closed} de ${data.orders.total} órdenes están cerradas (${Math.round(data.orders.closed / data.orders.total * 100)}%).` : 'Todavía no hay órdenes para calcular un porcentaje de cierre.'} Este porcentaje cuenta órdenes; no mide asistencia ni productividad.</p></div>
      <details className="dashboard-details"><summary>Más indicadores de la empresa</summary><div className="stats-grid">{stats.slice(4).map(stat => <StatCard key={stat.label} {...stat} />)}</div></details>
    </>}
    <div className="panel panel-full"><div className="panel-header"><h2>Seguimiento de órdenes</h2>{onViewOrders && <button className="text-button" onClick={onViewOrders}>Ver todas</button>}</div>
      {ordersError ? <p role="alert">No se pudo consultar el detalle de las órdenes. Actualiza los datos para reintentar.</p> : !orders.length ? <p>Aún no hay órdenes registradas.</p> : <div className="orders-table-scroll"><table className="responsive-records" role="table"><thead><tr><th>Cliente</th><th>Técnico</th><th>Fecha prevista</th><th>Estado</th><th>Avance</th></tr></thead><tbody>
        {orders.slice(0, 10).map(order => <tr key={order.id}><td data-label="Cliente">{order.client}</td><td data-label="Técnico">{order.assignedName || 'Sin asignar'}</td><td data-label="Fecha prevista">{order.date || 'Por definir'}</td><td data-label="Estado">{order.status}</td><td data-label="Avance">{order.progress}%</td></tr>)}
      </tbody></table></div>}
      {orders.length > 10 && <p className="metric-explanation">Se muestran las 10 órdenes más recientes. Los indicadores incluyen todas.</p>}
    </div>
  </section>
}
