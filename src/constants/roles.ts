import type { Role, View } from '../types'
import { managedRoleNames } from '../../shared/access-policy.js'

export const roleDisplayNames: Record<Role, string> = {
  Gerente: 'Gerente General',
  Secretaria: 'Secretaria General',
  Supervisor: 'Supervisor de obras',
  Trabajador: 'Trabajador',
}

export const roleViews: Record<Role, View[]> = {
  Gerente: ['inventory', 'dashboard', 'workers', 'personal', 'orders', 'field-reports', 'secretary', 'reports'],
  Secretaria: ['dashboard', 'inventory', 'personal', 'orders', 'field-reports', 'secretary'],
  Supervisor: ['dashboard', 'inventory', 'orders', 'field-reports'],
  Trabajador: ['my-work', 'orders', 'field-reports'],
}

export const managedRoles = managedRoleNames as Exclude<Role, 'Gerente'>[]
export const roleDescriptions = {
  Supervisor: { title: 'Supervisor', detail: 'Coordinación y supervisión de las obras.', permissions: ['Crear órdenes con instrucciones y evidencias', 'Asignar trabajadores y supervisar avances', 'Gestionar materiales y préstamos de herramientas', 'Atender problemas y necesidades de las obras'], limits: 'No administra cuentas ni personal. El cierre final de órdenes corresponde únicamente al Gerente.' },
  Secretaria: { title: 'Secretaría', detail: 'Coordinación administrativa y seguimiento de problemas de las obras.', permissions: ['Registrar órdenes sin asignar técnicos', 'Atender reportes y responder a los trabajadores', 'Consultar órdenes, agenda y candidatos'], limits: 'No administra cuentas, aprueba candidatos, asigna técnicos ni cierra órdenes.' },
  Trabajador: { title: 'Trabajador', detail: 'Acceso personal a los servicios asignados.', permissions: ['Ver únicamente sus órdenes', 'Reportar avance del trabajo', 'Enviar el servicio a revisión'], limits: 'No ve órdenes ajenas, administra personal, asigna técnicos ni cierra trabajos.' },
}
