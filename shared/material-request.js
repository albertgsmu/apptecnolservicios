export function validateMaterialRequest(category, input) {
  if (category !== 'Solicitud de material') {
    return input == null || (Array.isArray(input) && input.length === 0) ? { value: [] } : { error: 'La lista de materiales corresponde al tipo Solicitud de material.' }
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) return { error: 'Incluye entre 1 y 20 materiales en la solicitud.' }
  const value = []
  for (const line of input) {
    if (!line || typeof line.name !== 'string' || !line.name.trim() || line.name.length > 160 ||
      typeof line.unit !== 'string' || !line.unit.trim() || line.unit.length > 40 ||
      typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1000000 ||
      Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) > 0.00001) {
      return { error: 'Cada material necesita nombre, cantidad positiva (hasta tres decimales) y unidad de medida.' }
    }
    value.push({ name: line.name.trim(), quantity: Math.round(line.quantity * 1000) / 1000, unit: line.unit.trim() })
  }
  return { value }
}
