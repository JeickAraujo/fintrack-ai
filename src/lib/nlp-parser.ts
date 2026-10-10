import { dollarsToCents } from './currency';

export interface ParsedItem {
  description: string;
  amountCents: number;
  type: 'EXPENSE' | 'INCOME';
  categorySuggestion?: string;
  confidence: number;
  date: string;
}

/**
 * Parser de lenguaje natural para entradas como:
 * "Hoy gasté 18.000 pesos en almuerzo y 7.000 en transporte"
 * "Ayer recibí 500.000 de sueldo y pagué 120.000 de internet"
 */
export function parseNaturalLanguageInput(text: string): ParsedItem[] {
  const results: ParsedItem[] = [];
  if (!text || typeof text !== 'string') return results;

  const todayStr = new Date().toISOString().substring(0, 10);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().substring(0, 10);

  let defaultDate = todayStr;
  if (/ayer/i.test(text)) {
    defaultDate = yesterdayStr;
  }

  // Dividir por conectores naturales de múltiples movimientos: " y ", " además ", " tambien ", ", "
  const clauses = text.split(/\s+(?:y|además|tambien|también)\s+|,\s*/i);

  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (!trimmed) continue;

    // Buscar patrones de monto numérico (ej. 18.000, 18000, $18.000, 18k)
    // Coincide con números con o sin puntos de miles
    const amountMatch = trimmed.match(/(?:\$|\s|^)([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:k|mil)?)(?:\s*(?:pesos|cop|usd|dólares|dolares))?/i);
    
    if (amountMatch) {
      let rawVal = amountMatch[1].toLowerCase();
      let multiplier = 1;
      if (rawVal.endsWith('k') || rawVal.endsWith('mil')) {
        rawVal = rawVal.replace(/(?:k|mil)/, '');
        multiplier = 1000;
      }
      // Limpiar puntos de miles
      const cleanVal = rawVal.replace(/\./g, '').replace(',', '.');
      const numericVal = parseFloat(cleanVal) * multiplier;

      if (!isNaN(numericVal) && numericVal > 0) {
        const isIncome = /(?:recib[íi]|gan[ée]|ingres[oó]|sueldo|abono|consignaci[oó]n|me pagaron)/i.test(trimmed);
        
        // Extraer descripción limpiando verbos y montos
        let desc = trimmed
          .replace(/(?:hoy|ayer|gast[ée]|compr[ée]|recib[íi]|gan[ée]|pagu[ée]|en|de|por|\$|pesos|cop|usd)/gi, '')
          .replace(amountMatch[0], '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!desc) {
          desc = isIncome ? 'Ingreso registrado' : 'Gasto registrado';
        } else {
          // Capitalizar primera letra
          desc = desc.charAt(0).toUpperCase() + desc.slice(1);
        }

        // Sugerir categoría por palabras clave
        let category = isIncome ? 'Salario / Sueldo' : 'Alimentación';
        if (/almuerzo|cena|comida|restaurante|caf[ée]|desayuno/i.test(trimmed)) {
          category = 'Alimentación';
        } else if (/transporte|uber|taxi|gasolina|bus|pasaje/i.test(trimmed)) {
          category = 'Transporte';
        } else if (/internet|luz|agua|gas|servicio/i.test(trimmed)) {
          category = 'Servicios Públicos';
        } else if (/netflix|spotify|suscripci[oó]n/i.test(trimmed)) {
          category = 'Suscripciones';
        } else if (/arriendo|arriendo|renta/i.test(trimmed)) {
          category = 'Vivienda';
        } else if (/farmacia|medicina|doctor|cita/i.test(trimmed)) {
          category = 'Salud y Bienestar';
        }

        results.push({
          description: desc,
          amountCents: dollarsToCents(numericVal),
          type: isIncome ? 'INCOME' : 'EXPENSE',
          categorySuggestion: category,
          confidence: 0.9,
          date: defaultDate,
        });
      }
    }
  }

  return results;
}

/**
 * Parser de texto de notificaciones bancarias comunes (Bancolombia, Nequi, Daviplata, BBVA, etc.)
 * Ej: "Bancolombia: Compra por $45.000 en EXITO CALLE 80 el 10/10/2026 14:20 con tarjeta *1234"
 */
export function parseBankNotification(text: string): ParsedItem | null {
  if (!text) return null;

  // Buscar monto
  const amountMatch = text.match(/\$\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+)/);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
  const amount = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) return null;

  // Detectar comercio después de "en", "a favor de" o "hacia"
  const merchantMatch = text.match(/(?:en|a favor de|hacia|comercio:?)\s+([A-Za-z0-9\s._-]+?)(?:\s+(?:el|por|con|\*|\d{2}\/)|$)/i);
  let merchant = merchantMatch ? merchantMatch[1].trim() : 'Compra comercio';

  // Limpiar palabras residuales
  merchant = merchant.replace(/^(el|la|los|un|una)\s+/i, '');
  if (merchant.length > 30) merchant = merchant.substring(0, 30);

  const isIncome = /(?:recibiste|transferencia recibida|abono a cuenta|te transfirieron)/i.test(text);

  return {
    description: merchant.toUpperCase(),
    amountCents: dollarsToCents(amount),
    type: isIncome ? 'INCOME' : 'EXPENSE',
    confidence: 0.95,
    date: new Date().toISOString().substring(0, 10),
  };
}
