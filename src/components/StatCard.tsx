type StatCardProps = {
  label: string
  value: string
  delta: string
  tone: string
}

export function StatCard({ label, value, delta, tone }: StatCardProps) {
  return (
    <article className={`stat-card ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <em>{delta}</em>
    </article>
  )
}
