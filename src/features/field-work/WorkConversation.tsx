import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { apiRequest, getApiBaseUrl } from '../../lib/dataService'
import type { FieldWorkData, MaterialRequestLine } from '../../types'
import { WorkerReportComposer } from './WorkerReportComposer'
import { ReportMaterials } from './MaterialRequestFields'
import { ReportFollowup } from './ReportFollowup'
import './WorkConversation.css'

type Event = { id: string; reportId: string; kind: 'report' | 'reply'; createdAt: string; authorName: string; role: string; body: string; title: string; category: string; urgency: string; status: string; materials: MaterialRequestLine[]; requestedAction: string; notificationId: string | null; canMarkRead: boolean }
type Report = { id: string; title: string; status: string; version: number }
type Conversation = { order: { id: string; client: string; area: string; address: string; status: string; assignedName: string }; events: Event[]; reports: Report[]; hasMore: boolean; unread: number; canReport: boolean; focus: Event | null }
type Work = { id: string; client: string; area: string; address: string; status: string }
const time = (date: string) => new Date(date).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const merge = (previous: Event[], incoming: Event[]) => {
  const map = new Map(previous.filter(event => !event.id.startsWith('2-legacy-') || !incoming.some(item => item.kind === 'reply' && item.reportId === event.reportId && item.body === event.body)).map(event => [event.id, event]))
  incoming.forEach(event => map.set(event.id, event))
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function ReplyComposer({ report, reload }: { report: Report; reload: () => void }) {
  const [status, setStatus] = useState(report.status === 'Pendiente' ? 'En atención' : report.status)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(report.version)
  const changed = version !== report.version
  return <>{report.status !== 'Resuelto' && <ReportFollowup reportId={report.id} refreshVersion={report.version} reload={reload} />}<form className="field-form work-reply-composer" onSubmit={async event => {
    event.preventDefault(); if (changed) return; setBusy(true); setError('')
    try { await apiRequest(`/field-work/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status, reply, version }) }); setReply(''); setVersion(version + 1); reload() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar la respuesta.'); reload() }
    finally { setBusy(false) }
  }}>{changed && <div role="status"><p>El seguimiento cambió. Tu borrador se conserva.</p><button type="button" className="ghost-button" onClick={() => { setVersion(report.version); setStatus(report.status); setError('') }}>Actualizar estado y conservar texto</button></div>}<label>Estado<select aria-label="Estado del reporte" value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>{['Pendiente', 'En atención', 'Resuelto'].map(value => <option key={value}>{value}</option>)}</select></label><label>Respuesta en esta obra<textarea aria-label="Respuesta en la conversación" rows={3} maxLength={2000} required disabled={busy} value={reply} onChange={event => setReply(event.target.value)} placeholder="Escribe la solución o las indicaciones…" /></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy || changed}>{busy ? 'Enviando…' : 'Enviar respuesta'}</button></form></>
}

function ConversationEvent({ event, onReply }: { event: Event; onReply?: (id: string) => void }) {
  return <article className={`work-conversation-message ${event.kind}`} data-report-id={event.reportId}>
    <div className="conversation-author"><strong>{event.authorName}</strong><span>{event.role === 'Secretaria' ? 'Secretaría' : event.role}</span></div>
    <small>{time(event.createdAt)} · {event.kind === 'report' ? `${event.category} · ${event.urgency}` : event.status}</small>
    <h4>{event.kind === 'reply' ? `Respuesta a: ${event.title}` : event.title}</h4><p className="field-text">{event.body || 'Seguimiento actualizado.'}</p>
    <ReportMaterials materials={event.materials} />{event.requestedAction && <p className="field-text"><strong>Apoyo solicitado: </strong>{event.requestedAction}</p>}
    {onReply && event.kind === 'report' && <button className="text-button" onClick={() => onReply(event.reportId)}>Responder a este reporte</button>}
  </article>
}

export function WorkConversation({ orderId, manager, reload, refreshToken, focusReportId }: { orderId: string; manager: boolean; reload: () => void; refreshToken?: string; focusReportId?: string }) {
  const [data, setData] = useState<Conversation | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState('')
  const [olderBusy, setOlderBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [selectedReportId, setSelectedReportId] = useState(focusReportId ?? '')
  const [readBusy, setReadBusy] = useState(false)
  const sequence = useRef(0), loadedOlder = useRef(false)
  const history = useRef<HTMLDivElement>(null), pinned = useRef(true), composer = useRef<HTMLDivElement>(null)
  const endpoint = `/work-conversations/${encodeURIComponent(orderId)}`
  const fetchLatest = useCallback(async () => {
    const version = ++sequence.current
    try {
      const result = await apiRequest<Conversation>(`${endpoint}${focusReportId ? `?focusReportId=${encodeURIComponent(focusReportId)}` : ''}`)
      if (version !== sequence.current) return
      setData(result); setEvents(current => merge(current, result.events)); if (!loadedOlder.current) setHasMore(result.hasMore); setError('')
    } catch (cause) { if (version === sequence.current) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la conversación.') }
  }, [endpoint, focusReportId])
  useEffect(() => {
    let active = true
    const versions = sequence
    const refresh = () => { if (active && document.visibilityState === 'visible') void fetchLatest() }
    queueMicrotask(refresh)
    const socket = io(getApiBaseUrl() || window.location.origin, { withCredentials: true })
    socket.on('field-report-updated', refresh); socket.on('connect', refresh)
    const timer = window.setInterval(refresh, 15000)
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh)
    return () => { active = false; versions.current++; socket.disconnect(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [fetchLatest])
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void fetchLatest() }); return () => { active = false } }, [fetchLatest, refreshToken])
  useEffect(() => { if (pinned.current && history.current) history.current.scrollTop = history.current.scrollHeight }, [events])
  const saved = () => { pinned.current = true; void fetchLatest(); reload() }
  if (!data) return <div className="panel">{error ? <><p role="alert">{error}</p><button className="ghost-button" onClick={() => void fetchLatest()}>Reintentar conversación</button></> : <p role="status">Cargando conversación de la obra…</p>}</div>
  const selected = data.reports.find(report => report.id === (selectedReportId || data.reports[0]?.id))
  return <section className="panel work-conversation" aria-label={`Conversación de ${data.order.client}`}>
    <header className="work-conversation-header"><p className="eyebrow">Conversación de la obra</p><h3>{data.order.client}</h3><p>{data.order.address}</p><small>{data.order.id} · {data.order.area}</small></header>
    {!manager && <div className="conversation-unread" role="status">{data.unread ? `Tienes ${data.unread} respuestas sin leer.` : 'No tienes respuestas nuevas.'}{data.unread > 0 && <button className="ghost-button" disabled={readBusy} onClick={async () => {
      const ids = events.filter(event => event.notificationId && event.canMarkRead).map(event => event.notificationId).slice(-50)
      if (!ids.length) { setError('Carga mensajes anteriores para leer las respuestas pendientes.'); return }
      setReadBusy(true)
      try { await apiRequest(`${endpoint}/read`, { method: 'PATCH', body: JSON.stringify({ ids }) }); saved() }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron marcar las respuestas.') }
      finally { setReadBusy(false) }
    }}>Marcar como leída</button>}</div>}
    {error && <p role="alert">{error}</p>}
    {data.focus && !events.some(event => event.id === data.focus!.id) && <details className="focused-work-report" open><summary>Reporte seleccionado</summary><ConversationEvent event={data.focus} onReply={manager ? setSelectedReportId : undefined} /></details>}
    <div className="work-conversation-history" ref={history} onScroll={() => { const el = history.current; if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70 }}>
      {hasMore && <button className="ghost-button" disabled={olderBusy} onClick={async () => {
        if (!events.length) return
        setOlderBusy(true); pinned.current = false
        const height = history.current?.scrollHeight ?? 0, top = history.current?.scrollTop ?? 0
        try { const result = await apiRequest<Conversation>(`${endpoint}?before=${encodeURIComponent(events[0].id)}`); setEvents(current => merge(current, result.events)); loadedOlder.current = true; setHasMore(result.hasMore); requestAnimationFrame(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight - height + top }) }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.') }
        finally { setOlderBusy(false) }
      }}>{olderBusy ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}
      {!events.length && <p>Aún no hay reportes en esta obra.</p>}
      {events.map(event => <ConversationEvent key={event.id} event={event} onReply={manager ? id => { setSelectedReportId(id); composer.current?.scrollIntoView({ block: 'nearest' }) } : undefined} />)}
    </div>
    <div className="work-conversation-composer" ref={composer}>
      {manager && data.reports.length > 0 && <><label>Responder sobre<select aria-label="Reporte al que respondes" value={selected?.id ?? ''} onChange={event => setSelectedReportId(event.target.value)}>{data.reports.map(report => <option key={report.id} value={report.id}>{report.title} · {report.status}</option>)}</select></label>{selected && <ReplyComposer key={selected.id} report={selected} reload={saved} />}</>}
      {!manager && (data.canReport ? <WorkerReportComposer currentOrder={data.order} reload={saved} /> : <p>Historial de consulta. Los nuevos reportes se envían desde tu trabajo actual.</p>)}
    </div>
  </section>
}

export function WorkerConversations({ currentOrderId, data, reload, initialOrderId, initialReportId }: { currentOrderId?: string; data: FieldWorkData | null; reload: () => void; initialOrderId?: string; initialReportId?: string }) {
  const [works, setWorks] = useState<Work[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { let active = true; apiRequest<Work[]>('/work-conversations').then(result => { if (active) { setWorks(result); setError('') } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial de obras.') }); return () => { active = false } }, [data?.generatedAt])
  const orderId = selected || initialOrderId || currentOrderId || works[0]?.id
  return <section className="worker-conversations"><h2>Conversación e historial por obra</h2>{error && <p role="alert">{error}</p>}{works.length > 1 && <label>Obra<select aria-label="Obra de la conversación" value={orderId ?? ''} onChange={event => setSelected(event.target.value)}>{works.map(work => <option key={work.id} value={work.id}>{work.client} · {work.address} · {work.id.slice(0, 11)}</option>)}</select></label>}{orderId ? <WorkConversation key={orderId} orderId={orderId} manager={false} focusReportId={orderId === initialOrderId ? initialReportId : undefined} reload={reload} refreshToken={data?.generatedAt} /> : <p>No tienes obras con conversación disponible.</p>}</section>
}
