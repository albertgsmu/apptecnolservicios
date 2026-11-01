type AttendanceItem = {
  day: string
  attendance: number
}

type AttendanceChartProps = {
  items: AttendanceItem[]
  compact?: boolean
}

export function AttendanceChart({ items, compact = false }: AttendanceChartProps) {
  return (
    <div className="attendance-chart">
      {items.map((item) => (
        <div key={item.day} className="attendance-item">
          <div className="bar-group">
            <span className="bar" style={{ height: `${compact ? item.attendance * 1.2 : item.attendance}%` }} />
          </div>
          <strong>{item.day}</strong>
          <small>{item.attendance}%</small>
        </div>
      ))}
    </div>
  )
}
