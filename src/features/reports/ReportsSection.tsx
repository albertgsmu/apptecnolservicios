type ReportItem = {
  name: string
  type: string
  updated: string
}

type ReportsSectionProps = {
  reports: ReportItem[]
}

export function ReportsSection({ reports }: ReportsSectionProps) {
  return (
    <section className="content-block">
      <div className="panel panel-full">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Indicadores</p>
            <h2>Reportes y exportación</h2>
          </div>
          <button type="button" className="ghost-button">Exportar todo</button>
        </div>

        <div className="report-grid">
          {reports.map((report) => (
            <article key={report.name} className="report-card">
              <div className="report-icon">{report.type}</div>
              <div>
                <strong>{report.name}</strong>
                <span>Actualizado {report.updated}</span>
              </div>
              <button type="button" className="text-button">Descargar</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
