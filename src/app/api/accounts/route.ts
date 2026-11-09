export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest, ensureDefaultAccount } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/db';
import { dollarsToCents } from '@/lib/currency';
import { recalculateAllUserAccounts, recalculateAccountBalance } from '@/lib/financial-engine';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Auto-reparar saldos de cuentas con base en transacciones reales
    await recalculateAllUserAccounts(session.id);

    let accounts = await queryAll(
      `SELECT * FROM accounts WHERE user_id = ? AND is_active IS TRUE ORDER BY created_at ASC`,
      [session.id]
    );

    // Auto-reparación preventiva si el usuario no tiene ninguna cuenta activa
    if (accounts.length === 0) {
      await ensureDefaultAccount(session.id);
      accounts = await queryAll(
        `SELECT * FROM accounts WHERE user_id = ? AND is_active IS TRUE ORDER BY created_at ASC`,
        [session.id]
      );
    }

    return NextResponse.json({ accounts });
  } catch (err: any) {
    console.error('Accounts GET error:', err);
    return NextResponse.json(
      { error: 'Error cargando cuentas: ' + (err?.message || String(err)), accounts: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, type, initialBalance, creditLimit = 0, color = '#10b981' } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Nombre y tipo de cuenta requeridos' }, { status: 400 });
    }

    const initialBalanceCents = dollarsToCents(initialBalance || 0);
    const creditLimitCents = dollarsToCents(creditLimit || 0);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, credit_limit_cents, color, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, ?)`,
      [id, session.id, name.trim(), type, initialBalanceCents, initialBalanceCents, creditLimitCents, color, now]
    );

    return NextResponse.json({ success: true, accountId: id });
  } catch (err: any) {
    console.error('Accounts POST error:', err);
    return NextResponse.json({ error: 'Error creando cuenta: ' + (err?.message || String(err)) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, name, type, initialBalance, currentBalance, creditLimit, color } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de cuenta requerido' }, { status: 400 });
    }

    const existing = await queryOne<any>(
      `SELECT * FROM accounts WHERE id = ? AND user_id = ?`,
      [id, session.id]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    let initialBalCents = existing.initial_balance_cents;
    if (initialBalance !== undefined) {
      initialBalCents = dollarsToCents(initialBalance);
    } else if (currentBalance !== undefined) {
      // Ajuste directo de saldo actual: calcular el saldo inicial necesario para que coincida exactamente
      const targetCurrentCents = dollarsToCents(currentBalance);
      const incomes = await queryOne<{ total: string | number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type = 'INCOME'`,
        [id]
      );
      const expenses = await queryOne<{ total: string | number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE')`,
        [id]
      );
      const incomingTransfers = await queryOne<{ total: string | number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE destination_account_id = ? AND type = 'TRANSFER'`,
        [id]
      );
      const outgoingTransfers = await queryOne<{ total: string | number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type = 'TRANSFER'`,
        [id]
      );
      const totalIncome = Number(incomes?.total || 0) + Number(incomingTransfers?.total || 0);
      const totalExpense = Number(expenses?.total || 0) + Number(outgoingTransfers?.total || 0);

      if (existing.type === 'CREDIT_CARD') {
        initialBalCents = targetCurrentCents - Number(expenses?.total || 0) + Number(incomingTransfers?.total || 0);
      } else {
        initialBalCents = targetCurrentCents - totalIncome + totalExpense;
      }
    }

    const creditLimitCents = creditLimit !== undefined ? dollarsToCents(creditLimit) : existing.credit_limit_cents;
    const updatedName = name ? name.trim() : existing.name;
    const updatedType = type || existing.type;
    const updatedColor = color || existing.color;

    await execute(
      `UPDATE accounts 
       SET name = ?, type = ?, initial_balance_cents = ?, credit_limit_cents = ?, color = ?
       WHERE id = ? AND user_id = ?`,
      [updatedName, updatedType, initialBalCents, creditLimitCents, updatedColor, id, session.id]
    );

    await recalculateAccountBalance(id);

    return NextResponse.json({ success: true, updated: true });
  } catch (err: any) {
    console.error('Accounts PUT error:', err);
    return NextResponse.json({ error: 'Error actualizando cuenta: ' + (err?.message || String(err)) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID de cuenta requerido' }, { status: 400 });
    }

    const existing = await queryOne<any>(
      `SELECT id FROM accounts WHERE id = ? AND user_id = ?`,
      [id, session.id]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    await execute(
      `UPDATE accounts SET is_active = false WHERE id = ? AND user_id = ?`,
      [id, session.id]
    );

    return NextResponse.json({ success: true, deleted: true });
  } catch (err: any) {
    console.error('Accounts DELETE error:', err);
    return NextResponse.json({ error: 'Error eliminando cuenta: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
