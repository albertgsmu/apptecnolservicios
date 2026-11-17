import { useState } from 'react'
import { apiRequest } from '../../lib/dataService'
import type { DashboardOverview, WorkOrder } from '../../types'

function downloadCsv(name: string, rows: unknown[][]) {
  const cell = (value: unknown) => {
    const text = String(value ?? '')
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ReportsSection({ data }: { data: DashboardOverview | null }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const exportReport = async (kind: 'orders' | 'overview') => {
    setBusy(true); setNotice('')
    try {
      if (kind === 'orders') {
        const orders = await apiRequest<WorkOrder[]>('/orders')
        downloadCsv('ordenes-de-trabajo.csv', [['ID', 'Cliente', 'Área', 'Prioridad', 'Estado', 'Avance (%)', 'Técnico', 'Fecha prevista', 'Dirección', 'Ciudad', 'Barrio', 'Edificio o torre', 'Apartamento o unidad', 'Contacto', 'Teléfono', 'Horario de ingreso', 'Acceso y referencias', 'Materiales y cuidados', 'Observaciones', 'Adjuntos'], ...orders.map(order => [order.id, order.client, order.area, order.priority, order.status, order.progress, order.assignedName, order.date, order.site.address, order.site.city, order.site.neighborhood, order.site.building, order.site.unit, order.site.contactName, order.site.contactPhone, order.site.accessHours, order.site.accessInstructions, order.site.workRequirements, order.observations, order.attachments.length])])
      } else {
        const overview = await apiRequest<DashboardOverview>('/dashboard/overview')
        downloadCsv('resumen-operativo.csv', [['Indicador', 'Valor'], ['Consulta UTC', overview.generatedAt], ['Órdenes registradas', overview.orders.total], ['Órdenes abiertas', overview.orders.open], ['Órdenes cerradas', overview.orders.closed], ['En revisión', overview.operations.review], ['Sin técnico', overview.operations.unassigned], ['Críticas abiertas', overview.operations.critical], ['Fecha prevista vencida', overview.operations.overdue], ['Avance promedio de abiertas (%)', overview.operations.openAverageProgress ?? 'No disponible'], ['Empleados registrados', overview.employees?.total ?? 'No disponible'], ['Empleados activos', overview.employees?.active ?? 'No disponible'], ['Candidatos pendientes', overview.applicants.pending], ['Adjuntos guardados', overview.media.files]])
      }
      setNotice('CSV generado.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo generar el reporte.') }
    finally { setBusy(false) }
  }
  return <section className="content-block"><div className="panel panel-full"><div className="panel-header"><div><p className="eyebrow">Información operativa</p><h2>Reportes y exportación</h2></div></div>
    <div className="report-grid"><article className="report-card"><div><strong>Órdenes de trabajo</strong>{data && <small>{data.orders.total} órdenes</small>}</div><button className="primary-button" disabled={busy} onClick={() => void exportReport('orders')}>Descargar órdenes CSV</button></article>
      <article className="report-card"><div><strong>Resumen operativo</strong></div><button className="primary-button" disabled={busy} onClick={() => void exportReport('overview')}>Descargar resumen CSV</button></article></div>
    {notice && <p role="status">{notice}</p>}
  </div></section>
}
