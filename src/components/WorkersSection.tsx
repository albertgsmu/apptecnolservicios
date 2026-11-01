import type { EmployeeStatus } from '../types'

type WorkersSectionProps = {
  searchTerm: string
  statusFilter: 'Todos' | EmployeeStatus
  onSearchChange: (value: string) => void
  onStatusChange: (value: 'Todos' | EmployeeStatus) => void
  onUpdateStatus: (id: string, status: EmployeeStatus) => Promise<void>
  employees: Array<{
    id: string
    name: string
    area: string
    title: string
    status: EmployeeStatus
    shift: string
    score: number
  }>
}

export function WorkersSection({
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusChange,
  onUpdateStatus,
  employees,
}: WorkersSectionProps) {
  const filteredEmployees = employees.filter((employee) => {
    const q = searchTerm.trim().toLowerCase()
    const matchesQuery =
      q.length === 0 ||
      employee.name.toLowerCase().includes(q) ||
      employee.area.toLowerCase().includes(q) ||
      employee.title.toLowerCase().includes(q)

    const matchesStatus = statusFilter === 'Todos' || employee.status === statusFilter
    return matchesQuery && matchesStatus
  })

  return (
    <section className="content-block">
      <div className="panel panel-full">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Control de personal</p>
            <h2>Trabajadores y estructura operativa</h2>
          </div>
          <button type="button" className="ghost-button">Agregar empleado</button>
        </div>

        <div className="filters-toolbar">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nombre, área o cargo"
            aria-label="Buscar trabajadores"
          />

          <div className="filter-pills" aria-label="Filtrar por estado">
            {['Todos', 'Activo', 'Vacaciones', 'Licencia', 'Inactivo'].map((item) => (
              <button
                key={item}
                type="button"
                className={statusFilter === item ? 'chip active' : 'chip'}
                onClick={() => onStatusChange(item as 'Todos' | EmployeeStatus)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Área</th>
                <th>Cargo</th>
                <th>Turno</th>
                <th>Estado</th>
                <th>Rendimiento</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.id}</td>
                  <td>{employee.name}</td>
                  <td>{employee.area}</td>
                  <td>{employee.title}</td>
                  <td>{employee.shift}</td>
                  <td>
                    <select
                      className="status-select"
                      value={employee.status}
                      onChange={async (event) => {
                        const nextStatus = event.target.value as EmployeeStatus
                        await onUpdateStatus(employee.id, nextStatus)
                      }}
                    >
                      {['Activo', 'Vacaciones', 'Licencia', 'Inactivo'].map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="metric-line">
                      <span>{employee.score}%</span>
                      <div className="mini-bar">
                        <span style={{ width: `${employee.score}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
