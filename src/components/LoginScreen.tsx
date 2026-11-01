import { BrandMark } from './BrandMark'
import type { RegisterForm, Role } from '../types'

type LoginScreenProps = {
  activeRole: Role
  onChangeRole: (role: Role) => void
  loginEmail: string
  onChangeLoginEmail: (value: string) => void
  loginPassword: string
  onChangeLoginPassword: (value: string) => void
  onLogin: () => void
  onOpenRegister: () => void
  registerOpen: boolean
  onCloseRegister: () => void
  registerForm: RegisterForm
  onRegisterChange: (field: keyof RegisterForm, value: string) => void
  onRegisterSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  registerNotice: string
  roleOptions: Role[]
}

export function LoginScreen({
  activeRole,
  onChangeRole,
  loginEmail,
  onChangeLoginEmail,
  loginPassword,
  onChangeLoginPassword,
  onLogin,
  onOpenRegister,
  registerOpen,
  onCloseRegister,
  registerForm,
  onRegisterChange,
  onRegisterSubmit,
  registerNotice,
  roleOptions,
}: LoginScreenProps) {
  return (
    <div className="login-screen">
      <div className="login-panel">
        <div className="login-brand">
          <div className="brand-logo">
            <BrandMark size={106} />
          </div>
          <div>
            <span className="eyebrow">JP Mantenimiento Integral</span>
            <h1>Plataforma corporativa</h1>
          </div>
        </div>

        <div className="login-form">
          <label>
            Rol de acceso
            <select value={activeRole} onChange={(event) => onChangeRole(event.target.value as Role)}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>

          <label>
            Usuario o correo
            <input value={loginEmail} onChange={(event) => onChangeLoginEmail(event.target.value)} type="email" placeholder="usuario@jpmantenimiento.com" />
          </label>

          <label>
            Contraseña
            <input value={loginPassword} onChange={(event) => onChangeLoginPassword(event.target.value)} type="password" placeholder="••••••••" />
          </label>

          <button type="button" className="primary-button login-button" onClick={onLogin}>
            Ingresar al sistema
          </button>

          <button type="button" className="secondary-button full-width" onClick={onOpenRegister}>
            Registrar usuario
          </button>
        </div>

        <div className="demo-credentials">
          <span>Acceso demo</span>
          <strong>{activeRole}</strong>
        </div>
      </div>

      {registerOpen && (
        <div className="modal-backdrop" onClick={onCloseRegister}>
          <div className="register-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Registro</p>
                <h2>Solicitud de empleo</h2>
              </div>
              <button type="button" className="close-button" onClick={onCloseRegister}>×</button>
            </div>

            <form className="register-form" onSubmit={onRegisterSubmit}>
              <div className="two-columns">
                <label>
                  Nombre completo
                  <input value={registerForm.fullName} onChange={(event) => onRegisterChange('fullName', event.target.value)} type="text" />
                </label>
                <label>
                  Correo electrónico
                  <input value={registerForm.email} onChange={(event) => onRegisterChange('email', event.target.value)} type="email" />
                </label>
              </div>

              <div className="two-columns">
                <label>
                  Teléfono
                  <input value={registerForm.phone} onChange={(event) => onRegisterChange('phone', event.target.value)} type="tel" />
                </label>
                <label>
                  Fecha de nacimiento
                  <input value={registerForm.birthDate} onChange={(event) => onRegisterChange('birthDate', event.target.value)} type="date" />
                </label>
              </div>

              <div className="two-columns">
                <label>
                  Género
                  <select value={registerForm.gender} onChange={(event) => onRegisterChange('gender', event.target.value)}>
                    <option>Masculino</option>
                    <option>Femenino</option>
                    <option>Prefiero no decirlo</option>
                  </select>
                </label>
                <label>
                  Estado o ciudad
                  <input value={registerForm.city} onChange={(event) => onRegisterChange('city', event.target.value)} type="text" />
                </label>
              </div>

              <label>
                Dirección completa
                <input value={registerForm.address} onChange={(event) => onRegisterChange('address', event.target.value)} type="text" />
              </label>

              <div className="two-columns">
                <label>
                  CURP / Identidad
                  <input value={registerForm.identityNumber} onChange={(event) => onRegisterChange('identityNumber', event.target.value)} type="text" />
                </label>
                <label>
                  Educación
                  <select value={registerForm.education} onChange={(event) => onRegisterChange('education', event.target.value)}>
                    <option>Secundaria</option>
                    <option>Preparatoria</option>
                    <option>Técnico</option>
                    <option>Licenciatura</option>
                    <option>Posgrado</option>
                  </select>
                </label>
              </div>

              <div className="two-columns">
                <label>
                  Área de interés
                  <select value={registerForm.area} onChange={(event) => onRegisterChange('area', event.target.value)}>
                    <option>Electricidad</option>
                    <option>Plomería</option>
                    <option>Mecánica</option>
                    <option>HVAC</option>
                    <option>Seguridad</option>
                    <option>Administración</option>
                  </select>
                </label>
                <label>
                  Experiencia
                  <select value={registerForm.experience} onChange={(event) => onRegisterChange('experience', event.target.value)}>
                    <option>Sin experiencia</option>
                    <option>6 meses</option>
                    <option>1 año</option>
                    <option>2 años</option>
                    <option>3+ años</option>
                  </select>
                </label>
              </div>

              <label>
                Habilidades principales
                <input value={registerForm.skills} onChange={(event) => onRegisterChange('skills', event.target.value)} type="text" />
              </label>

              <div className="two-columns">
                <label>
                  Disponibilidad
                  <select value={registerForm.availability} onChange={(event) => onRegisterChange('availability', event.target.value)}>
                    <option>Full time</option>
                    <option>Part time</option>
                    <option>Turno matutino</option>
                    <option>Turno nocturno</option>
                  </select>
                </label>
                <label>
                  Contraseña segura
                  <input value={registerForm.password} onChange={(event) => onRegisterChange('password', event.target.value)} type="password" />
                </label>
              </div>

              <div className="two-columns">
                <label>
                  Contacto de emergencia
                  <input value={registerForm.emergencyContact} onChange={(event) => onRegisterChange('emergencyContact', event.target.value)} type="text" />
                </label>
                <label>
                  Teléfono de emergencia
                  <input value={registerForm.emergencyPhone} onChange={(event) => onRegisterChange('emergencyPhone', event.target.value)} type="tel" />
                </label>
              </div>

              <label>
                Documentos entregados
                <input value={registerForm.documents} onChange={(event) => onRegisterChange('documents', event.target.value)} type="text" />
              </label>

              {registerNotice && <div className="register-notice">{registerNotice}</div>}

              <div className="register-actions">
                <button type="button" className="secondary-button" onClick={onCloseRegister}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Enviar solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
