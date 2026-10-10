import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

let dbInstance: SqlJsDatabase | null = null;
const DB_PATH = path.join(process.cwd(), 'fintrack.sqlite');

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
    initSchema(dbInstance);
    saveDb();
  }

  return dbInstance;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Error saving SQLite database file:', err);
  }
}

function initSchema(db: SqlJsDatabase): void {
  db.run(`
    -- Tabla de Usuarios
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'COP',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Tabla de Cuentas Financieras
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- CHECKING, SAVINGS, CASH, WALLET, CREDIT_CARD
      initial_balance_cents INTEGER NOT NULL DEFAULT 0,
      current_balance_cents INTEGER NOT NULL DEFAULT 0,
      credit_limit_cents INTEGER DEFAULT 0,
      color TEXT DEFAULT '#10b981',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Tabla de Categorías
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT, -- NULL para categorías por defecto del sistema
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- EXPENSE, INCOME
      icon TEXT NOT NULL DEFAULT 'Tag',
      color TEXT NOT NULL DEFAULT '#64748b',
      keywords TEXT, -- términos separados por comas para auto-clasificación
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Tabla de Transacciones (con importes en centavos y trazabilidad)
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      destination_account_id TEXT, -- sólo para transferencias
      category_id TEXT,
      type TEXT NOT NULL, -- EXPENSE, INCOME, TRANSFER, CREDIT_PURCHASE, REFUND
      amount_cents INTEGER NOT NULL,
      date TEXT NOT NULL, -- YYYY-MM-DD
      description TEXT NOT NULL,
      payment_method TEXT,
      status TEXT NOT NULL DEFAULT 'CLEARED', -- CLEARED, PENDING
      notes TEXT,
      import_hash TEXT, -- deduplicación criptográfica
      source TEXT NOT NULL DEFAULT 'MANUAL', -- MANUAL, NLP, CSV_IMPORT
      is_recurring INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- Tabla de Obligaciones de Pago (Bills)
    CREATE TABLE IF NOT EXISTS payment_obligations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_date TEXT NOT NULL, -- YYYY-MM-DD
      frequency TEXT NOT NULL DEFAULT 'MONTHLY', -- ONCE, WEEKLY, MONTHLY, ANNUAL
      category_id TEXT,
      account_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, DUE_SOON, OVERDUE, PAID, CANCELLED
      is_subscription INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      transaction_id TEXT, -- vínculo a la transacción generada al pagar
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Tabla de Presupuestos
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month_year TEXT NOT NULL, -- YYYY-MM
      allocated_cents INTEGER NOT NULL,
      alert_70_sent INTEGER NOT NULL DEFAULT 0,
      alert_90_sent INTEGER NOT NULL DEFAULT 0,
      alert_100_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    -- Tabla de Objetivos de Ahorro
    CREATE TABLE IF NOT EXISTS financial_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_cents INTEGER NOT NULL,
      current_cents INTEGER NOT NULL DEFAULT 0,
      target_date TEXT,
      color TEXT DEFAULT '#10b981',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Tabla de Notificaciones
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL, -- BILL_DUE, BILL_OVERDUE, BUDGET_ALERT, DUPLICATE_DETECTED, UNUSUAL_SPENDING
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Índices para alto desempeño y aislamiento
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_import_hash ON transactions(import_hash);
    CREATE INDEX IF NOT EXISTS idx_obligations_user_due ON payment_obligations(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month_year);
  `);
}

/**
 * Ejecuta una consulta SELECT y retorna un arreglo de objetos mapeados
 */
export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
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
 * Ejecuta INSERT, UPDATE o DELETE y persiste a disco
 */
export async function execute(sql: string, params: any[] = []): Promise<void> {
  const db = await getDb();
  db.run(sql, params);
  saveDb();
}
