import { useEffect, useState } from 'react'
import type { FieldWorkData, LocationAssessment, WorkOrder, WorkerCheckIn } from '../../types'
import { useFieldWork } from '../../hooks/useFieldWork'
import { getApiBaseUrl } from '../../lib/dataService'
import { FieldReportList } from './FieldReportList'
import { OrderSiteInfo } from '../orders/OrderSiteInfo'
import { OrderAttachments } from '../orders/OrderAttachments'

const dayOf = (date: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(date))
const timeOf = (date: string) => new Date(date).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
const dateOf = (date: string) => new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })
const statusLabels = { inside: 'Dentro del radio', outside: 'Fuera del radio', uncertain: 'Ubicación imprecisa', unconfigured: 'Sin radio configurado', unavailable: 'Sin ubicación' }
type LocationEntry = { id: string; employeeName: string; createdAt: string; capturedAt?: string | null; latitude?: number | null; longitude?: number | null; accuracy?: number | null; assessments: LocationAssessment[]; source: string }
function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) { const value = key(item); if (!groups.has(value)) groups.set(value, []); groups.get(value)!.push(item) }
  return groups
}

function LocationDetail({ entry, orderId }: { entry: LocationEntry; orderId?: string }) {
  const assessment = entry.assessments.find(item => item.orderId === orderId)
  const hasLocation = typeof entry.latitude === 'number' && typeof entry.longitude === 'number'
  return <details className="record-location-detail"><summary>Ver detalle</summary><div>
    <p>{entry.source}</p>
    {assessment && <p>{statusLabels[assessment.status]}{assessment.distance !== null && ` · Distancia: ${assessment.distance} m`}{assessment.radius !== null && ` · Radio: ${assessment.radius} m`}</p>}
    {hasLocation ? <><p>Precisión aproximada: {Math.round(entry.accuracy ?? 0)} m{entry.capturedAt && ` · ${timeOf(entry.capturedAt)}`}</p><a href={`https://www.google.com/maps/search/?api=1&query=${entry.latitude},${entry.longitude}`} target="_blank" rel="noreferrer">Ver mapa ↗</a></> : <p>Sin coordenadas disponibles.</p>}
  </div></details>
}

function ArrivalRecords({ data, orderId }: { data: FieldWorkData; orderId: string }) {
  const [date, setDate] = useState('')
  const entries: LocationEntry[] = [
    ...data.checkIns.filter(item => item.kind === 'arrival' && item.orderId === orderId).map(item => ({ ...item, source: 'Llegada declarada a la obra' })),
    ...data.photos.filter(item => item.orderId === orderId).map(item => ({ ...item, source: 'Ubicación al enviar foto' })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
  const groups = groupBy(entries.filter(entry => !date || dayOf(entry.createdAt) === date), entry => dayOf(entry.createdAt))
  return <section className="panel work-arrivals"><h3>Llegadas y ubicaciones de la obra</h3>
    <div className="record-date-filter"><label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>{date && <button className="ghost-button" onClick={() => setDate('')}>Ver todas</button>}</div>
    {!groups.size && <p>No hay registros{date ? ' para esta fecha' : ' en esta obra'}.</p>}
    {[...groups].map(([day, items]) => <section className="record-day" key={day}><h4>{dateOf(day)}</h4><ul className="arrival-timeline">{items.map(entry => {
      const assessment = entry.assessments.find(item => item.orderId === orderId)
      return <li key={entry.id}><div className="arrival-line"><time dateTime={entry.createdAt}>{timeOf(entry.createdAt)}</time><strong>{entry.employeeName}</strong></div><span className={`arrival-state ${assessment?.status ?? 'unavailable'}`}>{assessment ? statusLabels[assessment.status] : 'Sin comparación'}</span><small>{entry.source}</small><LocationDetail entry={entry} orderId={orderId} /></li>
    })}</ul></section>)}
    <p className="metric-explanation">Hora de Colombia · Las ubicaciones de las fotos corresponden al envío.</p>
  </section>
}

function PhotoRecords({ data, orderId, showLocations }: { data: FieldWorkData; orderId: string; showLocations: boolean }) {
  const groups = groupBy(data.photos.filter(photo => photo.orderId === orderId), photo => photo.day)
  return <section className="panel work-photos"><h3>Fotos de la obra</h3>{!groups.size && <p>No hay fotos registradas.</p>}
    {[...groups].map(([day, photos]) => <section className="record-day" key={day}><h4>{dateOf(day)}</h4><div className="record-photo-grid">{photos.map(photo => <article className="field-report-card" key={photo.id}><strong>{photo.employeeName}</strong><time dateTime={photo.createdAt}>{timeOf(photo.createdAt)}</time><a href={`${getApiBaseUrl()}/api/field-work/photos/${photo.id}/content`} target="_blank" rel="noreferrer"><img src={`${getApiBaseUrl()}/api/field-work/photos/${photo.id}/content`} alt={photo.caption} loading="lazy" /></a><p className="field-text">{photo.caption}</p>{showLocations && <LocationDetail entry={{ ...photo, source: 'Ubicación al enviar foto' }} orderId={orderId} />}</article>)}</div></section>)}
  </section>
}

export function AccessRecords({ checkIns }: { checkIns: WorkerCheckIn[] }) {
  const groups = groupBy(checkIns.filter(item => item.kind === 'login'), item => item.employeeId)
  return <section className="panel worker-access-records"><h3>Accesos por trabajador</h3><p className="metric-explanation">Últimos 100 registros · El inicio de sesión no confirma una llegada.</p>
    {!groups.size && <p>No hay accesos registrados.</p>}
    {[...groups].map(([id, items]) => <details className="worker-access-group" key={id}><summary>{items[0].employeeName}<span>{items.length} registros</span></summary><ul className="arrival-timeline">{items.map(item => <li key={item.id}><strong>{dateOf(dayOf(item.createdAt))} · {timeOf(item.createdAt)}</strong><LocationDetail entry={{ ...item, source: 'Inicio de sesión del trabajador' }} /></li>)}</ul></details>)}
  </section>
}

function SelectedWorkRecord({ order, showLocations, onBack, onSaved, refreshToken }: { order: WorkOrder; showLocations: boolean; onBack: () => void; onSaved: () => void; refreshToken?: string }) {
  const [tab, setTab] = useState('Resumen')
  const history = useFieldWork('work-record', order.id)
  const reloadHistory = history.reload
  useEffect(() => { if (refreshToken) void reloadHistory() }, [refreshToken, reloadHistory])
  const tabs = showLocations ? ['Resumen', 'Llegadas', 'Fotos', 'Reportes'] : ['Resumen', 'Reportes']
  const reload = () => { void history.reload(); onSaved() }
  return <section className="content-block work-record" aria-label={`Registro de ${order.client}`}>
    <button className="text-button record-back" onClick={onBack}>← Todas las obras</button>
    <header className="panel work-record-header"><p className="eyebrow">Registro de obra</p><h2>{order.client}</h2><p>{order.site.address} · {order.site.city}</p><span className="status-badge">{order.status}</span></header>
    <nav className="work-record-tabs" aria-label="Secciones del registro">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} aria-current={tab === item ? 'page' : undefined} aria-controls="work-record-content" onClick={() => setTab(item)}>{item}</button>)}</nav>
    {history.loading && !history.data && <p role="status">Cargando registro…</p>}
    {history.error && <div className="panel" role="alert"><p>{history.error}</p><button className="ghost-button" onClick={() => void history.reload()}>Reintentar</button></div>}
    <div id="work-record-content">
      {tab === 'Resumen' && <div className="panel"><h3>Resumen de la obra</h3><dl className="work-record-summary"><div><dt>Trabajador asignado</dt><dd>{order.assignedName || 'Sin asignar'}</dd></div><div><dt>Fecha prevista</dt><dd>{order.date || 'Por definir'}</dd></div><div><dt>Avance</dt><dd>{order.progress}%</dd></div><div><dt>Reportes pendientes</dt><dd>{history.data ? history.data.totals.pending : 'Consultando…'}</dd></div></dl><OrderSiteInfo site={showLocations ? order.site : { ...order.site, geofence: undefined }} />{order.observations && <p className="field-text">{order.observations}</p>}<OrderAttachments attachments={order.attachments} /></div>}
      {tab === 'Llegadas' && history.data && <ArrivalRecords data={history.data} orderId={order.id} />}
      {tab === 'Fotos' && history.data && <PhotoRecords data={history.data} orderId={order.id} showLocations={showLocations} />}
      {tab === 'Reportes' && history.data && <FieldReportList reports={history.data.reports} manager reload={reload} />}
    </div>
    {tab !== 'Resumen' && <p className="metric-explanation">Hasta 100 registros recientes por categoría, solo de esta obra.</p>}
  </section>
}

