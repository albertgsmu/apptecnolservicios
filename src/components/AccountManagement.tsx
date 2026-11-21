import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../lib/dataService'
import { useModalDialog } from '../hooks/useModalDialog'
import type { EmployeeRow } from '../hooks/useEmployees'
import './accounts.css'

type Account = { id: string; name: string; email: string; role: string; blocked: boolean; archivedAt: string | null; version: number; employeeId: string | null; area: string; title: string; shift: string; employeeStatus: string | null }
const actions: Record<string, string> = { block: 'Bloquear acceso', unblock: 'Habilitar acceso', retire: 'Dar de baja', restore: 'Reactivar cuenta', logout: 'Cerrar todas las sesiones', reset: 'Restablecer contraseña' }
const explanations: Record<string, string> = {
  block: 'Se cerrarán todas sus sesiones y no podrá ingresar hasta que habilites el acceso.',
  unblock: 'La persona podrá volver a ingresar con su contraseña.',
  retire: 'Se bloqueará el acceso y la ficha quedará inactiva. Sus obras, reportes y conversaciones se conservarán.',
  restore: 'La ficha volverá a estar activa y se habilitará el acceso.',
  logout: 'Se cerrarán sus sesiones en todos los dispositivos. Podrá volver a ingresar con su contraseña.',
  reset: 'La contraseña anterior dejará de funcionar y se cerrarán sus sesiones. Recibirás una contraseña temporal que deberá cambiar al ingresar.',
}

