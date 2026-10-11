export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest, ensureDefaultAccount } from '@/lib/auth';
import { queryAll, execute } from '@/lib/db';
import { dollarsToCents } from '@/lib/currency';

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

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
