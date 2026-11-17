import { useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { FieldReport } from '../../types'
import { ReportMaterials } from './MaterialRequestFields'

const fieldTime = (value: string) => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota' })

function ReportReview({ report, onSaved }: { report: FieldReport; onSaved: () => void }) {
  const [status, setStatus] = useState(report.status)
  const [reply, setReply] = useState(report.managerReply)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="field-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { await apiRequest(`/field-work/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status, reply, version: report.version }) }); onSaved() }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }}><label>Seguimiento<select value={status} onChange={event => setStatus(event.target.value)}>{['Pendiente', 'En atención', 'Resuelto'].map(item => <option key={item}>{item}</option>)}</select></label><label>Respuesta al trabajador<textarea maxLength={2000} value={reply} onChange={event => setReply(event.target.value)} rows={3} /></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar seguimiento'}</button></form>
}

export function FieldReportList({ reports, manager, reload }: { reports: FieldReport[]; manager: boolean; reload: () => void }) {
  return <div className="panel"><h3>{manager ? 'Reportes recibidos' : 'Mis reportes y respuestas'}</h3>{!reports.length && <p>{'No hay reportes registrados.'}</p>}
      <div className="field-report-list">{reports.map(report => <article className="field-report-card" key={`${report.id}-${report.version}`}><div className="panel-header"><h4>{report.title}</h4><span className="status-badge">{report.status} · {report.urgency}</span></div><p><strong>{report.employeeName}</strong> · {report.client} · {report.category}</p><p className="metric-explanation">{fieldTime(report.createdAt)} · Hora de Colombia</p><p className="field-text">{report.details}</p><ReportMaterials materials={report.materials} />{report.requestedAction && <p className="field-text"><strong>Apoyo solicitado: </strong>{report.requestedAction}</p>}{report.managerReply && <div className="field-manager-reply"><strong>Respuesta de {report.reviewerName || 'equipo responsable'}{report.reviewerRole && ` (${report.reviewerRole})`}</strong><p className="field-text">{report.managerReply}</p></div>}{manager && <ReportReview report={report} onSaved={reload} />}</article>)}</div>
    </div>
}
