import { useState, type FormEvent } from 'react'
import { useModalDialog } from '../../hooks/useModalDialog'
import { OrderMediaPicker } from './OrderMediaPicker'
import type { OrderAttachmentDraft, OrderSiteDetails } from '../../types'
import { emptyOrderSite, validateOrderSite } from '../../../shared/order-site.js'
import { OrderSiteFields } from './OrderSiteFields'
import './CreateOrderDialog.css'

export type OrderDraft = {
  client: string
  area: string
  priority: string
  assignedTo: string
  date: string
  observations: string
  attachments?: OrderAttachmentDraft[]
  site: OrderSiteDetails
}

type Props = {
  assignees: { id: string; name: string }[]
  canAssign: boolean
  onClose: () => void
  onCreate: (draft: OrderDraft) => Promise<void>
}

const priorities = [
  { value: 'Baja', detail: 'Puede programarse', tone: 'low' },
  { value: 'Media', detail: 'Atención habitual', tone: 'normal' },
  { value: 'Alta', detail: 'Requiere prioridad', tone: 'high' },
  { value: 'Crítica', detail: 'Atención inmediata', tone: 'critical' },
]

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CreateOrderDialog({ assignees, canAssign, onClose, onCreate }: Props) {
  const [draft, setDraft] = useState<OrderDraft>(() => ({
    client: '', area: '', priority: 'Media', assignedTo: '', date: today(), observations: '', attachments: [], site: emptyOrderSite(),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialog = useModalDialog(onClose, saving)
  const technician = assignees.find(employee => employee.id === draft.assignedTo)

  const update = <K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    if (!draft.client.trim() || !draft.area.trim()) {
      setError('Completa el cliente y el área del servicio.')
      return
    }
    const site = validateOrderSite(draft.site)
    if (!site.value) { setError(site.error); return }
    setSaving(true)
    setError('')
    try { await onCreate({ ...draft, site: site.value, client: draft.client.trim(), area: draft.area.trim(), assignedTo: canAssign ? draft.assignedTo : '' }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la orden. Intenta nuevamente.') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop order-create-backdrop">
      <div ref={dialog} className="order-create-dialog" role="dialog" aria-modal="true" aria-labelledby="order-create-title" aria-describedby="order-create-description">
        <header className="order-create-header">
          <div>
            <p className="eyebrow">Operación · Órdenes de trabajo</p>
            <h2 id="order-create-title">Nueva orden de trabajo</h2>
            <p id="order-create-description">Organiza el servicio, define su prioridad y programa la atención.</p>
          </div>
          <button type="button" className="close-button" aria-label="Cerrar nueva orden" disabled={saving} onClick={onClose}>×</button>
        </header>

        <form className="order-create-form" onSubmit={submit}>
          <div className="order-create-content">
            <div className="order-create-fields">
              <section aria-labelledby="order-service-title">
                <h3 id="order-service-title"><span>01</span> Información del servicio</h3>
                <div className="order-form-grid">
                  <label htmlFor="order-client">Cliente <span className="order-required">Obligatorio</span>
                    <input id="order-client" placeholder="Ej. Edificio Los Cedros" required maxLength={200} autoComplete="organization" value={draft.client} onChange={event => update('client', event.target.value)} />
                  </label>
                  <label htmlFor="order-area">Área del servicio <span className="order-required">Obligatorio</span>
                    <input id="order-area" placeholder="Ej. Electricidad o plomería" required maxLength={120} value={draft.area} onChange={event => update('area', event.target.value)} />
                  </label>
                </div>
                <label className="order-description-field" htmlFor="order-description">Descripción del trabajo <span className="order-optional">Opcional</span>
                  <textarea id="order-description" placeholder="Describe qué necesita el cliente, la ubicación y las indicaciones para realizar el servicio." rows={4} maxLength={4000} value={draft.observations} onChange={event => update('observations', event.target.value)} />
                  <small className="order-character-count">{draft.observations.length.toLocaleString('es-CO')} / 4.000 caracteres</small>
                </label>
              </section>

              <OrderSiteFields value={draft.site} onChange={site => update('site', site)} />
              <section aria-labelledby="order-priority-title">
                <h3 id="order-priority-title"><span>04</span> Prioridad del servicio</h3>
                <fieldset className="order-priority-options">
                  <legend className="visually-hidden">Selecciona la prioridad</legend>
                  {priorities.map(priority => (
                    <label key={priority.value} className={`order-priority-option ${priority.tone} ${draft.priority === priority.value ? 'selected' : ''}`}>
                      <input type="radio" name="order-priority" value={priority.value} checked={draft.priority === priority.value} onChange={() => update('priority', priority.value)} />
                      <span><strong>{priority.value}</strong><small>{priority.detail}</small></span>
                    </label>
                  ))}
                </fieldset>
              </section>

              <section aria-labelledby="order-scheduling-title">
                <h3 id="order-scheduling-title"><span>05</span> Programación y responsable</h3>
                <div className="order-form-grid">
                  <label htmlFor="order-date">Fecha prevista <span className="order-optional">Opcional</span>
                    <input id="order-date" type="date" value={draft.date} onChange={event => update('date', event.target.value)} />
                  </label>
                  {canAssign ? (
                    <label htmlFor="order-technician">Técnico responsable <span className="order-optional">Opcional</span>
                      <select id="order-technician" value={draft.assignedTo} onChange={event => update('assignedTo', event.target.value)}>
                        <option value="">Asignar más adelante</option>
                        {assignees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                      </select>
                      {!assignees.length && <small>No hay técnicos activos disponibles. Puedes crear la orden sin asignar.</small>}
                    </label>
                  ) : <div className="order-assignment-note"><strong>Asignación por Gerencia</strong><p>El Gerente seleccionará al técnico después de registrar la orden.</p></div>}
                </div>
              </section>
              <section aria-labelledby="order-media-title">
                <h3 id="order-media-title"><span>06</span> Fotos y videos del servicio <span className="order-optional">Opcional</span></h3>
                <OrderMediaPicker files={draft.attachments ?? []} onChange={attachments => update('attachments', attachments)} disabled={saving} />
              </section>
            </div>

            <aside className="order-create-summary" aria-label="Resumen de la nueva orden" aria-live="polite">
              <p className="eyebrow">Resumen de la orden</p>
              <h3>{draft.client.trim() || 'Tu próximo servicio'}</h3>
              <p className="order-summary-area">{draft.area.trim() || 'Completa los datos para preparar el servicio.'}</p>
              <dl>
                <div><dt>Dirección de la obra</dt><dd>{[draft.site.address, draft.site.city].filter(Boolean).join(', ') || 'Por completar'}</dd></div>
                {(draft.site.building || draft.site.unit) && <div><dt>Unidad de destino</dt><dd>{[draft.site.building, draft.site.unit].filter(Boolean).join(' · ')}</dd></div>}
                <div><dt>Prioridad</dt><dd><span className={`order-summary-priority ${priorities.find(item => item.value === draft.priority)?.tone}`}>{draft.priority}</span></dd></div>
                <div><dt>Fecha prevista</dt><dd>{draft.date ? new Date(`${draft.date}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Por definir'}</dd></div>
                <div><dt>Responsable</dt><dd>{technician?.name || 'Pendiente de asignación'}</dd></div>
                <div><dt>Estado inicial</dt><dd>{technician ? 'Asignada' : 'Programada'}</dd></div>
                <div><dt>Fotos y videos</dt><dd>{draft.attachments?.length ? `${draft.attachments.length} archivos seleccionados` : 'Sin adjuntos'}</dd></div>
              </dl>
              <div className="order-initial-progress"><span>Avance inicial</span><strong>0 %</strong><div className="progress-line"><span style={{ width: 0 }} /></div></div>
              <p className="order-summary-help">Al crearla, la orden quedará guardada y disponible para su seguimiento en el panel.</p>
            </aside>
          </div>

          <footer className="order-create-footer">
            {error && <p className="order-create-error" role="alert">{error}</p>}
            <div className="order-create-actions"><p>Completa cliente, área, dirección y ciudad.</p><div>
              <button type="button" className="ghost-button" disabled={saving} onClick={onClose}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? draft.attachments?.length ? 'Subiendo archivos…' : 'Creando orden…' : 'Crear orden'}</button>
            </div></div>
          </footer>
        </form>
      </div>
    </div>
  )
}
