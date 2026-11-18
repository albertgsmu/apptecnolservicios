// Authorization rules shared by the UI and API. The API remains authoritative.
export const permissionRoles = Object.freeze({
  manageUsers: ['Gerente'],
  directMessages: ['Gerente', 'Secretaria'],
  readInventory: ['Gerente', 'Supervisor', 'Secretaria'],
  manageInventory: ['Gerente', 'Supervisor'],
  createOrders: ['Gerente', 'Secretaria', 'Supervisor'],
  manageOrders: ['Gerente', 'Supervisor'],
  closeOrders: ['Gerente'],
  deleteOrders: ['Gerente'],
  updateOrders: ['Gerente', 'Supervisor', 'Trabajador'],
  readOrders: ['Gerente', 'Secretaria', 'Supervisor', 'Trabajador'],
  readFieldReports: ['Gerente', 'Secretaria', 'Supervisor', 'Trabajador'],
  reviewFieldReports: ['Gerente', 'Secretaria', 'Supervisor'],
  readEmployees: ['Gerente'],
  manageEmployees: ['Gerente'],
  readApplicants: ['Gerente', 'Secretaria'],
  decideApplicants: ['Gerente'],
})

export const can = (role, permission) => permissionRoles[permission]?.includes(role) ?? false
export const activeRoleNames = ['Gerente', 'Secretaria', 'Supervisor', 'Trabajador']
export const managedRoleNames = ['Secretaria', 'Supervisor', 'Trabajador']
