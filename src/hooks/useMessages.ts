import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { apiRequest, getApiBaseUrl } from '../lib/dataService'

export type MessageContact = { id: string; name: string; role: string; unread: number; lastMessage: string; lastAt: string | null }
export type DirectMessage = { id: string; body: string; own: boolean; createdAt: string; readAt: string | null }
export type MessageThread = { messages: DirectMessage[]; hasMore: boolean }

export function useMessages(identity: string | null) {
  const [state, setState] = useState<{ identity: string | null; contacts: MessageContact[]; error: string; loading: boolean }>({ identity: null, contacts: [], error: '', loading: false })
  const [revision, setRevision] = useState(0)
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const version = ++sequence.current
    if (!identity) return
    setState(current => ({ identity, contacts: current.identity === identity ? current.contacts : [], error: '', loading: true }))
    try {
      const contacts = await apiRequest<MessageContact[]>('/messages')
      if (version === sequence.current) setState({ identity, contacts, error: '', loading: false })
    } catch (cause) { if (version === sequence.current) setState(current => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : 'No se pudieron cargar los mensajes.' })) }
  }, [identity])
  useEffect(() => {
    let active = true
    const versions = sequence
    const refresh = () => { if (active && identity && document.visibilityState === 'visible') { void reload(); setRevision(value => value + 1) } }
    queueMicrotask(refresh)
    const socket = identity ? io(getApiBaseUrl() || window.location.origin, { withCredentials: true }) : null
    socket?.on('direct-message-updated', refresh)
    socket?.on('connect', refresh)
    const interval = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; versions.current++; socket?.disconnect(); window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [identity, reload])
  const contacts = identity && state.identity === identity ? state.contacts : []
  return { contacts, unread: contacts.reduce((sum, contact) => sum + contact.unread, 0), loading: state.loading, error: identity && state.identity === identity ? state.error : '', revision, reload }
}
