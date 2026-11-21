import bcrypt from 'bcryptjs'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import helmet from 'helmet'
import path from 'node:path'
import { Server } from 'socket.io'
import pg from 'pg'
import QRCode from 'qrcode'
import {
  createCsrfToken,
  createOpaqueToken,
  createOtpAuthUri,
  createRecoveryCode,
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpSecret,
  hashOpaqueToken,
  hashRecoveryCode,
  verifyTotpToken,
} from './auth-security.js'
import { migrateSqliteAuthSchema } from './migrations/auth-security.js'
import { initializeOrders, registerOrders } from './orders.js'
import { assertAuthSchema } from './database-readiness.js'
import { managerMfaRequired } from './auth-policy.js'
import { registerUsers } from './users.js'
import { registerAccountManagement, revokeAccountSockets } from './account-management.js'
import { migrateAccountManagement } from './migrations/account-management.js'
import { migrateDirectMessages, registerDirectMessages } from './direct-messages.js'
import { migrateReportAlerts, registerReportAlerts } from './report-alerts.js'
import { registerWorkConversations } from './work-conversations.js'
import { registerDashboard } from './dashboard.js'
import { activeRoleNames, permissionRoles } from '../shared/access-policy.js'
import { migrateUserAccess } from './migrations/user-access.js'
import { migrateOrderMedia } from './migrations/order-media.js'
import { migrateDatabaseMedia } from './migrations/database-media.js'
import { migrateMediaInstructions } from './migrations/media-instructions.js'
import { migrateOrderSite } from './migrations/order-site.js'
import { migrateFieldWork } from './migrations/field-work.js'
import { registerFieldWork } from './field-work.js'
import { migrateReportNotifications } from './migrations/report-notifications.js'
import { migrateMaterialRequests } from './migrations/material-requests.js'
import { migrateInventory, registerInventory } from './inventory.js'
import { validLocation, workDay } from './worker-photos.js'
import { saveAssessments } from './location-assessments.js'
import { createOrderMediaStorage } from './storage/order-media.js'
import { registerOrderAttachments } from './order-attachments.js'
import { webAllowedOrigins, registerWebHosting } from './web-hosting.js'

dotenv.config({ path: '.env.local' })
dotenv.config()
const MANAGER_MFA_REQUIRED = managerMfaRequired()

const { Pool } = pg

const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use('/api/auth', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  return next()
})
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0)
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS debe ser un entero mayor o igual a cero.')
}
app.set('trust proxy', trustProxyHops)
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST', 'PATCH'],
  },
})
const MFA_ENCRYPTION_KEY = Buffer.from(process.env.MFA_ENCRYPTION_KEY ?? '', 'base64')
if (MFA_ENCRYPTION_KEY.length !== 32) {
  throw new Error('MFA_ENCRYPTION_KEY debe configurarse con una clave aleatoria de 32 bytes codificada en base64.')
}
const DEFAULT_PORT = Number(process.env.PORT ?? 3003)
let PORT = DEFAULT_PORT
const SQLITE_DB_PATH = path.resolve(process.env.SQLITE_DB_PATH ?? 'server/data/jp.db')
let dbMode = 'postgres'
let sqliteDb = null

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
})

const normalizeSqliteQuery = (text) => text.replace(/\$(\d+)/g, '?$1')

const initSqlite = async () => {
  if (sqliteDb) {
    return sqliteDb
  }

  const [{ default: sqlite3 }, { open }] = await Promise.all([import('sqlite3'), import('sqlite')])
  sqliteDb = await open({
    filename: SQLITE_DB_PATH,
    driver: sqlite3.Database,
  })

  dbMode = 'sqlite'
  return sqliteDb
}

const dbQuery = async (text, params = []) => {
  if (dbMode === 'sqlite') {
    const rows = await sqliteDb.all(normalizeSqliteQuery(text), params)
    return rows
  }

  const result = await pool.query(text, params)
  return result.rows
}

const dbGet = async (text, params = []) => {
  if (dbMode === 'sqlite') {
    return sqliteDb.get(normalizeSqliteQuery(text), params) ?? null
  }

  const result = await pool.query(text, params)
  return result.rows[0] ?? null
}

const dbRun = async (text, params = []) => {
  if (dbMode === 'sqlite') {
    return params.length > 0
      ? sqliteDb.run(normalizeSqliteQuery(text), params)
      : sqliteDb.exec(text)
  }

  return pool.query(text, params)
}

