import type { RegisterForm, Role, View, EmployeeStatus } from '../types'

export const roleOptions: Role[] = ['Gerente', 'Secretaria', 'Supervisor', 'RRHH', 'Administración']

export const menuItems: Array<{ key: View; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'workers', label: 'Trabajadores' },
  { key: 'personal', label: 'Personal' },
  { key: 'orders', label: 'Órdenes' },
  { key: 'contracts', label: 'Contratos' },
  { key: 'secretary', label: 'Secretaría' },
  { key: 'reports', label: 'Reportes' },
]

export const defaultRegisterForm: RegisterForm = {
  fullName: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: 'Masculino',
  address: '',
  city: '',
  identityNumber: '',
  education: 'Secundaria',
  area: 'Electricidad',
  experience: 'Sin experiencia',
  skills: 'Mantenimiento general, lectura de planos, trabajo en equipo',
  availability: 'Full time',
  emergencyContact: '',
  emergencyPhone: '',
  password: '',
  documents: 'INE, CURP, Comprobante de domicilio',
}

export const summaryStats = [
  { label: 'Empleados activos', value: '548', delta: '+12%', tone: 'amber' },
  { label: 'Órdenes abiertas', value: '126', delta: '+8%', tone: 'blue' },
  { label: 'Cumplimiento', value: '96.4%', delta: '+2.1%', tone: 'green' },
  { label: 'Incidencias', value: '18', delta: '-6%', tone: 'red' },
] as const

export const employees: Array<{
  id: string
  name: string
  area: string
  title: string
  status: EmployeeStatus
  shift: string
  score: number
  lastEntry: string
}> = [
  { id: 'EMP-1042', name: 'Luis Salas', area: 'Electricidad', title: 'Técnico senior', status: 'Activo', shift: 'Matutino', score: 96, lastEntry: '07:05' },
  { id: 'EMP-1087', name: 'Patricia Romero', area: 'RRHH', title: 'Analista de personal', status: 'Activo', shift: 'Horario administrativo', score: 92, lastEntry: '08:15' },
  { id: 'EMP-2191', name: 'Miguel Torres', area: 'Mecánica', title: 'Supervisor campo', status: 'Vacaciones', shift: 'Turno A', score: 88, lastEntry: '07:40' },
  { id: 'EMP-3324', name: 'Carmen Vela', area: 'Secretaría', title: 'Coordinadora', status: 'Activo', shift: 'Matutino', score: 98, lastEntry: '08:00' },
  { id: 'EMP-4410', name: 'Javier Huerta', area: 'Plomería', title: 'Especialista', status: 'Licencia', shift: 'Turno B', score: 81, lastEntry: '06:50' },
  { id: 'EMP-5102', name: 'Daniela Cruz', area: 'Administración', title: 'Contabilidad', status: 'Activo', shift: 'Horario administrativo', score: 94, lastEntry: '08:20' },
]

export const attendance = [
  { day: 'Lun', attendance: 97, absences: 3 },
  { day: 'Mar', attendance: 94, absences: 6 },
  { day: 'Mié', attendance: 98, absences: 2 },
  { day: 'Jue', attendance: 96, absences: 4 },
  { day: 'Vie', attendance: 95, absences: 5 },
]

export const vacationRequests = [
  { person: 'Ana Sandoval', dates: '12-18 jul', type: 'Vacaciones', state: 'Aprobado' },
  { person: 'Roberto Díaz', dates: '20-27 jul', type: 'Permiso', state: 'Pendiente' },
  { person: 'Lourdes Vega', dates: '02-09 ago', type: 'Vacaciones', state: 'Revisión' },
]

export const workOrders = [
  { id: 'OT-2048', client: 'Plaza Norte', area: 'Mantenimiento eléctrico', priority: 'Alta', status: 'En ejecución', progress: 72 },
  { id: 'OT-2051', client: 'Hotel Sol', area: 'Plomería y HVAC', priority: 'Media', status: 'Programada', progress: 42 },
  { id: 'OT-2057', client: 'Coppel', area: 'Infraestructura', priority: 'Crítica', status: 'Revisión', progress: 86 },
  { id: 'OT-2062', client: 'Grupo Logístico', area: 'Seguridad', priority: 'Alta', status: 'Asignada', progress: 58 },
]

export const contracts = [
  { name: 'Limpieza institucional', vendor: 'Suministros Delta', amount: '$185,000', due: '18 jun', status: 'Vigente' },
  { name: 'Mantenimiento de ascensores', vendor: 'Elevación Plus', amount: '$320,000', due: '22 jun', status: 'En revisión' },
  { name: 'Servicios HVAC', vendor: 'Clima Técnica', amount: '$245,000', due: '08 jul', status: 'Vigente' },
]

export const providers = [
  { name: 'Ferretería Industrial', category: 'Materiales', rating: '4.8/5', status: 'Activo' },
  { name: 'Aseguradora Nexa', category: 'Seguridad', rating: '4.9/5', status: 'Activo' },
  { name: 'Mecánica Rápida', category: 'Mantenimiento', rating: '4.6/5', status: 'Evaluación' },
]

export const agenda = [
  { time: '09:00', title: 'Reunión de operación', owner: 'Gerencia' },
  { time: '10:30', title: 'Aprobación de contratos', owner: 'Administración' },
  { time: '12:15', title: 'Seguimiento a proveedores', owner: 'Compras' },
  { time: '15:00', title: 'Vacaciones y personal', owner: 'RRHH' },
]

export const reports = [
  { name: 'KPI de operación', type: 'Excel', updated: 'Hace 2h' },
  { name: 'Reporte de personal', type: 'PDF', updated: 'Hace 4h' },
  { name: 'OT por sucursal', type: 'CSV', updated: 'Hoy' },
  { name: 'Contratos vencidos', type: 'PDF', updated: 'Hace 1d' },
]
