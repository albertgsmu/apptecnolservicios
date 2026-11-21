import type { Applicant, ApplicantStatus, SessionUser } from '../types'
import { activeRoleNames } from '../../shared/access-policy.js'
import { readLocation } from '../features/field-work/location'

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
let sessionUser: SessionUser | null = null

try { localStorage.removeItem('jp_session') } catch { /* Storage may be disabled by the browser. */ }

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const getApiBaseUrl = () => API_BASE_URL

const resolveApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}/api${normalizedPath}` : `/api${normalizedPath}`
}

const readCsrfCookie = () => {
  if (typeof document === 'undefined') {
    return null
  }
  const prefix = 'jp_csrf='
  const entry = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))
  return entry ? entry.slice(prefix.length) : null
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && path !== '/auth/login') {
    const csrfToken = readCsrfCookie() || (await apiRequest<{ csrfToken: string }>('/auth/csrf')).csrfToken
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
  }

  let response: Response
  try {
    response = await fetch(resolveApiUrl(path), {
      ...options,
      method,
      headers,
      credentials: 'include',
      signal: options.signal ?? AbortSignal.timeout(15000),
    })
  } catch {
    throw new ApiError('No se pudo conectar con la API. Comprueba que el servidor esté iniciado y que la base de datos esté disponible.', 0)
  }

  if (!response.ok) {
    if (response.status === 401 && sessionUser) {
      sessionUser = null
      window.dispatchEvent(new Event('jp-session-expired'))
    }
    const content = await response.text()
    let message = `La API respondió con un error (${response.status}).`
    try {
      const parsed = JSON.parse(content) as { message?: string }
      message = parsed.message ?? message
    } catch {
      // Never show an HTML error page as a login message.
    }
    throw new ApiError(message, response.status)
  }

  const text = await response.text()
  if (!text) return undefined as T
  try { return JSON.parse(text) as T }
  catch { throw new ApiError('La dirección de la API devolvió una página en lugar de datos. Revisa VITE_API_URL y el proxy de desarrollo.', response.status) }
}

export async function fetchApplicants(): Promise<Applicant[]> {
  return apiRequest<Applicant[]>('/applicants')
}

export async function createApplicant(input: Omit<Applicant, 'id' | 'status' | 'createdAt'>): Promise<Applicant> {
  return apiRequest<Applicant>('/applicants', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateApplicantStatus(id: string, status: ApplicantStatus): Promise<Applicant> {
  return apiRequest<Applicant>(`/applicants/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function createUser(payload: { name: string; email: string; password: string; role: string; employeeId?: string; employeeDetails?: { area: string; title: string; shift: string } }) {
  const response = await apiRequest<{ user: { id: string; name: string; email: string; role: string } }>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.user
}

export async function loginUser(payload: { email: string; password: string }) {
  const response = await apiRequest<{
    user: SessionUser
    nextStep: 'authenticated' | 'change-password' | 'enroll-mfa' | 'verify-mfa' | 'location-required'
    locationNoticeRequired?: boolean
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response || !['authenticated', 'change-password', 'enroll-mfa', 'verify-mfa', 'location-required'].includes(response.nextStep) ||
      !response.user || typeof response.user.email !== 'string' || typeof response.user.name !== 'string' ||
      !activeRoleNames.includes(response.user.role)) {
    throw new ApiError('La API activa está desactualizada o devolvió un acceso incompatible. Reinicia el servidor del proyecto y vuelve a ingresar.', 502)
  }
  if (response.nextStep === 'location-required' && response.locationNoticeRequired === false) {
    const location = await readLocation()
    if (location.status !== 'captured') throw new ApiError('No se obtuvo ubicación para entrar. Revisa el permiso del navegador y el GPS, y vuelve a iniciar sesión.', 400)
    const completed = await apiRequest<{ user: SessionUser }>('/auth/worker-location', { method: 'POST', body: JSON.stringify({ location }) })
    saveSessionUser(completed.user)
    return { user: completed.user, nextStep: 'authenticated' as const }
  }
  if (response.nextStep === 'authenticated') {
    saveSessionUser(response.user)
  }
  return response
}

export async function changeManagerPassword(payload: { password: string; confirmPassword: string }) {
  return apiRequest<{ nextStep: string; user?: SessionUser }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getMfaSetup() {
  return apiRequest<{ qrCodeDataUrl: string; manualEntryKey: string }>('/auth/mfa/setup', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function enableMfa(code: string) {
  return apiRequest<{ user: SessionUser; recoveryCodes: string[] }>('/auth/mfa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function verifyMfaLogin(payload: { code?: string; recoveryCode?: string }) {
  const response = await apiRequest<{ user: SessionUser; nextStep: 'authenticated' }>('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  saveSessionUser(response.user)
  return response
}

export async function logoutUser() {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' })
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error
    }
  } finally {
    saveSessionUser(null)
  }
}

export async function getSessionInfo(): Promise<SessionUser | null> {
  try {
    const response = await apiRequest<{ user: SessionUser }>('/auth/me')
    saveSessionUser(response.user)
    return response.user
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      saveSessionUser(null)
      return null
    }
    throw error
  }
}

export function getSessionUser(): SessionUser | null {
  return sessionUser
}

export function saveSessionUser(nextSessionUser: SessionUser | null) {
  sessionUser = nextSessionUser
}
