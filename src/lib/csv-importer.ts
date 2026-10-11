import crypto from 'crypto';
import { dollarsToCents } from './currency';
import { queryAll } from './db';

export interface CsvTransactionRow {
  date: string;
  description: string;
  amountCents: number;
  type: 'EXPENSE' | 'INCOME';
  categorySuggestion: string;
  confidence: number;
  importHash: string;
  isDuplicate: boolean;
}

export interface CsvParseResult {
  totalRows: number;
  validRows: CsvTransactionRow[];
  duplicateCount: number;
  errors: string[];
}

/**
 * Genera un hash SHA-256 criptográfico para deduplicación exacta
 */
export function generateTransactionHash(
  userId: string,
  accountId: string,
  date: string,
  amountCents: number,
  description: string
): string {
  const normalizedDesc = description.trim().toLowerCase().replace(/\s+/g, ' ');
  const raw = `${userId}|${accountId}|${date}|${amountCents}|${normalizedDesc}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Normaliza y procesa un archivo CSV con detección de encabezados bancarios comunes
 */
export async function parseBankCsv(
  csvContent: string,
  userId: string,
  accountId: string
): Promise<CsvParseResult> {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return { totalRows: 0, validRows: [], duplicateCount: 0, errors: ['El archivo CSV no contiene suficientes filas.'] };
  }

  // Detectar delimitador (, o ;)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));

  // Buscar índices de columnas
  const dateIdx = headers.findIndex(h => /fecha|date|dia/i.test(h));
  const descIdx = headers.findIndex(h => /descripci[oó]n|concepto|detalle|merchant|comercio/i.test(h));
  const amountIdx = headers.findIndex(h => /valor|monto|importe|amount|total/i.test(h));
  const debitIdx = headers.findIndex(h => /debito|d[ée]bito|cargo|egreso|gasto/i.test(h));
  const creditIdx = headers.findIndex(h => /credito|cr[ée]dito|abono|ingreso/i.test(h));

  if (dateIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
    return {
      totalRows: lines.length - 1,
      validRows: [],
      duplicateCount: 0,
      errors: ['No se pudieron identificar las columnas requeridas (Fecha y Monto/Débito/Crédito) en el encabezado.'],
    };
  }

  // Cargar categorías existentes del usuario para clasificación inteligente
  const categories = await queryAll<{ id: string; name: string; keywords: string; type: string }>(
    `SELECT id, name, keywords, type FROM categories WHERE user_id = ? OR (user_id IS NULL AND is_system IS TRUE)`,
    [userId]
  );

  // Cargar hashes existentes del usuario para detección de duplicados
  const existingHashesRows = await queryAll<{ import_hash: string }>(
    `SELECT import_hash FROM transactions WHERE user_id = ? AND import_hash IS NOT NULL`,
    [userId]
  );
  const existingHashes = new Set(existingHashesRows.map(r => r.import_hash));

  const validRows: CsvTransactionRow[] = [];
  const errors: string[] = [];
  let duplicateCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (row.length < 2) continue;

    const rawDate = row[dateIdx] || '';
    const rawDesc = descIdx !== -1 ? row[descIdx] : 'Movimiento importado';
    
    // Normalizar Fecha a YYYY-MM-DD
    let normalizedDate = new Date().toISOString().substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      normalizedDate = rawDate;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
      const [d, m, y] = rawDate.split('/');
      normalizedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(rawDate)) {
      const [y, m, d] = rawDate.split('/');
      normalizedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Determinar Monto y Tipo
    let amount = 0;
    let type: 'EXPENSE' | 'INCOME' = 'EXPENSE';

    if (amountIdx !== -1) {
      const rawAmt = row[amountIdx] || '0';
      const cleanAmt = rawAmt.replace(/\./g, '').replace(',', '.');
      const parsedNum = parseFloat(cleanAmt);
      if (parsedNum < 0) {
        amount = Math.abs(parsedNum);
        type = 'EXPENSE';
      } else {
        amount = parsedNum;
        type = 'INCOME';
      }
    } else {
      const debitVal = debitIdx !== -1 ? parseFloat((row[debitIdx] || '0').replace(/\./g, '').replace(',', '.')) : 0;
      const creditVal = creditIdx !== -1 ? parseFloat((row[creditIdx] || '0').replace(/\./g, '').replace(',', '.')) : 0;
      if (debitVal > 0) {
        amount = debitVal;
        type = 'EXPENSE';
      } else if (creditVal > 0) {
        amount = creditVal;
        type = 'INCOME';
      }
    }

    if (isNaN(amount) || amount <= 0) {
      errors.push(`Fila ${i}: Monto no válido (${row[amountIdx] || 'vacío'}).`);
      continue;
    }

    const amountCents = dollarsToCents(amount);
    const hash = generateTransactionHash(userId, accountId, normalizedDate, amountCents, rawDesc);
    const isDuplicate = existingHashes.has(hash);
    if (isDuplicate) duplicateCount++;

    // Clasificación automática basada en palabras clave
    let categorySuggestion = type === 'INCOME' ? 'Salario / Sueldo' : 'Alimentación';
    let confidence = 0.6;

    const lowerDesc = rawDesc.toLowerCase();
    for (const cat of categories) {
      if (cat.type !== type) continue;
      if (cat.keywords) {
        const kws = cat.keywords.split(',').map(k => k.trim().toLowerCase());
        const matched = kws.some(kw => lowerDesc.includes(kw));
        if (matched) {
          categorySuggestion = cat.name;
          confidence = 0.95;
          break;
        }
      }
    }

    validRows.push({
      date: normalizedDate,
      description: rawDesc,
      amountCents,
      type,
      categorySuggestion,
      confidence,
      importHash: hash,
      isDuplicate,
    });
  }

  return {
    totalRows: lines.length - 1,
    validRows,
    duplicateCount,
    errors,
  };
}
