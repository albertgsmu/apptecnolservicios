import { permissionRoles } from '../shared/access-policy.js'
import { createAccount } from './services/accounts.js'

export function registerUsers(app, { dbQuery, authRequired, allowRoles, asyncRoute, withTransaction }) {
  const managerOnly = allowRoles(...permissionRoles.manageUsers)

  app.get('/api/users/employees', authRequired, managerOnly, asyncRoute(async (_req, res) => {
    const employees = await dbQuery(`SELECT e.id, e.name, e.area FROM employees e
      WHERE e.status = 'Activo' AND NOT EXISTS (
        SELECT 1 FROM user_employees ue WHERE ue.employee_id = e.id
      ) ORDER BY e.name`)
    return res.json(employees)
  }))

  app.post('/api/users', authRequired, managerOnly, asyncRoute(async (req, res) => {
    try {
      const user = await createAccount(req.body, req.user.id, withTransaction)
      return res.status(201).json({ user })
    } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message })
      if (error.code === '23505' || String(error.code).startsWith('SQLITE_CONSTRAINT')) {
        return res.status(409).json({ message: 'El correo o el empleado ya tiene una cuenta. Verifica los datos.' })
      }
      throw error
    }
  }))
}
