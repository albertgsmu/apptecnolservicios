import dotenv from 'dotenv'
import pg from 'pg'
import path from 'node:path'
import { migratePostgresAuthSchema, migrateSqliteAuthSchema } from '../server/migrations/auth-security.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const target = process.argv.find((argument) => argument.startsWith('--target='))?.split('=')[1]
if (!['postgres', 'sqlite'].includes(target)) {
  throw new Error('Indica el destino explícitamente: --target=postgres o --target=sqlite.')
}

if (target === 'sqlite') {
  const [{ default: sqlite3 }, { open }] = await Promise.all([import('sqlite3'), import('sqlite')])
  const filename = path.resolve(process.env.SQLITE_DB_PATH ?? 'server/data/jp.db')
  const db = await open({ filename, driver: sqlite3.Database })
  try {
    await migrateSqliteAuthSchema(db)
  } finally {
    await db.close()
  }
  console.log('Auth security migration applied to the selected SQLite database.')
} else {
  if (process.env.ALLOW_AUTH_MIGRATION !== 'non-production-branch') {
    throw new Error('PostgreSQL migration blocked. Set ALLOW_AUTH_MIGRATION=non-production-branch only for a verified development branch.')
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio para la migración PostgreSQL.')
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    await migratePostgresAuthSchema(client)
  } finally {
    await client.end()
  }
  console.log('Auth security migration applied to the selected PostgreSQL branch.')
}
