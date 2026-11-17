export function managerMfaRequired(env = process.env) {
  return env.MANAGER_MFA_REQUIRED === 'true'
}
