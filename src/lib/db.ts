import { Pool } from 'pg';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

let pgPool: Pool | null = null;
let memorySqlite: SqlJsDatabase | null = null;
let schemaConstraintsChecked = false;

/**
 * Retorna el pool de PostgreSQL si DATABASE_URL o SUPABASE_DB_URL está disponible.
 */
function getPgPool(): Pool | null {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    return null;
  }
  if (!pgPool) {
    const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pgPool;
}

/**
 * Garantiza de forma reactiva y automática que las claves foráneas de PostgreSQL
 * apunten a public.users(id) y no al esquema interno de auth.users(id) de Supabase.
 */
async function ensurePostgresConstraints(pool: Pool): Promise<void> {
  if (schemaConstraintsChecked) return;
  schemaConstraintsChecked = true;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        DO $$
        BEGIN
          -- 1. Si accounts_user_id_fkey apunta a auth.users, corregirla a public.users(id)
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'accounts_user_id_fkey'
              AND confrelid::regclass::text = 'auth.users'
          ) THEN
            ALTER TABLE public.accounts DROP CONSTRAINT accounts_user_id_fkey;
            ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey 
              FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
          END IF;

          -- 2. Asegurar que exista la clave foránea correcta si no existía ninguna
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'accounts_user_id_fkey'
          ) THEN
            ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey 
              FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[DB] Falló auto-migración de restricciones Postgres:', err);
  }
}

/**
 * Inicializa el esquema en memoria SQLite para tests locales rápidos o entornos sin DATABASE_URL configurada.
 */
async function getMemorySqlite(): Promise<SqlJsDatabase> {
  if (memorySqlite) return memorySqlite;
  const SQL = await initSqlJs();
  memorySqlite = new SQL.Database();
  initMemorySchema(memorySqlite);
  return memorySqlite;
}

function initMemorySchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'COP',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      initial_balance_cents INTEGER NOT NULL DEFAULT 0,
      current_balance_cents INTEGER NOT NULL DEFAULT 0,
      credit_limit_cents INTEGER DEFAULT 0,
      color TEXT DEFAULT '#10b981',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'Tag',
      color TEXT NOT NULL DEFAULT '#64748b',
      keywords TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      destination_account_id TEXT,
      category_id TEXT,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      payment_method TEXT,
      status TEXT NOT NULL DEFAULT 'CLEARED',
      notes TEXT,
      import_hash TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_obligations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'MONTHLY',
      category_id TEXT,
      account_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      is_subscription INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      transaction_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month_year TEXT NOT NULL,
      allocated_cents INTEGER NOT NULL,
      alert_70_sent INTEGER NOT NULL DEFAULT 0,
      alert_90_sent INTEGER NOT NULL DEFAULT 0,
      alert_100_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * Transforma placeholders de SQLite (?) a PostgreSQL ($1, $2, ...)
 */
function convertPlaceholders(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

/**
 * Ejecuta una consulta SELECT y retorna un arreglo de objetos mapeados
 */
export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getPgPool();
  if (pool) {
    await ensurePostgresConstraints(pool);
    const pgSql = convertPlaceholders(sql);
    const client = await pool.connect();
    try {
      const result = await client.query(pgSql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  // Fallback seguro en memoria (e.g. tests sin base externa)
  const db = await getMemorySqlite();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

/**
 * Ejecuta una consulta SELECT y retorna una única fila o null
 */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Ejecuta INSERT, UPDATE o DELETE
 */
export async function execute(sql: string, params: any[] = []): Promise<void> {
  const pool = getPgPool();
  if (pool) {
    await ensurePostgresConstraints(pool);
    const pgSql = convertPlaceholders(sql);
    const client = await pool.connect();
    try {
      await client.query(pgSql, params);
      return;
    } finally {
      client.release();
    }
  }

  // Fallback seguro en memoria sin tocar filesystem
  const db = await getMemorySqlite();
  db.run(sql, params);
}
