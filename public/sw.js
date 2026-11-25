/* No caches for authenticated pages or API responses. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let notice = {}
  try { notice = event.data?.json() ?? {} } catch { /* Always show a visible notice. */ }
  event.waitUntil(self.registration.showNotification(notice.title || 'JP Mantenimiento', { body: notice.body || 'Tienes un aviso nuevo en la aplicación.', icon: '/logo-jp.jpg', tag: notice.tag || 'jp-notice', data: { url: notice.url || '/' } }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  let target = new URL('/', self.location.origin)
  try { const url = new URL(event.notification.data?.url || '/', self.location.origin); if (url.origin === self.location.origin) target = url } catch { /* Use home. */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    for (const window of windows) if (new URL(window.url).origin === target.origin) { await window.navigate(target.href); return window.focus() }
    return self.clients.openWindow(target.href)
  }))
})
