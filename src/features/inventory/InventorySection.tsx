import { useEffect, useRef, useState } from 'react'
import { apiRequest, getApiBaseUrl } from '../../lib/dataService'
import { DataStatus } from '../../components/DataStatus'
import { useInventory } from './useInventory'
import type { InventoryData, InventoryItem, InventoryMovement } from './types'
import './Inventory.css'

const time = (value: string) => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota' })

async function downloadLabel(item: InventoryItem, url: string) {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error('No se pudo descargar el QR.')
  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    const image = new Image(); image.src = objectUrl; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 500
    const context = canvas.getContext('2d')
    if (!context) throw new Error('El navegador no permite generar la etiqueta.')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 420, 500); context.drawImage(image, 30, 10, 360, 360)
    context.fillStyle = '#111111'; context.textAlign = 'center'; context.font = 'bold 28px sans-serif'; context.fillText(item.code, 210, 400)
    context.font = '20px sans-serif'; context.fillText(item.name, 210, 443, 390); context.font = '16px sans-serif'; context.fillText('JP Mantenimiento Integral', 210, 478)
    const link = document.createElement('a'); link.download = `Etiqueta-${item.code}.png`; link.href = canvas.toDataURL('image/png'); link.click()
  } finally { URL.revokeObjectURL(objectUrl) }
}

