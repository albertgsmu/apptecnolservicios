import dotenv from 'dotenv'
import pg from 'pg'
import { assertAuthSchema } from '../server/database-readiness.js'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) {
  console.log('DATABASE_URL no configurada. La API usará SQLite local.')
  process.exit(0)
}
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
try {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
  console.log('Tablas disponibles:', tables.rows.map(row => row.table_name).join(', '))
  const managers = await client.query("SELECT COUNT(*) AS total FROM users WHERE role = 'Gerente'")
  console.log('Cuentas Gerente:', managers.rows[0].total)
  await assertAuthSchema((...args) => client.query(...args))
  console.log('Esquema de autenticación listo.')
  await client.query('COMMIT')
} catch (error) {
  console.error('Comprobación fallida:', error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
