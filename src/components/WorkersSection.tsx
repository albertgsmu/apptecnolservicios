import type { EmployeeStatus, WorkOrder } from '../types'
import type { EmployeeRow } from '../hooks/useEmployees'
import { StatCard } from './StatCard'

type Props = {
  searchTerm: string; statusFilter: 'Todos' | EmployeeStatus; onSearchChange: (value: string) => void
  onStatusChange: (value: 'Todos' | EmployeeStatus) => void; onUpdateStatus: (id: string, status: EmployeeStatus) => Promise<void>
  employees: EmployeeRow[]; canManageEmployees: boolean; orders: WorkOrder[]; ordersError: string
  employeeLoading: boolean; employeeError: string
  mode?: 'team' | 'summary'
}

export function WorkersSection({ searchTerm, statusFilter, onSearchChange, onStatusChange, onUpdateStatus, employees, canManageEmployees, orders, ordersError, employeeLoading, employeeError, mode = 'team' }: Props) {
  const filtered = employees.filter(employee => (statusFilter === 'Todos' || employee.status === statusFilter) && [employee.name, employee.area, employee.title, employee.shift].some(value => value.toLowerCase().includes(searchTerm.trim().toLowerCase())))
  const workload = employees.map(employee => {
    const assigned = orders.filter(order => order.assignedTo === employee.id)
    return { ...employee, open: assigned.filter(order => order.status !== 'Cerrada').length, closed: assigned.filter(order => order.status === 'Cerrada').length }
  }).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
  const areas = Object.entries(employees.reduce<Record<string, number>>((counts, employee) => { counts[employee.area] = (counts[employee.area] ?? 0) + 1; return counts }, {})).sort((a, b) => b[1] - a[1])
  const available = !employeeLoading && !employeeError
  const stats = [
    { label: 'Empleados registrados', value: String(employees.length), delta: 'Fichas guardadas; no equivale a cuentas de acceso', tone: 'blue' },
    { label: 'Personal activo', value: String(employees.filter(employee => employee.status === 'Activo').length), delta: 'Estado actual Activo', tone: 'green' },
    { label: 'En vacaciones o licencia', value: String(employees.filter(employee => ['Vacaciones', 'Licencia'].includes(employee.status)).length), delta: 'Estado administrativo de la ficha', tone: 'amber' },
    { label: 'Personal inactivo', value: String(employees.filter(employee => employee.status === 'Inactivo').length), delta: 'Estado actual Inactivo', tone: 'red' },
  ]
  return <section className="content-block workers-section">
    {employeeLoading && <p role="status">Consultando personal…</p>}{employeeError && <p role="alert">No se pudo actualizar el personal: {employeeError}. Los conteos no están disponibles.</p>}
    {mode === 'summary' && <>{available && <div className="stats-grid">{stats.map(stat => <StatCard key={stat.label} {...stat} />)}</div>}
    <div className="content-grid"><div className="panel large-panel"><h2>Carga de trabajo</h2><p className="metric-explanation">Órdenes abiertas y cerradas por trabajador.</p>
      {ordersError || !available ? <p>La carga de trabajo requiere consultar las órdenes y el personal.</p> : !workload.length ? <p>No hay empleados registrados.</p> : <ul className="simple-list">{workload.slice(0, 6).map(employee => <li key={employee.id}><div><strong>{employee.name}</strong><span>{employee.area}</span></div><span>{employee.open} abiertas · {employee.closed} cerradas</span></li>)}</ul>}
    </div><div className="panel"><h2>Trabajadores por área</h2>
      {!available ? <p>Distribución pendiente de consulta.</p> : !areas.length ? <p>No hay áreas con personal registrado.</p> : <div className="stacked-bars">{areas.map(([area, total]) => <div key={area} className="mini-area-stat"><div className="mini-area-row"><span>{area}</span><strong>{total}</strong></div><div className="mini-bar"><span style={{ width: `${total / employees.length * 100}%` }} /></div></div>)}</div>}
    </div></div></>}
    {mode === 'team' && <div className="panel panel-full worker-directory"><h2>Trabajadores y estructura operativa</h2><div className="filters-toolbar"><input type="search" aria-label="Buscar trabajadores" placeholder="Buscar por nombre, área, cargo o turno" value={searchTerm} onChange={event => onSearchChange(event.target.value)} /><div className="filter-pills">{(['Todos', 'Activo', 'Vacaciones', 'Licencia', 'Inactivo'] as const).map(status => <button key={status} className={statusFilter === status ? 'chip active' : 'chip'} onClick={() => onStatusChange(status)}>{status}</button>)}</div></div>
      <div className="table-wrap"><table className="responsive-records" role="table"><thead><tr><th>Nombre</th><th>Área</th><th>Cargo</th><th>Turno</th><th>Estado</th><th>Órdenes abiertas</th></tr></thead><tbody>{filtered.map(employee => <tr key={employee.id}><td data-label="Nombre">{employee.name}</td><td data-label="Área">{employee.area}</td><td data-label="Cargo">{employee.title}</td><td data-label="Turno">{employee.shift || 'Sin registrar'}</td><td data-label="Estado"><select aria-label={`Estado de ${employee.name}`} disabled={!canManageEmployees} value={employee.status} onChange={event => void onUpdateStatus(employee.id, event.target.value as EmployeeStatus)}>{['Activo', 'Vacaciones', 'Licencia', 'Inactivo'].map(status => <option key={status}>{status}</option>)}</select></td><td data-label="Órdenes abiertas">{ordersError ? 'No disponible' : workload.find(item => item.id === employee.id)?.open ?? 0}</td></tr>)}</tbody></table></div>
      {available && !filtered.length && <p>No hay empleados que coincidan con la búsqueda y el estado seleccionados.</p>}
    </div>}
  </section>
}
