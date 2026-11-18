import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { DirectMessage, MessageContact, MessageThread } from '../../hooks/useMessages'
import './Messages.css'

const stamp = (value: string) => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const merge = (current: DirectMessage[], incoming: DirectMessage[]) => {
  const messages = new Map(current.map(message => [message.id, message]))
  for (const message of incoming) messages.set(message.id, { ...message, readAt: message.readAt ?? messages.get(message.id)?.readAt ?? null })
  return [...messages.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function Conversation({ contact, revision, onRead, onBack }: { contact: MessageContact; revision: number; onRead: () => Promise<void>; onBack: () => void }) {
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const scroll = useRef<HTMLDivElement>(null)
  const sequence = useRef(0)
  const active = useRef(true)
  const olderLoaded = useRef(false)
  const pendingSend = useRef<{ body: string; clientId: string } | null>(null)
  const endpoint = `/messages/${encodeURIComponent(contact.id)}`
  const reload = useCallback(async () => {
    const version = ++sequence.current
    try {
      const thread = await apiRequest<MessageThread>(endpoint)
      if (!active.current || sequence.current !== version) return
      setMessages(current => merge(current, thread.messages))
      if (!olderLoaded.current) setHasMore(thread.hasMore)
      setError('')
    } catch (cause) { if (active.current && sequence.current === version) setError(cause instanceof Error ? cause.message : 'No se pudo abrir la conversación.') }
    finally { if (active.current && sequence.current === version) setLoading(false) }
  }, [endpoint])
  useEffect(() => { const versions = sequence; active.current = true; return () => { active.current = false; versions.current++ } }, [])
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) void reload() }); return () => { cancelled = true } }, [reload, revision])
  useEffect(() => { if (atBottom && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [messages, atBottom])
  useEffect(() => {
    if (!atBottom || document.visibilityState !== 'visible') return
    const ids = messages.filter(message => !message.own && !message.readAt).slice(-50).map(message => message.id)
    if (!ids.length) return
    let cancelled = false
    apiRequest<{ readAt: string }>(`${endpoint}/read`, { method: 'PATCH', body: JSON.stringify({ ids }) }).then(result => {
      if (cancelled || !active.current) return
      setMessages(current => current.map(message => ids.includes(message.id) ? { ...message, readAt: result.readAt } : message))
      void onRead()
    }).catch(cause => { if (!cancelled && active.current) setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la lectura.') })
    return () => { cancelled = true }
  }, [messages, atBottom, endpoint, onRead, revision])
  return <section className="chat-thread" aria-label={`Conversación con ${contact.name}`}>
    <header className="chat-thread-header"><button className="ghost-button chat-back" onClick={onBack}>← Chats</button><div><h2>{contact.name}</h2><span>{contact.role === 'Secretaria' ? 'Secretaría' : 'Gerente'}</span></div></header>
    {error && <div className="chat-error" role="alert">{error}<button className="text-button" onClick={() => void reload()}>Reintentar</button></div>}
    <div className="chat-history" ref={scroll} onScroll={() => { const pane = scroll.current; if (pane) setAtBottom(pane.scrollHeight - pane.scrollTop - pane.clientHeight < 70) }}>
      {hasMore && <button className="ghost-button" disabled={loadingOlder} onClick={async () => {
        if (!messages.length) return
        setLoadingOlder(true); setAtBottom(false)
        const height = scroll.current?.scrollHeight ?? 0, top = scroll.current?.scrollTop ?? 0
        try {
          const thread = await apiRequest<MessageThread>(`${endpoint}?before=${encodeURIComponent(messages[0].id)}`)
          if (!active.current) return
          olderLoaded.current = true; setHasMore(thread.hasMore); setMessages(current => merge(current, thread.messages))
          requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight - height + top })
        } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.') }
        finally { if (active.current) setLoadingOlder(false) }
      }}>{loadingOlder ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}
      {loading && <p role="status">Cargando conversación…</p>}
      {!loading && !messages.length && !error && <p className="chat-empty">Envía el primer mensaje.</p>}
      {messages.map(message => <article key={message.id} className={`chat-message ${message.own ? 'own' : 'received'}`}><p>{message.body}</p><small><time dateTime={message.createdAt}>{stamp(message.createdAt)}</time>{message.own && <span> · {message.readAt ? 'Leído' : 'Enviado'}</span>}</small></article>)}
    </div>
    {!atBottom && <button className="chat-jump ghost-button" onClick={() => setAtBottom(true)}>Ir a mensajes recientes ↓</button>}
    <form className="chat-compose" onSubmit={async event => {
      event.preventDefault(); if (sending || !draft.trim()) return
      setSending(true); setError('')
      const body = draft.trim()
      if (pendingSend.current?.body !== body) pendingSend.current = { body, clientId: crypto.randomUUID() }
      try {
        const message = await apiRequest<DirectMessage>(endpoint, { method: 'POST', body: JSON.stringify(pendingSend.current) })
        if (!active.current) return
        sequence.current++; setLoading(false); setMessages(current => merge(current, [message])); setDraft(''); pendingSend.current = null; setAtBottom(true); void onRead(); void reload()
      } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'No se pudo enviar. Tu mensaje sigue en el campo.') }
      finally { if (active.current) setSending(false) }
    }}><label className="visually-hidden" htmlFor="direct-message-body">Mensaje</label><textarea id="direct-message-body" placeholder="Escribe un mensaje…" maxLength={4000} rows={2} required disabled={sending} value={draft} onChange={event => setDraft(event.target.value)} /><button className="primary-button" disabled={sending || !draft.trim()}>{sending ? 'Enviando…' : 'Enviar'}</button></form>
  </section>
}

export function MessagesSection({ contacts, loading, error, revision, reload }: { contacts: MessageContact[]; loading: boolean; error: string; revision: number; reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState('')
  const selected = contacts.find(contact => contact.id === selectedId)
  const sorted = [...contacts].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name))
  return <section className={`messages-layout ${selected ? 'chat-has-contact' : ''}`}>
    <aside className="chat-contacts" aria-label="Conversaciones"><h2>Mensajes</h2>{error && <p role="alert">{error}<button className="text-button" onClick={() => void reload()}>Reintentar</button></p>}{loading && !contacts.length && <p role="status">Cargando contactos…</p>}{!loading && !error && !contacts.length && <p>No hay contactos disponibles. Las cuentas de Gerente y Secretaría se crean desde Crear usuario.</p>}{sorted.map(contact => <button className={`chat-contact ${selected?.id === contact.id ? 'active' : ''}`} key={contact.id} aria-label={`Conversar con ${contact.name}${contact.unread ? `, ${contact.unread} sin leer` : ''}`} onClick={() => setSelectedId(contact.id)}><strong>{contact.name}</strong>{contact.unread > 0 && <span className="message-count">{contact.unread}</span>}<small>{contact.lastMessage || 'Iniciar conversación'}</small></button>)}</aside>
    {selected ? <Conversation key={selected.id} contact={selected} revision={revision} onRead={reload} onBack={() => setSelectedId('')} /> : <div className="chat-placeholder"><p>Selecciona un contacto para conversar.</p></div>}
  </section>
}
