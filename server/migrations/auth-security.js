export const migrateSqliteAuthSchema = async (db) => {
  await db.exec('BEGIN IMMEDIATE')
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    if (await db.get('SELECT version FROM schema_migrations WHERE version = ?', ['001-auth-security'])) {
      await db.exec('COMMIT')
      return
    }

    const columns = await db.all('PRAGMA table_info(users)')
    const existingColumns = new Set(columns.map((column) => column.name))
    const additions = [
      ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
      ['mfa_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['mfa_secret_encrypted', 'TEXT'],
      ['mfa_pending_secret_encrypted', 'TEXT'],
      ['mfa_last_counter', 'INTEGER NOT NULL DEFAULT -1'],
    ]
    for (const [name, definition] of additions) {
      if (!existingColumns.has(name)) {
        await db.exec(`ALTER TABLE users ADD COLUMN "${name}" ${definition}`)
      }
    }

    await db.exec(`
      CREATE TABLE auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'mfa_pending', 'authenticated')),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
      CREATE TABLE login_attempts (
        ip_hash TEXT PRIMARY KEY,
        failure_count INTEGER NOT NULL,
        window_started_at TEXT NOT NULL,
        locked_until TEXT NOT NULL
      );
      CREATE INDEX login_attempts_window_started_idx ON login_attempts(window_started_at);
      CREATE TABLE recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX recovery_codes_user_id_idx ON recovery_codes(user_id);
      CREATE TABLE security_events (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        event TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX security_events_created_at_idx ON security_events(created_at);
      CREATE UNIQUE INDEX users_single_manager_idx ON users(role) WHERE role = 'Gerente';
      INSERT INTO schema_migrations (version, applied_at)
      VALUES ('001-auth-security', datetime('now'));
    `)
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

export const migratePostgresAuthSchema = async (client) => {
  await client.query('BEGIN')
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    const applied = await client.query('SELECT version FROM schema_migrations WHERE version = $1', ['001-auth-security'])
    if (applied.rowCount) {
      await client.query('COMMIT')
      return
    }

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT,
        ADD COLUMN IF NOT EXISTS mfa_pending_secret_encrypted TEXT,
        ADD COLUMN IF NOT EXISTS mfa_last_counter BIGINT NOT NULL DEFAULT -1;
      CREATE TABLE auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'mfa_pending', 'authenticated')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
      CREATE TABLE login_attempts (
        ip_hash TEXT PRIMARY KEY,
        failure_count INTEGER NOT NULL,
        window_started_at TIMESTAMPTZ NOT NULL,
        locked_until TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX login_attempts_window_started_idx ON login_attempts(window_started_at);
      CREATE TABLE recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX recovery_codes_user_id_idx ON recovery_codes(user_id);
      CREATE TABLE security_events (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        event TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX security_events_created_at_idx ON security_events(created_at);
      CREATE UNIQUE INDEX users_single_manager_idx ON users(role) WHERE role = 'Gerente';
      INSERT INTO schema_migrations (version) VALUES ('001-auth-security');
    `)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
