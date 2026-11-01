type DashboardStat = {
  label: string
  value: string
  delta: string
  tone: string
}

type DashboardOrder = {
  id: string
  client: string
  area: string
  priority: string
  status: string
}

import { StatCard } from '../../components/StatCard'

type DashboardSectionProps = {
  stats: ReadonlyArray<DashboardStat>
  orders: ReadonlyArray<DashboardOrder>
  roles: readonly string[]
}

export function DashboardSection({ stats, orders, roles }: DashboardSectionProps) {
  return (
    <section className="content-block">
      <div className="stats-grid">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            delta={stat.delta}
            tone={stat.tone}
          />
        ))}
      </div>

      <div className="analytics-strip">
        <div className="analytic-card">
          <span>Rendimiento operativo</span>
          <strong>94.8%</strong>
          <div className="progress-line"><span style={{ width: '94.8%' }} /></div>
        </div>
        <div className="analytic-card">
          <span>Eficiencia de recursos</span>
          <strong>87.3%</strong>
          <div className="progress-line"><span style={{ width: '87.3%' }} /></div>
        </div>
        <div className="analytic-card">
          <span>Tiempo medio de cierre</span>
          <strong>2.4 días</strong>
          <div className="progress-line"><span style={{ width: '76%' }} /></div>
        </div>
      </div>

      <div className="content-grid">
        <div className="panel large-panel">
          <div className="panel-header">
            <h2>Órdenes de trabajo</h2>
            <button type="button" className="text-button">Ver todo</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Área</th>
                <th>Prioridad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>{order.client}</td>
                  <td>{order.area}</td>
                  <td>
                    <span className={`priority-badge ${order.priority.toLowerCase()}`}>{order.priority}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${order.status.toLowerCase().replace(/\s+/g, '-')}`}>{order.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Alertas</h2>
            <button type="button" className="text-button">Revisar</button>
          </div>

          <ul className="simple-list">
            {[
              'Revisión de SLA por sucursal y cumplimiento mensual.',
              'Coordinación de mantenimiento crítico en 3 clientes prioritarios.',
              'Confirmar disponibilidad de personal para turno nocturno.',
              'Seguimiento a proveedores con cotizaciones vencidas.',
            ].map((alert) => (
              <li key={alert}>
                <div>
                  <strong>{alert}</strong>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Gestión directiva</h2>
            <button type="button" className="text-button">Organigrama</button>
          </div>

          <div className="leadership-list">
            {roles.map((role, index) => (
              <div key={role} className="leader-item">
                <div className="avatar">{role.slice(0, 2).toUpperCase()}</div>
                <div>
                  <strong>{role}</strong>
                  <span>{['Luis Ramírez', 'María López', 'Julio Ortega', 'Ana García', 'Carlos Ruiz'][index]}</span>
                  <small>{['Estrategia', 'Agenda', 'Operación', 'RRHH', 'Finanzas'][index]}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Asistencia</h2>
            <button type="button" className="text-button">Semana</button>
          </div>

          <div className="attendance-chart">
            {[
              { day: 'Lun', attendance: 97 },
              { day: 'Mar', attendance: 94 },
              { day: 'Mié', attendance: 98 },
              { day: 'Jue', attendance: 96 },
              { day: 'Vie', attendance: 95 },
            ].map((item) => (
              <div key={item.day} className="attendance-item">
                <div className="bar-group">
                  <span className="bar" style={{ height: `${item.attendance}%` }} />
                </div>
                <strong>{item.day}</strong>
                <small>{item.attendance}%</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