export function WorkRecords({ orders, data, showLocations, initialOrderId, reload }: { orders: WorkOrder[]; data: FieldWorkData | null; showLocations: boolean; initialOrderId?: string; reload: () => void }) {
  const [selectedId, setSelectedId] = useState(initialOrderId ?? '')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Todas')
  const [showAccess, setShowAccess] = useState(false)
  const selected = orders.find(order => order.id === selectedId)
  if (selected) return <SelectedWorkRecord key={selected.id} order={selected} showLocations={showLocations} onBack={() => setSelectedId('')} onSaved={reload} refreshToken={data?.generatedAt} />
  const filtered = orders.filter(order => (status === 'Todas' || (status === 'Cerradas' ? order.status === 'Cerrada' : order.status !== 'Cerrada')) && [order.client, order.assignedName, order.site.address, order.site.city, order.id].some(value => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  return <section className="content-block work-records"><div className="panel"><div className="panel-header"><div><p className="eyebrow">Reportes de obra</p><h2>Registro por obra</h2></div></div>
    <div className="orders-filters"><label>Buscar obra<input type="search" placeholder="Cliente, dirección o trabajador" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Estado<select value={status} onChange={event => setStatus(event.target.value)}>{['Todas', 'Abiertas', 'Cerradas'].map(item => <option key={item}>{item}</option>)}</select></label></div>
    {!filtered.length && <p>No hay obras para mostrar.</p>}
    <div className="order-grid">{filtered.map(order => <article className="work-record-card" key={order.id}><span className="status-badge">{order.status}</span><h3>{order.client}</h3><p>{order.site.address} · {order.site.city}</p><p>{order.assignedName || 'Sin trabajador asignado'}</p><button className="primary-button" aria-label={`Abrir registro de ${order.client}`} onClick={() => { setSelectedId(order.id); window.scrollTo({ top: 0, behavior: 'instant' }) }}>Ver registro de obra</button></article>)}</div>
  </div>{showLocations && <><button className="ghost-button" aria-expanded={showAccess} onClick={() => setShowAccess(!showAccess)}>{showAccess ? 'Ocultar accesos de trabajadores' : 'Accesos de trabajadores'}</button>{showAccess && <AccessRecords checkIns={data?.checkIns ?? []} />}</>}</section>
}
