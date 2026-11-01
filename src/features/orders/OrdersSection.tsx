type Order = {
  id: string
  client: string
  area: string
  priority: string
  status: string
  progress: number
}

type OrdersSectionProps = {
  orders: Order[]
}

export function OrdersSection({ orders }: OrdersSectionProps) {
  return (
    <section className="content-block">
      <div className="panel panel-full">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operación</p>
            <h2>Órdenes de trabajo y seguimiento</h2>
          </div>
          <button type="button" className="primary-button">Nueva OT</button>
        </div>

        <div className="order-grid">
          {orders.map((order) => (
            <article key={order.id} className="order-card">
              <div className="order-head">
                <div>
                  <span className="order-id">{order.id}</span>
                  <h3>{order.client}</h3>
                </div>
                <span className={`priority-badge ${order.priority.toLowerCase()}`}>{order.priority}</span>
              </div>

              <p>{order.area}</p>

              <div className="progress-line">
                <span style={{ width: `${order.progress}%` }} />
              </div>

              <div className="order-footer">
                <span>{order.status}</span>
                <strong>{order.progress}%</strong>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
