import crypto from 'crypto';
import { queryAll, queryOne, execute } from './db';

export interface FinancialSummary {
  totalBalanceCents: number;
  monthlyIncomeCents: number;
  monthlyExpenseCents: number;
  committedObligationsCents: number;
  monthlyCashFlowCents: number;
  savingsRatePercentage: number;
  prevMonthExpenseCents: number;
  expenseChangePercentage: number;
  budgetUsedPercentage: number;
}

/**
 * Recalcula el saldo real de una cuenta específica a partir de su balance inicial
 * y todas las transacciones históricas registradas.
 */
export async function recalculateAccountBalance(accountId: string): Promise<number> {
  const account = await queryOne<{ initial_balance_cents: number; type: string }>(
    `SELECT initial_balance_cents, type FROM accounts WHERE id = ?`,
    [accountId]
  );
  if (!account) return 0;

  // Gastos normales y compras a crédito que salen de la cuenta
  const expenses = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE account_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE')`,
    [accountId]
  );

  // Ingresos y reembolsos que entran a la cuenta
  const incomes = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE account_id = ? AND type IN ('INCOME', 'REFUND')`,
    [accountId]
  );

  // Transferencias salientes
  const outgoingTransfers = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE account_id = ? AND type = 'TRANSFER'`,
    [accountId]
  );

  // Transferencias entrantes
  const incomingTransfers = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE destination_account_id = ? AND type = 'TRANSFER'`,
    [accountId]
  );

  const totalIncome = (incomes?.total || 0) + (incomingTransfers?.total || 0);
  const totalExpense = (expenses?.total || 0) + (outgoingTransfers?.total || 0);

  let newBalanceCents = 0;
  if (account.type === 'CREDIT_CARD') {
    // Para tarjeta de crédito, el saldo representa la deuda acumulada:
    // saldo inicial (deuda) + compras - pagos hacia la tarjeta (transferencias entrantes)
    newBalanceCents = account.initial_balance_cents + (expenses?.total || 0) - (incomingTransfers?.total || 0);
  } else {
    // Para cuentas de débito/ahorros/efectivo
    newBalanceCents = account.initial_balance_cents + totalIncome - totalExpense;
  }

  await execute(
    `UPDATE accounts SET current_balance_cents = ? WHERE id = ?`,
    [newBalanceCents, accountId]
  );

  return newBalanceCents;
}

export function getBogotaCurrentMonth(): string {
  // YYYY-MM en zona horaria America/Bogota
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return dateStr.substring(0, 7);
}

/**
 * Calcula todas las métricas para el Dashboard Financiero Inteligente
 */
export async function getDashboardMetrics(userId: string, targetMonthYear?: string): Promise<FinancialSummary> {
  const currentMonth = targetMonthYear || getBogotaCurrentMonth(); // YYYY-MM
  
  // Calcular mes anterior
  const [yearStr, monthStr] = currentMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const prevMonthDate = new Date(year, month - 2, 1);
  const prevMonthYear = prevMonthDate.getFullYear();
  const prevMonthNum = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const prevMonthStr = `${prevMonthYear}-${prevMonthNum}`;

  // 1. Saldo total disponible (excluyendo tarjetas de crédito que son pasivos)
  const assetAccounts = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(current_balance_cents), 0) as total 
     FROM accounts 
     WHERE user_id = ? AND type != 'CREDIT_CARD' AND is_active = 1`,
    [userId]
  );

  // 2. Ingresos del mes
  const monthlyIncome = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE user_id = ? AND type = 'INCOME' AND date::text LIKE ?`,
    [userId, `${currentMonth}%`]
  );

  // 3. Gastos del mes (EXPENSE y CREDIT_PURCHASE)
  const monthlyExpense = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE user_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE') AND date::text LIKE ?`,
    [userId, `${currentMonth}%`]
  );

  // 4. Dinero comprometido en pagos pendientes del mes
  const committedObligations = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM payment_obligations 
     WHERE user_id = ? AND status IN ('PENDING', 'DUE_SOON', 'OVERDUE') AND due_date::text LIKE ?`,
    [userId, `${currentMonth}%`]
  );

  // 5. Gastos del mes anterior
  const prevMonthExpense = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total 
     FROM transactions 
     WHERE user_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE') AND date::text LIKE ?`,
    [userId, `${prevMonthStr}%`]
  );

  // 6. Presupuestos asignados del mes
  const budgets = await queryOne<{ totalAllocated: number }>(
    `SELECT COALESCE(SUM(allocated_cents), 0) as totalAllocated 
     FROM budgets 
     WHERE user_id = ? AND month_year = ?`,
    [userId, currentMonth]
  );

  const totalBal = assetAccounts?.total || 0;
  const inc = monthlyIncome?.total || 0;
  const exp = monthlyExpense?.total || 0;
  const comm = committedObligations?.total || 0;
  const prevExp = prevMonthExpense?.total || 0;
  const allocBudget = budgets?.totalAllocated || 0;

  const cashFlow = inc - exp;
  const savingsRate = inc > 0 ? Math.max(0, Math.round(((inc - exp) / inc) * 100)) : 0;
  
  let expenseChange = 0;
  if (prevExp > 0) {
    expenseChange = Math.round(((exp - prevExp) / prevExp) * 100);
  }

  const budgetUsed = allocBudget > 0 ? Math.round((exp / allocBudget) * 100) : 0;

  return {
    totalBalanceCents: totalBal,
    monthlyIncomeCents: inc,
    monthlyExpenseCents: exp,
    committedObligationsCents: comm,
    monthlyCashFlowCents: cashFlow,
    savingsRatePercentage: savingsRate,
    prevMonthExpenseCents: prevExp,
    expenseChangePercentage: expenseChange,
    budgetUsedPercentage: budgetUsed,
  };
}
