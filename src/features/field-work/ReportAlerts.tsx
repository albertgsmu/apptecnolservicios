import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReportAlert, ReportAlertData } from '../../hooks/useReportAlerts'
import './ReportAlerts.css'

export function ReportAlerts({ data, error, cue, reload, read, onAttend }: { data: ReportAlertData | null; error: string; cue: string; reload: () => Promise<void>; read: (id: string) => Promise<void>; onAttend: (report: ReportAlert) => void }) {
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const audioRef = useRef<AudioContext | null>(null)
  const play = useCallback(() => {
    const context = audioRef.current
    if (!context || context.state !== 'running') return
    for (const [index, frequency] of [740, 980].entries()) {
      const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index * .18
      oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.12, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .16)
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + .18)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    }
  }, [])
  useEffect(() => { if (cue && sound) play() }, [cue, sound, play])
  useEffect(() => { const audio = audioRef; return () => { void audio.current?.close() } }, [])
  const totals = data?.totals
  return <section className={`report-alerts ${totals?.critical ? 'critical' : totals?.total ? 'pending' : ''}`} aria-label="Avisos de reportes">
    <div className="report-alert-summary"><div role="status" aria-live="polite"><strong>{totals?.critical ? `¡Atención! ${totals.critical} ${totals.critical === 1 ? 'reporte crítico' : 'reportes críticos'}` : totals?.total ? `${totals.total} ${totals.total === 1 ? 'reporte por resolver' : 'reportes por resolver'}` : data ? 'Sin reportes pendientes' : 'Consultando avisos…'}</strong>{!!totals?.total && <span>{totals.unread} sin leer · {totals.pending} sin atender</span>}</div><div className="report-alert-buttons">{!!totals?.total && <button className="primary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar avisos' : 'Ver avisos'}</button>}<button className="ghost-button" aria-pressed={sound} onClick={async () => {
      if (sound) { setSound(false); return }
      try { audioRef.current ??= new AudioContext(); await audioRef.current.resume(); setSound(true); setNotice('') }
      catch { setNotice('No se pudo activar el sonido en este navegador.') }
    }}>{sound ? 'Sonido activado' : 'Activar sonido'}</button></div></div>
    {error && <p role="alert">{error} <button className="text-button" onClick={() => void reload()}>Reintentar avisos</button></p>}
    {notice && <p role="alert">{notice}</p>}
    {open && <div className="report-alert-list"><h2>Reportes por atender</h2>{!data?.reports.length && <p>No quedan reportes abiertos.</p>}{data?.reports.map(report => <article className={`report-alert-card ${report.urgency === 'Crítica' ? 'critical' : ''}`} key={report.id}><div className="report-alert-card-head"><strong>{report.title}</strong><span>{report.urgency}{report.unread && ' · Nuevo'}</span></div><p>{report.employeeName} · {report.client}</p><small>{report.category} · {report.status} · {new Date(report.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</small><button className="secondary-button" aria-label={`Atender reporte: ${report.title}`} disabled={!!busy} onClick={async () => {
      setBusy(report.id); setNotice('')
      try { await read(report.id); setOpen(false); onAttend(report) }
      catch (cause) { setNotice(cause instanceof Error ? cause.message : 'No se pudo abrir el reporte.') }
      finally { setBusy('') }
    }}>{busy === report.id ? 'Abriendo…' : 'Atender reporte'}</button></article>)}{data && data.totals.total > data.reports.length && <p className="metric-explanation">Se muestran los primeros 50. Al atenderlos aparecerán los siguientes.</p>}</div>}
  </section>
}
