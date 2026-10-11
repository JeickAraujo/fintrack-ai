export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest, ensureDefaultUserCategories } from '@/lib/auth';
import { queryAll, execute } from '@/lib/db';
import { dollarsToCents } from '@/lib/currency';
import { getBogotaCurrentMonth } from '@/lib/financial-engine';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || getBogotaCurrentMonth();

    // Obtener presupuestos con el gasto real acumulado por categoría
    // Usamos date::text LIKE $1 para máxima compatibilidad Postgres y SQLite
    const budgets = await queryAll(
      `SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
              COALESCE((
                SELECT SUM(t.amount_cents) 
                FROM transactions t 
                WHERE t.user_id = b.user_id 
                  AND t.category_id = b.category_id 
                  AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE')
                  AND t.date::text LIKE ?
              ), 0) as spent_cents
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ? AND b.month_year = ?`,
      [`${month}%`, session.id, month]
    );

    let categories = await queryAll(
      `SELECT * FROM categories WHERE user_id = ? OR (user_id IS NULL AND is_system IS TRUE) ORDER BY type ASC, name ASC`,
      [session.id]
    );

    // Auto-reparación preventiva si el usuario no tiene categorías sembradas
    if (categories.length === 0) {
      await ensureDefaultUserCategories(session.id);
      categories = await queryAll(
        `SELECT * FROM categories WHERE user_id = ? OR (user_id IS NULL AND is_system IS TRUE) ORDER BY type ASC, name ASC`,
        [session.id]
      );
    }

    // Deduplicación estricta en memoria por tipo y nombre
    const uniqueCategories: any[] = [];
    const seenCat = new Set<string>();
    for (const c of categories) {
      const key = `${c.type}_${c.name.trim().toLowerCase()}`;
      if (!seenCat.has(key)) {
        seenCat.add(key);
        uniqueCategories.push(c);
      }
    }

    return NextResponse.json({ budgets, categories: uniqueCategories, month });
  } catch (err: any) {
    console.error('Budgets GET error:', err);
    return NextResponse.json(
      { error: 'Error cargando presupuestos: ' + (err?.message || String(err)), budgets: [], categories: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { categoryId, monthYear, allocatedAmount } = body;

    if (!categoryId || !monthYear || allocatedAmount === undefined) {
      return NextResponse.json({ error: 'Categoría, mes y monto presupuestado requeridos' }, { status: 400 });
    }

    const allocatedCents = dollarsToCents(allocatedAmount);
    const existing = await queryAll(
      `SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month_year = ?`,
      [session.id, categoryId, monthYear]
    );

    const now = new Date().toISOString();
    if (existing.length > 0) {
      await execute(
        `UPDATE budgets SET allocated_cents = ? WHERE id = ?`,
        [allocatedCents, existing[0].id]
      );
      return NextResponse.json({ success: true, updated: true });
    } else {
      const id = crypto.randomUUID();
      await execute(
        `INSERT INTO budgets (id, user_id, category_id, month_year, allocated_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, session.id, categoryId, monthYear, allocatedCents, now]
      );
      return NextResponse.json({ success: true, budgetId: id });
    }
  } catch (err: any) {
    console.error('Budgets POST error:', err);
    return NextResponse.json({ error: 'Error guardando presupuesto: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
