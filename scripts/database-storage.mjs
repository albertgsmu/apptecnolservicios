import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
try {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  const usage = (await client.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
    current_setting('neon.max_cluster_size', true) AS cluster_limit`)).rows[0]
  const exists = (await client.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order_attachments' AND column_name='content') AS ready")).rows[0].ready
  const media = exists ? (await client.query(`SELECT count(*)::int AS files,
    count(*) FILTER (WHERE content IS NULL)::int AS files_pending_import,
    COALESCE(sum(octet_length(content)),0)::text AS media_bytes FROM order_attachments`)).rows[0] : { migrationPending: true }
  console.log(JSON.stringify({ databaseBytes: Number(usage.database_bytes), databaseMiB: Number((Number(usage.database_bytes) / 1048576).toFixed(2)), configuredClusterLimit: usage.cluster_limit, media }, null, 2))
  await client.query('COMMIT')
} finally { await client.end() }
