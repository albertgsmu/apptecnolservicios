import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { managedRoleNames } from '../../shared/access-policy.js'

class AccountError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function normalizeDraft(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  const { password, role, employeeId, employeeDetails } = input ?? {}

  if (name.length < 2 || name.length > 120) throw new AccountError('Escribe un nombre de entre 2 y 120 caracteres.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AccountError('Escribe un correo electrónico válido.')
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new AccountError('Usa una contraseña de al menos 12 caracteres y máximo 72 bytes.')
  }
  if (!managedRoleNames.includes(role)) throw new AccountError('Selecciona uno de los perfiles de acceso disponibles.')
  let newEmployee = null
  if (role === 'Trabajador') {
    if (employeeId && employeeDetails) throw new AccountError('Elige crear una ficha nueva o vincular una existente.')
    if (employeeId && typeof employeeId !== 'string') throw new AccountError('Selecciona una ficha válida.')
    if (!employeeId) {
      if (!employeeDetails || typeof employeeDetails !== 'object' || Array.isArray(employeeDetails)) throw new AccountError('Completa los datos del nuevo trabajador o selecciona una ficha existente.')
      const area = typeof employeeDetails.area === 'string' ? employeeDetails.area.trim() : ''
      const title = typeof employeeDetails.title === 'string' ? employeeDetails.title.trim() : ''
      const shift = typeof employeeDetails.shift === 'string' ? employeeDetails.shift.trim() : ''
      if (!area || area.length > 120 || !title || title.length > 120 || !['Diurno', 'Nocturno', 'Rotativo'].includes(shift)) {
        throw new AccountError('Completa la especialidad, el cargo y un turno válido para el trabajador.')
      }
      newEmployee = { area, title, shift }
    }
  }
  if (role !== 'Trabajador' && (employeeId || employeeDetails)) throw new AccountError('La ficha de empleado corresponde únicamente a cuentas de Trabajador.')

  return { name, email, password, role, employeeId, newEmployee }
}

export async function createAccount(input, actorId, withTransaction) {
  const draft = normalizeDraft(input)
  const id = `user-${randomUUID()}`
  const passwordHash = await bcrypt.hash(draft.password, 12)
  const now = new Date().toISOString()
  const employeeId = draft.role === 'Trabajador' ? draft.employeeId || `employee-${randomUUID()}` : null

  await withTransaction(async tx => {
    if (await tx.get('SELECT id FROM users WHERE lower(email) = $1', [draft.email])) {
      throw new AccountError('Ya existe una cuenta con ese correo.', 409)
    }
    if (draft.role === 'Trabajador' && !draft.newEmployee) {
      const employee = await tx.get("SELECT id FROM employees WHERE id = $1 AND status = 'Activo'", [draft.employeeId])
      if (!employee) throw new AccountError('El empleado seleccionado no está activo.')
      if (await tx.get('SELECT user_id FROM user_employees WHERE employee_id = $1', [draft.employeeId])) {
        throw new AccountError('Ese empleado ya tiene una cuenta vinculada.', 409)
      }
    }

    if (draft.newEmployee) {
      await tx.run(`INSERT INTO employees (id,name,area,title,status,shift,score,"lastEntry","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$8)`,
      [employeeId, draft.name, draft.newEmployee.area, draft.newEmployee.title, 'Activo', draft.newEmployee.shift, '', now])
    }

    await tx.run(
      'INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, draft.email, passwordHash, draft.name, draft.role, now],
    )
    if (draft.role === 'Trabajador') {
      await tx.run('INSERT INTO user_employees (user_id, employee_id) VALUES ($1, $2)', [id, employeeId])
    }
    await tx.run(
      'INSERT INTO security_events (id, user_id, event, created_at) VALUES ($1, $2, $3, $4)',
      [`event-${randomUUID()}`, actorId, `account_created:${id}:${draft.role}`, now],
    )
  })

  return { id, email: draft.email, name: draft.name, role: draft.role, ...(employeeId ? { employeeId } : {}) }
}
