import assert from 'node:assert/strict'
import test from 'node:test'
import { assertAuthSchema } from './database-readiness.js'

test('missing PostgreSQL migrations produce an actionable error before initialization writes', async () => {
  const queries = []
  await assert.rejects(assertAuthSchema(async sql => {
    queries.push(sql)
    return { rows: [{ migrations: null }] }
  }), /001-auth-security/)
  assert.equal(queries.length, 1)
  assert.ok(queries.every(sql => sql.startsWith('SELECT')))
})
test('a marker alone does not accept a broken authentication schema', async () => {
  let count = 0
  await assert.rejects(assertAuthSchema(async () => {
    count++
    if (count === 1) return { rows: [{ migrations: 'schema_migrations' }] }
    if (count === 2) return { rows: [{ version: '001-auth-security' }] }
    throw new Error('auth_sessions missing')
  }), /auth_sessions missing/)
})
