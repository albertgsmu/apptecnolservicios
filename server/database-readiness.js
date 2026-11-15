export async function assertAuthSchema(query) {
  const result = await query("SELECT to_regclass('public.schema_migrations') AS migrations")
  if (!result.rows[0]?.migrations) {
    throw new Error('Falta la migración de autenticación PostgreSQL 001-auth-security. Ejecuta npm run db:check para revisar el esquema. La migración debe probarse en desarrollo antes de aplicarse a producción; no borres ni reinicies la base.')
  }
  const applied = await query('SELECT version FROM schema_migrations WHERE version = $1', ['001-auth-security'])
  if (!applied.rows.length) {
    throw new Error('La migración PostgreSQL 001-auth-security está pendiente. Ejecuta npm run db:check y aplica la migración revisada antes de iniciar la API.')
  }
  // Check the actual objects as well as the migration marker.
  await query('SELECT token_hash, csrf_hash, status, expires_at FROM auth_sessions LIMIT 0')
  await query('SELECT must_change_password, mfa_enabled, mfa_secret_encrypted, mfa_pending_secret_encrypted, mfa_last_counter FROM users LIMIT 0')
  await query('SELECT code_hash, used_at FROM recovery_codes LIMIT 0')
  await query('SELECT ip_hash, failure_count, window_started_at, locked_until FROM login_attempts LIMIT 0')
  await query('SELECT user_id, event, created_at FROM security_events LIMIT 0')
}
