import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
})
const DEFAULT_PORT = Number(process.env.PORT ?? 3003)
let PORT = DEFAULT_PORT
const JWT_SECRET = process.env.JWT_SECRET ?? 'jp-mantenimiento-secret-dev'
const DB_PATH = path.join(__dirname, 'data', 'jp.db')

const db = await open({
  filename: DB_PATH,
  driver: sqlite3.Database,
})

const ensureDatabase = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      shift TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      lastEntry TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applicants (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      birthDate TEXT NOT NULL,
      gender TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      identityNumber TEXT NOT NULL,
      education TEXT NOT NULL,
      area TEXT NOT NULL,
      experience TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      availability TEXT NOT NULL,
      emergencyContact TEXT NOT NULL,
      emergencyPhone TEXT NOT NULL,
      documents TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `)

  const count = await db.get('SELECT COUNT(*) AS total FROM users')
  if (Number(count.total) === 0) {
    const hashedPassword = await bcrypt.hash('JPsecure123', 10)
    await db.run(
      `INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ['user-gerente', 'gerente@jpmantenimiento.com', hashedPassword, 'Gerente General', 'Gerente', new Date().toISOString()],
    )
    await db.run(
      `INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ['user-secretaria', 'secretaria@jpmantenimiento.com', await bcrypt.hash('JPsecure123', 10), 'Secretaria General', 'Secretaria', new Date().toISOString()],
    )
  }

  const employeeCount = await db.get('SELECT COUNT(*) AS total FROM employees')
  if (Number(employeeCount.total) === 0) {
    const seedEmployees = [
      { id: 'EMP-1042', name: 'Luis Salas', area: 'Electricidad', title: 'Técnico senior', status: 'Activo', shift: 'Matutino', score: 96, lastEntry: '07:05' },
      { id: 'EMP-1087', name: 'Patricia Romero', area: 'RRHH', title: 'Analista de personal', status: 'Activo', shift: 'Horario administrativo', score: 92, lastEntry: '08:15' },
      { id: 'EMP-2191', name: 'Miguel Torres', area: 'Mecánica', title: 'Supervisor campo', status: 'Vacaciones', shift: 'Turno A', score: 88, lastEntry: '07:40' },
      { id: 'EMP-3324', name: 'Carmen Vela', area: 'Secretaría', title: 'Coordinadora', status: 'Activo', shift: 'Matutino', score: 98, lastEntry: '08:00' },
      { id: 'EMP-4410', name: 'Javier Huerta', area: 'Plomería', title: 'Especialista', status: 'Licencia', shift: 'Turno B', score: 81, lastEntry: '06:50' },
      { id: 'EMP-5102', name: 'Daniela Cruz', area: 'Administración', title: 'Contabilidad', status: 'Activo', shift: 'Horario administrativo', score: 94, lastEntry: '08:20' },
    ]

    for (const employee of seedEmployees) {
      await db.run(
        `INSERT INTO employees (id, name, area, title, status, shift, score, lastEntry, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [employee.id, employee.name, employee.area, employee.title, employee.status, employee.shift, employee.score, employee.lastEntry, new Date().toISOString(), new Date().toISOString()],
      )
    }
  }

  const applicantCount = await db.get('SELECT COUNT(*) AS total FROM applicants')
  if (Number(applicantCount.total) === 0) {
    const seedApplicants = [
      {
        id: 'SOL-1001',
        fullName: 'María José Vázquez',
        email: 'maria.vazquez@email.com',
        phone: '5512345678',
        birthDate: '1994-07-12',
        gender: 'Femenino',
        address: 'Calle 5, Colonia Roma',
        city: 'Ciudad de México',
        identityNumber: 'VAMJ940712MDF',
        education: 'Licenciatura',
        area: 'Electricidad',
        experience: '2 años',
        skills: ['Mantenimiento eléctrico', 'Diagnóstico', 'Trabajo en equipo'],
        availability: 'Full time',
        emergencyContact: 'José Vázquez',
        emergencyPhone: '5578901234',
        documents: ['INE', 'CURP', 'Comprobante de domicilio'],
        status: 'Pendiente',
        createdAt: '2026-10-15T09:00:00.000Z',
      },
      {
        id: 'SOL-1002',
        fullName: 'Eduardo Duran',
        email: 'eduardo.duran@email.com',
        phone: '5523456789',
        birthDate: '1989-03-21',
        gender: 'Masculino',
        address: 'Avenida de la Reforma 87',
        city: 'Guadalajara',
        identityNumber: 'DURE890321JDF',
        education: 'Técnico superior',
        area: 'Plomería',
        experience: '4 años',
        skills: ['Plomería', 'HVAC', 'Atención a clientes'],
        availability: 'Turno nocturno',
        emergencyContact: 'Diana Duran',
        emergencyPhone: '5543210987',
        documents: ['INE', 'CURP'],
        status: 'Aprobado',
        createdAt: '2026-10-18T10:00:00.000Z',
      },
    ]

    for (const applicant of seedApplicants) {
      await db.run(
        `INSERT INTO applicants (id, fullName, email, phone, birthDate, gender, address, city, identityNumber, education, area, experience, skills, availability, emergencyContact, emergencyPhone, documents, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          applicant.id,
          applicant.fullName,
          applicant.email,
          applicant.phone,
          applicant.birthDate,
          applicant.gender,
          applicant.address,
          applicant.city,
          applicant.identityNumber,
          applicant.education,
          applicant.area,
          applicant.experience,
          JSON.stringify(applicant.skills),
          applicant.availability,
          applicant.emergencyContact,
          applicant.emergencyPhone,
          JSON.stringify(applicant.documents),
          applicant.status,
          applicant.createdAt,
        ],
      )
    }
  }
}

const normalizeApplicant = (input) => ({
  fullName: input.fullName,
  email: input.email,
  phone: input.phone,
  birthDate: input.birthDate,
  gender: input.gender ?? 'Sin especificar',
  address: input.address,
  city: input.city,
  identityNumber: input.identityNumber,
  education: input.education ?? 'No especificada',
  area: input.area,
  experience: input.experience ?? 'Sin experiencia',
  skills: Array.isArray(input.skills) ? input.skills : [],
  availability: input.availability ?? 'Full time',
  emergencyContact: input.emergencyContact,
  emergencyPhone: input.emergencyPhone,
  documents: Array.isArray(input.documents) ? input.documents : [],
})

const parseApplicant = (row) => ({
  ...row,
  skills: JSON.parse(row.skills || '[]'),
  documents: JSON.parse(row.documents || '[]'),
})

const parseEmployee = (row) => ({
  id: row.id,
  name: row.name,
  area: row.area,
  title: row.title,
  status: row.status,
  shift: row.shift,
  score: Number(row.score ?? 0),
  lastEntry: row.lastEntry,
})

const authRequired = (req, res, next) => {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null

  if (!token) {
    return res.status(401).json({ message: 'Token no proporcionado.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ message: 'Token inválido o expirado.' })
  }
}

const createApplicantId = async () => {
  const row = await db.get('SELECT MAX(CAST(REPLACE(id, "SOL-", "") AS INTEGER)) AS maxId FROM applicants')
  const next = Number(row?.maxId ?? 100) + 1
  return `SOL-${String(next).padStart(4, '0')}`
}

app.use(cors())
app.use(express.json())

await ensureDatabase()

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'jp-mantenimiento-api', port: PORT })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body ?? {}

  if (!email || !password) {
    return res.status(400).json({ message: 'Correo y contraseña requeridos.' })
  }

  const user = await db.get('SELECT * FROM users WHERE lower(email) = lower(?)', [String(email)])
  if (!user) {
    return res.status(401).json({ message: 'Credenciales incorrectas.' })
  }

  const validPassword = await bcrypt.compare(String(password), user.password_hash)
  if (!validPassword) {
    return res.status(401).json({ message: 'Credenciales incorrectas.' })
  }

  if (role && user.role !== role) {
    return res.status(403).json({ message: 'El rol seleccionado no coincide con la cuenta.' })
  }

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' })

  return res.json({
    token,
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
    },
  })
})

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await db.get('SELECT email, name, role FROM users WHERE id = ?', [req.user.sub])

  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado.' })
  }

  return res.json({
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
    },
  })
})

app.get('/api/employees', authRequired, async (_req, res) => {
  const rows = await db.all('SELECT * FROM employees ORDER BY createdAt DESC')
  return res.json(rows.map(parseEmployee))
})

app.patch('/api/employees/:id/status', authRequired, async (req, res) => {
  const { status } = req.body ?? {}
  const validStatuses = ['Activo', 'Vacaciones', 'Licencia', 'Inactivo']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' })
  }

  const employee = await db.get('SELECT * FROM employees WHERE id = ?', [req.params.id])
  if (!employee) {
    return res.status(404).json({ message: 'Empleado no encontrado.' })
  }

  const updated = {
    ...parseEmployee(employee),
    status,
  }

  await db.run('UPDATE employees SET status = ?, updatedAt = ? WHERE id = ?', [status, new Date().toISOString(), req.params.id])
  const employees = await db.all('SELECT * FROM employees ORDER BY createdAt DESC')
  io.emit('employees:updated', employees.map(parseEmployee))

  return res.json(updated)
})

app.get('/api/applicants', authRequired, async (_req, res) => {
  const rows = await db.all('SELECT * FROM applicants ORDER BY createdAt DESC')
  return res.json(rows.map(parseApplicant))
})

app.post('/api/applicants', async (req, res) => {
  const payload = req.body ?? {}
  const normalized = normalizeApplicant(payload)
  const requiredFields = [
    normalized.fullName,
    normalized.email,
    normalized.phone,
    normalized.birthDate,
    normalized.address,
    normalized.city,
    normalized.identityNumber,
    normalized.emergencyContact,
    normalized.emergencyPhone,
  ]

  if (requiredFields.some((field) => typeof field !== 'string' || field.trim().length === 0)) {
    return res.status(400).json({ message: 'Faltan campos obligatorios.' })
  }

  const id = await createApplicantId()
  const created = {
    id,
    status: 'Pendiente',
    createdAt: new Date().toISOString(),
    ...normalized,
  }

  await db.run(
    `INSERT INTO applicants (id, fullName, email, phone, birthDate, gender, address, city, identityNumber, education, area, experience, skills, availability, emergencyContact, emergencyPhone, documents, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      created.id,
      created.fullName,
      created.email,
      created.phone,
      created.birthDate,
      created.gender,
      created.address,
      created.city,
      created.identityNumber,
      created.education,
      created.area,
      created.experience,
      JSON.stringify(created.skills),
      created.availability,
      created.emergencyContact,
      created.emergencyPhone,
      JSON.stringify(created.documents),
      created.status,
      created.createdAt,
    ],
  )

  return res.status(201).json(created)
})

