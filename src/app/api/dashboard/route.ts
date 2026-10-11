import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDashboardMetrics, getBogotaCurrentMonth } from '@/lib/financial-engine';
import { queryAll } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') || getBogotaCurrentMonth();

  const metrics = await getDashboardMetrics(session.id, month);

  // Gastos por categoría para gráficos
  const expensesByCategory = await queryAll<{ name: string; total: number; color: string }>(
    `SELECT c.name, COALESCE(SUM(t.amount_cents), 0) as total, c.color
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     WHERE t.user_id = ? AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE') AND t.date LIKE ?
     GROUP BY c.id
     HAVING total > 0
     ORDER BY total DESC`,
    [session.id, `${month}%`]
  );

  // Próximas obligaciones
  const upcomingBills = await queryAll(
    `SELECT * FROM payment_obligations 
     WHERE user_id = ? AND status IN ('PENDING', 'DUE_SOON', 'OVERDUE')
     ORDER BY due_date ASC LIMIT 5`,
    [session.id]
  );

  // Últimas transacciones
  const recentTransactions = await queryAll(
    `SELECT t.*, a.name as account_name, c.name as category_name, c.color as category_color
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.user_id = ?
     ORDER BY t.date DESC, t.created_at DESC LIMIT 6`,
    [session.id]
  );

  return NextResponse.json({
    metrics,
    expensesByCategory,
    upcomingBills,
    recentTransactions,
    user: session,
  });
}
