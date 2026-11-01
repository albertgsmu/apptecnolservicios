type StatusBadgeProps = {
  label: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  variant?: 'status' | 'priority' | 'state'
}

export function StatusBadge({ label, tone = 'neutral', variant = 'status' }: StatusBadgeProps) {
  const className = variant === 'priority'
    ? `priority-badge ${label.toLowerCase()}`
    : variant === 'state'
      ? `state ${label.toLowerCase()}`
      : `status-badge ${tone}`

  return <span className={className}>{label}</span>
}
