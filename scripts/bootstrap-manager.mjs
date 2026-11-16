import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

dotenv.config({ path: '.env.local' })
dotenv.config()

const target = process.argv.find((argument) => argument.startsWith('--target='))?.split('=')[1]
if (!['postgres', 'sqlite'].includes(target)) {
  throw new Error('Indica el destino explícitamente: --target=postgres o --target=sqlite.')
}

const bootstrapPassword = randomBytes(32).toString('base64url')
const passwordHash = await bcrypt.hash(bootstrapPassword, 12)
const outputPath = path.resolve(process.env.BOOTSTRAP_FILE ?? '.local-secrets/manager-bootstrap.txt')
await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 })

if (target === 'sqlite') {
  const filename = path.resolve(process.env.SQLITE_DB_PATH ?? 'server/data/jp.db')
  const [{ default: sqlite3 }, { open }] = await Promise.all([import('sqlite3'), import('sqlite')])
  const db = await open({ filename, driver: sqlite3.Database })
  try {
    const managers = await db.all("SELECT id, email FROM users WHERE role = 'Gerente'")
    if (managers.length !== 1) {
      throw new Error('El reinicio requiere exactamente una cuenta Gerente.')
    }

    await db.exec('BEGIN IMMEDIATE')
    try {
      await db.run(
        `UPDATE users SET password_hash = ?, must_change_password = 1, mfa_enabled = 0,
          mfa_secret_encrypted = NULL, mfa_pending_secret_encrypted = NULL, mfa_last_counter = -1
         WHERE id = ?`,
        [passwordHash, managers[0].id],
      )
      await db.run('DELETE FROM auth_sessions WHERE user_id = ?', [managers[0].id])
      await db.run('DELETE FROM recovery_codes WHERE user_id = ?', [managers[0].id])
      await db.run(
        'INSERT INTO security_events (id, user_id, event, created_at) VALUES (?, ?, ?, ?)',
        [`event-${randomUUID()}`, managers[0].id, 'manager_bootstrap_reset', new Date().toISOString()],
      )
      await writeFile(outputPath, `Correo: ${managers[0].email}\nContraseña temporal: ${bootstrapPassword}\n`, { mode: 0o600, flag: 'wx' })
      await db.exec('COMMIT')
    } catch (error) {
      await db.exec('ROLLBACK')
      throw error
    }
  } finally {
    await db.close()
  }
} else {
  if (process.env.ALLOW_AUTH_MIGRATION !== 'non-production-branch') {
    throw new Error('PostgreSQL bootstrap bloqueado. Usa únicamente una rama de desarrollo verificada.')
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio para el bootstrap PostgreSQL.')
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    const managers = await client.query("SELECT id, email FROM users WHERE role = 'Gerente' FOR UPDATE")
    if (managers.rowCount !== 1) {
      throw new Error('El reinicio requiere exactamente una cuenta Gerente.')
    }

    const manager = managers.rows[0]
    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = TRUE, mfa_enabled = FALSE,
        mfa_secret_encrypted = NULL, mfa_pending_secret_encrypted = NULL, mfa_last_counter = -1
       WHERE id = $2`,
      [passwordHash, manager.id],
    )
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [manager.id])
    await client.query('DELETE FROM recovery_codes WHERE user_id = $1', [manager.id])
    await client.query(
      'INSERT INTO security_events (id, user_id, event, created_at) VALUES ($1, $2, $3, $4)',
      [`event-${randomUUID()}`, manager.id, 'manager_bootstrap_reset', new Date().toISOString()],
    )
    await writeFile(outputPath, `Correo: ${manager.email}\nContraseña temporal: ${bootstrapPassword}\n`, { mode: 0o600, flag: 'wx' })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

console.log(`Se generó la credencial temporal en: ${outputPath}`)
