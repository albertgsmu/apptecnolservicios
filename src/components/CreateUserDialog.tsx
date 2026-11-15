import { useEffect, useRef, useState, type FormEvent } from 'react'
import { managedRoles, roleDescriptions } from '../constants/roles'
import { apiRequest, createUser } from '../lib/dataService'
import type { ManagedRole } from '../types'

type EmployeeOption = { id: string; name: string; area: string }
type Props = { onClose: () => void; onCreated: () => void }
const emptyDraft = { name: '', email: '', password: '', confirmPassword: '', employeeId: '' }

export function CreateUserDialog({ onClose, onCreated }: Props) {
  const [draft, setDraft] = useState(emptyDraft)
  const [role, setRole] = useState<ManagedRole>('Secretaria')
  const [employeeMode, setEmployeeMode] = useState<'new' | 'existing'>('new')
  const [employeeDetails, setEmployeeDetails] = useState({ area: '', title: '', shift: 'Diurno' })
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [employeeError, setEmployeeError] = useState('')
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [created, setCreated] = useState<{ name: string; email: string; role: string } | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const savingRef = useRef(saving)
  useEffect(() => { savingRef.current = saving }, [saving])
  const description = roleDescriptions[role]

  useEffect(() => {
    let active = true
    apiRequest<EmployeeOption[]>('/users/employees').then(data => { if (active) setEmployees(data) }).catch(error => {
      if (active) setEmployeeError(error instanceof Error ? error.message : 'No se pudo consultar el personal.')
    }).finally(() => { if (active) setLoadingEmployees(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) onClose()
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKey); previousFocus?.focus() }
  }, [onClose])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('')
    if (draft.password !== draft.confirmPassword) { setNotice('Las contraseñas no coinciden.'); return }
    if (new TextEncoder().encode(draft.password).length > 72) { setNotice('La contraseña supera el máximo de 72 bytes. Usa una frase más corta.'); return }
    setSaving(true)
    try {
      const employeePayload = role !== 'Trabajador' ? {} : employeeMode === 'existing' ? { employeeId: draft.employeeId } : { employeeDetails }
      const user = await createUser({ name: draft.name.trim(), email: draft.email.trim().toLowerCase(), password: draft.password, role, ...employeePayload })
      setCreated(user)
      setEmployees(current => current.filter(employee => employee.id !== draft.employeeId))
      setDraft(emptyDraft)
      setShowPassword(false)
      setEmployeeDetails({ area: '', title: '', shift: 'Diurno' })
      onCreated()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo crear la cuenta.') }
    finally { setSaving(false) }
  }

  return <div className="modal-backdrop user-access-backdrop">
    <div ref={dialog} className="user-access-dialog" role="dialog" aria-modal="true" aria-labelledby="create-user-title" aria-describedby="create-user-description">
      <header className="user-access-header"><div><p className="eyebrow">Gerencia · Control de acceso</p><h2 id="create-user-title">{created ? 'Cuenta creada' : 'Crear usuario'}</h2><p id="create-user-description">Asigna a cada persona el acceso que necesita para su trabajo.</p></div><button type="button" className="close-button" aria-label="Cerrar creación de usuario" disabled={saving} onClick={onClose}>×</button></header>
      {created ? <div className="user-created" role="status"><span className="user-created-icon" aria-hidden="true">✓</span><h3>{created.name} ya tiene acceso</h3><p>{created.email}</p><p>Perfil: <strong>{roleDescriptions[created.role as ManagedRole]?.title}</strong></p><p>Entrega la contraseña a esta persona por un medio privado. La cuenta conserva únicamente los permisos del perfil seleccionado.</p><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Volver al panel</button><button className="primary-button" onClick={() => setCreated(null)}>Crear otra cuenta</button></div></div> : <form onSubmit={submit}>
        <div className="user-access-layout"><div className="user-access-fields">
          <section aria-labelledby="user-identity-title"><h3 id="user-identity-title"><span>01</span> Datos de la persona</h3><div className="user-access-grid">
            <label htmlFor="new-user-name">Nombre completo<input id="new-user-name" autoComplete="name" placeholder="Nombre y apellidos" required minLength={2} maxLength={120} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
            <label htmlFor="new-user-email">Correo de acceso<input id="new-user-email" type="email" autoComplete="email" placeholder="persona@empresa.com" required maxLength={254} value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} /><small>Será su identificador para iniciar sesión.</small></label>
          </div></section>
          <section aria-labelledby="user-role-title"><h3 id="user-role-title"><span>02</span> Perfil y responsabilidades</h3><fieldset className="user-role-options"><legend className="visually-hidden">Selecciona el rol del usuario</legend>
            {managedRoles.map(option => <label key={option} className={role === option ? 'user-role-option selected' : 'user-role-option'}><input type="radio" name="new-user-role" value={option} checked={role === option} onChange={() => { setRole(option); setNotice('') }} /><span>{roleDescriptions[option].title}</span></label>)}
          </fieldset>
          {role === 'Trabajador' && <div className="employee-link-field">
            <fieldset className="user-role-options"><legend>Registro del trabajador</legend>
              <label className={employeeMode === 'new' ? 'user-role-option selected' : 'user-role-option'}><input type="radio" name="employee-mode" checked={employeeMode === 'new'} onChange={() => setEmployeeMode('new')} />Nuevo trabajador</label>
              <label className={employeeMode === 'existing' ? 'user-role-option selected' : 'user-role-option'}><input type="radio" name="employee-mode" checked={employeeMode === 'existing'} onChange={() => setEmployeeMode('existing')} />Vincular ficha existente</label>
            </fieldset>
            {employeeMode === 'new' ? <><p className="metric-explanation">Se crearán la cuenta y una ficha activa con el nombre indicado arriba. Podrás asignarle órdenes inmediatamente.</p><div className="user-access-grid">
              <label htmlFor="new-worker-area">Área o especialidad<input id="new-worker-area" required maxLength={120} placeholder="Ej. Electricidad" value={employeeDetails.area} onChange={event => setEmployeeDetails(current => ({ ...current, area: event.target.value }))} /></label>
              <label htmlFor="new-worker-title">Cargo<input id="new-worker-title" required maxLength={120} placeholder="Ej. Técnico electricista" value={employeeDetails.title} onChange={event => setEmployeeDetails(current => ({ ...current, title: event.target.value }))} /></label>
              <label htmlFor="new-worker-shift">Turno<select id="new-worker-shift" value={employeeDetails.shift} onChange={event => setEmployeeDetails(current => ({ ...current, shift: event.target.value }))}>{['Diurno', 'Nocturno', 'Rotativo'].map(shift => <option key={shift}>{shift}</option>)}</select></label>
            </div></> : <label htmlFor="new-user-employee">Ficha del empleado<select id="new-user-employee" required disabled={loadingEmployees} value={draft.employeeId} onChange={event => { const employee = employees.find(item => item.id === event.target.value); setDraft(current => ({ ...current, employeeId: event.target.value, name: employee?.name ?? current.name })) }}><option value="">{loadingEmployees ? 'Consultando empleados…' : 'Selecciona un empleado activo'}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.area}</option>)}</select><small>La cuenta solo verá las órdenes asignadas a esta ficha.</small>{employeeError && <p role="alert">{employeeError}</p>}{!loadingEmployees && !employeeError && !employees.length && <p>No hay fichas disponibles. Elige Nuevo trabajador para registrar a esta persona.</p>}</label>}
          </div>}
          </section>
          <section aria-labelledby="user-password-title"><h3 id="user-password-title"><span>03</span> Credenciales de acceso</h3><div className="user-access-grid">
            <label htmlFor="new-user-password">Contraseña<input id="new-user-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={72} value={draft.password} onChange={event => setDraft(current => ({ ...current, password: event.target.value }))} /><small>Usa una frase de al menos 12 caracteres.</small></label>
            <label htmlFor="new-user-confirm">Confirmar contraseña<input id="new-user-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={72} value={draft.confirmPassword} onChange={event => setDraft(current => ({ ...current, confirmPassword: event.target.value }))} /></label>
          </div><button type="button" className="text-button" aria-pressed={showPassword} onClick={() => setShowPassword(current => !current)}>{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</button></section>
        </div><aside className="user-permissions-preview" aria-live="polite"><p className="eyebrow">Vista previa del acceso</p><h3>{description.title}</h3><p>{description.detail}</p><h4>Puede realizar</h4><ul>{description.permissions.map(permission => <li key={permission}><span aria-hidden="true">✓</span>{permission}</li>)}</ul><div className="user-access-limits"><h4>Acceso limitado</h4><p>{description.limits}</p></div><p className="user-access-owner">La administración de cuentas está reservada al Gerente.</p></aside></div>
        <footer className="user-access-footer">{notice && <p className="login-error" role="alert">{notice}</p>}<div className="modal-actions"><button type="button" className="ghost-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving || (role === 'Trabajador' && employeeMode === 'existing' && (loadingEmployees || !draft.employeeId || Boolean(employeeError)))}>{saving ? 'Creando cuenta…' : 'Crear cuenta con este perfil'}</button></div></footer>
      </form>}
    </div>
  </div>
}
