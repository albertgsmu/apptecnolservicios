import type { MaterialRequestLine } from '../../types'

import { emptyMaterialLine } from './materialRequestDraft'

export function MaterialRequestFields({ value, onChange, disabled }: { value: MaterialRequestLine[]; onChange: (value: MaterialRequestLine[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<MaterialRequestLine>) => onChange(value.map((line, position) => position === index ? { ...line, ...patch } : line))
  return <fieldset className="material-request-fields"><legend>Materiales que necesitas</legend><p>Indica el material y sus especificaciones, la cantidad y la unidad. El equipo responsable revisará la solicitud; enviarla no reserva ni descuenta existencias.</p>
    {value.map((line, index) => <div className="material-request-line" key={index}>
      <label>Material {index + 1}<input aria-label={`Material solicitado ${index + 1}`} maxLength={160} required value={line.name} onChange={event => update(index, { name: event.target.value })} placeholder="Ej. Cable calibre 12, color negro" disabled={disabled} /></label>
      <label>Cantidad<input aria-label={`Cantidad solicitada ${index + 1}`} type="number" min="0.001" max={1000000} step="0.001" required value={line.quantity || ''} onChange={event => update(index, { quantity: Number(event.target.value) })} disabled={disabled} /></label>
      <label>Unidad<input aria-label={`Unidad solicitada ${index + 1}`} maxLength={40} required value={line.unit} onChange={event => update(index, { unit: event.target.value })} placeholder="metro, kg, saco, unidad…" disabled={disabled} /></label>
      {value.length > 1 && <button type="button" className="ghost-button" disabled={disabled} onClick={() => onChange(value.filter((_, position) => position !== index))}>Quitar material {index + 1}</button>}
    </div>)}
    <button type="button" className="ghost-button" disabled={disabled || value.length >= 20} onClick={() => onChange([...value, emptyMaterialLine()])}>Agregar otro material</button>
  </fieldset>
}

export function ReportMaterials({ materials }: { materials?: MaterialRequestLine[] }) {
  if (!materials?.length) return null
  return <div className="report-materials"><strong>Materiales solicitados</strong><ul>{materials.map((line, index) => <li key={index}><strong>{line.name}</strong> · {line.quantity} {line.unit}</li>)}</ul></div>
}
