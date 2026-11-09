export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest } from '@/lib/auth';
import { parseNaturalLanguageInput, parseNaturalLanguageWithAI, parseBankNotification } from '@/lib/nlp-parser';
import { parseBankCsv as executeCsvImport } from '@/lib/csv-importer';
import { execute, queryAll, queryOne } from '@/lib/db';
import { recalculateAccountBalance } from '@/lib/financial-engine';

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Parser de lenguaje natural con IA (Groq)
    if (action === 'parse_nlp') {
      const { text } = body;
      const items = await parseNaturalLanguageWithAI(text);

      // Enriquecer cada item con categoryId y cuenta sugerida si coincide con el método
      for (const item of items) {
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

        if (item.paymentMethod && item.paymentMethod.toLowerCase() !== 'efectivo') {
          let acc = await queryOne<{ id: string }>(
            `SELECT id FROM accounts WHERE user_id = ? AND is_active = true AND LOWER(name) LIKE ? LIMIT 1`,
            [session.id, `%${item.paymentMethod.toLowerCase()}%`]
          );
          if (!acc && ['nequi', 'daviplata'].includes(item.paymentMethod.toLowerCase())) {
            const newAccId = crypto.randomUUID();
            const accName = item.paymentMethod.charAt(0).toUpperCase() + item.paymentMethod.slice(1);
            const accColor = item.paymentMethod.toLowerCase() === 'nequi' ? '#e11d48' : '#dc2626';
            await execute(
              `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
               VALUES (?, ?, ?, 'CHECKING', 0, 0, ?, true, ?)`,
              [newAccId, session.id, accName, accColor, new Date().toISOString()]
            );
            acc = { id: newAccId };
          }
          if (acc) {
            item.suggestedAccountId = acc.id;
          }
        }
      }

      return NextResponse.json({ items });
    }

    // 2. Parser de notificación bancaria copiada
    if (action === 'parse_notification') {
      const { text } = body;
      const item = parseBankNotification(text);
      return NextResponse.json({ item });
    }

    // 3. Previsualización y análisis de archivo CSV
    if (action === 'preview_csv') {
      const { csvContent, accountId } = body;
      if (!csvContent || !accountId) {
        return NextResponse.json({ error: 'Contenido CSV y cuenta requeridos' }, { status: 400 });
      }

      const result = await executeCsvImport(csvContent, session.id, accountId);
      return NextResponse.json(result);
    }

    // 4. Confirmación e inserción de transacciones importadas
    if (action === 'confirm_import') {
      const { rows, accountId } = body;
      if (!rows || !Array.isArray(rows) || !accountId) {
        return NextResponse.json({ error: 'Filas y cuenta de destino requeridas' }, { status: 400 });
      }

      // Obtener categorías para mapear nombres a IDs
      const categories = await queryAll<{ id: string; name: string }>(
        `SELECT id, name FROM categories WHERE user_id = ? OR (user_id IS NULL AND is_system IS TRUE)`,
        [session.id]
      );
      const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

      let importedCount = 0;
      const now = new Date().toISOString();

      for (const row of rows) {
        // Ignorar filas marcadas como duplicadas a menos que el usuario las fuerce
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

      // Recalcular saldo de la cuenta
      await recalculateAccountBalance(accountId);

      return NextResponse.json({ success: true, importedCount });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (err: any) {
    console.error('Import API error:', err);
    return NextResponse.json({ error: 'Error procesando importación' }, { status: 500 });
  }
}
