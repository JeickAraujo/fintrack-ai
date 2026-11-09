import { dollarsToCents } from './currency';

export interface ParsedItem {
  description: string;
  amountCents: number;
  type: 'EXPENSE' | 'INCOME';
  categorySuggestion?: string;
  categoryId?: string;
  paymentMethod?: string;
  suggestedAccountId?: string;
  confidence: number;
  date: string;
}

/**
 * Parser de lenguaje natural local con heurísticas y expresiones regulares
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

    // Buscar patrones de monto numérico (ej. 18.000, 18000, $18.000, 18k, 3M)
    const amountMatch = trimmed.match(/(?:\$|\s|^)([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:k|mil|m)?)(?:\s*(?:pesos|cop|usd|dólares|dolares))?/i);
    
    if (amountMatch) {
      let rawVal = amountMatch[1].toLowerCase();
      let multiplier = 1;
      if (rawVal.endsWith('k') || rawVal.endsWith('mil')) {
        rawVal = rawVal.replace(/(?:k|mil)/, '');
        multiplier = 1000;
      } else if (rawVal.endsWith('m')) {
        rawVal = rawVal.replace(/m/, '');
        multiplier = 1000000;
      }
      // Limpiar puntos de miles
      const cleanVal = rawVal.replace(/\./g, '').replace(',', '.');
      const numericVal = parseFloat(cleanVal) * multiplier;

      if (!isNaN(numericVal) && numericVal > 0) {
        const isIncome = /(?:recib[íi]|gan[ée]|ingres[oó]|sueldo|abono|consignaci[oó]n|consignaron|me pagaron|agregaron|me agregaron|transfirieron|me transfirieron|cobr[ée])/i.test(trimmed);
        
        // Detectar método de pago si se menciona
        let detectedMethod = 'Efectivo';
        if (/nequi/i.test(trimmed)) detectedMethod = 'Nequi';
        else if (/daviplata/i.test(trimmed)) detectedMethod = 'Daviplata';
        else if (/tarjeta.*(?:d[ée]bito|debito)|d[ée]bito/i.test(trimmed)) detectedMethod = 'Tarjeta débito';
        else if (/cr[ée]dito|tarjeta/i.test(trimmed)) detectedMethod = 'Crédito';
        else if (/transferencia|bancolombia/i.test(trimmed)) detectedMethod = 'Transferencia';

        // Extraer descripción limpiando verbos, métodos y montos
        let desc = trimmed
          .replace(/(?:hoy|ayer|gast[ée]|compr[ée]|recib[íi]|gan[ée]|pagu[ée]|agregaron|consignaron|transfirieron|en|de|por|a|para|\$|pesos|cop|usd|nequi|daviplata|efectivo|tarjeta|debito|débito|credito|crédito)/gi, '').replace(/\b(?:me|le|nos|te)\b/gi, '')
          .replace(amountMatch[0], '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!desc) {
          desc = isIncome ? 'Ingreso registrado' : 'Gasto registrado';
        } else {
          // Capitalizar primera letra
          desc = desc.charAt(0).toUpperCase() + desc.slice(1);
        }

        // Sugerir categoría por palabras clave con límites de palabra precisos
        let category = isIncome ? 'Otros Ingresos' : 'Alimentación';
        if (/almuerzo|cena|comida|restaurante|caf[ée]|desayuno|salchipapa|pizza|hamburguesa|empanada|arepa|panaderia|mercado|d1|éxito|carulla|sándwich|pollo/i.test(trimmed)) {
          category = 'Alimentación';
        } else if (/\b(?:transporte|uber|didi|taxi|bus|pasaje|gasolina|peaje|metro)\b/i.test(trimmed)) {
          category = 'Transporte';
        } else if (/\b(?:internet|luz|agua|gas\b|servicio(?:s)?|energia|epm|enel|claro|tigo)\b/i.test(trimmed)) {
          category = 'Servicios Públicos';
        } else if (/netflix|spotify|suscripci[oó]n|prime|disney|apple|icloud/i.test(trimmed)) {
          category = 'Suscripciones';
        } else if (/arriendo|alquiler|renta|hipoteca|administraci[oó]n/i.test(trimmed)) {
          category = 'Vivienda';
        } else if (/farmacia|medicina|doctor|cita|eps|salud/i.test(trimmed)) {
          category = 'Salud y Bienestar';
        }

        results.push({
          description: desc,
          amountCents: dollarsToCents(numericVal),
          type: isIncome ? 'INCOME' : 'EXPENSE',
          categorySuggestion: category,
          paymentMethod: detectedMethod,
          confidence: 0.9,
          date: defaultDate,
        });
      }
    }
  }

  return results;
}

/**
 * Parser impulsado por IA con Groq (LLaMA/GPT-OSS) y fallback heurístico determinista
 */
export async function parseNaturalLanguageWithAI(text: string): Promise<ParsedItem[]> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (apiKey) {
    const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
    const systemPrompt = `Eres un extractor de gastos e ingresos financieros para Colombia.
Dado un texto libre del usuario, extrae un array JSON de transacciones con esta estructura exacta:
[
  {
    "description": "Nombre claro y limpio del comercio o concepto (ej: Salchipapa o Depósito)",
    "amount_cents": 1800000,
    "category_name": "Alimentación",
    "payment_method": "Nequi",
    "type": "EXPENSE",
    "date": "YYYY-MM-DD"
  }
]

REGLAS ESTRICTAS DE CATEGORÍA (debes elegir exactamente UNA sin barras ni plecas):
- Gastos: Alimentación, Transporte, Vivienda, Servicios Públicos, Suscripciones, Salud y Bienestar, Educación, Tecnología, Entretenimiento, Compras Personales, Tarjetas y Deudas.
- Ingresos: Salario / Sueldo, Honorarios / Freelance, Rendimientos / Inversiones, Otros Ingresos.

REGLAS DE TIPO Y MONTO:
- "100k" = 100000 pesos = 10000000 amount_cents.
- "18k" = 18000 pesos = 1800000 amount_cents.
- "me agregaron", "consignaron", "recibí", "transfirieron" -> type: "INCOME".
- "gasté", "pagué", "compré" -> type: "EXPENSE".

Responde ÚNICAMENTE el array JSON, sin formato markdown ni texto adicional.`;

    for (const model of models) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
            temperature: 0.1,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let rawContent = data.choices?.[0]?.message?.content?.trim() || '';
          if (rawContent.startsWith('```')) {
            rawContent = rawContent.replace(/^```(?:json)?\n?/, '').replace(/```$/, '').trim();
          }
          const parsed = JSON.parse(rawContent);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const todayStr = new Date().toISOString().substring(0, 10);

          if (list.length > 0 && list[0].amount_cents > 0) {
            return list.map((item: any) => ({
              description: item.description || 'Movimiento registrado',
              amountCents: Number(item.amount_cents) || 0,
              type: item.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
              categorySuggestion: item.category_name || 'Alimentación',
              paymentMethod: item.payment_method || 'Efectivo',
              confidence: 0.98,
              date: item.date || todayStr,
            }));
          }
        }
      } catch (err) {
        console.warn(`[NLP-AI] Error con modelo ${model}:`, err);
      }
    }
  }

  // Fallback determinista local
  return parseNaturalLanguageInput(text);
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
