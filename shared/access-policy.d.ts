import type { ManagedRole, Role } from '../src/types'

export type Permission = 'manageUsers' | 'createOrders' | 'manageOrders' | 'closeOrders' | 'updateOrders' | 'readOrders' | 'readEmployees' | 'manageEmployees' | 'readApplicants' | 'decideApplicants' | 'readFieldReports' | 'reviewFieldReports' | 'readInventory' | 'manageInventory'
export const permissionRoles: Readonly<Record<Permission, Role[]>>
export const managedRoleNames: ManagedRole[]
export const activeRoleNames: Role[]
export function can(role: Role | undefined, permission: Permission): boolean
