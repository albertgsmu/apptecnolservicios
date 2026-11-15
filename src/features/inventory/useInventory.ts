import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { InventoryData } from './types'

export function useInventory() {
  const [data, setData] = useState<InventoryData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const version = useRef(0)
  const reload = useCallback(async () => {
    const request = ++version.current; setLoading(true)
    try {
      const next = await apiRequest<InventoryData>('/inventory')
      if (request === version.current) { setData(next); setError('') }
    } catch (error) { if (request === version.current) setError(error instanceof Error ? error.message : 'No se pudo consultar la bodega.') }
    finally { if (request === version.current) setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    const requests = version
    queueMicrotask(() => { if (active) void reload() })
    const refresh = () => { if (document.visibilityState === 'visible') void reload() }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { active = false; requests.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [reload])
  return { data, error, loading, reload }
}
