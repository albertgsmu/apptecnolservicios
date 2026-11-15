import dotenv from 'dotenv'
import pg from 'pg'
import { getDashboardOverview } from '../server/dashboard.js'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
let connected = false
try {
  await client.connect(); connected = true
  await client.query('BEGIN READ ONLY')
  const overview = await getDashboardOverview(async (...args) => (await client.query(...args)).rows[0], 'Gerente')
  console.log(JSON.stringify(overview, null, 2))
} finally {
  if (connected) await client.query('ROLLBACK')
  await client.end()
}
