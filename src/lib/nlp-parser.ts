import { dollarsToCents } from './currency';

export type NlpIntent = 'TRANSACTION' | 'OBLIGATION' | 'BUDGET' | 'ACCOUNT';

export interface ParsedItem {
  intent: NlpIntent;
  description: string;
  amountCents: number;
  type: 'EXPENSE' | 'INCOME';
  categorySuggestion?: string;
  categoryId?: string;
  paymentMethod?: string;
  suggestedAccountId?: string;
  confidence: number;
  date: string; // YYYY-MM-DD

  // Obligaciones
  dueDate?: string; // YYYY-MM-DD
  frequency?: string; // 'MONTHLY', 'ONCE', 'YEARLY', 'WEEKLY'
  isSubscription?: boolean;

  // Presupuestos
  monthYear?: string; // YYYY-MM

  // Cuentas y Deudas
  accountAction?: 'UPDATE_BALANCE' | 'CREATE';
  accountName?: string;
  accountType?: 'SAVINGS' | 'CHECKING' | 'WALLET' | 'CASH' | 'CREDIT_CARD';
  creditLimitCents?: number;
}

/**
 * Parser de lenguaje natural local con heurísticas y expresiones regulares deterministas
 */
export function parseNaturalLanguageInput(text: string): ParsedItem[] {
  const results: ParsedItem[] = [];
  if (!text || typeof text !== 'string') return results;

  const today = new Date();
  const todayStr = today.toISOString().substring(0, 10);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().substring(0, 10);
  const currentMonthYear = todayStr.substring(0, 7);

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
    let numericVal = 0;
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
      const cleanVal = rawVal.replace(/\./g, '').replace(',', '.');
      numericVal = parseFloat(cleanVal) * multiplier;
    }

    const amountCents = !isNaN(numericVal) && numericVal > 0 ? dollarsToCents(numericVal) : 0;

    // Detectar método de pago o cuenta
    let detectedAccount = 'Efectivo';
    let accountType: 'SAVINGS' | 'CHECKING' | 'WALLET' | 'CASH' | 'CREDIT_CARD' = 'CASH';
    if (/nequi/i.test(trimmed)) { detectedAccount = 'Nequi'; accountType = 'WALLET'; }
    else if (/daviplata/i.test(trimmed)) { detectedAccount = 'Daviplata'; accountType = 'WALLET'; }
    else if (/tarjeta.*(?:d[ée]bito|debito)|d[ée]bito/i.test(trimmed)) { detectedAccount = 'Tarjeta débito'; accountType = 'CHECKING'; }
    else if (/cr[ée]dito|tarjeta/i.test(trimmed)) { detectedAccount = 'Tarjeta de Crédito'; accountType = 'CREDIT_CARD'; }
    else if (/bancolombia/i.test(trimmed)) { detectedAccount = 'Bancolombia'; accountType = 'SAVINGS'; }
    else if (/banco|ahorros/i.test(trimmed)) { detectedAccount = 'Cuenta de Ahorros'; accountType = 'SAVINGS'; }

    // Detectar categoría sugerida
    let category = 'General';
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

    // 1. INTENCIÓN: PRESUPUESTO
    if (/\b(?:presupuesto|presupuestar|fijar presupuesto|tope|limite de gasto)\b/i.test(trimmed)) {
      results.push({
        intent: 'BUDGET',
        description: `Presupuesto ${category !== 'General' ? category : 'Mensual'}`,
        amountCents,
        type: 'EXPENSE',
        categorySuggestion: category !== 'General' ? category : 'Alimentación',
        monthYear: currentMonthYear,
        confidence: 0.95,
        date: defaultDate,
      });
      continue;
    }

    // 2. INTENCIÓN: ACTUALIZAR O EDITAR CUENTA / DEUDA
    if (/\b(?:saldo en|saldo de|tengo .* en|actualizar saldo|editar saldo|crear cuenta|nueva cuenta|deuda tarjeta|deuda de)\b/i.test(trimmed)) {
      const isCreate = /\b(?:crear|nueva|abrir)\b/i.test(trimmed);
      results.push({
        intent: 'ACCOUNT',
        description: isCreate ? `Crear cuenta ${detectedAccount}` : `Actualizar saldo ${detectedAccount}`,
        amountCents,
        type: accountType === 'CREDIT_CARD' ? 'EXPENSE' : 'INCOME',
        accountName: detectedAccount,
        accountAction: isCreate ? 'CREATE' : 'UPDATE_BALANCE',
        accountType,
        confidence: 0.95,
        date: defaultDate,
      });
      continue;
    }

    // 3. INTENCIÓN: OBLIGACIÓN / PAGO PENDIENTE
    if (/\b(?:tengo que pagar|pagar|vence|vencimiento|factura|cuota|obligaci[oó]n|recibo|recordar pago)\b/i.test(trimmed)) {
      const dayMatch = trimmed.match(/(?:el|día|dia|vence|para el)\s+([0-9]{1,2})/i);
      let dueDay = dayMatch ? parseInt(dayMatch[1], 10) : 15;
      if (dueDay < 1) dueDay = 1;
      if (dueDay > 31) dueDay = 28;
      const dueDayStr = dueDay < 10 ? `0${dueDay}` : `${dueDay}`;
      const dueDate = `${currentMonthYear}-${dueDayStr}`;

      const isSub = /suscripci[oó]n|netflix|spotify|disney|prime|youtube|icloud/i.test(trimmed);
      let cleanDesc = trimmed
        .replace(/\b(?:tengo que pagar|pagar|vence|vencimiento|factura|cuota|obligaci[oó]n|recibo|recordar pago|de|el|para|por)\b/gi, '')
        .replace(/\$|pesos|cop|usd/gi, '')
        .replace(amountMatch ? amountMatch[0] : '', '')
        .replace(/\b[0-9]{1,2}\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanDesc) cleanDesc = `Pago de ${category !== 'General' ? category : 'Obligación'}`;
      cleanDesc = cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1);

      results.push({
        intent: 'OBLIGATION',
        description: cleanDesc,
        amountCents,
        type: 'EXPENSE',
        categorySuggestion: category !== 'General' ? category : 'Servicios Públicos',
        dueDate,
        frequency: /cada mes|mensual/i.test(trimmed) ? 'MONTHLY' : 'MONTHLY',
        isSubscription: isSub,
        paymentMethod: detectedAccount,
        confidence: 0.92,
        date: defaultDate,
      });
      continue;
    }

    // 4. INTENCIÓN: TRANSACCIÓN HABITUAL (GASTO / INGRESO)
    if (amountCents > 0) {
      const isIncome = /(?:recib[íi]|gan[ée]|ingres[oó]|sueldo|abono|consignaci[oó]n|consignaron|me pagaron|agregaron|me agregaron|transfirieron|me transfirieron|cobr[ée])/i.test(trimmed);
      let desc = trimmed
        .replace(/\b(?:hoy|ayer|gast[ée]|compr[ée]|recib[íi]|gan[ée]|pagu[ée]|agregaron|consignaron|transfirieron|en|de|por|a|para|nequi|daviplata|efectivo|tarjeta|debito|débito|credito|crédito|me|le|nos|te)\b/gi, '')
        .replace(/\$|pesos|cop|usd/gi, '')
        .replace(amountMatch ? amountMatch[0] : '', '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!desc) {
        desc = isIncome ? `Depósito en ${detectedAccount}` : 'Gasto registrado';
      } else {
        desc = desc.charAt(0).toUpperCase() + desc.slice(1);
      }

      const finalCat = isIncome ? 'Otros Ingresos' : (category !== 'General' ? category : 'Alimentación');

      results.push({
        intent: 'TRANSACTION',
        description: desc,
        amountCents,
        type: isIncome ? 'INCOME' : 'EXPENSE',
        categorySuggestion: finalCat,
        paymentMethod: detectedAccount,
        confidence: 0.9,
        date: defaultDate,
      });
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
    const systemPrompt = `Eres el extractor financiero inteligente de FinTrack AI para Colombia.
Dado un texto del usuario en lenguaje natural, analiza la intención y extrae un array JSON de acciones estructuradas.
Detecta cuál de las siguientes 4 intenciones ("intent") corresponde al texto:

1. "TRANSACTION": Compras, gastos o ingresos cotidianos ya ocurridos.
   Ejemplos: "gasté 18k en salchipapa", "me agregaron 100k a nequi", "almuerzo 20.000 en efectivo", "uber 14k".
   Campos: intent="TRANSACTION", description, amount_cents, type ("EXPENSE"|"INCOME"), category_name, payment_method, date ("YYYY-MM-DD").

2. "OBLIGATION": Pagos futuros, facturas pendientes, cuotas de créditos, arriendos o suscripciones que vencen en una fecha.
   Ejemplos: "tengo que pagar internet 80k el 15", "factura de spotify 20.000 el 28", "arriendo 1.2M cada mes el 5", "cuota de moto 350k el 30 de noviembre".
   Campos: intent="OBLIGATION", description (ej: "Internet"), amount_cents, category_name, due_date ("YYYY-MM-DD"), frequency ("MONTHLY"|"ONCE"), is_subscription (boolean).

3. "BUDGET": Límites de gasto mensual o metas presupuestarias para una categoría.
   Ejemplos: "presupuesto de 600k para comida este mes", "fijar presupuesto de transporte en 200.000", "quiero presupuestar 150k en entretenimiento".
   Campos: intent="BUDGET", description (ej: "Presupuesto Alimentación"), amount_cents, category_name, month_year ("YYYY-MM").

4. "ACCOUNT": Actualización de saldo de cuentas/billeteras/tarjetas o creación de nuevas cuentas/deudas.
   Ejemplos: "mi saldo en Nequi ahora es 350.000", "actualizar saldo de Bancolombia a 1.5M", "tengo 80k en efectivo", "crear cuenta Ahorros con 500k", "mi tarjeta de crédito tiene deuda de 450.000".
   Campos: intent="ACCOUNT", description (ej: "Nequi"), amount_cents, account_name ("Nequi"|"Bancolombia"|"Efectivo"|etc), account_action ("UPDATE_BALANCE"|"CREATE"), account_type ("WALLET"|"SAVINGS"|"CHECKING"|"CASH"|"CREDIT_CARD").

REGLAS DE CATEGORÍA:
- Gastos/Obligaciones/Presupuestos: "Alimentación", "Transporte", "Vivienda", "Servicios Públicos", "Suscripciones", "Salud y Bienestar", "Educación", "Tecnología", "Entretenimiento", "Compras Personales", "Tarjetas y Deudas".
- Ingresos: "Salario / Sueldo", "Honorarios / Freelance", "Rendimientos / Inversiones", "Otros Ingresos".
Elige solo una categoría exacta de la lista, sin plecas ni inventar nombres.

REGLAS DE MONTO:
- "100k" o "100 mil" = 100000 pesos = 10000000 amount_cents.
- "18k" = 18000 pesos = 1800000 amount_cents.
- "1.2M" o "1.2 millones" = 1200000 pesos = 120000000 amount_cents.
- amount_cents siempre es el valor en centavos (monto en pesos * 100).

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
          const currentMonthYear = todayStr.substring(0, 7);

          if (list.length > 0 && Number(list[0].amount_cents) > 0) {
            return list.map((item: any) => {
              const intent: NlpIntent =
                item.intent === 'OBLIGATION' ||
                item.intent === 'BUDGET' ||
                item.intent === 'ACCOUNT'
                  ? item.intent
                  : 'TRANSACTION';

              let dueDate = item.due_date;
              if (intent === 'OBLIGATION' && !dueDate) {
                dueDate = `${currentMonthYear}-15`;
              }

              let monthYear = item.month_year;
              if (intent === 'BUDGET' && (!monthYear || !monthYear.includes('-'))) {
                monthYear = currentMonthYear;
              }

              return {
                intent,
                description: item.description || 'Acción financiera',
                amountCents: Math.round(Number(item.amount_cents)) || 0,
                type: item.type?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE',
                categorySuggestion: item.category_name || (intent === 'OBLIGATION' ? 'Servicios Públicos' : 'Alimentación'),
                paymentMethod: item.payment_method || item.account_name || 'Efectivo',
                confidence: 0.98,
                date: item.date || todayStr,
                dueDate,
                frequency: item.frequency || 'MONTHLY',
                isSubscription: Boolean(item.is_subscription),
                monthYear,
                accountAction: item.account_action?.includes('create') ? 'CREATE' : 'UPDATE_BALANCE',
                accountName: item.account_name || item.payment_method || 'Cuenta',
                accountType: item.account_type || 'CHECKING',
              };
            });
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
 */
export function parseBankNotification(text: string): ParsedItem | null {
  if (!text) return null;

  const amountMatch = text.match(/\$\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+)/);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
  const amount = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) return null;

  const merchantMatch = text.match(/(?:en|a favor de|hacia|comercio:?)\s+([A-Za-z0-9\s._-]+?)(?:\s+(?:el|por|con|\*|\d{2}\/)|$)/i);
  let merchant = merchantMatch ? merchantMatch[1].trim() : 'Compra comercio';

  merchant = merchant.replace(/^(el|la|los|un|una)\s+/i, '');
  if (merchant.length > 30) merchant = merchant.substring(0, 30);

  const isIncome = /(?:recibiste|transferencia recibida|abono a cuenta|te transfirieron)/i.test(text);

  return {
    intent: 'TRANSACTION',
    description: merchant.toUpperCase(),
    amountCents: dollarsToCents(amount),
    type: isIncome ? 'INCOME' : 'EXPENSE',
    confidence: 0.95,
    date: new Date().toISOString().substring(0, 10),
  };
}
