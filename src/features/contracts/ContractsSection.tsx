type Contract = {
  name: string
  vendor: string
  amount: string
  due: string
  status: string
}

type Provider = {
  name: string
  category: string
  rating: string
  status: string
}

type ContractsSectionProps = {
  contracts: Contract[]
  providers: Provider[]
}

export function ContractsSection({ contracts, providers }: ContractsSectionProps) {
  return (
    <section className="content-block">
      <div className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Contratos vigentes</h2>
            <button type="button" className="text-button">Todos</button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Vence</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.vendor}</td>
                  <td>{item.amount}</td>
                  <td>{item.due}</td>
                  <td>
                    <span className={`status-badge ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Proveedores</h2>
            <button type="button" className="text-button">Evaluar</button>
          </div>

          <ul className="simple-list provider-list">
            {providers.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.category}</span>
                </div>
                <div className="list-meta">
                  <em>{item.rating}</em>
                  <small className={`state ${item.status.toLowerCase()}`}>{item.status}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
