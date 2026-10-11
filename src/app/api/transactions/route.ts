import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest } from '@/lib/auth';
import { queryAll, execute } from '@/lib/db';
import { recalculateAccountBalance } from '@/lib/financial-engine';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const type = searchParams.get('type');
    const month = searchParams.get('month');

    let query = `
      SELECT t.*, a.name as account_name, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ?
    `;
    const params: any[] = [session.id];

    if (accountId) {
      query += ` AND (t.account_id = ? OR t.destination_account_id = ?)`;
      params.push(accountId, accountId);
    }
    if (type) {
      query += ` AND t.type = ?`;
      params.push(type);
    }
    if (month) {
      query += ` AND t.date::text LIKE ?`;
      params.push(`${month}%`);
    }

    query += ` ORDER BY t.date DESC, t.created_at DESC LIMIT 100`;

    const transactions = await queryAll(query, params);
    return NextResponse.json({ transactions });
  } catch (err: any) {
    console.error('Transactions GET error:', err);
    return NextResponse.json({ error: 'Error obteniendo transacciones: ' + (err?.message || String(err)), transactions: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      accountId,
      destinationAccountId,
      categoryId,
      type, // EXPENSE, INCOME, TRANSFER, CREDIT_PURCHASE, REFUND
      amountCents,
      date,
      description,
      paymentMethod = 'Efectivo',
      status = 'CLEARED',
      notes = '',
      source = 'MANUAL',
      isRecurring = 0,
    } = body;

    if (!accountId || !type || !amountCents || !description || !date) {
      return NextResponse.json({ error: 'Campos obligatorios incompletos' }, { status: 400 });
    }

    if (type === 'TRANSFER' && !destinationAccountId) {
      return NextResponse.json({ error: 'Transferencia requiere cuenta de destino' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO transactions 
       (id, user_id, account_id, destination_account_id, category_id, type, amount_cents, date, description, payment_method, status, notes, source, is_recurring, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.id,
        accountId,
        destinationAccountId || null,
        categoryId || null,
        type,
        amountCents,
        date,
        description.trim(),
        paymentMethod,
        status,
        notes,
        source,
        isRecurring ? 1 : 0,
        now,
      ]
    );

    // Recalcular saldos de forma determinista
    await recalculateAccountBalance(accountId);
    if (destinationAccountId) {
      await recalculateAccountBalance(destinationAccountId);
    }

    return NextResponse.json({ success: true, transactionId: id });
  } catch (err: any) {
    console.error('Transactions POST error:', err);
    return NextResponse.json({ error: 'Error registrando movimiento: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
