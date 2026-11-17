import { useState } from 'react'
import type { WorkOrder } from '../../types'
import { useModalDialog } from '../../hooks/useModalDialog'

type Props = { order: WorkOrder; onClose: () => void; onDelete: (id: string, version: number) => Promise<void> }

export function DeleteOrderDialog({ order, onClose, onDelete }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const container = useModalDialog(onClose, busy)
  return <div className="modal-backdrop" onClick={event => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <div ref={container} className="delete-order-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-order-title" aria-describedby="delete-order-description" aria-busy={busy}>
      <p className="eyebrow">Eliminar orden de trabajo</p>
      <h2 id="delete-order-title">¿Borrar esta orden?</h2>
      <div className="delete-order-summary"><strong>{order.client}</strong><span>{order.area} · {order.status}</span><small>{order.id}</small></div>
      <p id="delete-order-description">Se borrarán la orden, sus archivos adjuntos, fotos, reportes de obra y notificaciones relacionadas. <strong>Esta acción no se puede deshacer.</strong></p>
      <p className="metric-explanation">El historial de movimientos de inventario se conserva. Las herramientas o materiales pendientes deben resolverse en Bodega antes de borrar.</p>
      {error && <p className="delete-order-error" role="alert">{error}</p>}
      <div className="delete-order-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="danger-button" disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await onDelete(order.id, order.version); onClose() }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo borrar la orden. Intenta nuevamente.') }
          finally { setBusy(false) }
        }}>{busy ? 'Borrando…' : 'Sí, borrar orden'}</button>
      </div>
    </div>
  </div>
}
