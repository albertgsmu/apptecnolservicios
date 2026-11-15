import { useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { OrderAttachmentDraft, WorkOrder } from '../../types'
import { OrderMediaPicker } from './OrderMediaPicker'

export function OrderEvidenceEditor({ order, onSaved }: { order: WorkOrder; onSaved: () => void }) {
  const [observations, setObservations] = useState(order.observations)
  const [files, setFiles] = useState<OrderAttachmentDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  return <details className="panel"><summary>Instrucciones y evidencias de la visita</summary><form className="field-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      const body = new FormData()
      body.set('order', JSON.stringify({ version: order.version, observations, attachmentInstructions: files.map(item => item.instructions) }))
      files.forEach(item => body.append('attachments', item.file))
      await apiRequest(`/orders/${order.id}/evidence`, { method: 'POST', body, signal: AbortSignal.timeout(180000) })
      setFiles([]); setNotice('Instrucciones y evidencias guardadas.'); onSaved()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }}><label>Trabajo que se debe realizar<textarea maxLength={4000} rows={4} value={observations} onChange={event => setObservations(event.target.value)} disabled={busy} /></label>
    <OrderMediaPicker files={files} onChange={setFiles} disabled={busy} />
    <button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar instrucciones y evidencias'}</button>
    {notice && <p role="status">{notice}</p>}
  </form></details>
}