const ensureDatabase = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio en producción. Configura la conexión de Neon en el hosting.')
  if (process.env.DATABASE_URL) {
    await pool.query('SELECT 1')
    await assertAuthSchema((...args) => pool.query(...args))
  } else {
    await initSqlite()
    console.warn('DATABASE_URL no está configurado; usando la base SQLite local.')
  }

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "area" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "shift" TEXT NOT NULL,
      "score" INTEGER NOT NULL DEFAULT 0,
      "lastEntry" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applicants (
      "id" TEXT PRIMARY KEY,
      "fullName" TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      "birthDate" TEXT NOT NULL,
      gender TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      "identityNumber" TEXT NOT NULL,
      education TEXT NOT NULL,
      area TEXT NOT NULL,
      experience TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      availability TEXT NOT NULL,
      "emergencyContact" TEXT NOT NULL,
      "emergencyPhone" TEXT NOT NULL,
      documents TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  if (dbMode === 'sqlite') {
    await migrateSqliteAuthSchema(sqliteDb)
  }
  await initializeOrders(dbRun)
  await migrateUserAccess(dbRun)
  await migrateOrderMedia(dbRun)
  await migrateDatabaseMedia({ dbRun, dbQuery, dbMode })
  await migrateMediaInstructions({ dbRun, dbQuery, dbMode })
  await migrateOrderSite({ dbRun, dbQuery, dbMode })
  await migrateFieldWork(dbRun)
  await migrateReportNotifications(dbRun)
  await migrateMaterialRequests({ dbRun, dbQuery, dbMode })
  await migrateInventory(dbRun)
  await migrateDirectMessages(dbRun)
  await migrateReportAlerts(dbRun)
  await migrateAccountManagement({ dbRun, dbQuery, dbGet, dbMode })

  const count = await dbGet('SELECT COUNT(*) AS total FROM users')
  if (Number(count.total) === 0) {
    const { INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_NAME } = process.env
    if (INITIAL_ADMIN_EMAIL && INITIAL_ADMIN_PASSWORD && INITIAL_ADMIN_NAME) {
      const passwordHash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 12)
      await dbRun(
        `INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [`user-${randomUUID()}`, INITIAL_ADMIN_EMAIL.trim().toLowerCase(), passwordHash, INITIAL_ADMIN_NAME.trim(), 'Gerente', new Date().toISOString()],
      )
    } else {
      console.warn('No hay cuentas de usuario. Configure INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD e INITIAL_ADMIN_NAME para crear el primer Gerente.')
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
  version: row.record_version,
  name: row.name,
  area: row.area,
  title: row.title,
  status: row.status,
  shift: row.shift,
  score: Number(row.score ?? 0),
  lastEntry: row.lastEntry,
})

const SESSION_COOKIE = 'jp_session'
const CSRF_COOKIE = 'jp_csrf'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const PENDING_SESSION_TTL_MS = 15 * 60 * 1000
const MFA_SESSION_TTL_MS = 5 * 60 * 1000

const readCookie = (header, name) => {
  const entry = String(header ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return entry ? entry.slice(name.length + 1) : null
}

const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false
  }
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const cookieOptions = (httpOnly, maxAge) => ({
  httpOnly,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge,
})

const setSessionCookies = (res, sessionToken, csrfToken, maxAge) => {
  res.cookie(SESSION_COOKIE, sessionToken, cookieOptions(true, maxAge))
  res.cookie(CSRF_COOKIE, csrfToken, cookieOptions(false, maxAge))
}

const clearSessionCookies = (res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions(true))
  res.clearCookie(CSRF_COOKIE, cookieOptions(false))
}

const issueSession = async (res, userId, status, ttlMs, passwordOnly = false, accountVersion) => {
  const sessionToken = `${passwordOnly ? 'test-' : ''}${createOpaqueToken()}`
  const csrfToken = createCsrfToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)
  await dbRun('DELETE FROM auth_sessions WHERE expires_at <= $1', [now.toISOString()])
  const inserted = await dbRun(
    'INSERT INTO auth_sessions (token_hash, user_id, csrf_hash, status, expires_at, created_at, last_seen_at, account_version) SELECT $1, id, $3, $4, $5, $6, $7, account_version FROM users WHERE id=$2 AND account_version=$8 AND access_blocked=FALSE AND archived_at IS NULL',
    [hashOpaqueToken(sessionToken), userId, hashOpaqueToken(csrfToken), status, expiresAt.toISOString(), now.toISOString(), now.toISOString(), accountVersion],
  )
  if ((inserted.rowCount ?? inserted.changes) !== 1) throw Object.assign(new Error('Account changed'), { code: 'SESSION_ACCOUNT_CHANGED' })
  setSessionCookies(res, sessionToken, csrfToken, ttlMs)
}

const createSessionCredentials = (userId, status, ttlMs, accountVersion) => {
  const sessionToken = createOpaqueToken()
  const csrfToken = createCsrfToken()
  const now = new Date()
  return {
    sessionToken,
    csrfToken,
    tokenHash: hashOpaqueToken(sessionToken),
    csrfHash: hashOpaqueToken(csrfToken),
    userId,
    accountVersion,
    status,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    createdAt: now.toISOString(),
    ttlMs,
  }
}

const insertSessionCredentials = async (tx, credentials) => {
  const inserted = await tx.run(
    `INSERT INTO auth_sessions (token_hash, user_id, csrf_hash, status, expires_at, created_at, last_seen_at, account_version)
     SELECT $1, id, $3, $4, $5, $6, $6, account_version FROM users WHERE id=$2 AND account_version=$7 AND access_blocked=FALSE AND archived_at IS NULL`,
    [
      credentials.tokenHash,
      credentials.userId,
      credentials.csrfHash,
      credentials.status,
      credentials.expiresAt,
      credentials.createdAt,
      credentials.accountVersion,
    ],
  )
  if ((inserted.rowCount ?? inserted.changes) !== 1) throw Object.assign(new Error('Account changed'), { code: 'SESSION_ACCOUNT_CHANGED' })
}

const sessionRequired = (...allowedStatuses) => async (req, res, next) => {
  const sessionToken = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (!sessionToken) {
    return res.status(401).json({ message: 'Sesión no válida o expirada.' })
  }
  if (MANAGER_MFA_REQUIRED && sessionToken.startsWith('test-')) {
    return res.status(401).json({ message: 'Inicia sesión nuevamente para verificar el autenticador.' })
  }

  try {
    const session = await dbGet(
      `SELECT s.token_hash, s.csrf_hash, s.status, s.expires_at, u.account_version,
              u.id, u.email, u.name, u.role, u.must_change_password,
              u.mfa_enabled, u.mfa_secret_encrypted, u.mfa_pending_secret_encrypted,
              u.mfa_last_counter
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2 AND s.account_version=u.account_version AND u.access_blocked=FALSE AND u.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM user_employees ue JOIN employees e ON e.id=ue.employee_id WHERE ue.user_id=u.id AND e.status='Inactivo')`,
      [hashOpaqueToken(sessionToken), new Date().toISOString()],
    )
    if (!session || !allowedStatuses.includes(session.status)) {
      return res.status(401).json({ message: 'Sesión no válida o expirada.' })
    }
    if (!activeRoleNames.includes(session.role)) {
      return res.status(403).json({ message: 'Este perfil ya no está habilitado. Contacta al Gerente para revisar tu cuenta.' })
    }

    if (session.status === 'authenticated') {
      if (session.role === 'Trabajador' && !await dbGet("SELECT id FROM worker_check_ins WHERE user_id=$1 AND session_key=$2 AND kind='login' AND location_status='captured'", [session.id, createHash('sha256').update(session.token_hash).digest('hex')])) {
        return res.status(403).json({ message: 'Debes iniciar sesión y registrar una ubicación válida para acceder.' })
      }
      if (session.must_change_password) {
        return res.status(403).json({ message: 'Debes cambiar la contraseña antes de continuar.' })
      }
      if (MANAGER_MFA_REQUIRED && session.role === 'Gerente' && !session.mfa_enabled) {
        return res.status(403).json({ message: 'Debes activar la autenticación en dos pasos antes de continuar.' })
      }
    }

    req.authSession = session
    req.user = {
      id: session.id,
      email: session.email,
      name: session.name,
      role: session.role,
      mustChangePassword: Boolean(session.must_change_password),
      mfaEnabled: Boolean(session.mfa_enabled),
    }
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return csrfRequired(req, res, next)
    }
    return next()
  } catch (error) {
    return next(error)
  }
}

const authRequired = sessionRequired('authenticated')
const pendingSessionRequired = sessionRequired('pending')
const mfaSessionRequired = sessionRequired('mfa_pending')
const anySessionRequired = sessionRequired('pending', 'mfa_pending', 'authenticated')

const csrfRequired = (req, res, next) => {
  const headerToken = req.get('x-csrf-token')
  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE)
  if (
    typeof headerToken !== 'string' ||
    !cookieToken ||
    !safeEqual(headerToken, cookieToken) ||
    !safeEqual(hashOpaqueToken(headerToken), req.authSession?.csrf_hash)
  ) {
    return res.status(403).json({ message: 'La verificación de seguridad falló. Recarga e inténtalo de nuevo.' })
  }
  return next()
}

const requireManager = (req, res, next) => {
  if (req.user?.role !== 'Gerente') {
    return res.status(403).json({ message: 'No tienes permisos para realizar esta acción.' })
  }
  return next()
}

const requireChangedPassword = (req, res, next) => {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ message: 'Debes cambiar la contraseña antes de continuar.' })
  }
  return next()
}

const publicUser = (user) => ({
  email: user.email,
  role: user.role,
  name: user.name,
})

const logSecurityEvent = async (userId, event) => {
  await dbRun(
    'INSERT INTO security_events (id, user_id, event, created_at) VALUES ($1, $2, $3, $4)',
    [`event-${randomUUID()}`, userId ?? null, event, new Date().toISOString()],
  )
}

let sqliteTransactions = Promise.resolve()
const withTransaction = async (callback) => {
  if (dbMode === 'sqlite') {
    const previous = sqliteTransactions
    let release
    sqliteTransactions = new Promise(resolve => { release = resolve })
    await previous
    try {
      await dbRun('BEGIN IMMEDIATE')
      try {
        const result = await callback({ get: dbGet, run: dbRun })
        await dbRun('COMMIT')
        return result
      } catch (error) { await dbRun('ROLLBACK'); throw error }
    } finally { release() }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tx = {
      get: async (query, params) => (await client.query(query, params)).rows[0] ?? null,
      run: (query, params) => client.query(query, params),
    }
    const result = await callback(tx)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const changedRows = (result) => dbMode === 'sqlite' ? result.changes : result.rowCount

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: 'No tienes permisos para realizar esta acción.' })
  }

  return next()
}

const employeeReadRoles = permissionRoles.readEmployees
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 10
const LOGIN_MAX_BACKOFF_MS = 30 * 1000
let loginFailuresSinceCleanup = 0

const getClientKey = (req) => createHmac('sha256', MFA_ENCRYPTION_KEY)
  .update(req.ip ?? req.socket.remoteAddress ?? 'unknown')
  .digest('hex')

const getLoginWaitSeconds = async (ipHash) => {
  const attempt = await dbGet('SELECT window_started_at, locked_until FROM login_attempts WHERE ip_hash = $1', [ipHash])
  if (!attempt) {
    return 0
  }
  const now = Date.now()
  if (now - Date.parse(attempt.window_started_at) >= LOGIN_WINDOW_MS) {
    await dbRun('DELETE FROM login_attempts WHERE ip_hash = $1', [ipHash])
    return 0
  }
  return Math.max(0, Math.ceil((Date.parse(attempt.locked_until) - now) / 1000))
}

const pruneLoginAttempts = async () => {
  loginFailuresSinceCleanup += 1
  if (loginFailuresSinceCleanup < 100) {
    return
  }
  loginFailuresSinceCleanup = 0
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString()
  await dbRun('DELETE FROM login_attempts WHERE window_started_at <= $1', [cutoff])
}

const loginRateLimit = async (req, res, next) => {
  try {
    const retryAfterSeconds = await getLoginWaitSeconds(getClientKey(req))
    if (retryAfterSeconds > 0) {
      res.set('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({
        message: `Demasiados intentos. Espera ${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'segundo' : 'segundos'} antes de volver a intentarlo.`,
        retryAfterSeconds,
      })
    }
    return next()
  } catch (error) {
    return next(error)
  }
}

const recordLoginFailure = async (req) => {
  const ipHash = getClientKey(req)
  const now = Date.now()
  let failureCount = 1
  let windowStartedAt = now

  if (dbMode === 'sqlite') {
    await dbRun('BEGIN IMMEDIATE')
    try {
      const current = await dbGet('SELECT failure_count, window_started_at FROM login_attempts WHERE ip_hash = $1', [ipHash])
      if (current && now - Date.parse(current.window_started_at) < LOGIN_WINDOW_MS) {
        failureCount = Number(current.failure_count) + 1
        windowStartedAt = Date.parse(current.window_started_at)
      }
      const lockedUntil = failureCount >= LOGIN_MAX_ATTEMPTS
        ? windowStartedAt + LOGIN_WINDOW_MS
        : now + Math.min(LOGIN_MAX_BACKOFF_MS, 1000 * (2 ** (failureCount - 1)))
      await dbRun(
        `INSERT INTO login_attempts (ip_hash, failure_count, window_started_at, locked_until)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(ip_hash) DO UPDATE SET failure_count = excluded.failure_count,
           window_started_at = excluded.window_started_at, locked_until = excluded.locked_until`,
        [ipHash, failureCount, new Date(windowStartedAt).toISOString(), new Date(lockedUntil).toISOString()],
      )
      await dbRun('COMMIT')
      await pruneLoginAttempts()
      return Math.max(1, Math.ceil((lockedUntil - now) / 1000))
    } catch (error) {
      await dbRun('ROLLBACK')
      throw error
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ipHash])
    const result = await client.query(
      'SELECT failure_count, window_started_at FROM login_attempts WHERE ip_hash = $1 FOR UPDATE',
      [ipHash],
    )
    const current = result.rows[0]
    if (current && now - Date.parse(current.window_started_at) < LOGIN_WINDOW_MS) {
      failureCount = Number(current.failure_count) + 1
      windowStartedAt = Date.parse(current.window_started_at)
    }
    const lockedUntil = failureCount >= LOGIN_MAX_ATTEMPTS
      ? windowStartedAt + LOGIN_WINDOW_MS
      : now + Math.min(LOGIN_MAX_BACKOFF_MS, 1000 * (2 ** (failureCount - 1)))
    await client.query(
      `INSERT INTO login_attempts (ip_hash, failure_count, window_started_at, locked_until)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ip_hash) DO UPDATE SET failure_count = EXCLUDED.failure_count,
         window_started_at = EXCLUDED.window_started_at, locked_until = EXCLUDED.locked_until`,
      [ipHash, failureCount, new Date(windowStartedAt).toISOString(), new Date(lockedUntil).toISOString()],
    )
    await client.query('COMMIT')
    await pruneLoginAttempts()
    return Math.max(1, Math.ceil((lockedUntil - now) / 1000))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const resetLoginAttempts = (req) => dbRun('DELETE FROM login_attempts WHERE ip_hash = $1', [getClientKey(req)])

const createApplicantId = async () => {
  const row = await dbGet("SELECT COALESCE(MAX(CAST(REPLACE(\"id\", 'SOL-', '') AS INTEGER)), 100) AS \"maxId\" FROM applicants")
  const next = Number(row?.maxId ?? 100) + 1
  return `SOL-${String(next).padStart(4, '0')}`
}

const allowedOrigins = webAllowedOrigins()

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true
  }

  return allowedOrigins.includes(origin)
}

app.use(cors({
  origin: (origin, callback) => {
    return callback(null, isAllowedOrigin(origin))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
}))
app.use((req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin')
    if (!origin || !isAllowedOrigin(origin)) {
      return res.status(403).json({ message: 'Origen no autorizado.' })
    }
  }
  return next()
})
app.use(express.json({ limit: '32kb' }))

try {
  await ensureDatabase()
} catch (error) {
  console.error('No se pudo iniciar la API:', error instanceof Error ? error.message : 'Error de base de datos.')
  await pool.end()
  process.exit(1)
}

const DUMMY_PASSWORD_HASH = await bcrypt.hash(randomUUID(), 12)

registerUsers(app, { dbQuery, authRequired, allowRoles, asyncRoute, withTransaction })
registerAccountManagement(app, { authRequired, allowRoles, asyncRoute, dbQuery, withTransaction, io })
registerDirectMessages(app, { dbQuery, dbGet, authRequired, allowRoles, asyncRoute, withTransaction, io })
registerReportAlerts(app, { dbQuery, dbGet, authRequired, allowRoles, asyncRoute, withTransaction, io })
registerWorkConversations(app, { dbQuery, dbGet, authRequired, allowRoles, asyncRoute, withTransaction })

const mediaStorage = createOrderMediaStorage()
await mediaStorage.importLegacy({ dbQuery, dbGet, dbRun })
registerOrders(app, { dbRun, dbGet, dbQuery, authRequired, allowRoles, asyncRoute, withTransaction, mediaStorage })
registerOrderAttachments(app, { dbGet, authRequired, allowRoles, asyncRoute, mediaStorage })

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'jp-mantenimiento-api',
    authProtocol: 'session-mfa-v1',
    managerMfaRequired: MANAGER_MFA_REQUIRED,
    port: PORT,
    database: dbMode,
    fallback: dbMode === 'sqlite',
    timestamp: new Date().toISOString(),
  })
})

app.post('/api/auth/login', loginRateLimit, asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {}
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const validInput = normalizedEmail.length > 0 &&
    normalizedEmail.length <= 254 &&
    typeof password === 'string' &&
    password.length > 0 &&
    Buffer.byteLength(password, 'utf8') <= 72

  const user = validInput
    ? await dbGet(
      'SELECT id, email, name, role, password_hash, must_change_password, mfa_enabled, account_version, access_blocked, archived_at FROM users WHERE lower(email) = $1',
      [normalizedEmail],
    )
    : null
  const validPassword = await bcrypt.compare(
    validInput ? password : '',
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  )

  if (!user || !validPassword || user.access_blocked || user.archived_at) {
    const retryAfterSeconds = await recordLoginFailure(req)
    res.set('Retry-After', String(retryAfterSeconds))
    return res.status(401).json({
      message: `Correo o contraseña incorrectos. Intenta de nuevo en ${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'segundo' : 'segundos'}.`,
      retryAfterSeconds,
    })
  }

  await resetLoginAttempts(req)
  if (!activeRoleNames.includes(user.role)) {
    return res.status(403).json({ message: 'Este perfil ya no está habilitado. Contacta al Gerente para revisar tu cuenta.' })
  }
  if (user.must_change_password || (user.role === 'Gerente' && MANAGER_MFA_REQUIRED)) {
    const mustChangePassword = Boolean(user.must_change_password)
    const mfaEnabled = Boolean(user.mfa_enabled)
    const status = !mustChangePassword && mfaEnabled ? 'mfa_pending' : 'pending'
    const nextStep = mustChangePassword ? 'change-password' : mfaEnabled ? 'verify-mfa' : 'enroll-mfa'
    const ttlMs = mfaEnabled ? MFA_SESSION_TTL_MS : PENDING_SESSION_TTL_MS
    await issueSession(res, user.id, status, ttlMs, false, user.account_version)
    await logSecurityEvent(user.id, 'manager_password_verified')
    return res.json({ user: publicUser(user), nextStep })
  }

  if (user.role === 'Trabajador') {
    const dayStart = `${workDay()}T05:00:00.000Z`
    const dayEnd = new Date(Date.parse(dayStart) + 86400000).toISOString()
    const registeredToday = await dbGet("SELECT id FROM worker_check_ins WHERE user_id=$1 AND kind='login' AND location_status='captured' AND created_at >= $2 AND created_at < $3 LIMIT 1", [user.id, dayStart, dayEnd])
    await issueSession(res, user.id, 'pending', PENDING_SESSION_TTL_MS, false, user.account_version)
    return res.json({ user: publicUser(user), nextStep: 'location-required', locationNoticeRequired: !registeredToday })
  }
  await issueSession(res, user.id, 'authenticated', SESSION_TTL_MS, user.role === 'Gerente' && !MANAGER_MFA_REQUIRED, user.account_version)
  await logSecurityEvent(user.id, 'login_succeeded')
  return res.json({ user: publicUser(user), nextStep: 'authenticated' })
}))

app.post('/api/auth/worker-location', pendingSessionRequired, allowRoles('Trabajador'), requireChangedPassword, asyncRoute(async (req, res) => {
  const location = req.body?.location
  if (!validLocation(location)) return res.status(400).json({ message: 'No puedes entrar sin una ubicación actual válida. Activa el permiso y vuelve a intentar.' })
  const employee = await dbGet("SELECT e.id FROM employees e JOIN user_employees ue ON ue.employee_id=e.id WHERE ue.user_id=$1 AND e.status='Activo'", [req.user.id])
  if (!employee) return res.status(403).json({ message: 'Tu cuenta no está vinculada a un trabajador activo. Contacta al Gerente.' })
  const orders = await dbQuery("SELECT id,client,site_details FROM work_orders WHERE assigned_to=$1 AND status <> 'Cerrada'", [employee.id])
  const credentials = createSessionCredentials(req.user.id, 'authenticated', SESSION_TTL_MS, req.authSession.account_version)
  const now = new Date().toISOString(), id = randomUUID()
  const promoted = await withTransaction(async tx => {
    const removed = await tx.run("DELETE FROM auth_sessions WHERE token_hash=$1 AND status='pending' AND expires_at > $2", [req.authSession.token_hash, now])
    if ((removed.rowCount ?? removed.changes) !== 1) return false
    await insertSessionCredentials(tx, credentials)
    await tx.run(`INSERT INTO worker_check_ins (id,user_id,employee_id,kind,location_status,latitude,longitude,accuracy,captured_at,notes,created_at,session_key)
      VALUES ($1,$2,$3,'login','captured',$4,$5,$6,$7,'',$8,$9)`, [id, req.user.id, employee.id, location.latitude, location.longitude, location.accuracy, location.capturedAt, now, createHash('sha256').update(credentials.tokenHash).digest('hex')])
    await saveAssessments(tx, id, location, orders)
    await tx.run('INSERT INTO security_events (id,user_id,event,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), req.user.id, 'worker_login_with_location', now])
    return true
  })
  if (!promoted) return res.status(401).json({ message: 'La sesión venció. Ingresa tus credenciales nuevamente.' })
  setSessionCookies(res, credentials.sessionToken, credentials.csrfToken, SESSION_TTL_MS)
  return res.json({ user: publicUser(req.user), nextStep: 'authenticated' })
}))

app.post('/api/auth/change-password', pendingSessionRequired, asyncRoute(async (req, res) => {
  const { password, confirmPassword } = req.body ?? {}
  if (
    typeof password !== 'string' ||
    password.length < 15 ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    password !== confirmPassword
  ) {
    return res.status(400).json({ message: 'Usa una contraseña nueva de al menos 15 caracteres y confirma que coincida.' })
  }

  const current = await dbGet('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
  if (!current || await bcrypt.compare(password, current.password_hash)) {
    return res.status(400).json({ message: 'La nueva contraseña debe ser diferente a la actual.' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await withTransaction(async tx => {
    const changed = await tx.run('UPDATE users SET password_hash=$1,must_change_password=FALSE,account_version=account_version+1 WHERE id=$2 AND account_version=$3 AND access_blocked=FALSE AND archived_at IS NULL', [passwordHash, req.user.id, req.authSession.account_version])
    if ((changed.rowCount ?? changed.changes) !== 1) throw Object.assign(new Error('Account changed'), { code: 'SESSION_ACCOUNT_CHANGED' })
    await tx.run('DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash <> $2', [req.user.id, req.authSession.token_hash])
    await tx.run('UPDATE auth_sessions SET account_version=$1,status=$2 WHERE token_hash=$3', [req.authSession.account_version + 1, req.user.role === 'Gerente' && MANAGER_MFA_REQUIRED && req.user.mfaEnabled ? 'mfa_pending' : 'pending', req.authSession.token_hash])
  })
  revokeAccountSockets(io, req.user.id)
  await logSecurityEvent(req.user.id, 'password_changed')
  if (req.user.role === 'Gerente' && MANAGER_MFA_REQUIRED) return res.json({ nextStep: req.user.mfaEnabled ? 'verify-mfa' : 'enroll-mfa' })
  await dbRun('DELETE FROM auth_sessions WHERE token_hash=$1', [req.authSession.token_hash])
  const worker = req.user.role === 'Trabajador'
  await issueSession(res, req.user.id, worker ? 'pending' : 'authenticated', worker ? PENDING_SESSION_TTL_MS : SESSION_TTL_MS, req.user.role === 'Gerente', req.authSession.account_version + 1)
  return res.json({ user: publicUser(req.user), nextStep: worker ? 'location-required' : 'authenticated' })
}))

app.post('/api/auth/mfa/setup', pendingSessionRequired, requireManager, requireChangedPassword, asyncRoute(async (req, res) => {
  const user = await dbGet('SELECT email, mfa_enabled FROM users WHERE id = $1', [req.user.id])
  if (!user || user.mfa_enabled) {
    return res.status(409).json({ message: 'La autenticación en dos pasos ya está configurada.' })
  }

  const secret = generateTotpSecret()
  await dbRun(
    'UPDATE users SET mfa_pending_secret_encrypted = $1 WHERE id = $2 AND mfa_enabled = FALSE',
    [encryptMfaSecret(secret), req.user.id],
  )
  const qrCodeDataUrl = await QRCode.toDataURL(createOtpAuthUri(user.email, secret))
  return res.json({ qrCodeDataUrl, manualEntryKey: secret })
}))

app.post('/api/auth/mfa/enable', loginRateLimit, pendingSessionRequired, requireManager, requireChangedPassword, asyncRoute(async (req, res) => {
  const { code } = req.body ?? {}
  const user = await dbGet(
    'SELECT mfa_pending_secret_encrypted, mfa_last_counter, mfa_enabled FROM users WHERE id = $1',
    [req.user.id],
  )
  if (!user?.mfa_pending_secret_encrypted || user.mfa_enabled) {
    return res.status(409).json({ message: 'Inicia la configuración de la aplicación autenticadora nuevamente.' })
  }

  const secret = decryptMfaSecret(user.mfa_pending_secret_encrypted)
  const counter = verifyTotpToken(secret, code, Number(user.mfa_last_counter))
  if (counter === null) {
    const retryAfterSeconds = await recordLoginFailure(req)
    res.set('Retry-After', String(retryAfterSeconds))
    return res.status(401).json({ message: 'El código no es válido. Revisa la hora del dispositivo e inténtalo otra vez.' })
  }

  const recoveryCodes = Array.from({ length: 10 }, createRecoveryCode)
  const credentials = createSessionCredentials(req.user.id, 'authenticated', SESSION_TTL_MS, req.authSession.account_version)
  const promoted = await withTransaction(async (tx) => {
    const update = await tx.run(
      `UPDATE users SET mfa_enabled = TRUE, mfa_secret_encrypted = mfa_pending_secret_encrypted,
         mfa_pending_secret_encrypted = NULL, mfa_last_counter = $1
       WHERE id = $2 AND mfa_enabled = FALSE AND mfa_pending_secret_encrypted = $3
         AND mfa_last_counter < $1`,
      [counter, req.user.id, user.mfa_pending_secret_encrypted],
    )
    if (changedRows(update) !== 1) {
      return false
    }

    for (const recoveryCode of recoveryCodes) {
      await tx.run(
        'INSERT INTO recovery_codes (id, user_id, code_hash, created_at) VALUES ($1, $2, $3, $4)',
        [`recovery-${randomUUID()}`, req.user.id, hashRecoveryCode(recoveryCode), new Date().toISOString()],
      )
    }
    await tx.run('DELETE FROM auth_sessions WHERE token_hash = $1', [req.authSession.token_hash])
    await insertSessionCredentials(tx, credentials)
    return true
  })

  if (!promoted) {
    return res.status(409).json({ message: 'El código ya fue utilizado. Genera uno nuevo e inténtalo otra vez.' })
  }

  await resetLoginAttempts(req)
  setSessionCookies(res, credentials.sessionToken, credentials.csrfToken, SESSION_TTL_MS)
  await logSecurityEvent(req.user.id, 'mfa_enabled')
  return res.json({ user: publicUser(req.user), recoveryCodes })
}))

app.post('/api/auth/mfa/verify', loginRateLimit, mfaSessionRequired, csrfRequired, asyncRoute(async (req, res) => {
  const { code, recoveryCode } = req.body ?? {}
  const hasTotp = typeof code === 'string'
  const hasRecoveryCode = typeof recoveryCode === 'string'
  if (hasTotp === hasRecoveryCode) {
    return res.status(400).json({ message: 'Ingresa un código de autenticación o un código de recuperación.' })
  }

  let validCounter = null
  let recoveryEntry = null
  if (hasTotp && req.authSession.mfa_secret_encrypted) {
    const secret = decryptMfaSecret(req.authSession.mfa_secret_encrypted)
    validCounter = verifyTotpToken(secret, code, Number(req.authSession.mfa_last_counter))
  } else if (hasRecoveryCode) {
    recoveryEntry = await dbGet(
      'SELECT id FROM recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL',
      [req.user.id, hashRecoveryCode(recoveryCode)],
    )
  }

  const credentials = createSessionCredentials(req.user.id, 'authenticated', SESSION_TTL_MS, req.authSession.account_version)
  const verified = await withTransaction(async (tx) => {
    if (validCounter !== null) {
      const update = await tx.run(
        'UPDATE users SET mfa_last_counter = $1 WHERE id = $2 AND mfa_last_counter < $1',
        [validCounter, req.user.id],
      )
      if (changedRows(update) !== 1) {
        return false
      }
    } else if (recoveryEntry) {
      const update = await tx.run(
        'UPDATE recovery_codes SET used_at = $1 WHERE id = $2 AND used_at IS NULL',
        [new Date().toISOString(), recoveryEntry.id],
      )
      if (changedRows(update) !== 1) {
        return false
      }
    } else {
      return false
    }

    const sessionUpdate = await tx.run(
      'DELETE FROM auth_sessions WHERE token_hash = $1 AND status = $2',
      [req.authSession.token_hash, 'mfa_pending'],
    )
    if (changedRows(sessionUpdate) !== 1) {
      return false
    }
    await insertSessionCredentials(tx, credentials)
    return true
  })

  if (!verified) {
    const retryAfterSeconds = await recordLoginFailure(req)
    res.set('Retry-After', String(retryAfterSeconds))
    return res.status(401).json({ message: 'El código no es válido o ya fue utilizado.' })
  }

  await resetLoginAttempts(req)
  setSessionCookies(res, credentials.sessionToken, credentials.csrfToken, SESSION_TTL_MS)
  await logSecurityEvent(req.user.id, hasRecoveryCode ? 'recovery_code_used' : 'mfa_login_succeeded')
  return res.json({ user: publicUser(req.user), nextStep: 'authenticated' })
}))

app.post('/api/auth/logout', anySessionRequired, asyncRoute(async (req, res) => {
  await dbRun('DELETE FROM auth_sessions WHERE token_hash = $1', [req.authSession.token_hash])
  io.in(`user:${req.user.id}`).disconnectSockets(true)
  await logSecurityEvent(req.user.id, 'logout')
  clearSessionCookies(res)
  return res.status(204).end()
}))

app.get('/api/auth/me', authRequired, (req, res) => {
  return res.json({ user: publicUser(req.user) })
})

app.get('/api/auth/csrf', anySessionRequired, (req, res) => {
  const csrfToken = readCookie(req.headers.cookie, CSRF_COOKIE)
  if (!csrfToken || !safeEqual(hashOpaqueToken(csrfToken), req.authSession.csrf_hash)) {
    return res.status(403).json({ message: 'Token CSRF no válido. Inicia sesión nuevamente.' })
  }
  return res.json({ csrfToken })
})

app.get('/api/employees', authRequired, allowRoles(...employeeReadRoles), asyncRoute(async (_req, res) => {
  const rows = await dbQuery('SELECT * FROM employees ORDER BY "createdAt" DESC')
  return res.json(rows.map(parseEmployee))
}))

app.patch('/api/employees/:id/status', authRequired, allowRoles(...permissionRoles.manageEmployees), asyncRoute(async (req, res) => {
  const { status } = req.body ?? {}
  const validStatuses = ['Activo', 'Vacaciones', 'Licencia', 'Inactivo']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' })
  }

  const employee = await dbGet('SELECT * FROM employees WHERE id = $1', [req.params.id])
  if (!employee) {
    return res.status(404).json({ message: 'Empleado no encontrado.' })
  }

  let accountId
  await withTransaction(async tx => {
    await tx.run('UPDATE employees SET status=$1,record_version=record_version+1,"updatedAt"=$2 WHERE id=$3', [status, new Date().toISOString(), req.params.id])
    if (status === 'Inactivo') {
      const linked = await tx.get('SELECT user_id FROM user_employees WHERE employee_id=$1', [req.params.id])
      accountId = linked?.user_id
      if (accountId) {
        await tx.run('UPDATE users SET access_blocked=TRUE,account_version=account_version+1 WHERE id=$1', [accountId])
        await tx.run('DELETE FROM auth_sessions WHERE user_id=$1', [accountId])
      }
    }
  })
  if (accountId) revokeAccountSockets(io, accountId)
  const employees = await dbQuery('SELECT * FROM employees ORDER BY "createdAt" DESC')
  io.to('employees:read').emit('employees:updated', employees.map(parseEmployee))
  return res.json(parseEmployee(await dbGet('SELECT * FROM employees WHERE id=$1', [req.params.id])))
}))

app.get('/api/applicants', authRequired, allowRoles(...permissionRoles.readApplicants), asyncRoute(async (_req, res) => {
  const rows = await dbQuery('SELECT * FROM applicants ORDER BY "createdAt" DESC')
  return res.json(rows.map(parseApplicant))
}))

app.post('/api/applicants', authRequired, allowRoles(...permissionRoles.readApplicants), asyncRoute(async (req, res) => {
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

  await dbRun(
    `INSERT INTO applicants ("id", "fullName", email, phone, "birthDate", gender, address, city, "identityNumber", education, area, experience, skills, availability, "emergencyContact", "emergencyPhone", documents, status, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
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
}))

