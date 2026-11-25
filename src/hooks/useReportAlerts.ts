import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { apiRequest, getApiBaseUrl } from '../lib/dataService'

export type ReportAlert = { id: string; orderId: string; title: string; employeeName: string; client: string; category: string; urgency: string; status: string; unread: boolean; createdAt: string; assigneeId: string | null; assigneeName: string | null; dueAt: string | null; overdue: boolean }
export type ReportAlertData = { reports: ReportAlert[]; totals: { total: number; unread: number; pending: number; critical: number; high: number; overdue: number } }
export function useReportAlerts(identity: string | null) {
  const [state, setState] = useState<{ identity: string | null; data: ReportAlertData | null; error: string }>({ identity: null, data: null, error: '' })
  const [cue, setCue] = useState('')
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const version = ++sequence.current
    if (!identity) return
    try {
      const data = await apiRequest<ReportAlertData>('/report-alerts')
      if (sequence.current === version) setState({ identity, data, error: '' })
    } catch (cause) { if (sequence.current === version) setState(current => ({ identity, data: current.identity === identity ? current.data : null, error: cause instanceof Error ? cause.message : 'No se pudieron actualizar los avisos.' })) }
  }, [identity])
  useEffect(() => {
    let active = true
    const versions = sequence
    const refresh = () => { if (active && identity && document.visibilityState === 'visible') void reload() }
    queueMicrotask(refresh)
    const socket = identity ? io(getApiBaseUrl() || window.location.origin, { withCredentials: true }) : null
    socket?.on('report-alerts-updated', (event: { kind: string; reportId: string }) => { if (!active) return; if (event.kind === 'created') setCue(event.reportId); refresh() })
    socket?.on('connect', refresh)
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; versions.current++; socket?.disconnect(); window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [identity, reload])
  const read = async (id: string) => { await apiRequest(`/report-alerts/${encodeURIComponent(id)}/read`, { method: 'PATCH' }); await reload() }
  return { data: identity && state.identity === identity ? state.data : null, error: identity && state.identity === identity ? state.error : '', cue, reload, read }
}
