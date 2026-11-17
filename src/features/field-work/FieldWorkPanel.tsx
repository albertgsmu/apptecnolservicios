import { useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { FieldWorkData, WorkOrder } from '../../types'
import './FieldWork.css'
import { WorkerAssignment } from './WorkerAssignment'
import { WorkerNotifications } from './WorkerNotifications'
import { WorkerPhotos } from './WorkerPhotos'
import { MaterialRequestFields } from './MaterialRequestFields'
import { emptyMaterialLine } from './materialRequestDraft'

import { FieldReportList } from './FieldReportList'
import { WorkRecords } from './WorkRecords'


type Props = { showLocations?: boolean; manager: boolean; orders: WorkOrder[]; data: FieldWorkData | null; reload: () => void; initialOrderId?: string }

export function FieldWorkPanel({ manager, orders, data, reload, showLocations = true, initialOrderId }: Props) {
  const openOrders = orders.filter(order => order.status !== 'Cerrada')
  const currentOrder = orders.find(order => order.id === data?.currentOrderId)
  const [reportNotice, setReportNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [materials, setMaterials] = useState([emptyMaterialLine()])
  const [draft, setDraft] = useState({ category: 'Avance', urgency: 'Normal', title: '', details: '', requestedAction: '' })

  if (manager) return <WorkRecords orders={orders} data={data} showLocations={showLocations} initialOrderId={initialOrderId} reload={reload} />

  return <section className="content-block field-work-panel">
    <WorkerAssignment order={currentOrder} count={openOrders.length} />
    <WorkerNotifications data={data} reload={reload} />
    <div className="section-explanation"><h2>Mi jornada y reportes</h2><p>Comunica los avances, problemas y necesidades del trabajo asignado.</p></div>
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
    <WorkerPhotos manager={false} currentOrder={currentOrder} orders={orders} data={data} reload={reload} />
    <FieldReportList reports={data?.reports ?? []} manager={false} reload={reload} />


  </section>
}
