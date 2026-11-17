import { useState, type ComponentProps, type ReactNode } from 'react'
import { WorkersSection } from './WorkersSection'
import { AccessRecords } from '../features/field-work/WorkRecords'
import type { DashboardOverview, FieldWorkData } from '../types'

type Props = {
  employeeProps: ComponentProps<typeof WorkersSection>
  applicants: ReactNode
  canReadEmployees: boolean
  data: DashboardOverview | null
  fieldWork: FieldWorkData | null
  onCreateWorker?: () => void
}

export function WorkersHub({ employeeProps, applicants, canReadEmployees, data, fieldWork, onCreateWorker }: Props) {
  const [tab, setTab] = useState(canReadEmployees ? 'Equipo' : 'Candidatos')
  const tabs = canReadEmployees ? ['Equipo', 'Candidatos', 'Resumen', 'Accesos'] : ['Candidatos']
  return <section className="content-block workers-hub">
    <div className="panel-header workers-hub-header"><h2>Control de trabajadores</h2>{onCreateWorker && <button className="primary-button" onClick={onCreateWorker}>Nuevo trabajador</button>}</div>
    {tabs.length > 1 && <nav className="work-record-tabs workers-hub-tabs" aria-label="Control de trabajadores">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} aria-current={tab === item ? 'page' : undefined} aria-controls="workers-hub-content" onClick={() => setTab(item)}>{item}</button>)}</nav>}
    <div id="workers-hub-content">
      {canReadEmployees && tab === 'Equipo' && <WorkersSection {...employeeProps} mode="team" />}
      {tab === 'Candidatos' && <div className="content-block">{data && <div className="worker-candidate-counts"><span><strong>{data.applicants.pending}</strong> pendientes</span><span><strong>{data.applicants.approved}</strong> aprobados</span><span><strong>{data.applicants.rejected}</strong> rechazados</span></div>}{applicants}</div>}
      {canReadEmployees && tab === 'Resumen' && <WorkersSection {...employeeProps} mode="summary" />}
      {canReadEmployees && tab === 'Accesos' && <AccessRecords checkIns={fieldWork?.checkIns ?? []} />}
    </div>
  </section>
}
