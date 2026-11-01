import type { Applicant, ApplicantStatus, SessionUser } from '../types'

export const APPLICANTS_KEY = 'jp_applicants'
export const SESSION_KEY = 'jp_session'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const resolveApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (API_BASE_URL) {
    return `${API_BASE_URL}/api${normalizedPath}`
  }

  return `/api${normalizedPath}`
}

const seedApplicants: Applicant[] = [
  {
    id: 'SOL-1001',
    fullName: 'María José Vázquez',
    email: 'maria.vazquez@email.com',
    phone: '5512345678',
    birthDate: '1994-07-12',
    gender: 'Femenino',
    address: 'Calle 5, Colonia Roma',
    city: 'Ciudad de México',
    identityNumber: 'VAMJ940712MDF',
    education: 'Licenciatura',
    area: 'Electricidad',
    experience: '2 años',
    skills: ['Mantenimiento eléctrico', 'Diagnóstico', 'Trabajo en equipo'],
    availability: 'Full time',
    emergencyContact: 'José Vázquez',
    emergencyPhone: '5578901234',
    documents: ['INE', 'CURP', 'Comprobante de domicilio'],
    status: 'Pendiente',
    createdAt: '2026-10-15T09:00:00.000Z',
  },
  {
    id: 'SOL-1002',
    fullName: 'Eduardo Duran',
    email: 'eduardo.duran@email.com',
    phone: '5523456789',
    birthDate: '1989-03-21',
    gender: 'Masculino',
    address: 'Avenida de la Reforma 87',
    city: 'Guadalajara',
    identityNumber: 'DURE890321JDF',
    education: 'Técnico superior',
    area: 'Plomería',
    experience: '4 años',
    skills: ['Plomería', 'HVAC', 'Atención a clientes'],
    availability: 'Turno nocturno',
    emergencyContact: 'Diana Duran',
    emergencyPhone: '5543210987',
    documents: ['INE', 'CURP'],
    status: 'Aprobado',
    createdAt: '2026-10-18T10:00:00.000Z',
  },
]

const getSessionToken = () => {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) {
      return null
    }

    const parsed = JSON.parse(saved) as SessionUser
    return parsed?.token ?? null
  } catch {
    return null
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken()
  const response = await fetch(resolveApiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  })

  if (!response.ok) {
    const content = await response.text()
    throw new Error(content || 'Request failed')
  }

  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export function getApplicants(): Applicant[] {
  try {
    const stored = localStorage.getItem(APPLICANTS_KEY)
    if (!stored) {
      localStorage.setItem(APPLICANTS_KEY, JSON.stringify(seedApplicants))
      return seedApplicants
    }

    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : seedApplicants
  } catch {
    return seedApplicants
  }
}

export async function fetchApplicants(): Promise<Applicant[]> {
  try {
    return await apiRequest<Applicant[]>('/applicants')
  } catch {
    await wait(250)
    return getApplicants()
  }
}

export function saveApplicants(applicants: Applicant[]) {
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(applicants))
}

export async function createApplicant(input: Omit<Applicant, 'id' | 'status' | 'createdAt'>): Promise<Applicant> {
  try {
    return await apiRequest<Applicant>('/applicants', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  } catch {
    await wait(300)
    const applicants = getApplicants()
    const newApplicant: Applicant = {
      id: `SOL-${String(applicants.length + 101).padStart(4, '0')}`,
      status: 'Pendiente',
      createdAt: new Date().toISOString(),
      ...input,
    }

    const nextApplicants = [newApplicant, ...applicants]
    saveApplicants(nextApplicants)
    return newApplicant
  }
}

export async function updateApplicantStatus(id: string, status: ApplicantStatus): Promise<Applicant> {
  try {
    return await apiRequest<Applicant>(`/applicants/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  } catch {
    await wait(200)
    const applicants = getApplicants()
    const nextApplicants = applicants.map((entry) => (entry.id === id ? { ...entry, status } : entry))
    saveApplicants(nextApplicants)

    const updated = nextApplicants.find((entry) => entry.id === id)
    if (!updated) {
      throw new Error(`Applicant ${id} not found`)
    }

    return updated
  }
}

export async function loginUser(payload: { email: string; password: string; role: string }) {
  const response = await apiRequest<{ user: SessionUser; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const sessionUser = { ...response.user, token: response.token }
  saveSessionUser(sessionUser)
  return sessionUser
}

export async function getSessionInfo(): Promise<SessionUser | null> {
  try {
    const response = await apiRequest<{ user: SessionUser }>('/auth/me')
    if (!response?.user) {
      return null
    }

    const user = { ...response.user, token: getSessionToken() ?? undefined }
    saveSessionUser(user)
    return user
  } catch {
    return getSessionUser()
  }
}

export function getSessionUser(): SessionUser | null {
  try {
    const savedSession = localStorage.getItem(SESSION_KEY)
    if (!savedSession) {
      return null
    }

    const parsed = JSON.parse(savedSession) as SessionUser
    return parsed && typeof parsed.email === 'string' ? parsed : null
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function saveSessionUser(sessionUser: SessionUser | null) {
  if (sessionUser) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    return
  }

  localStorage.removeItem(SESSION_KEY)
}
