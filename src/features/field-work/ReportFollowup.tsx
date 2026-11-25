import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../lib/dataService'
type Data = { overdue: boolean; followup: { assignee_id: string | null; assignee_name: string | null; due_at: string; version: number; status: string }; people: { id: string; name: string; role: string }[] }
const localInput = (date: string) => { const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
export function ReportFollowup({ reportId, refreshVersion, reload }: { reportId: string; refreshVersion: number; reload: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    try { const result = await apiRequest<Data>(`/report-followups/${encodeURIComponent(reportId)}`); setData(result); setOwner(result.followup.assignee_id ?? ''); setDue(localInput(result.followup.due_at)) }
    catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudo consultar el seguimiento.') }
  }, [reportId])
  useEffect(() => { queueMicrotask(() => void load()) }, [load, refreshVersion])
  return <section className="report-followup"><h4>Responsable y plazo</h4>{data ? <form className="field-form" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setNotice('')
    try { await apiRequest(`/report-followups/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: JSON.stringify({ assigneeId: owner, dueAt: new Date(due).toISOString(), version: data.followup.version }) }); await load(); reload(); setNotice('Responsable y plazo guardados.') }
    catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudo guardar.'); await load() }
    finally { setBusy(false) }
  }}><label>Responsable<select aria-label="Responsable del reporte" required disabled={busy || data.followup.status === 'Resuelto'} value={owner} onChange={e => setOwner(e.target.value)}><option value="">Seleccionar responsable</option>{data.people.map(person => <option key={person.id} value={person.id}>{person.name} · {person.role === 'Secretaria' ? 'Secretaría' : person.role}</option>)}</select></label><label>Fecha y hora límite<input aria-label="Plazo del reporte" type="datetime-local" required disabled={busy || data.followup.status === 'Resuelto'} value={due} onChange={e => setDue(e.target.value)} /></label><small>Hora local de este dispositivo.</small>{data.followup.status !== 'Resuelto' && <><p>{data.overdue ? 'Plazo vencido. Se avisará al responsable y a Gerencia.' : 'Si vence sin resolverse, se recordará al responsable y a Gerencia.'}</p><button className="ghost-button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar responsable y plazo'}</button></>}</form> : <button className="ghost-button" onClick={() => void load()}>Consultar seguimiento</button>}{notice && <p role="status">{notice}</p>}</section>
}
