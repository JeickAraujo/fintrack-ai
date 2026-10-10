import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest } from '@/lib/auth';
import { queryAll, execute } from '@/lib/db';
import { recalculateAccountBalance } from '@/lib/financial-engine';

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const obligations = await queryAll(
    `SELECT b.*, c.name as category_name, c.color as category_color, a.name as account_name
     FROM payment_obligations b
     LEFT JOIN categories c ON b.category_id = c.id
     LEFT JOIN accounts a ON b.account_id = a.id
     WHERE b.user_id = ?
     ORDER BY b.due_date ASC`,
    [session.id]
  );
  return NextResponse.json({ obligations });
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // Acción de marcar como pagado sin duplicar gastos
    if (action === 'pay') {
      const { obligationId, accountId, date = new Date().toISOString().substring(0, 10) } = body;
      const obligation = await queryAll(
        `SELECT * FROM payment_obligations WHERE id = ? AND user_id = ?`,
        [obligationId, session.id]
      );
      if (!obligation.length) {
        return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 });
      }

      const item = obligation[0];
      if (item.status === 'PAID') {
        return NextResponse.json({ error: 'Esta obligación ya se encuentra pagada' }, { status: 400 });
      }

      const selectedAccountId = accountId || item.account_id;
      if (!selectedAccountId) {
        return NextResponse.json({ error: 'Debe especificar una cuenta para efectuar el pago' }, { status: 400 });
      }

      // 1. Generar la transacción financiera correspondiente
      const txId = crypto.randomUUID();
      const now = new Date().toISOString();
      await execute(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount_cents, date, description, payment_method, status, notes, source, created_at)
         VALUES (?, ?, ?, ?, 'EXPENSE', ?, ?, ?, 'Transferencia / Débito', 'CLEARED', 'Pago de obligación programada', 'MANUAL', ?)`,
        [txId, session.id, selectedAccountId, item.category_id, item.amount_cents, date, `Pago: ${item.name}`, now]
      );

      // 2. Marcar la obligación como pagada enlazando la transacción
      await execute(
        `UPDATE payment_obligations 
         SET status = 'PAID', paid_at = ?, transaction_id = ?
         WHERE id = ? AND user_id = ?`,
        [now, txId, obligationId, session.id]
      );

      // 3. Recalcular el saldo real de la cuenta
      await recalculateAccountBalance(selectedAccountId);

      return NextResponse.json({ success: true, transactionId: txId });
    }

    // Creación de nueva obligación
    const { name, amountCents, dueDate, frequency = 'MONTHLY', categoryId, accountId, isSubscription = false } = body;
    if (!name || !amountCents || !dueDate) {
      return NextResponse.json({ error: 'Nombre, monto y fecha de vencimiento requeridos' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO payment_obligations (id, user_id, name, amount_cents, due_date, frequency, category_id, account_id, status, is_subscription, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, session.id, name.trim(), amountCents, dueDate, frequency, categoryId || null, accountId || null, isSubscription ? 1 : 0, now]
    );

    return NextResponse.json({ success: true, obligationId: id });
  } catch (err: any) {
    console.error('Obligations POST error:', err);
    return NextResponse.json({ error: 'Error procesando obligación de pago' }, { status: 500 });
  }
}
