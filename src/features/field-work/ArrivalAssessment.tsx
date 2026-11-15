import type { LocationAssessment } from '../../types'

const labels = { inside: 'Dentro del radio · llegada detectada', outside: 'Fuera del radio', uncertain: 'Precisión insuficiente', unconfigured: 'Obra sin radio configurado', unavailable: 'Sin ubicación disponible' }
export function ArrivalAssessment({ items }: { items: LocationAssessment[] }) {
  if (!items.length) return <p className="metric-explanation">Sin comparación de llegada registrada.</p>
  return <ul>{items.map(item => <li key={item.orderId}><strong>{item.client}: {labels[item.status]}</strong>{item.distance !== null && <span> · Distancia aproximada: {item.distance} m · Radio: {item.radius} m</span>}</li>)}</ul>
}
