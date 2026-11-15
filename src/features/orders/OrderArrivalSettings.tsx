import { useState } from 'react'
import type { WorkOrder } from '../../types'
import { apiRequest } from '../../lib/dataService'
import { readLocation } from '../field-work/location'

export function OrderArrivalSettings({ order, onSaved }: { order: WorkOrder; onSaved: () => void }) {
  const [latitude, setLatitude] = useState(String(order.site.geofence?.latitude ?? ''))
  const [longitude, setLongitude] = useState(String(order.site.geofence?.longitude ?? ''))
  const [radius, setRadius] = useState(String(order.site.geofence?.radius ?? 100))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const save = async (remove = false) => {
    setBusy(true); setNotice('')
    try {
      await apiRequest(`/orders/${order.id}/location`, { method: 'PATCH', body: JSON.stringify({ version: order.version, geofence: remove ? null : { latitude: Number(latitude), longitude: Number(longitude), radius: Number(radius) } }) })
      setNotice('Radio de llegada actualizado.'); onSaved()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }
  return <details className="panel"><summary>Configurar llegada automática</summary><p>Copia las coordenadas del punto de acceso desde el mapa. Si estás en la obra, puedes usar tu ubicación actual. La dirección escrita no se convierte automáticamente en coordenadas.</p>
    <form className="field-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <label>Latitud<input aria-label="Latitud de la obra" type="number" min={-90} max={90} step="any" required value={latitude} onChange={event => setLatitude(event.target.value)} /></label>
      <label>Longitud<input aria-label="Longitud de la obra" type="number" min={-180} max={180} step="any" required value={longitude} onChange={event => setLongitude(event.target.value)} /></label>
      <label>Radio permitido en metros<input aria-label="Radio de llegada" type="number" min={25} max={2000} step={1} required value={radius} onChange={event => setRadius(event.target.value)} /></label>
      <button type="button" className="ghost-button" disabled={busy} onClick={async () => {
        setBusy(true); setNotice('Obteniendo ubicación…')
        const location = await readLocation()
        if (location.status === 'captured') { setLatitude(String(location.latitude)); setLongitude(String(location.longitude)); setNotice(`Punto obtenido con precisión aproximada de ${Math.round(location.accuracy)} m. Verifica el punto antes de guardar.`) }
        else setNotice('No se obtuvo ubicación. Revisa el permiso o introduce las coordenadas del mapa.')
        setBusy(false)
      }}>Usar mi ubicación estando en la obra</button>
      <button className="primary-button" disabled={busy}>Guardar radio de llegada</button>
      {order.site.geofence && <button type="button" className="ghost-button" disabled={busy} onClick={() => void save(true)}>Desactivar comparación de llegada</button>}
      {notice && <p role="status">{notice}</p>}
    </form>
  </details>
}
