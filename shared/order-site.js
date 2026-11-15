import { validGeofence } from './geofence.js'

export const ORDER_SITE_FIELDS = {
  address: { label: 'Dirección de la obra', maxLength: 240, required: true },
  city: { label: 'Ciudad o municipio', maxLength: 100, required: true },
  neighborhood: { label: 'Barrio o sector', maxLength: 120 },
  building: { label: 'Edificio, conjunto o torre', maxLength: 120 },
  unit: { label: 'Apartamento, casa, piso o local', maxLength: 100 },
  contactName: { label: 'Persona de contacto', maxLength: 120 },
  contactPhone: { label: 'Teléfono de contacto', maxLength: 40 },
  accessHours: { label: 'Horario permitido de ingreso', maxLength: 160 },
  accessInstructions: { label: 'Referencias y condiciones de acceso', maxLength: 2000 },
  workRequirements: { label: 'Materiales, herramientas y cuidados', maxLength: 2000 },
}

export const emptyOrderSite = () => Object.fromEntries(Object.keys(ORDER_SITE_FIELDS).map(key => [key, '']))

export function validateOrderSite(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Completa la dirección y la ciudad de la obra.' }
  const value = emptyOrderSite()
  for (const [key, field] of Object.entries(ORDER_SITE_FIELDS)) {
    const text = input[key] ?? ''
    if (typeof text !== 'string' || text.length > field.maxLength) return { error: `Revisa ${field.label.toLowerCase()}: máximo ${field.maxLength} caracteres.` }
    value[key] = text.trim()
    if (field.required && !value[key]) return { error: `Completa ${field.label.toLowerCase()}.` }
  }
  if (input.geofence != null) {
    if (!validGeofence(input.geofence)) return { error: 'Revisa las coordenadas y el radio de llegada (25 a 2.000 metros).' }
    value.geofence = { latitude: input.geofence.latitude, longitude: input.geofence.longitude, radius: input.geofence.radius }
  }
  return { value }
}
