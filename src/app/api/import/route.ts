export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest } from '@/lib/auth';
import { parseNaturalLanguageWithAI, parseBankNotification } from '@/lib/nlp-parser';
import { parseBankCsv as executeCsvImport } from '@/lib/csv-importer';
import { execute, queryAll, queryOne } from '@/lib/db';
import { recalculateAccountBalance, resolveOrCreateTargetAccount } from '@/lib/financial-engine';

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Parser de lenguaje natural con IA (Groq) con soporte para Transacciones, Obligaciones, Presupuestos y Cuentas
    if (action === 'parse_nlp') {
      const { text } = body;
      const items = await parseNaturalLanguageWithAI(text);

      for (const item of items) {
        // A. Resolver categoría
        if (item.categorySuggestion) {
          const cleanCat = item.categorySuggestion.split('|')[0].trim();
          let cat = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND LOWER(name) = LOWER(?) LIMIT 1`,
            [session.id, cleanCat]
          );
          if (!cat) {
            cat = await queryOne<{ id: string; name: string }>(
              `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND (LOWER(name) LIKE ? OR LOWER(?) LIKE LOWER(CONCAT('%', name, '%'))) LIMIT 1`,
              [session.id, `%${cleanCat.toLowerCase()}%`, cleanCat]
            );
          }
          if (cat) {
            item.categoryId = cat.id;
            item.categorySuggestion = cat.name;
          }
        }

        // B. Resolver cuenta para transacciones o cuentas
        const methodOrAcc = item.accountName || item.paymentMethod;
        const acc = await resolveOrCreateTargetAccount(session.id, methodOrAcc);
        if (acc) {
          item.suggestedAccountId = acc.id;
          item.accountName = acc.name;
        }
      }

      return NextResponse.json({ items });
    }

    // 2. Ejecutar acción de lenguaje natural confirmada por el usuario
    if (action === 'execute_nlp_action') {
      const { item, selectedAccountId } = body;
      if (!item) {
        return NextResponse.json({ error: 'Item requerido' }, { status: 400 });
      }

      const now = new Date().toISOString();

      // Caso A: OBLIGACIÓN / PAGO PENDIENTE
      if (item.intent === 'OBLIGATION') {
        const id = crypto.randomUUID();
        const dueDate = item.dueDate || item.date || new Date().toISOString().substring(0, 10);
        await execute(
          `INSERT INTO payment_obligations (id, user_id, name, amount_cents, due_date, frequency, category_id, account_id, status, is_subscription, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          [
            id,
            session.id,
            item.description.trim(),
            item.amountCents,
            dueDate,
            item.frequency || 'MONTHLY',
            item.categoryId || null,
            item.suggestedAccountId || selectedAccountId || null,
            Boolean(item.isSubscription),
            now,
          ]
        );
        return NextResponse.json({ success: true, type: 'OBLIGATION', id });
      }

      // Caso B: PRESUPUESTO MENSUAL
      if (item.intent === 'BUDGET') {
        const monthYear = item.monthYear || new Date().toISOString().substring(0, 7);
        let categoryId = item.categoryId;
        if (!categoryId) {
          const defaultCat = await queryOne<{ id: string }>(
            `SELECT id FROM categories WHERE user_id = ? OR is_system = true ORDER BY id ASC LIMIT 1`,
            [session.id]
          );
          categoryId = defaultCat?.id;
        }

        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month_year = ?`,
          [session.id, categoryId, monthYear]
        );

        if (existing) {
          await execute(
            `UPDATE budgets SET allocated_cents = ? WHERE id = ?`,
            [item.amountCents, existing.id]
          );
        } else {
          const id = crypto.randomUUID();
          await execute(
            `INSERT INTO budgets (id, user_id, category_id, month_year, allocated_cents, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, session.id, categoryId, monthYear, item.amountCents, now]
          );
        }
        return NextResponse.json({ success: true, type: 'BUDGET' });
      }

      // Caso C: ACTUALIZACIÓN O CREACIÓN DE CUENTA / DEUDA
      if (item.intent === 'ACCOUNT') {
        const targetAccId = item.suggestedAccountId || selectedAccountId;
        if (item.accountAction === 'CREATE' || !targetAccId) {
          const newAccId = crypto.randomUUID();
          const accName = item.accountName || item.description || 'Nueva Cuenta';
          const accType = item.accountType || (item.type === 'EXPENSE' ? 'CREDIT_CARD' : 'CHECKING');
          const color = accType === 'CREDIT_CARD' ? '#f59e0b' : '#10b981';
          await execute(
            `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, true, ?)`,
            [newAccId, session.id, accName.trim(), accType, item.amountCents, item.amountCents, color, now]
          );
          return NextResponse.json({ success: true, type: 'ACCOUNT_CREATED', id: newAccId });
        } else {
          // Actualizar saldo de cuenta existente ajustando initial_balance
          const existing = await queryOne<any>(
            `SELECT * FROM accounts WHERE id = ? AND user_id = ?`,
            [targetAccId, session.id]
          );
          if (existing) {
            const incomes = await queryOne<{ total: string | number }>(
              `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type = 'INCOME'`,
              [targetAccId]
            );
            const expenses = await queryOne<{ total: string | number }>(
              `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE')`,
              [targetAccId]
            );
            const incomingTransfers = await queryOne<{ total: string | number }>(
              `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE destination_account_id = ? AND type = 'TRANSFER'`,
              [targetAccId]
            );
            const outgoingTransfers = await queryOne<{ total: string | number }>(
              `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type = 'TRANSFER'`,
              [targetAccId]
            );
            const totalIncome = Number(incomes?.total || 0) + Number(incomingTransfers?.total || 0);
            const totalExpense = Number(expenses?.total || 0) + Number(outgoingTransfers?.total || 0);

            let initialBalCents = 0;
            if (existing.type === 'CREDIT_CARD') {
              initialBalCents = item.amountCents - Number(expenses?.total || 0) + Number(incomingTransfers?.total || 0);
            } else {
              initialBalCents = item.amountCents - totalIncome + totalExpense;
            }

            await execute(
              `UPDATE accounts SET initial_balance_cents = ? WHERE id = ? AND user_id = ?`,
              [initialBalCents, targetAccId, session.id]
            );
            await recalculateAccountBalance(targetAccId);
          }
          return NextResponse.json({ success: true, type: 'ACCOUNT_UPDATED', id: targetAccId });
        }
      }

      // Caso D: MOVIMIENTO HABITUAL (GASTO / INGRESO)
      const txId = crypto.randomUUID();
      const targetAccountId = item.suggestedAccountId || selectedAccountId;
      if (!targetAccountId) {
        return NextResponse.json({ error: 'Cuenta requerida para registrar el movimiento' }, { status: 400 });
      }

      await execute(
        `INSERT INTO transactions 
         (id, user_id, account_id, category_id, type, amount_cents, date, description, payment_method, status, notes, source, is_recurring, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLEARED', 'Registrado con Registro Rápido', 'NLP', false, ?)`,
        [
          txId,
          session.id,
          targetAccountId,
          item.categoryId || null,
          item.type,
          item.amountCents,
          item.date,
          item.description,
          item.paymentMethod || 'Efectivo',
          now,
        ]
      );
      await recalculateAccountBalance(targetAccountId);
      return NextResponse.json({ success: true, type: 'TRANSACTION', id: txId });
    }

    // 3. Parser de notificación bancaria copiada
    if (action === 'parse_notification') {
      const { text } = body;
      const item = parseBankNotification(text);
      return NextResponse.json({ item });
    }

    // 4. Previsualización y análisis de archivo CSV
    if (action === 'preview_csv') {
      const { csvContent, accountId } = body;
      if (!csvContent || !accountId) {
        return NextResponse.json({ error: 'Contenido CSV y cuenta requeridos' }, { status: 400 });
      }

      const result = await executeCsvImport(csvContent, session.id, accountId);
      return NextResponse.json(result);
    }

    // 5. Confirmación e inserción de transacciones importadas
    if (action === 'confirm_import') {
      const { rows, accountId } = body;
      if (!rows || !Array.isArray(rows) || !accountId) {
        return NextResponse.json({ error: 'Filas y cuenta de destino requeridas' }, { status: 400 });
      }

      const categories = await queryAll<{ id: string; name: string }>(
        `SELECT id, name FROM categories WHERE user_id = ? OR (user_id IS NULL AND is_system IS TRUE)`,
        [session.id]
      );
      const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

      let importedCount = 0;
      const now = new Date().toISOString();

      for (const row of rows) {
        if (row.isDuplicate && !row.forceImport) continue;

        const catId = catMap.get((row.categorySuggestion || '').toLowerCase()) || null;
        const txId = crypto.randomUUID();

        await execute(
          `INSERT INTO transactions 
           (id, user_id, account_id, category_id, type, amount_cents, date, description, payment_method, status, notes, import_hash, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Importación Bancaria', 'CLEARED', 'Importado desde extracto CSV', ?, 'CSV_IMPORT', ?)`,
          [
            txId,
            session.id,
            accountId,
            catId,
            row.type,
            row.amountCents,
            row.date,
            row.description,
            row.importHash,
            now,
          ]
        );
        importedCount++;
      }

      await recalculateAccountBalance(accountId);
      return NextResponse.json({ success: true, count: importedCount });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err: any) {
    console.error('Import API error:', err);
    return NextResponse.json({ error: 'Error procesando solicitud: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
