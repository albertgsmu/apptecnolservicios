import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/dataService'
import type { WorkOrder, OrderAttachmentDraft, OrderSiteDetails } from '../types'

export function useOrders(enabled: boolean, canWrite: boolean) {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    const id = ++requestId.current
    if (!enabled) { setOrders([]); setAssignees([]); setError(''); setLoading(false); return }
    setLoading(true)
    try {
      const [nextOrders, nextAssignees] = await Promise.all([
        apiRequest<WorkOrder[]>('/orders'),
        canWrite ? apiRequest<{ id: string; name: string }[]>('/orders/assignees') : Promise.resolve([]),
      ])
      if (id !== requestId.current) return
      setOrders(nextOrders)
      setAssignees(nextAssignees)
      setError('')
    } catch (cause) { if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las órdenes.') }
    finally { if (id === requestId.current) setLoading(false) }
  }, [enabled, canWrite])
  useEffect(() => {
    let active = true
    const requests = requestId
    const refresh = () => { if (active && enabled && document.visibilityState === 'visible') void reload() }
    queueMicrotask(() => { if (active) void reload() })
    const interval = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { active = false; requests.current++; window.clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [reload, enabled])
  const create = async (draft: { client: string; area: string; priority: string; assignedTo: string; date: string; observations: string; attachments?: OrderAttachmentDraft[]; site: OrderSiteDetails }) => {
    const { attachments = [], ...payload } = draft
    let body: BodyInit = JSON.stringify(payload)
    if (attachments.length) {
      const form = new FormData()
      form.append('order', JSON.stringify({ ...payload, attachmentInstructions: attachments.map(attachment => attachment.instructions) }))
      attachments.forEach(attachment => form.append('attachments', attachment.file))
      body = form
    }
    const order = await apiRequest<WorkOrder>('/orders', { method: 'POST', body, signal: AbortSignal.timeout(attachments.length ? 180000 : 15000) })
    setOrders(current => [order, ...current])
  }
  const update = async (id: string, payload: { assignedTo: string; progress: number; status: string; version: number }) => {
    const order = await apiRequest<WorkOrder>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    setOrders(current => current.map(item => item.id === id ? order : item))
  }
  return { orders: enabled ? orders : [], assignees, error, loading, reload, create, update }
}