export function AccountManagement({ onChanged, employees = [] }: { onChanged?: () => void; employees?: EmployeeRow[] }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Account | null>(null)
  const [employee, setEmployee] = useState<EmployeeRow | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setAccounts(await apiRequest<Account[]>('/users')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron consultar las cuentas.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  const close = useCallback(() => setSelected(null), [])
  const closeEmployee = useCallback(() => setEmployee(null), [])
  return <div className="panel account-management">
    <h2>Cuentas de acceso</h2><p>Edita los datos y controla quién puede ingresar.</p>
    <div className="account-toolbar"><input type="search" aria-label="Buscar cuentas" placeholder="Nombre, correo o perfil" value={search} onChange={e => setSearch(e.target.value)} /><button className="ghost-button" onClick={() => void load()} disabled={loading}>Actualizar cuentas</button></div>
    {loading && <p role="status">Consultando cuentas…</p>}{error && <p role="alert" className="login-error">{error}</p>}
    <ul className="account-list">{accounts.filter(a => `${a.name} ${a.email} ${a.role}`.toLowerCase().includes(search.trim().toLowerCase())).map(a => <li key={a.id}><div><strong>{a.name}</strong><span>{a.email}</span><span>{a.role} · {a.archivedAt ? 'De baja' : a.blocked ? 'Acceso bloqueado' : 'Acceso habilitado'}</span>{a.employeeStatus && <span>Ficha: {a.employeeStatus}</span>}</div><button className="ghost-button" aria-label={`Gestionar cuenta de ${a.name}`} onClick={() => setSelected(a)}>Gestionar</button></li>)}</ul>
    {!loading && !error && !accounts.length && <p>No hay cuentas de personal registradas.</p>}
    {!loading && !error && employees.some(e => !accounts.some(a => a.employeeId === e.id)) && <><h3>Fichas sin cuenta de acceso</h3><ul className="account-list">{employees.filter(e => !accounts.some(a => a.employeeId === e.id)).map(e => <li key={e.id}><div><strong>{e.name}</strong><span>{e.title} · {e.area}</span></div><button className="ghost-button" onClick={() => setEmployee(e)}>Editar ficha</button></li>)}</ul></>}
    {employee && <EmployeeDialog employee={employee} onClose={closeEmployee} onChanged={() => onChanged?.()} />}
    {selected && <AccountDialog key={`${selected.id}:${selected.version}`} account={selected} onClose={close} onChanged={() => { void load(); onChanged?.() }} />}
  </div>
}

function EmployeeDialog({ employee, onClose, onChanged }: { employee: EmployeeRow; onClose: () => void; onChanged: () => void }) {
  const [draft, setDraft] = useState(employee)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, busy)
  return <div className="modal-backdrop user-access-backdrop"><div className="user-access-dialog account-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="employee-edit-title"><h2 id="employee-edit-title">Editar ficha</h2><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('')
    try { await apiRequest(`/employees/${encodeURIComponent(employee.id)}`, { method: 'PATCH', body: JSON.stringify({ ...draft, version: employee.version }) }); onChanged(); onClose() }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }}><div className="account-fields">{(['name', 'area', 'title'] as const).map((key, i) => <label key={key}>{['Nombre', 'Área', 'Cargo'][i]}<input required maxLength={120} value={draft[key]} disabled={busy} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}<label>Turno<select required value={draft.shift} disabled={busy} onChange={e => setDraft({ ...draft, shift: e.target.value })}><option value="">Seleccionar</option>{['Diurno', 'Nocturno', 'Rotativo'].map(s => <option key={s}>{s}</option>)}</select></label></div>{error && <p role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>Guardar ficha</button></div></form></div></div>
}

function AccountDialog({ account, onClose, onChanged }: { account: Account; onClose: () => void; onChanged: () => void }) {
  const [draft, setDraft] = useState(account)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  const [temporary, setTemporary] = useState('')
  const [done, setDone] = useState('')
  const [copied, setCopied] = useState(false)
  const ref = useModalDialog(onClose, busy)
  const execute = async (action: string) => {
    setBusy(true); setError('')
    try {
      const result = await apiRequest<{ message: string; temporaryPassword?: string }>(`/users/${encodeURIComponent(account.id)}${action === 'save' ? '' : action === 'reset' ? '/reset-password' : '/access'}`, {
        method: action === 'save' ? 'PATCH' : 'POST', body: JSON.stringify(action === 'save' ? { name: draft.name, email: draft.email, area: draft.area, title: draft.title, shift: draft.shift, version: account.version } : { action, version: account.version }),
      })
      setTemporary(result.temporaryPassword ?? ''); setDone(result.message); setConfirm(''); onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }
  const field = (label: string, key: 'name' | 'email' | 'area' | 'title', type = 'text') => <label>{label}<input type={type} required maxLength={key === 'email' ? 254 : 120} value={draft[key]} disabled={busy || Boolean(account.archivedAt)} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>
  return <div className="modal-backdrop user-access-backdrop"><div className="user-access-dialog account-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="account-title">
    <h2 id="account-title">Gestionar cuenta</h2><p>{account.name} · {account.role}</p>
    {done ? <div role="status"><p>{done}</p>{temporary && <div className="temporary-password"><label>Contraseña temporal<input readOnly value={temporary} aria-label="Contraseña temporal" /></label><p>Guárdala antes de cerrar: solo se muestra ahora. Entrégala por un medio privado. La persona deberá cambiarla al ingresar.</p>{account.blocked && <p>Esta cuenta sigue bloqueada. Habilita el acceso cuando corresponda.</p>}<button className="ghost-button" onClick={async () => { try { await navigator.clipboard.writeText(temporary); setCopied(true) } catch { setError('Selecciona y copia la contraseña manualmente.') } }}>{copied ? 'Copiada' : 'Copiar contraseña'}</button></div>}<button className="primary-button" onClick={onClose}>Volver a cuentas</button></div> : <>
      <form onSubmit={e => { e.preventDefault(); void execute('save') }}><div className="account-fields">{field('Nombre', 'name')}{field('Correo', 'email', 'email')}{account.employeeId && <>{field('Área', 'area')}{field('Cargo', 'title')}<label>Turno<select value={draft.shift} disabled={busy || Boolean(account.archivedAt)} onChange={e => setDraft({ ...draft, shift: e.target.value })}><option value="">Seleccionar</option>{['Diurno', 'Nocturno', 'Rotativo'].map(s => <option key={s}>{s}</option>)}</select></label></>}</div><p>Al guardar los datos, la persona deberá iniciar sesión de nuevo.</p><button className="primary-button" disabled={busy || Boolean(account.archivedAt)}>Guardar datos</button></form>
      <div className="account-actions">{(account.archivedAt ? ['restore'] : [account.blocked ? (account.employeeStatus === 'Inactivo' ? 'restore' : 'unblock') : 'block', 'logout', 'reset', 'retire']).map(action => <button className="ghost-button" disabled={busy} key={action} onClick={() => { setConfirm(action); setError('') }}>{actions[action]}</button>)}</div>
      {confirm && <div className="account-confirm" role="alert"><strong>¿{actions[confirm]}?</strong><p>{explanations[confirm]}</p><div className="modal-actions"><button className="ghost-button" disabled={busy} onClick={() => setConfirm('')}>Cancelar acción</button><button className="primary-button" disabled={busy} onClick={() => void execute(confirm)}>{busy ? 'Procesando…' : 'Confirmar'}</button></div></div>}
      <button className="ghost-button" disabled={busy} onClick={onClose}>Cerrar</button>
    </>}{error && <p role="alert" className="login-error">{error}</p>}
  </div></div>
}
