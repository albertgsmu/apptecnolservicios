import { useState, type FormEvent } from 'react'
import { BrandMark } from './BrandMark'
import {
  changeManagerPassword,
  enableMfa,
  getMfaSetup,
  verifyMfaLogin,
} from '../lib/dataService'
import type { SessionUser } from '../types'
import { apiRequest, logoutUser } from '../lib/dataService'
import { readLocation } from '../features/field-work/location'

const currentYear = new Date().getFullYear()

type LoginResult = {
  user: SessionUser
  nextStep: 'authenticated' | 'change-password' | 'enroll-mfa' | 'verify-mfa' | 'location-required'
}

type LoginScreenProps = {
  onLogin: (credentials: { email: string; password: string }) => Promise<LoginResult>
  onAuthenticated: (user: SessionUser) => void
}

type LoginStep = 'credentials' | 'change-password' | 'enroll-mfa' | 'verify-mfa' | 'recovery-codes' | 'location-required'

export function LoginScreen({ onLogin, onAuthenticated }: LoginScreenProps) {
  const [step, setStep] = useState<LoginStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [setup, setSetup] = useState<{ qrCodeDataUrl: string; manualEntryKey: string } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [pendingUser, setPendingUser] = useState<SessionUser | null>(null)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('')
    setIsSubmitting(true)
    try {
      if (step === 'credentials') {
        const result = await onLogin({ email: email.trim().toLowerCase(), password })
        if (result.nextStep === 'authenticated') {
          return
        }
        setPendingUser(result.user)
        setStep(result.nextStep)
        setPassword('')
        return
      }

      if (step === 'location-required') {
        const location = await readLocation()
        if (location.status !== 'captured') {
          throw new Error(location.status === 'denied' ? 'Permiso de ubicación rechazado. Actívalo en el candado del navegador para poder entrar.' : 'No se obtuvo una ubicación válida. Revisa el GPS, usa HTTPS o localhost y vuelve a intentar.')
        }
        const result = await apiRequest<{ user: SessionUser }>('/auth/worker-location', { method: 'POST', body: JSON.stringify({ location }) })
        onAuthenticated(result.user)
        return
      }

      if (step === 'change-password') {
        const result = await changeManagerPassword({ password: newPassword, confirmPassword })
        if (result.nextStep === 'authenticated' && result.user) {
          onAuthenticated(result.user)
          return
        }
        setStep('enroll-mfa')
        setNewPassword('')
        setConfirmPassword('')
        return
      }

      if (step === 'enroll-mfa') {
        if (!setup) {
          setSetup(await getMfaSetup())
          return
        }
        const result = await enableMfa(code)
        setPendingUser(result.user)
        setRecoveryCodes(result.recoveryCodes)
        setCode('')
        setStep('recovery-codes')
        return
      }

      if (step === 'verify-mfa') {
        const result = await verifyMfaLogin(
          useRecoveryCode ? { recoveryCode } : { code },
        )
        onAuthenticated(result.user)
        return
      }

      if (step === 'recovery-codes' && pendingUser) {
        onAuthenticated(pendingUser)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No fue posible completar la autenticación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const heading = {
    'location-required': {
      kicker: 'UBICACIÓN OBLIGATORIA',
      title: 'Registra tu ubicación para entrar',
      detail: 'Tu ubicación de inicio de sesión se guardará y el Gerente podrá consultar el punto, la hora y la precisión. Este aviso aparece una vez al día; cada acceso y cada foto seguirán registrando una ubicación nueva.',
    },
    credentials: {
      kicker: 'BIENVENIDO DE NUEVO',
      title: 'Inicia sesión',
      detail: 'Ingresa tus datos para acceder a tu espacio de trabajo.',
    },
    'change-password': {
      kicker: 'PROTEGE TU CUENTA',
      title: 'Cambia tu contraseña',
      detail: 'La contraseña temporal ya no es válida para continuar.',
    },
    'enroll-mfa': {
      kicker: 'VERIFICACIÓN EN DOS PASOS',
      title: 'Configura tu autenticador',
      detail: 'Vincula una aplicación autenticadora para proteger la cuenta Gerente.',
    },
    'verify-mfa': {
      kicker: 'VERIFICACIÓN EN DOS PASOS',
      title: 'Confirma tu identidad',
      detail: 'Ingresa el código de tu aplicación autenticadora.',
    },
    'recovery-codes': {
      kicker: 'GUARDA ESTOS CÓDIGOS',
      title: 'Recuperación de cuenta',
      detail: 'Cada código se puede usar una sola vez. Guárdalos fuera de este dispositivo.',
    },
  }[step]

  return (
    <div className="login-screen">
      <section className="login-showcase" aria-label="JP Mantenimiento Integral">
        <div className="login-showcase-top">
          <div className="login-logo-frame">
            <BrandMark size={410} />
          </div>
          <div className="login-showcase-copy">
            <span className="login-kicker">JP MANTENIMIENTO INTEGRAL</span>
            <h1>El control de tu operación, en un solo lugar.</h1>
            <p>Personas, servicios y gestión trabajando en perfecta coordinación.</p>
          </div>
        </div>

        <div className="login-showcase-footer">
          <span className="login-status-dot" />
          <span>PLATAFORMA DE GESTIÓN EMPRESARIAL</span>
        </div>
      </section>

      <main className="login-panel">
        <div className="login-panel-content">
          <div className="login-mobile-brand">
            <BrandMark size={92} />
            <span>JP MANTENIMIENTO INTEGRAL</span>
          </div>

          <div className="login-heading">
            <span className="login-kicker">{heading.kicker}</span>
            <h2>{heading.title}</h2>
            <p>{heading.detail}</p>
          </div>

          <form
            className="login-form"
            onSubmit={(event) => void submit(event)}
          >
            {step === 'location-required' && <div className="login-security-note"><p>Permite el acceso a tu ubicación cuando lo solicite el navegador. Se obtiene una lectura puntual; no hay seguimiento continuo. Cada foto enviada también registrará una ubicación nueva.</p><p>La ubicación no necesita estar dentro del radio de una obra para acceder: el Gerente verá el resultado de la comparación.</p></div>}
            {step === 'credentials' && (
              <>
                <label htmlFor="login-email">
                  Correo electrónico
                  <input
                    autoComplete="username"
                    id="login-email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nombre@empresa.com"
                    required
                    type="email"
                    value={email}
                  />
                </label>

                <label htmlFor="login-password">
                  Contraseña
                  <input
                    autoComplete="current-password"
                    id="login-password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Ingresa tu contraseña"
                    required
                    type="password"
                    value={password}
                  />
                </label>
              </>
            )}

            {step === 'change-password' && (
              <>
                <p className="login-security-note">
                  Elige una frase de al menos 15 caracteres. No reutilices la contraseña temporal.
                </p>
                <label htmlFor="new-password">
                  Nueva contraseña
                  <input
                    autoComplete="new-password"
                    id="new-password"
                    minLength={15}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>
                <label htmlFor="confirm-password">
                  Confirma la contraseña
                  <input
                    autoComplete="new-password"
                    id="confirm-password"
                    minLength={15}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              </>
            )}

            {step === 'enroll-mfa' && (
              <>
                {setup ? (
                  <>
                    <p className="login-security-note">
                      Escanea el código QR con Google Authenticator, Microsoft Authenticator o una app compatible.
                    </p>
                    <img className="login-mfa-qr" src={setup.qrCodeDataUrl} alt="Código QR de configuración del autenticador" />
                    <p className="login-manual-key">
                      Clave manual: <code>{setup.manualEntryKey}</code>
                    </p>
                    <label htmlFor="enrollment-code">
                      Código de 6 dígitos
                      <input
                        autoComplete="one-time-code"
                        id="enrollment-code"
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                        pattern="[0-9]{6}"
                        required
                        value={code}
                      />
                    </label>
                  </>
                ) : (
                  <p className="login-security-note">
                    El administrador debe proteger la cuenta Gerente con códigos que cambian cada 30 segundos.
                  </p>
                )}
              </>
            )}

            {step === 'verify-mfa' && (
              <>
                <label className="login-recovery-toggle">
                  <input
                    checked={useRecoveryCode}
                    onChange={(event) => setUseRecoveryCode(event.target.checked)}
                    type="checkbox"
                  />
                  Usar un código de recuperación
                </label>
                {useRecoveryCode ? (
                  <label htmlFor="recovery-code">
                    Código de recuperación
                    <input
                      autoComplete="one-time-code"
                      id="recovery-code"
                      onChange={(event) => setRecoveryCode(event.target.value)}
                      required
                      value={recoveryCode}
                    />
                  </label>
                ) : (
                  <label htmlFor="mfa-code">
                    Código de 6 dígitos
                    <input
                      autoComplete="one-time-code"
                      id="mfa-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                      pattern="[0-9]{6}"
                      required
                      value={code}
                    />
                  </label>
                )}
              </>
            )}

            {step === 'recovery-codes' && (
              <>
                <div className="login-recovery-codes" aria-label="Códigos de recuperación">
                  {recoveryCodes.map((recovery) => <code key={recovery}>{recovery}</code>)}
                </div>
                <p className="login-security-note">
                  No volverán a mostrarse. Si pierdes el autenticador, necesitarás uno de estos códigos.
                </p>
              </>
            )}

            {notice && <p className="login-error" role="alert">{notice}</p>}

            <button type="submit" className="primary-button login-button" disabled={isSubmitting}>
              {isSubmitting
                ? 'Verificando…'
                : step === 'location-required'
                  ? 'Permitir ubicación y entrar'
                : step === 'credentials'
                  ? <>Ingresar <span aria-hidden="true">→</span></>
                  : step === 'change-password'
                    ? 'Guardar contraseña'
                    : step === 'enroll-mfa'
                      ? setup ? 'Activar autenticador' : 'Mostrar código QR'
                      : step === 'verify-mfa'
                        ? 'Verificar código'
                        : 'Guardar y continuar'}
            </button>
            {step === 'location-required' && <button type="button" className="ghost-button" disabled={isSubmitting} onClick={async () => {
              setIsSubmitting(true)
              try { await logoutUser(); setStep('credentials'); setPendingUser(null); setNotice('') }
              catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo cancelar.') }
              finally { setIsSubmitting(false) }
            }}>Cancelar y volver</button>}
          </form>

          <p className="login-help">
            {step === 'credentials'
              ? '¿Necesitas acceso? Solicita una cuenta al administrador de tu empresa.'
              : pendingUser?.email ?? 'La sesión de configuración se cierra automáticamente.'}
          </p>
        </div>
        <footer className="login-panel-footer">© {currentYear} JP Mantenimiento Integral</footer>
      </main>
    </div>
  )
}
