type AgendaItem = {
  time: string
  title: string
  owner: string
}

type SecretarySectionProps = {
  agenda: AgendaItem[]
}

export function SecretarySection({ agenda }: SecretarySectionProps) {
  return (
    <section className="content-block">
      <div className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Agenda del gerente</h2>
            <button type="button" className="text-button">Hoy</button>
          </div>

          <ul className="simple-list">
            {agenda.map((item) => (
              <li key={`${item.time}-${item.title}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.owner}</span>
                </div>
                <em>{item.time}</em>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Documentación</h2>
            <button type="button" className="text-button">Banco</button>
          </div>

          <div className="doc-stack">
            <div className="doc-item">
              <span>Acta de junta</span>
              <strong>15 documentos</strong>
            </div>
            <div className="doc-item">
              <span>Contratos</span>
              <strong>42 archivos</strong>
            </div>
            <div className="doc-item">
              <span>Comunicados</span>
              <strong>9 pendientes</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
