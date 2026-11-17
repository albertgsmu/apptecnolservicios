import { useCallback, useState } from 'react'
import type { WorkOrder } from '../../types'
import { OrderAttachments } from './OrderAttachments'
import { OrderSiteInfo } from './OrderSiteInfo'
import { OrderArrivalSettings } from './OrderArrivalSettings'
import { OrderEvidenceEditor } from './OrderEvidenceEditor'
import { DeleteOrderDialog } from './DeleteOrderDialog'

type Props = {
  orders: WorkOrder[]; assignees: { id: string; name: string }[]; canWrite: boolean
  canCreate: boolean; canAssign: boolean; canClose: boolean; canDelete: boolean
  onDelete: (id: string, version: number) => Promise<void>
  onViewRecord?: (id: string) => void
  onLocationSaved: () => void
  onCreate: () => void
  onUpdate: (id: string, payload: { assignedTo: string; progress: number; status: string; version: number }) => Promise<void>
}
function OrderCard({ order, assignees, canWrite, canAssign, canClose, canDelete, onUpdate, onLocationSaved, onRequestDelete, onViewRecord }: Omit<Props, 'orders' | 'onCreate'> & { order: WorkOrder; onRequestDelete: (order: WorkOrder) => void }) {
  const [draft, setDraft] = useState({ assignedTo: order.assignedTo, progress: order.progress, status: order.status })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  return <article className="order-card">
    <div className="order-head"><div><span className="order-id" title={order.id}>{order.id.slice(0, 11)}</span><h3>{order.client}</h3></div><span className={`priority-badge ${order.priority.toLowerCase()}`}>{order.priority}</span></div>
    <p>{order.area} · {order.date || 'Sin fecha prevista'}</p><p>{order.assignedName || 'Sin técnico asignado'}</p>
    {order.observations && <p>{order.observations}</p>}
    <OrderSiteInfo site={order.site} />
    {canClose && order.status !== 'Cerrada' && <OrderArrivalSettings order={order} onSaved={onLocationSaved} />}
    <OrderAttachments attachments={order.attachments} />
    {canAssign && order.status !== 'Cerrada' && <OrderEvidenceEditor order={order} onSaved={onLocationSaved} />}
    <div className="progress-line"><span style={{ width: `${order.progress}%` }} /></div>
    <div className="order-footer"><span>{order.status}</span><strong>{order.progress}%</strong></div>
    {onViewRecord && <button className="secondary-button order-record-button" onClick={() => onViewRecord(order.id)}>Ver registro de obra</button>}
    {canWrite && order.status !== 'Cerrada' && <form className="order-editor" onSubmit={async event => {
      event.preventDefault(); setSaving(true); setNotice('')
      try { await onUpdate(order.id, { ...draft, version: order.version }); setNotice('Cambios guardados.') }
      catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar.') }
      finally { setSaving(false) }
    }}>
      {canAssign && <label>Técnico<select value={draft.assignedTo} onChange={event => setDraft(current => ({ ...current, assignedTo: event.target.value, status: event.target.value ? (current.status === 'Programada' ? 'Asignada' : current.status) : 'Programada' }))}>
        <option value="">Sin asignar</option>
        {order.assignedTo && !assignees.some(item => item.id === order.assignedTo) && <option value={order.assignedTo}>{order.assignedName} (no disponible)</option>}
        {assignees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <label>Estado<select value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value, progress: event.target.value === 'Cerrada' ? 100 : current.progress }))}>
        {(canClose ? ['Programada', 'Asignada', 'En ejecución', 'Revisión', 'Cerrada'] : canAssign ? ['Programada', 'Asignada', 'En ejecución', 'Revisión'] : [order.status, 'En ejecución', 'Revisión'].filter((item, index, items) => items.indexOf(item) === index)).map(status => <option key={status}>{status}</option>)}
      </select></label>
      <label>Avance (%)<input type="number" min={order.progress} max={canClose ? 100 : 99} required value={draft.progress} onChange={event => setDraft(current => ({ ...current, progress: Number(event.target.value), status: !canAssign && current.status === 'Asignada' ? 'En ejecución' : current.status }))} /></label>
      <button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : draft.status === 'Cerrada' ? 'Cerrar orden' : 'Guardar cambios'}</button>
    </form>}
    {order.status === 'Cerrada' && <p>Trabajo cerrado. Disponible para consulta.</p>}
    {notice && <p role="status">{notice}</p>}
    {canDelete && <div className="order-danger-zone"><button type="button" className="danger-button danger-button-outline" disabled={saving} onClick={() => onRequestDelete(order)}>Borrar orden</button></div>}
  </article>
}
export function OrdersSection({ orders, onCreate, ...props }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Todas')
  const [deleteOrder, setDeleteOrder] = useState<WorkOrder | null>(null)
  const [notice, setNotice] = useState('')
  const closeDelete = useCallback(() => setDeleteOrder(null), [])
  const filtered = orders.filter(order => (status === 'Todas' || order.status === status) && [order.client, order.area, order.assignedName ?? '', order.id].some(value => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  return <section className="content-block"><div className="panel panel-full">
    <div className="panel-header"><div><p className="eyebrow">Operación</p><h2>Órdenes de trabajo y seguimiento</h2></div>{props.canCreate && <button className="primary-button" onClick={onCreate}>Nueva OT</button>}</div>
    {notice && <p className="order-deleted-notice" role="status">{notice}</p>}
    {deleteOrder && props.canDelete && <DeleteOrderDialog order={deleteOrder} onClose={closeDelete} onDelete={async (id, version) => { await props.onDelete(id, version); setNotice('Orden borrada correctamente.') }} />}
    {!orders.length && <p>No hay órdenes registradas. Crea la primera para comenzar.</p>}
    {!!orders.length && <><div className="orders-filters"><label>Buscar orden<input type="search" placeholder="Cliente, técnico o área" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Estado<select value={status} onChange={event => setStatus(event.target.value)}>{['Todas', 'Programada', 'Asignada', 'En ejecución', 'Revisión', 'Cerrada'].map(value => <option key={value}>{value}</option>)}</select></label></div><p className="metric-explanation" role="status">{filtered.length} de {orders.length} órdenes</p></>}
    {!!orders.length && !filtered.length && <p>No hay órdenes con esta búsqueda. Cambia el texto o el estado.</p>}
    <div className="order-grid">{filtered.map(order => <OrderCard key={`${order.id}-${order.version}`} order={order} {...props} onRequestDelete={order => { setNotice(''); setDeleteOrder(order) }} />)}</div>
  </div></section>
}
