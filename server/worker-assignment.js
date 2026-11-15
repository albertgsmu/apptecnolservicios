export async function currentWorkerOrder(dbQuery, userId) {
  const rows = await dbQuery(`SELECT o.id FROM work_orders o JOIN user_employees ue ON ue.employee_id=o.assigned_to
    JOIN employees e ON e.id=ue.employee_id WHERE ue.user_id=$1 AND e.status='Activo' AND o.status <> 'Cerrada'
    ORDER BY CASE o.status WHEN 'En ejecución' THEN 0 WHEN 'Asignada' THEN 1 ELSE 2 END,
      CASE WHEN o.scheduled_date='' THEN 1 ELSE 0 END,o.scheduled_date,o.created_at,o.id LIMIT 1`, [userId])
  return rows[0]?.id ?? null
}
