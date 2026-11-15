import type { ReactNode } from 'react'
import { StatCard } from '../../components/StatCard'
import type { DashboardOverview } from '../../types'

export function PersonalSection({ data, applicants }: { data: DashboardOverview | null; applicants: ReactNode }) {
  const stats = data ? [
    { label: 'Candidatos registrados', value: String(data.applicants.total), delta: 'Solicitudes guardadas en la empresa', tone: 'blue' },
    { label: 'Pendientes de decisión', value: String(data.applicants.pending), delta: 'Estado Pendiente', tone: 'amber' },
    { label: 'Candidatos aprobados', value: String(data.applicants.approved), delta: 'La aprobación no crea una ficha de empleado', tone: 'green' },
    { label: 'Candidatos rechazados', value: String(data.applicants.rejected), delta: 'Estado Rechazado', tone: 'red' },
  ] : []
  return <section className="content-block">
    <div className="stats-grid">{stats.map(stat => <StatCard key={stat.label} {...stat} />)}</div>
    {!data && <p>Los totales de candidatos no están disponibles hasta completar la consulta.</p>}
    <div className="split-grid"><div className="panel"><h2>Asistencia semanal</h2><span className="availability-badge">No disponible</span><p>Aún no se registran entradas y salidas en el sistema. No hay datos para calcular un porcentaje de asistencia.</p></div>
      <div className="panel"><h2>Vacaciones y licencias</h2>{data?.employees ? <><p><strong>{data.employees.vacation}</strong> empleados con estado Vacaciones.</p><p><strong>{data.employees.leave}</strong> empleados con estado Licencia.</p><p className="metric-explanation">Son estados actuales de las fichas de personal; no representan solicitudes pendientes ni días disfrutados.</p></> : <p>El estado administrativo del personal está disponible en el perfil Gerente.</p>}</div>
    </div>
    {applicants}
  </section>
}
