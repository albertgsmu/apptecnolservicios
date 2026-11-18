import { useCallback, useState } from 'react'
import { BrandMark } from './BrandMark'
import { useModalDialog } from '../hooks/useModalDialog'
import type { View } from '../types'

type Item = { key: View; label: string; unread?: number }
type Props = { items: Item[]; activeView: View; role: string; name: string; onNavigate: (view: View) => void; onLogout: () => Promise<void>; onCreateUser?: () => void }

export function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    orders: 'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h5',
    'field-reports': 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h4',
    workers: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M17 3a4 4 0 0 1 0 8',
    inventory: 'm3 7 9-4 9 4v12l-9 3-9-3zM3 7l9 4 9-4M12 11v11',
    menu: 'M4 6h16M4 12h16M4 18h16',
    messages: 'M21 11a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h8a8 8 0 0 1 8 8M7 8h10M7 12h7',
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths['field-reports']} /></svg>
}

function MobileMenu({ items, activeView, name, role, onNavigate, onLogout, onCreateUser, onClose }: Props & { onClose: () => void }) {
  const container = useModalDialog(onClose, false)
  return <div className="mobile-menu-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={container} className="mobile-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title">
      <div className="mobile-menu-heading"><div><p className="eyebrow">{role}</p><h2 id="mobile-menu-title">Menú de la aplicación</h2></div><button className="close-button" aria-label="Cerrar menú" onClick={onClose}>×</button></div>
      <p className="mobile-account">{name}</p>
      <nav aria-label="Todas las secciones">{items.map(item => <button key={item.key} data-view={item.key} className={activeView === item.key ? 'mobile-menu-item active' : 'mobile-menu-item'} aria-current={activeView === item.key ? 'page' : undefined} onClick={() => { onNavigate(item.key); onClose() }}><NavigationIcon name={item.key} /><span>{item.key === 'dashboard' ? 'Inicio' : item.label}</span>{!!item.unread && <span className="message-count">{item.unread}</span>}<span aria-hidden="true">›</span></button>)}</nav>
      {onCreateUser && <button className="secondary-button" onClick={() => { onClose(); onCreateUser() }}>Crear usuario</button>}
      <button className="logout-button" onClick={() => { onClose(); void onLogout() }}>Cerrar sesión</button>
    </div>
  </div>
}

export function MobileNavigation(props: Props) {
  const [open, setOpen] = useState(false)
  const unread = props.items.reduce((sum, item) => sum + (item.unread ?? 0), 0)
  const close = useCallback(() => setOpen(false), [])
  const primary = props.items.filter(item => ['dashboard', 'my-work', 'orders', 'field-reports'].includes(item.key)).slice(0, 3)
  return <>
    <div className="mobile-app-header"><div className="mobile-app-brand"><BrandMark size={38} /><div><strong>JP Mantenimiento</strong><span>{props.role}</span></div></div><button className="mobile-menu-trigger" aria-label="Abrir menú" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><NavigationIcon name="menu" />{unread > 0 && <span className="mobile-message-count message-count" aria-label={`${unread} avisos sin leer`}>{unread}</span>}</button></div>
    <nav className="mobile-bottom-nav" aria-label="Navegación principal">{primary.map(item => <button key={item.key} aria-current={props.activeView === item.key ? 'page' : undefined} className={props.activeView === item.key ? 'active' : ''} onClick={() => props.onNavigate(item.key)}><NavigationIcon name={item.key} /><span>{item.key === 'dashboard' ? 'Inicio' : item.key === 'field-reports' ? 'Reportes' : item.label}{!!item.unread && <span className="message-count">{item.unread}</span>}</span></button>)}<button className={open || !primary.some(item => item.key === props.activeView) ? 'active' : ''} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><NavigationIcon name="menu" /><span>Más</span></button></nav>
    {open && <MobileMenu {...props} onClose={close} />}
  </>
}
