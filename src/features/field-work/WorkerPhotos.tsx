import { useEffect, useRef, useState } from 'react'
import type { FieldWorkData, WorkOrder } from '../../types'
import { apiRequest, getApiBaseUrl } from '../../lib/dataService'
import { readLocation } from './location'
import { ArrivalAssessment } from './ArrivalAssessment'

export function WorkerPhotos({ manager, data, reload, currentOrder }: { currentOrder?: WorkOrder; manager: boolean; orders: WorkOrder[]; data: FieldWorkData | null; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return <div className="panel"><h3>{manager ? 'Fotos del equipo' : 'Evidencias fotográficas obligatorias'}</h3>
    {manager ? <p className="metric-explanation">{data?.dailyPhotos.day ?? 'Consultando…'} · Mínimo 3 fotos por trabajador</p> : <p>Mínimo 3 fotos diferentes por día, por trabajador con obra abierta asignada. Día de Colombia: {data?.dailyPhotos.day ?? 'consultando…'}. Cada foto se guarda junto con una lectura nueva de ubicación.</p>}
    <div className="field-report-list">{data?.dailyPhotos.workers.map(worker => <p key={worker.employeeId}><strong>{worker.name}: {worker.count}/3 fotos</strong> · {worker.missing ? `Pendiente: faltan ${worker.missing}` : 'Requisito diario cumplido'}</p>)}</div>
    {!manager && <form className="field-form" onSubmit={async event => {
      event.preventDefault()
      const form = event.currentTarget
      const body = new FormData(form)
      body.set('orderId', currentOrder?.id ?? '')
      setBusy(true); setNotice('Obteniendo ubicación actual para adjuntarla a la foto…')
      try {
        const location = await readLocation()
        if (!mounted.current) return
        if (location.status !== 'captured') throw new Error('No se envió la foto: necesitas permitir la ubicación y tener una lectura disponible. Actívala en los permisos del navegador y vuelve a intentar.')
        body.set('location', JSON.stringify(location))
        await apiRequest('/field-work/photos', { method: 'POST', body, signal: AbortSignal.timeout(60000) })
        if (!mounted.current) return
        form.reset(); setNotice(''); reload()
      } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'No se pudo enviar la evidencia.') }
      finally { if (mounted.current) setBusy(false) }
    }}>
      <p>Fotos del trabajo asignado: <strong>{currentOrder?.client || 'Sin trabajo asignado'}</strong></p>
      <label>Foto del trabajo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required disabled={busy} /></label>
      <label>Qué muestra esta foto<textarea name="caption" required maxLength={2000} rows={3} disabled={busy} /></label>
      <p className="metric-explanation">Al enviar, se registra automáticamente tu ubicación para el Gerente. JPG, PNG o WEBP, hasta 10 MB. La ubicación corresponde al envío; no acredita cuándo ni dónde se tomó una imagen de la galería.</p>
      <button className="primary-button" disabled={busy || !currentOrder}>{busy ? 'Registrando evidencia…' : 'Enviar foto'}</button>
      {notice && <p role="status">{notice}</p>}
    </form>}
    {!manager && <><h4>Mis fotos enviadas</h4><p>Últimas 100 evidencias. El contador diario incluye todas las fotos del día, sin un máximo de tres.</p></>}
    <div className="field-report-list">{data?.photos.map(photo => <article className="field-report-card" key={photo.id}>
      <strong>{photo.employeeName} · {photo.client}</strong>
      <a href={`${getApiBaseUrl()}/api/field-work/photos/${photo.id}/content`} target="_blank" rel="noreferrer"><img src={`${getApiBaseUrl()}/api/field-work/photos/${photo.id}/content`} alt={photo.caption} loading="lazy" style={{ display: 'block', maxWidth: '100%', maxHeight: 280, marginTop: 12, objectFit: 'contain' }} /></a>
      {manager && <ArrivalAssessment items={photo.assessments} />}<p className="field-text">{photo.caption}</p><p>{new Date(photo.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} {manager && <>· Precisión: {Math.round(photo.accuracy)} m</>}</p>
      {manager && <a href={`https://www.google.com/maps/search/?api=1&query=${photo.latitude},${photo.longitude}`} target="_blank" rel="noreferrer">Ver ubicación de la evidencia</a>}
    </article>)}</div>
  </div>
}
