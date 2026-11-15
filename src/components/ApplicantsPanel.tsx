import type { Applicant, ApplicantStatus } from '../types'
import { useState } from 'react'

type ApplicantsPanelProps = {
  applicants: Applicant[]
  searchApplicant: string
  applicantFilter: 'Todos' | ApplicantStatus
  isLoadingData: boolean
  loadError: string | null
  onSearchChange: (value: string) => void
  onFilterChange: (value: 'Todos' | ApplicantStatus) => void
  onApplicantDecision: (id: string, status: ApplicantStatus) => Promise<void>
  canDecide: boolean
}

export function ApplicantsPanel({
  applicants,
  searchApplicant,
  applicantFilter,
  isLoadingData,
  loadError,
  onSearchChange,
  onFilterChange,
  onApplicantDecision,
  canDecide,
}: ApplicantsPanelProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [decisionError, setDecisionError] = useState('')
  const decide = async (id: string, status: ApplicantStatus) => {
    setPendingId(id)
    setDecisionError('')
    try { await onApplicantDecision(id, status) }
    catch (error) { setDecisionError(error instanceof Error ? error.message : 'No se pudo guardar la decisión.') }
    finally { setPendingId(null) }
  }
  const filteredApplicants = applicants.filter((applicant) => {
    const q = searchApplicant.trim().toLowerCase()
    const matchesText =
      q.length === 0 ||
      applicant.fullName.toLowerCase().includes(q) ||
      applicant.area.toLowerCase().includes(q) ||
      applicant.email.toLowerCase().includes(q)

    const matchesFilter = applicantFilter === 'Todos' || applicant.status === applicantFilter
    return matchesText && matchesFilter
  })

  return (
    <div className="panel panel-full">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Reclutamiento</p>
          <h2>Solicitudes de ingreso y autorización</h2>
        </div>
      </div>

      <div className="filters-toolbar">
        <input
          type="search"
          placeholder="Buscar solicitante"
          value={searchApplicant}
          onChange={(event) => onSearchChange(event.target.value)}
        />

        <div className="filter-pills">
          {(['Todos', 'Pendiente', 'Aprobado', 'Rechazado'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={applicantFilter === item ? 'chip active' : 'chip'}
              onClick={() => onFilterChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {decisionError && <p role="alert">{decisionError}</p>}
      <div className="applicant-grid">
        {isLoadingData ? (
          <div style={{ gridColumn: '1 / -1', padding: '1.25rem', color: '#64748b', fontWeight: 600 }}>
            Cargando solicitudes desde la base de datos...
          </div>
        ) : loadError ? (
          <div role="alert" style={{ gridColumn: '1 / -1', padding: '1.25rem', color: '#fecaca', fontWeight: 600 }}>
            Error al cargar solicitudes: {loadError}
          </div>
        ) : filteredApplicants.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '1.25rem', color: '#64748b', fontWeight: 600 }}>
            No hay solicitudes con los filtros actuales.
          </div>
        ) : filteredApplicants.map((applicant) => (
          <article key={applicant.id} className="applicant-card">
            <div className="applicant-head">
              <div>
                <span className="applicant-id">{applicant.id}</span>
                <h3>{applicant.fullName}</h3>
              </div>
              <span className={`status-pill ${applicant.status.toLowerCase()}`}>{applicant.status}</span>
            </div>

            <ul>
              <li><strong>Correo:</strong> {applicant.email}</li>
              <li><strong>Teléfono:</strong> {applicant.phone}</li>
              <li><strong>Área:</strong> {applicant.area}</li>
              <li><strong>Experiencia:</strong> {applicant.experience}</li>
              <li><strong>Disponibilidad:</strong> {applicant.availability}</li>
            </ul>

            <div className="skills-row">
              {applicant.skills.slice(0, 3).map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>

            {canDecide && <div className="applicant-actions">
              <button type="button" className="approve-button" disabled={pendingId !== null} onClick={() => void decide(applicant.id, 'Aprobado')}>
                Autorizar
              </button>
              <button type="button" className="reject-button" disabled={pendingId !== null} onClick={() => void decide(applicant.id, 'Rechazado')}>
                Rechazar
              </button>
            </div>}
          </article>
        ))}
      </div>
    </div>
  )
}
