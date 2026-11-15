import { useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { FieldWorkData, FieldReport, WorkOrder } from '../../types'
import './FieldWork.css'
import { ArrivalAssessment } from './ArrivalAssessment'
import { WorkerAssignment } from './WorkerAssignment'
import { WorkerNotifications } from './WorkerNotifications'
import { WorkerPhotos } from './WorkerPhotos'
import { MaterialRequestFields, ReportMaterials } from './MaterialRequestFields'
import { emptyMaterialLine } from './materialRequestDraft'

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

type Props = { showLocations?: boolean; manager: boolean; orders: WorkOrder[]; data: FieldWorkData | null; reload: () => void }

export function FieldWorkPanel({ manager, orders, data, reload, showLocations = true }: Props) {
  const openOrders = orders.filter(order => order.status !== 'Cerrada')
  const currentOrder = orders.find(order => order.id === data?.currentOrderId)
  const [reportNotice, setReportNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [materials, setMaterials] = useState([emptyMaterialLine()])
  const [draft, setDraft] = useState({ category: 'Avance', urgency: 'Normal', title: '', details: '', requestedAction: '' })

return <section className="content-block field-work-panel">
    {!manager && <WorkerAssignment order={currentOrder} count={openOrders.length} />}
    {!manager && <WorkerNotifications data={data} reload={reload} />}
    <div className="section-explanation"><h2>{manager ? 'Reportes del equipo y seguimiento' : 'Mi jornada y reportes'}</h2><p>{manager ? 'Necesidades y problemas de los trabajadores, con seguimiento del equipo responsable.' : 'Comunica los avances, problemas y necesidades del trabajo asignado.'}</p></div>
    {manager && data && <div className="stats-grid"><div className="panel"><span>Reportes sin resolver</span><h3>{data.totals.pending}</h3></div><div className="panel"><span>Críticos sin resolver</span><h3>{data.totals.critical}</h3></div><div className="panel"><span>Reportes registrados</span><h3>{data.totals.total}</h3></div></div>}
    {!manager && <>
      <form className="panel field-form" onSubmit={async event => {
        event.preventDefault(); setSending(true); setReportNotice('')
        try { await apiRequest('/field-work/reports', { method: 'POST', body: JSON.stringify({ ...draft, orderId: currentOrder?.id, materials: draft.category === 'Solicitud de material' ? materials : [] }) }); setDraft(current => ({ ...current, title: '', details: '', requestedAction: '' })); setMaterials([emptyMaterialLine()]); setReportNotice('Reporte enviado.'); reload() }
        catch (error) { setReportNotice(error instanceof Error ? error.message : 'No se pudo enviar el reporte.') }
        finally { setSending(false) }
      }}><h3>Enviar reporte de obra</h3>{!currentOrder && <p>Necesitas una orden abierta asignada para enviar reportes.</p>}
        <p>Reporte vinculado a: <strong>{currentOrder?.client || 'Sin trabajo asignado'}</strong></p>
        <div className="field-two-columns"><label>Tipo de reporte<select aria-label="Tipo de reporte" value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))}>{['Avance', 'Necesidad', 'Solicitud de material', 'Problema', 'Seguridad'].map(item => <option key={item}>{item}</option>)}</select></label><label>Prioridad<select aria-label="Prioridad del reporte" value={draft.urgency} onChange={event => setDraft(current => ({ ...current, urgency: event.target.value }))}>{['Normal', 'Alta', 'Crítica'].map(item => <option key={item}>{item}</option>)}</select></label></div>
        {draft.category === 'Solicitud de material' && <MaterialRequestFields value={materials} onChange={setMaterials} disabled={sending} />}
        <label>Título<input id="field-report-title" required maxLength={160} value={draft.title} placeholder="Ej. Faltan materiales para continuar" onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
        <label>Qué hiciste, qué necesitas o qué problema encontraste<textarea id="field-report-details" required maxLength={4000} rows={4} placeholder="Describe la zona, lo ocurrido, cantidades y cómo afecta el trabajo." value={draft.details} onChange={event => setDraft(current => ({ ...current, details: event.target.value }))} /></label>
        <label>Qué apoyo necesitas del equipo responsable (opcional)<textarea id="field-report-action" maxLength={2000} rows={3} value={draft.requestedAction} onChange={event => setDraft(current => ({ ...current, requestedAction: event.target.value }))} /></label>
        <p className="metric-explanation">Enviar un reporte no cierra la orden ni modifica su avance. Si existe un riesgo inmediato, interrumpe la tarea y comunícate directamente con el responsable; este panel no sustituye ese contacto.</p>
        {reportNotice && <p role="status">{reportNotice}</p>}<button className="primary-button" disabled={sending || !currentOrder}>{sending ? 'Enviando…' : 'Enviar'}</button>
      </form>
    </>}
    {(!manager || showLocations) && <WorkerPhotos manager={manager} currentOrder={currentOrder} orders={orders} data={data} reload={reload} />}
    <div className="panel"><h3>{manager ? 'Reportes recibidos' : 'Mis reportes y respuestas'}</h3><p className="metric-explanation">Últimos 100 reportes. Los totales incluyen todo el historial.</p>{!data?.reports.length && <p>{data ? 'No hay reportes registrados.' : 'Consulta pendiente.'}</p>}
      <div className="field-report-list">{data?.reports.map(report => <article className="field-report-card" key={`${report.id}-${report.version}`}><div className="panel-header"><h4>{report.title}</h4><span className="status-badge">{report.status} · {report.urgency}</span></div><p><strong>{report.employeeName}</strong> · {report.client} · {report.category}</p><p className="metric-explanation">{fieldTime(report.createdAt)} · Hora de Colombia</p><p className="field-text">{report.details}</p><ReportMaterials materials={report.materials} />{report.requestedAction && <p className="field-text"><strong>Apoyo solicitado: </strong>{report.requestedAction}</p>}{report.managerReply && <div className="field-manager-reply"><strong>Respuesta de {report.reviewerName || 'equipo responsable'}{report.reviewerRole && ` (${report.reviewerRole})`}</strong><p className="field-text">{report.managerReply}</p></div>}{manager && <ReportReview report={report} onSaved={reload} />}</article>)}</div>
    </div>
    {manager && showLocations && <div className="panel"><h3>{manager ? 'Ubicaciones compartidas y llegadas' : 'Mis registros de ubicación'}</h3><p className="metric-explanation">Últimos 100 registros. La precisión indica un radio aproximado; la comparación considera ese margen de error y el radio guardado en la obra.</p>
      {!data?.checkIns.length && <p>No hay registros para mostrar.</p>}
      <ul className="field-location-list">{data?.checkIns.map(item => <li key={item.id}><strong>{item.employeeName} · {item.kind === 'arrival' ? 'Llegada declarada a la obra' : 'Ubicación relacionada con inicio de sesión'}</strong><ArrivalAssessment items={item.assessments} /><p>{item.client || 'Sin obra asociada'} · {fieldTime(item.createdAt)}</p>{item.locationStatus === 'captured' && item.latitude !== null && item.longitude !== null ? <><p>Precisión aproximada: {Math.round(item.accuracy ?? 0)} m · Lectura: {item.capturedAt ? fieldTime(item.capturedAt) : 'Sin hora del dispositivo'}</p><a href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`} target="_blank" rel="noreferrer">Ver ubicación compartida en el mapa ↗</a></> : <p>Sin coordenadas: {item.locationStatus === 'denied' ? 'permiso rechazado' : item.locationStatus === 'timeout' ? 'tiempo de espera agotado' : 'ubicación no disponible'}. No confirma presencia en la obra.</p>}</li>)}</ul>
    </div>}
  </section>
}
