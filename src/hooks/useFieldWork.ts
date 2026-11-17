import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getApiBaseUrl, apiRequest } from '../lib/dataService'
import type { FieldWorkData } from '../types'

export function useFieldWork(identity: string | null, orderId?: string) {
  const scope = identity ? `${identity}:${orderId ?? 'all'}` : null
  const [state, setState] = useState<{ scope: string | null; data: FieldWorkData | null; error: string; loading: boolean }>({ scope: null, data: null, error: '', loading: false })
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const version = ++sequence.current
    if (!scope) { setState({ scope, data: null, error: '', loading: false }); return }
    setState(current => ({ scope, data: current.scope === scope ? current.data : null, error: '', loading: true }))
    try {
      const data = await apiRequest<FieldWorkData>(orderId ? `/field-work?orderId=${encodeURIComponent(orderId)}` : '/field-work')
      if (sequence.current === version) setState({ scope, data, error: '', loading: false })
    } catch (error) { if (sequence.current === version) setState(current => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'No se pudo consultar la jornada.' })) }
  }, [scope, orderId])
  useEffect(() => {
    let active = true
    const versions = sequence
    const refresh = () => { if (active && scope && document.visibilityState === 'visible') void reload() }
    queueMicrotask(() => { if (active) void reload() })
    const socket = scope ? io(getApiBaseUrl() || window.location.origin, { withCredentials: true }) : null
    socket?.on('field-report-updated', () => { if (active) void reload() })
    const interval = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { socket?.disconnect(); active = false; versions.current++; window.clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [reload, scope])
  return { data: state.scope === scope ? state.data : null, error: state.scope === scope ? state.error : '', loading: state.loading, reload }
}
