export function managerMfaRequired(env = process.env) {
  return env.NODE_ENV === 'production' || env.MANAGER_MFA_REQUIRED !== 'false'
}
