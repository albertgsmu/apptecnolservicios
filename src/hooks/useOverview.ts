import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/dataService'
import type { DashboardOverview } from '../types'

export function useOverview(scope: string | null) {
  const [state, setState] = useState<{ scope: string | null; data: DashboardOverview | null; loading: boolean; error: string }>({ scope: null, data: null, loading: false, error: '' })
  const sequence = useRef(0)
  const request = useRef<AbortController | null>(null)

  const reload = useCallback(async () => {
    const version = ++sequence.current
    request.current?.abort()
    if (!scope) { setState({ scope: null, data: null, loading: false, error: '' }); return }
    const controller = new AbortController()
    request.current = controller
    setState(current => ({ scope, data: current.scope === scope ? current.data : null, loading: true, error: '' }))
    try {
      const data = await apiRequest<DashboardOverview>('/dashboard/overview', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      if (version === sequence.current) setState({ scope, data, loading: false, error: '' })
    } catch (error) {
      if (version === sequence.current) setState(current => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'No se pudo consultar el resumen.' }))
    }
  }, [scope])

  useEffect(() => {
    let active = true
    const controller = request
    const versions = sequence
    const refresh = () => { if (active && document.visibilityState === 'visible') void reload() }
    queueMicrotask(() => { if (active) void reload() })
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false; versions.current++; controller.current?.abort()
      window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh)
    }
  }, [reload])

  return { data: state.scope === scope ? state.data : null, loading: Boolean(scope) && (state.scope !== scope || state.loading), error: state.scope === scope ? state.error : '', reload }
}
