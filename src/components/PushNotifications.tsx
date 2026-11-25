import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/dataService'
import './push-notifications.css'
const supported = () => window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
const keyBytes = (key: string) => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
export function PushNotifications() {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    if (supported()) void navigator.serviceWorker.getRegistration('/').then(async registration => {
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) { const result = await apiRequest<{ active: boolean }>('/push/status', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }); if (live) setActive(result.active && Notification.permission === 'granted') }
    }).catch(() => { /* Activation remains available. */ })
    return () => { live = false }
  }, [])
  const toggle = async () => {
    setBusy(true); setNotice('')
    try {
      if (!supported()) throw new Error('En iPhone agrega la app a la pantalla de inicio y ábrela desde allí. Usa un navegador actualizado.')
      if (active) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) { await apiRequest('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }); await subscription.unsubscribe() }
        setActive(false); setNotice('Notificaciones desactivadas en este dispositivo.'); return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('No se autorizó el permiso. Puedes habilitarlo en los ajustes de notificaciones de tu navegador.')
      const { publicKey } = await apiRequest<{ publicKey: string }>('/push/public-key')
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const currentKey = subscription.options.applicationServerKey, expected = keyBytes(publicKey)
        if (currentKey && [...new Uint8Array(currentKey)].join(',') !== [...expected].join(',')) { await subscription.unsubscribe(); subscription = null }
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
      await apiRequest('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription.toJSON()) })
      setActive(true); setNotice('Notificaciones activadas. Usa “Enviar prueba” para comprobar este celular.')
    } catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudieron activar las notificaciones.') }
    finally { setBusy(false) }
  }
  return <section className="push-controls" aria-label="Notificaciones del celular"><button className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>Notificaciones del celular: {active ? 'activadas' : 'configurar'}</button>{open && <div><p>Recibe avisos aunque la app esté cerrada. En iPhone, agrégala primero a la pantalla de inicio. Cada celular necesita su propio permiso.</p><div className="push-actions"><button className="ghost-button" disabled={busy} onClick={() => void toggle()}>{busy ? 'Procesando…' : active ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}</button>{active && <button className="ghost-button" disabled={busy} onClick={async () => { setBusy(true); try { const result = await apiRequest<{ message: string }>('/push/test', { method: 'POST' }); setNotice(result.message) } catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudo enviar.') } finally { setBusy(false) } }}>Enviar prueba</button>}</div>{notice && <p role="status">{notice}</p>}</div>}</section>
}
