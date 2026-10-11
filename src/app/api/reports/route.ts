export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { centsToDollars } from '@/lib/currency';

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');
  const month = searchParams.get('month');

  let query = `
    SELECT t.date, t.description, t.type, t.amount_cents, a.name as account_name, c.name as category_name, t.payment_method, t.source, t.status
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ?
  `;
  const params: any[] = [session.id];

  if (month) {
    query += ` AND t.date::text LIKE ?`;
    params.push(`${month}%`);
  }
  query += ` ORDER BY t.date DESC`;

  const rows = await queryAll(query, params);

  if (format === 'csv') {
    const headers = ['Fecha', 'Descripcion', 'Tipo', 'Monto', 'Cuenta', 'Categoria', 'Metodo_Pago', 'Origen', 'Estado'];
    const csvLines = [headers.join(',')];

    for (const r of rows) {
      const line = [
        `"${r.date}"`,
        `"${r.description.replace(/"/g, '""')}"`,
        `"${r.type}"`,
        centsToDollars(r.amount_cents),
        `"${r.account_name}"`,
        `"${r.category_name || 'Sin Categoría'}"`,
        `"${r.payment_method || ''}"`,
        `"${r.source}"`,
        `"${r.status}"`,
      ];
      csvLines.push(line.join(','));
    }

    return new NextResponse(csvLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="fintrack-report-${month || 'historico'}.csv"`,
      },
    });
  }

  return NextResponse.json({ rows });
}