app.patch('/api/applicants/:id/status', authRequired, allowRoles(...permissionRoles.decideApplicants), asyncRoute(async (req, res) => {
  const { status } = req.body ?? {}
  const validStatuses = ['Pendiente', 'Aprobado', 'Rechazado']

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' })
  }

  const applicant = await dbGet('SELECT * FROM applicants WHERE id = $1', [req.params.id])
  if (!applicant) {
    return res.status(404).json({ message: 'Solicitante no encontrado.' })
  }

  const updated = {
    ...parseApplicant(applicant),
    status,
  }

  await dbRun('UPDATE applicants SET status = $1 WHERE id = $2', [status, req.params.id])
  return res.json(updated)
}))

registerDashboard(app, { authRequired, allowRoles, asyncRoute, dbGet })
registerFieldWork(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction, io })
registerInventory(app, { authRequired, allowRoles, asyncRoute, dbGet, dbQuery, withTransaction })
await registerWebHosting(app)

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }
  if (error.code === 'SESSION_ACCOUNT_CHANGED') return res.status(401).json({ message: 'La cuenta cambi\u00f3. Inicia sesi\u00f3n de nuevo.' })
  console.error('API request failed:', error instanceof Error ? error.message : 'error desconocido')
  return res.status(500).json({ message: 'No se pudo completar la solicitud.' })
})

