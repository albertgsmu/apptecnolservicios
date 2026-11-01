import { AttendanceChart } from '../../components/AttendanceChart'
import { StatCard } from '../../components/StatCard'

type AttendanceItem = {
  day: string
  attendance: number
  absences: number
}

type VacationItem = {
  person: string
  dates: string
  type: string
  state: string
}

type PersonalSectionProps = {
  attendance: AttendanceItem[]
  vacations: VacationItem[]
  applicants: React.ReactNode
}

export function PersonalSection({ attendance, vacations, applicants }: PersonalSectionProps) {
  return (
    <section className="content-block">
      <div className="stats-grid compact">
        <StatCard label="Asistencia" value="96.2%" delta="+1.8%" tone="amber" />
        <StatCard label="Vacaciones" value="27" delta="12 pendientes" tone="blue" />
        <StatCard label="Expedientes" value="548" delta="100% al día" tone="green" />
      </div>

      <div className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Asistencia semanal</h2>
            <button type="button" className="text-button">Ver detalle</button>
          </div>

          <AttendanceChart items={attendance.map(({ day, attendance }) => ({ day, attendance }))} compact />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Vacaciones</h2>
            <button type="button" className="text-button">Gestionar</button>
          </div>

          <ul className="simple-list">
            {vacations.map((item) => (
              <li key={`${item.person}-${item.dates}`}>
                <div>
                  <strong>{item.person}</strong>
                  <span>{item.type}</span>
                </div>
                <div className="list-meta">
                  <em>{item.dates}</em>
                  <small className={`state ${item.state.toLowerCase()}`}>{item.state}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {applicants}
    </section>
  )
}
