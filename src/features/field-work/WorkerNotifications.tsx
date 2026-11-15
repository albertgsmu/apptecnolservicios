import { useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { FieldWorkData } from '../../types'

export function WorkerNotifications({ data, reload }: { data: FieldWorkData | null; reload: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const markRead = async (id?: string) => {
    setBusy(true); setError('')
    try { await apiRequest(id ? `/field-work/notifications/${id}/read` : '/field-work/notifications/read-all', { method: id ? 'PATCH' : 'POST' }); reload() }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo marcar la respuesta.') }
    finally { setBusy(false) }
  }
  return <section className="panel worker-notifications" aria-label="Mensajes y soluciones"><h3>Mensajes y soluciones para ti</h3>
    <p role="status" aria-live="polite">{data?.unreadNotifications ? `Tienes ${data.unreadNotifications} respuestas sin leer.` : 'No tienes respuestas nuevas. Aquí recibirás las indicaciones de Secretaría, Supervisor o Gerencia.'}</p>
    {!!data?.unreadNotifications && <button className="ghost-button" disabled={busy} onClick={() => void markRead()}>Marcar todas como leídas</button>}
    {error && <p role="alert">{error}</p>}
    {data?.notifications?.map(message => <article key={message.id} className="field-report-card"><h4>{!message.readAt && 'Nueva respuesta · '}{message.title}</h4><p>{message.reviewerName} · {message.reviewerRole} · {message.status}</p><p className="field-text">{message.reply || 'El equipo actualizó el estado de tu reporte.'}</p><p>{new Date(message.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>{!message.readAt && <button className="ghost-button" disabled={busy} onClick={() => void markRead(message.id)}>Marcar como leída</button>}</article>)}
  </section>
}
