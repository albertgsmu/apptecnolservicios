export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidPassword(value: string): boolean {
  return value.length >= 8
}

export function hasRequiredFields<T extends Record<string, string | undefined | null>>(values: T): boolean {
  return Object.values(values).every((value) => typeof value === 'string' && value.trim().length > 0)
}