io.use(async (socket, next) => {
  const sessionToken = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE)
  if (!sessionToken) {
    return next(new Error('Autenticación requerida'))
  }
  if (MANAGER_MFA_REQUIRED && sessionToken.startsWith('test-')) {
    return next(new Error('Verifica el autenticador nuevamente'))
  }

  try {
    const session = await dbGet(
      `SELECT s.status, u.id, u.email, u.name, u.role, u.mfa_enabled, u.must_change_password
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2 AND s.account_version=u.account_version AND u.access_blocked=FALSE AND u.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM user_employees ue JOIN employees e ON e.id=ue.employee_id WHERE ue.user_id=u.id AND e.status='Inactivo')`,
      [hashOpaqueToken(sessionToken), new Date().toISOString()],
    )
    if (
      !session ||
      !activeRoleNames.includes(session.role) ||
      session.status !== 'authenticated' ||
      session.must_change_password ||
      (MANAGER_MFA_REQUIRED && session.role === 'Gerente' && !session.mfa_enabled)
    ) {
      return next(new Error('Sesión no válida'))
    }

    socket.data.user = session
    return next()
  } catch (error) {
    console.error('No se pudo validar la sesión de Socket.IO:', error instanceof Error ? error.message : 'error desconocido')
    return next(new Error('Sesión no válida'))
  }
})

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.user.id}`)
  if (permissionRoles.reviewFieldReports.includes(socket.data.user.role)) socket.join('reports:review')
  if (employeeReadRoles.includes(socket.data.user.role)) {
    socket.join('employees:read')
  }
  socket.emit('connection', { status: 'connected' })
})

const startServer = (port) => new Promise((resolve, reject) => {
  const server = httpServer.listen(port, () => {
    PORT = port
    console.log(`API running at http://localhost:${PORT}`)
    resolve(server)
  })

  server.on('error', reject)
})

await startServer(DEFAULT_PORT)