function EditItem({ item, onSaved }: { item: InventoryItem; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  return <details><summary>Editar ficha · Gerencia</summary><form className="field-form" onSubmit={async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setNotice('')
    try { await apiRequest(`/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({ ...values, minimum: Number(values.minimum || 0), version: item.version }) }); onSaved() }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }}><label>Nombre<input name="name" required maxLength={160} defaultValue={item.name} disabled={busy} /></label><label>Marca<input name="brand" maxLength={120} defaultValue={item.brand} disabled={busy} /></label><label>Serie o referencia<input name="serial" maxLength={120} defaultValue={item.serial} disabled={busy} /></label><label>Observaciones<textarea name="notes" maxLength={2000} defaultValue={item.notes} disabled={busy} /></label>{item.kind === 'Material' && <label>Mínimo en bodega<input name="minimum" type="number" min={0} step="0.001" max={1000000} defaultValue={item.minimum} disabled={busy} /></label>}<p>El código y la unidad no cambian. Para corregir cantidades, registra un ajuste con su motivo.</p><button className="primary-button" disabled={busy}>Guardar ficha</button>{notice && <p role="alert">{notice}</p>}</form></details>
}

function CreateItem({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState('Herramienta')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  return <details className="panel inventory-create"><summary>Registrar herramienta o material</summary><form className="field-form" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form))
    setBusy(true); setNotice('')
    try {
      const item = await apiRequest<InventoryItem>('/inventory', { method: 'POST', body: JSON.stringify({ ...values, kind, minimum: Number(values.minimum || 0), initial: Number(values.initial || 0) }) })
      form.reset(); setNotice(`Registrado: ${item.name} · Código ${item.code}`); onSaved()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo registrar.') }
    finally { setBusy(false) }
  }}><div className="inventory-form-grid">
    <label>Tipo<select name="kind" value={kind} onChange={event => setKind(event.target.value)} disabled={busy}><option>Herramienta</option><option>Material</option></select></label>
    <label>Nombre<input name="name" required maxLength={160} disabled={busy} placeholder="Ej. Taladro percutor / Cemento gris" /></label>
    <label>Código numérico (opcional)<input name="code" inputMode="numeric" pattern="[0-9]{4,20}" maxLength={20} disabled={busy} placeholder="Vacío: generar código único" /></label>
    <label>Marca<input name="brand" maxLength={120} disabled={busy} /></label>
    <label>Serie o referencia<input name="serial" maxLength={120} disabled={busy} /></label>
    {kind === 'Material' && <><label>Unidad de medida<input name="unit" required maxLength={40} defaultValue="unidad" disabled={busy} placeholder="kg, metro, unidad, saco…" /></label><label>Existencia inicial<input name="initial" type="number" min={0} max={1000000} step="0.001" defaultValue={0} disabled={busy} /></label><label>Existencia mínima<input name="minimum" type="number" min={0} max={1000000} step="0.001" defaultValue={0} disabled={busy} /></label></>}
  </div><label>Observaciones<textarea name="notes" maxLength={2000} rows={2} disabled={busy} /></label>
    <p>Cada herramienta física debe registrarse por separado para tener su propio código, QR e historial.</p>
    <button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Registrar en inventario'}</button>{notice && <p role="status">{notice}</p>}
  </form></details>
}

function MoveItem({ item, data, manager, onSaved }: { item: InventoryItem; data: InventoryData; manager: boolean; onSaved: () => void }) {
  const actions = item.kind === 'Herramienta'
    ? item.status === 'Prestada' ? ['Devolución', 'Devolución con daño'] : item.status === 'Mantenimiento' ? ['Disponible', ...(manager ? ['Baja'] : [])] : item.status === 'Baja' ? [] : ['Préstamo', 'Mantenimiento', ...(manager ? ['Baja'] : [])]
    : ['Entrada', 'Entrega a obra', 'Consumo', 'Retorno a bodega', ...(manager ? ['Ajuste positivo', 'Ajuste negativo'] : [])]
  const [action, setAction] = useState(actions[0] ?? '')
  const [allocationId, setAllocationId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const allocationActions = ['Consumo', 'Retorno a bodega'].includes(action)
  const destination = ['Préstamo', 'Entrega a obra'].includes(action)
  if (!actions.length) return <p>Herramienta dada de baja. El historial se conserva.</p>
  return <form className="field-form" onSubmit={async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget))
    const allocation = data.allocations.find(a => a.id === allocationId)
    setBusy(true); setNotice('')
    try {
      await apiRequest(`/inventory/${item.id}/movements`, { method: 'POST', body: JSON.stringify({ action, quantity: item.kind === 'Herramienta' ? 1 : Number(values.quantity), notes: values.notes, version: item.version, requestId: requestId.current,
        employeeId: allocationActions ? allocation?.employeeId : destination ? values.employeeId : null,
        orderId: allocationActions ? allocation?.orderId : destination ? values.orderId : null,
        dueDate: values.dueDate || null }) })
      requestId.current = crypto.randomUUID(); setNotice('Movimiento registrado.'); onSaved()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo registrar el movimiento.') }
    finally { setBusy(false) }
  }}><h4>Registrar movimiento</h4><label>Movimiento<select value={action} disabled={busy} onChange={event => { setAction(event.target.value); requestId.current = crypto.randomUUID() }}>{actions.map(a => <option key={a}>{a}</option>)}</select></label>
    {item.kind === 'Material' && <label>Cantidad ({item.unit})<input name="quantity" type="number" min="0.001" max={1000000} step="0.001" required disabled={busy} /></label>}
    {destination && <><label>Trabajador responsable<select name="employeeId" required disabled={busy}><option value="">Selecciona trabajador</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>Obra de destino<select name="orderId" required disabled={busy}><option value="">Selecciona obra abierta</option>{data.orders.map(o => <option key={o.id} value={o.id}>{o.client}</option>)}</select></label></>}
    {action === 'Préstamo' && <label>Devolución prevista (opcional)<input type="date" name="dueDate" disabled={busy} /></label>}
    {allocationActions && <label>Material pendiente en obra<select value={allocationId} onChange={event => setAllocationId(event.target.value)} required disabled={busy}><option value="">Selecciona obra y responsable</option>{data.allocations.filter(a => a.itemId === item.id).map(a => <option key={a.id} value={a.id}>{a.client} · {a.employeeName} · {a.quantity} {item.unit}</option>)}</select></label>}
    <label>Motivo y estado del elemento<textarea name="notes" required maxLength={2000} rows={3} disabled={busy} placeholder="Ej. Entrega completa, accesorios incluidos / sobrante reutilizable" /></label>
    <button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar movimiento'}</button>{notice && <p role="status">{notice}</p>}
  </form>
}

function ItemDetail({ item, data, manager, writable, onSaved }: { item: InventoryItem; data: InventoryData; manager: boolean; writable: boolean; onSaved: () => void }) {
  const [history, setHistory] = useState<InventoryMovement[]>([])
  const [error, setError] = useState('')
  useEffect(() => { let active = true; apiRequest<InventoryMovement[]>(`/inventory/${item.id}/history`).then(rows => { if (active) setHistory(rows) }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'No se pudo consultar el historial.') }); return () => { active = false } }, [item.id, item.version])
  const qr = `${getApiBaseUrl()}/api/inventory/${item.id}/qr.png`
  return <section className="panel inventory-detail"><div className="inventory-detail-heading"><div><p className="eyebrow">{item.kind} · {item.code}</p><h3>{item.name}</h3><p>{[item.brand, item.serial].filter(Boolean).join(' · ')}</p><p>{item.notes}</p></div><div className="inventory-label"><img src={qr} alt={`QR de ${item.code}`} /><strong>{item.code}</strong><button className="ghost-button" onClick={() => void downloadLabel(item, qr).catch(error => setError(error instanceof Error ? error.message : 'No se pudo descargar.'))}>Descargar etiqueta QR</button></div></div>
    {item.kind === 'Herramienta' ? <p><strong>{item.status}</strong>{item.employeeName && <> · Responsable: {item.employeeName} · Obra: {item.client}</>}{item.dueDate && <> · Devolver: {item.dueDate}</>}</p> : <><p><strong>Disponible en bodega: {item.warehouse} {item.unit}</strong> · Mínimo: {item.minimum}</p><h4>Material entregado pendiente de consumo o devolución</h4>{data.allocations.filter(a => a.itemId === item.id).map(a => <p key={a.id}>{a.client} · {a.employeeName}: {a.quantity} {item.unit}</p>)}</>}
    {writable && <MoveItem key={`${item.id}-${item.version}`} item={item} data={data} manager={manager} onSaved={onSaved} />}
    {manager && <EditItem key={`edit-${item.id}-${item.version}`} item={item} onSaved={onSaved} />}
    <h4>Historial de movimientos</h4><p>Últimos 200 movimientos. Se conserva quién registró cada operación.</p>{error && <p role="alert">{error}</p>}
    <ol className="inventory-history">{history.map(m => <li key={m.id}><strong>{m.action} · {m.quantity} {item.unit}</strong><p>{time(m.createdAt)} · Registró: {m.actorName}</p>{m.employeeName && <p>Responsable: {m.employeeName} · {m.client}</p>}<p>{m.notes}</p></li>)}</ol>
  </section>
}

export function InventorySection({ manager, writable }: { manager: boolean; writable: boolean }) {
  const { data, error, loading, reload } = useInventory()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('Todos')
  const [selected, setSelected] = useState('')
  const items = data?.items ?? []
  const selectedItem = items.find(i => i.id === selected)
  const filtered = items.filter(i => (kind === 'Todos' || i.kind === kind) && `${i.code} ${i.name} ${i.serial} ${i.employeeName ?? ''} ${i.client ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <section className="content-block inventory-panel"><div className="section-explanation"><h2>Bodega, herramientas y materiales</h2><p>Cada herramienta tiene identidad propia. Los materiales solo vuelven a estar disponibles para otras obras después de registrar su retorno físico a bodega.</p></div>
    <DataStatus loading={loading} error={error} generatedAt={data?.generatedAt} onRefresh={() => void reload()} label="Inventario" />
    <div className="stats-grid"><div className="panel"><span>Herramientas en bodega</span><h3>{items.filter(i => i.kind === 'Herramienta' && i.status === 'En bodega').length}</h3></div><div className="panel"><span>Herramientas prestadas</span><h3>{items.filter(i => i.kind === 'Herramienta' && i.status === 'Prestada').length}</h3></div><div className="panel"><span>Materiales bajo mínimo</span><h3>{items.filter(i => i.kind === 'Material' && i.warehouse <= i.minimum).length}</h3></div></div>
    {writable && <CreateItem onSaved={() => void reload()} />}
    <div className="panel"><div className="inventory-form-grid"><label>Buscar por código, nombre, trabajador u obra<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Escribe o usa un lector QR / de códigos conectado" /></label><label>Tipo<select value={kind} onChange={event => setKind(event.target.value)}><option>Todos</option><option>Herramienta</option><option>Material</option></select></label></div>
      <p>El QR contiene el código numérico. Puedes leerlo con un lector que escriba en este campo o introducir el código manualmente.</p>
      {!filtered.length && <p>{items.length ? 'Sin coincidencias.' : 'Aún no hay herramientas ni materiales registrados.'}</p>}
      <div className="inventory-list">{filtered.map(i => <button className={`inventory-item ${selected === i.id ? 'selected' : ''}`} key={i.id} onClick={() => setSelected(i.id)}><strong>{i.name}</strong><span>{i.kind} · {i.code}</span><span>{i.kind === 'Herramienta' ? `${i.status}${i.employeeName ? ` · ${i.employeeName}` : ''}` : `${i.warehouse} ${i.unit} en bodega${i.warehouse <= i.minimum ? ' · Reponer' : ''}`}</span></button>)}</div>
    </div>
    {data && selectedItem && <ItemDetail item={selectedItem} data={data} manager={manager} writable={writable} onSaved={() => void reload()} />}
  </section>
}