app.patch('/api/applicants/:id/status', authRequired, async (req, res) => {
  const { status } = req.body ?? {}
  const validStatuses = ['Pendiente', 'Aprobado', 'Rechazado']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' })
  }

  const applicant = await db.get('SELECT * FROM applicants WHERE id = ?', [req.params.id])
  if (!applicant) {
    return res.status(404).json({ message: 'Solicitante no encontrado.' })
  }

  const updated = {
    ...parseApplicant(applicant),
    status,
  }

  await db.run('UPDATE applicants SET status = ? WHERE id = ?', [status, req.params.id])
  return res.json(updated)
})

app.get('/api/dashboard/overview', authRequired, async (_req, res) => {
  const rows = await db.all('SELECT * FROM applicants')
  const applicants = rows.map(parseApplicant)
  const employees = await db.all('SELECT * FROM employees')
  const approved = applicants.filter((item) => item.status === 'Aprobado').length
  const pending = applicants.filter((item) => item.status === 'Pendiente').length
  const activeEmployees = employees.filter((item) => item.status === 'Activo').length

  const metrics = [
    { label: 'Empleados activos', value: String(activeEmployees), delta: '+12%', tone: 'amber' },
    { label: 'Órdenes abiertas', value: '126', delta: '+8%', tone: 'blue' },
    { label: 'Cumplimiento', value: '96.4%', delta: '+2.1%', tone: 'green' },
    { label: 'Candidatos', value: String(applicants.length), delta: `+${pending} pendientes`, tone: 'red' },
  ]

  return res.json({
    metrics,
    alerts: [
      'Revisión de SLA por sucursal y cumplimiento mensual.',
      'Coordinación de mantenimiento crítico en 3 clientes prioritarios.',
      'Confirmar disponibilidad de personal para turno nocturno.',
      `Hay ${approved} solicitudes aprobadas y ${pending} en revisión.`,
    ],
    throughput: {
      attendance: [97, 94, 98, 96, 95],
      approved,
      pending,
    },
  })
})

io.on('connection', (socket) => {
  socket.emit('connection', { status: 'connected' })
})

const startServer = (port) => new Promise((resolve, reject) => {
  const server = httpServer.listen(port, () => {
    PORT = port
    console.log(`API running at http://localhost:${PORT}`)
    resolve(server)
  })

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      const nextPort = port + 1
      if (nextPort - DEFAULT_PORT < 10) {
        return startServer(nextPort).then(resolve).catch(reject)
      }
    }

    reject(error)
  })
})

await startServer(DEFAULT_PORT)
