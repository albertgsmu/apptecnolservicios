export type Role = 'Gerente' | 'Secretaria' | 'Supervisor' | 'RRHH' | 'Administración'
export type View = 'dashboard' | 'workers' | 'personal' | 'orders' | 'contracts' | 'secretary' | 'reports'
export type EmployeeStatus = 'Activo' | 'Vacaciones' | 'Licencia' | 'Inactivo'
export type ApplicantStatus = 'Pendiente' | 'Aprobado' | 'Rechazado'

export type Applicant = {
  id: string
  fullName: string
  email: string
  phone: string
  birthDate: string
  gender: string
  address: string
  city: string
  identityNumber: string
  education: string
  area: string
  experience: string
  skills: string[]
  availability: string
  emergencyContact: string
  emergencyPhone: string
  documents: string[]
  status: ApplicantStatus
  createdAt: string
}

export type RegisterForm = {
  fullName: string
  email: string
  phone: string
  birthDate: string
  gender: string
  address: string
  city: string
  identityNumber: string
  education: string
  area: string
  experience: string
  skills: string
  availability: string
  emergencyContact: string
  emergencyPhone: string
  password: string
  documents: string
}

export type SessionUser = {
  email: string
  role: Role
  name: string
  token?: string
}
