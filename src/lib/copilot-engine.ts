import crypto from 'crypto';
import { queryAll, queryOne, execute } from './db';
import { formatCurrency, centsToDollars } from './currency';
import { getDashboardMetrics, getBogotaCurrentMonth, recalculateAccountBalance } from './financial-engine';
import { parseNaturalLanguageInput, parseNaturalLanguageWithAI } from './nlp-parser';

export interface CopilotResponse {
  answer: string;
  categoryData?: { name: string; amount: string; percentage: number }[];
  suggestedActions?: string[];
  metrics?: Record<string, string | number>;
}

/**
 * Normaliza un texto removiendo diacríticos (tildes), signos de puntuación y espacios redundantes
 */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes/marcas de acento
    .replace(/[¿?¡!.,:;_\-\/()]/g, ' ') // Quita signos
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FullFinancialContext {
  metrics: {
    totalBalanceCents: number;
    monthlyIncomeCents: number;
    monthlyExpenseCents: number;
    monthlyCashFlowCents: number;
    committedObligationsCents: number;
    savingsRatePercentage: number;
    prevMonthExpenseCents: number;
    expenseChangePercentage: number;
    budgetUsedPercentage: number;
  };
  accounts: { name: string; type: string; balance: string }[];
  categoryBreakdown: { name: string; amount: string; percentage: number }[];
  budgets: { category: string; allocated: string; spent: string; percentage: number; status: string }[];
  obligations: { name: string; amount: string; dueDate: string; frequency: string; isSubscription: boolean; status: string }[];
  recentTransactions: { date: string; description: string; amount: string; category: string; type: string; account: string }[];
}

/**
 * Recopila todo el estado financiero real y determinista del usuario desde la base de datos
 */
export async function getFullFinancialContext(userId: string, currentMonth: string, currency: string = 'COP'): Promise<FullFinancialContext> {
  let metrics = {
    totalBalanceCents: 0,
    monthlyIncomeCents: 0,
    monthlyExpenseCents: 0,
    monthlyCashFlowCents: 0,
    committedObligationsCents: 0,
    savingsRatePercentage: 0,
    prevMonthExpenseCents: 0,
    expenseChangePercentage: 0,
    budgetUsedPercentage: 0,
  };
  try {
    metrics = await getDashboardMetrics(userId, currentMonth);
  } catch (err) {
    console.warn('[Copilot] Error obteniendo métricas:', err);
  }

  // 1. Cuentas activas con sus saldos
  let accounts: { name: string; type: string; balance: string }[] = [];
  try {
    const accRows = await queryAll<{ name: string; type: string; current_balance_cents: number }>(
      `SELECT name, type, current_balance_cents FROM accounts WHERE user_id = ? AND is_active = true ORDER BY name ASC`,
      [userId]
    );
    accounts = accRows.map(a => ({
      name: a.name,
      type: a.type,
      balance: formatCurrency(a.current_balance_cents, currency),
    }));
  } catch (err) {
    console.warn('[Copilot] Error obteniendo cuentas:', err);
  }

  // 2. Gastos por categoría de este mes
  let categoryBreakdown: { name: string; amount: string; percentage: number }[] = [];
  try {
    const catRows = await queryAll<{ name: string; total: number }>(
      `SELECT c.name, COALESCE(SUM(t.amount_cents), 0) as total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE') AND t.date::text LIKE ?
       GROUP BY c.id, c.name
       ORDER BY total DESC`,
      [userId, `${currentMonth}%`]
    );
    const totalMonth = metrics.monthlyExpenseCents || 1;
    categoryBreakdown = catRows.map(c => ({
      name: c.name,
      amount: formatCurrency(c.total, currency),
      percentage: Math.round((c.total / totalMonth) * 100),
    }));
  } catch (err) {
    console.warn('[Copilot] Error obteniendo categorías:', err);
  }

  // 3. Presupuestos del mes
  let budgets: { category: string; allocated: string; spent: string; percentage: number; status: string }[] = [];
  try {
    const budgetRows = await queryAll<{ name: string; allocated_cents: number; spent_cents: number }>(
      `SELECT c.name, b.allocated_cents,
              COALESCE((SELECT SUM(amount_cents) FROM transactions 
                        WHERE user_id = b.user_id AND category_id = b.category_id 
                          AND type IN ('EXPENSE', 'CREDIT_PURCHASE') AND date::text LIKE ?), 0) as spent_cents
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ? AND b.month_year = ?`,
      [`${currentMonth}%`, userId, currentMonth]
    );
    budgets = budgetRows.map(b => {
      const pct = b.allocated_cents > 0 ? Math.round((b.spent_cents / b.allocated_cents) * 100) : 0;
      let status = 'Al día';
      if (pct > 100) status = 'EXCEDIDO';
      else if (pct >= 85) status = 'ALERTA (Cerca del límite)';
      return {
        category: b.name,
        allocated: formatCurrency(b.allocated_cents, currency),
        spent: formatCurrency(b.spent_cents, currency),
        percentage: pct,
        status,
      };
    });
  } catch (err) {
    console.warn('[Copilot] Error obteniendo presupuestos:', err);
  }

  // 4. Obligaciones y pagos pendientes / suscripciones
  let obligations: { name: string; amount: string; dueDate: string; frequency: string; isSubscription: boolean; status: string }[] = [];
  try {
    const oblRows = await queryAll<{ name: string; amount_cents: number; due_date: string; frequency: string; is_subscription: boolean; status: string }>(
      `SELECT name, amount_cents, due_date, frequency, is_subscription, status
       FROM payment_obligations
       WHERE user_id = ? AND (status = 'PENDING' OR is_subscription = true)
       ORDER BY due_date ASC LIMIT 10`,
      [userId]
    );
    obligations = oblRows.map(o => ({
      name: o.name,
      amount: formatCurrency(o.amount_cents, currency),
      dueDate: o.due_date,
      frequency: o.frequency,
      isSubscription: Boolean(o.is_subscription),
      status: o.status,
    }));
  } catch (err) {
    console.warn('[Copilot] Error obteniendo obligaciones:', err);
  }

  // 5. Historial reciente de movimientos
  let recentTransactions: { date: string; description: string; amount: string; category: string; type: string; account: string }[] = [];
  try {
    const txRows = await queryAll<{ date: string; description: string; amount_cents: number; category_name: string; type: string; account_name: string }>(
      `SELECT t.date, t.description, t.amount_cents, COALESCE(c.name, 'Sin categoría') as category_name, t.type, COALESCE(a.name, 'Cuenta') as account_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = ?
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT 15`,
      [userId]
    );
    recentTransactions = txRows.map(t => ({
      date: t.date,
      description: t.description,
      amount: formatCurrency(t.amount_cents, currency),
      category: t.category_name,
      type: t.type === 'INCOME' ? 'Ingreso' : 'Gasto',
      account: t.account_name,
    }));
  } catch (err) {
    console.warn('[Copilot] Error obteniendo transacciones recientes:', err);
  }

  return {
    metrics,
    accounts,
    categoryBreakdown,
    budgets,
    obligations,
    recentTransactions,
  };
}

/**
 * Consulta a la IA de Groq (openai/gpt-oss-120b y openai/gpt-oss-20b) con contexto financiero completo
 */
async function queryGroqFinancialAI(
  question: string,
  currency: string,
  currentMonth: string,
  context: FullFinancialContext
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const accountsSummary = context.accounts.length > 0
    ? context.accounts.map(a => `- ${a.name} (${a.type}): ${a.balance}`).join('\n')
    : '- No hay cuentas registradas';

  const categoriesSummary = context.categoryBreakdown.length > 0
    ? context.categoryBreakdown.map(c => `- ${c.name}: ${c.amount} (${c.percentage}% del total de gastos)`).join('\n')
    : '- Sin gastos categorizados aún este mes';

  const budgetsSummary = context.budgets.length > 0
    ? context.budgets.map(b => `- ${b.category}: Presupuestado ${b.allocated} | Gastado ${b.spent} (${b.percentage}%) [${b.status}]`).join('\n')
    : '- No tienes presupuestos asignados este mes';

  const obligationsSummary = context.obligations.length > 0
    ? context.obligations.map(o => `- ${o.name}: ${o.amount} (Vencimiento: ${o.dueDate}, ${o.frequency}${o.isSubscription ? ' • Suscripción' : ''}) [${o.status}]`).join('\n')
    : '- No tienes pagos u obligaciones pendientes registradas';

  const transactionsSummary = context.recentTransactions.length > 0
    ? context.recentTransactions.map(t => `- [${t.date}] ${t.type}: ${t.description} (${t.amount}) • ${t.category} vía ${t.account}`).join('\n')
    : '- Sin transacciones registradas aún';

  const systemPrompt = `Eres FinTrack Asistente IA, el asesor financiero personal experto, analítico, empático y cuantitativo del usuario en Colombia (Moneda: ${currency}).

Tienes acceso TOTAL y en tiempo real a la base de datos financiera del usuario para el mes actual (${currentMonth}):

=== RESUMEN GENERAL DEL MES (${currentMonth}) ===
- Saldo total disponible en todas las cuentas: ${formatCurrency(context.metrics.totalBalanceCents, currency)}
- Total de ingresos este mes: ${formatCurrency(context.metrics.monthlyIncomeCents, currency)}
- Total de gastos este mes: ${formatCurrency(context.metrics.monthlyExpenseCents, currency)}
- Flujo de caja neto (Ahorro neto): ${formatCurrency(context.metrics.monthlyCashFlowCents, currency)}
- Tasa de ahorro actual: ${context.metrics.savingsRatePercentage}%
- Dinero comprometido en obligaciones pendientes: ${formatCurrency(context.metrics.committedObligationsCents, currency)}
- Gastos del mes anterior: ${formatCurrency(context.metrics.prevMonthExpenseCents, currency)} (Variación: ${context.metrics.expenseChangePercentage}%)

=== SALDO POR CUENTA ===
${accountsSummary}

=== GASTOS POR CATEGORÍA ESTE MES ===
${categoriesSummary}

=== PRESUPUESTOS Y TOPES MENSUALES ===
${budgetsSummary}

=== PRÓXIMAS OBLIGACIONES, FACTURAS Y SUSCRIPCIONES ===
${obligationsSummary}

=== HISTORIAL RECIENTE DE TRANSACCIONES ===
${transactionsSummary}

=== INSTRUCCIONES CLAVE ===
1. Eres un modelo de IA inteligente con criterio financiero avanzado. Puedes responder CUALQUIER pregunta sobre el dinero del usuario:
   - Diagnósticos y opiniones ("¿Qué opinas de mis gastos?", "¿Cómo voy este mes?").
   - Escenarios hipotéticos y viabilidad ("¿Me alcanza para comprar una moto?", "¿Qué pasa si gasto 200k hoy?").
   - Consultas puntuales de saldos, transacciones, presupuestos o vencimientos.
   - Auditorías de gastos hormiga, suscripciones o fugas de dinero.
   - Comparaciones y planes de ahorro para metas futuras.
2. Razona a profundidad: cita SIEMPRE las cifras reales, nombres de cuenta y conceptos exactos de los datos del usuario.
3. Responde en español claro, profesional y empático. Usa formato Markdown con viñetas, negritas y estructura limpia.
4. Si el usuario te pide un consejo, bríndale recomendaciones prácticas y cuantificadas sobre sus números actuales.
5. No inventes datos que contradigan los números anteriores. Si falta un dato (ej. el usuario no ha registrado ingresos), haz la salvedad amablemente.`;

  // Modelos activos en la cuenta de Groq
  const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

  for (const model of modelsToTry) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 750,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          return text;
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[Copilot-AI] Modelo ${model} devolvió ${res.status}:`, errText);
      }
    } catch (err) {
      console.warn(`[Copilot-AI] Excepción conectando con modelo ${model}:`, err);
    }
  }

  return null;
}

/**
 * Motor determinista de respaldo cuando no hay conexión externa de IA
 */
function getDeterministicFallback(
  norm: string,
  question: string,
  currency: string,
  currentMonth: string,
  context: FullFinancialContext
): CopilotResponse {
  const { metrics, accounts, categoryBreakdown, budgets, obligations } = context;

  // 1. Ayuda
  if (norm === 'ayuda' || norm.includes('que puedes hacer') || norm.includes('comandos')) {
    return {
      answer: `Soy **FinTrack Asistente IA**, tu copiloto financiero inteligente. Analizo tus transacciones, cuentas, presupuestos y hábitos en tiempo real.\n\nPuedes preguntarme libremente lo que quieras sobre tu dinero, por ejemplo:\n- **"¿Qué opinas de mis gastos este mes?"**\n- **"¿Cuál es mi saldo por cuenta?"**\n- **"¿En qué categoría he gastado más?"**\n- **"¿Cuánto puedo gastar hasta fin de mes?"**\n- **"¿Qué facturas o suscripciones se me vencen pronto?"**\n- **"¿Tengo presupuestos en riesgo de superarse?"**\n- **"¿Cómo voy en comparación con el mes pasado?"**`,
      suggestedActions: [
        '¿Qué opinas de mis gastos?',
        '¿Cuál es mi saldo por cuenta?',
        '¿En qué gasté más este mes?',
        '¿Cuáles son mis próximos pagos?',
      ],
    };
  }

  // 2. Saldos de cuentas
  if (norm.includes('saldo') || norm.includes('mis cuentas') || norm.includes('cuanto tengo')) {
    if (accounts.length === 0) {
      return {
        answer: `Actualmente no tienes cuentas bancarias registradas. Crea una desde la sección de **Cuentas y Deudas** para empezar a monitorear tus saldos.`,
        suggestedActions: ['Ver Cuentas y Deudas'],
      };
    }
    const accList = accounts.map(a => `- **${a.name}:** ${a.balance}`).join('\n');
    return {
      answer: `Tu saldo total consolidado es de **${formatCurrency(metrics.totalBalanceCents, currency)}** distribuido en tus cuentas:\n\n${accList}`,
      suggestedActions: ['¿En qué gasté más este mes?', '¿Cuánto puedo gastar hasta fin de mes?'],
    };
  }

  // 3. Gastos por categoría / En qué gasté más
  if (norm.includes('gaste mas') || norm.includes('mayor gasto') || norm.includes('categoria') || norm.includes('en que gaste')) {
    if (categoryBreakdown.length === 0) {
      return {
        answer: `No tienes gastos registrados en ${currentMonth}. Registra tus gastos con la barra rápida o importa tu extracto bancario.`,
        suggestedActions: ['Registrar gasto rápido'],
      };
    }
    const top = categoryBreakdown[0];
    const catList = categoryBreakdown.map(c => `- **${c.name}:** ${c.amount} (${c.percentage}%)`).join('\n');
    return {
      answer: `Tu mayor gasto durante este mes (${currentMonth}) es en **${top.name}** con **${top.amount}** (${top.percentage}% del total).\n\n**Desglose por categorías:**\n${catList}`,
      categoryData: categoryBreakdown,
      suggestedActions: ['Ajustar presupuestos', '¿Cuánto puedo gastar hasta fin de mes?'],
    };
  }

  // 4. Presupuestos
  if (norm.includes('presupuesto') || norm.includes('excedido') || norm.includes('tope')) {
    if (budgets.length === 0) {
      return {
        answer: `No tienes presupuestos asignados para el periodo ${currentMonth}. Puedes fijar un presupuesto escribiendo por ejemplo: *"Presupuesto 500k comida"*`,
        suggestedActions: ['Fijar presupuesto', '¿En qué gasté más este mes?'],
      };
    }
    const bList = budgets.map(b => `- **${b.category}:** ${b.spent} de ${b.allocated} (${b.percentage}%) • **${b.status}**`).join('\n');
    return {
      answer: `Estado de tus presupuestos para **${currentMonth}**:\n\n${bList}`,
      suggestedActions: ['¿En qué gasté más este mes?', '¿Cuánto puedo gastar hasta fin de mes?'],
    };
  }

  // 5. Vencimientos / Obligaciones / Suscripciones
  if (norm.includes('vencimiento') || norm.includes('proximos pagos') || norm.includes('factura') || norm.includes('suscripci')) {
    if (obligations.length === 0) {
      return {
        answer: `No tienes pagos pendientes ni suscripciones registradas. Puedes agregar una escribiendo por ejemplo: *"Tengo que pagar internet 80k el 15"*`,
        suggestedActions: ['Ver obligaciones'],
      };
    }
    const oList = obligations.map(o => `- **${o.name}:** ${o.amount} (Vence: ${o.dueDate}${o.isSubscription ? ' • Suscripción' : ''})`).join('\n');
    return {
      answer: `Tus próximos compromisos y suscripciones son:\n\n${oList}\n\nTotal comprometido: **${formatCurrency(metrics.committedObligationsCents, currency)}**.`,
      suggestedActions: ['¿Cuánto dinero puedo gastar hasta fin de mes?', '¿Cuál es mi saldo por cuenta?'],
    };
  }

  // 6. Diagnóstico y opinión financiera
  let healthBadge = '🟢 **Salud Financiera Positiva**';
  let diagnosis = '';
  if (metrics.monthlyIncomeCents === 0 && metrics.monthlyExpenseCents > 0) {
    healthBadge = '⚠️ **Solo Egresos Registrados**';
    diagnosis = `Llevas un acumulado de **${formatCurrency(metrics.monthlyExpenseCents, currency)}** en gastos durante ${currentMonth}, pero aún no has registrado ingresos. Te sugiero anotar tu sueldo para calcular tu tasa de ahorro real.`;
  } else if (metrics.monthlyCashFlowCents < 0) {
    healthBadge = '🔴 **Atención a tu Flujo de Caja**';
    diagnosis = `Tus gastos del mes (**${formatCurrency(metrics.monthlyExpenseCents, currency)}**) superan a tus ingresos (**${formatCurrency(metrics.monthlyIncomeCents, currency)}**) por **${formatCurrency(Math.abs(metrics.monthlyCashFlowCents), currency)}**. Prioriza recortar compras no esenciales.`;
  } else if (metrics.savingsRatePercentage >= 20) {
    healthBadge = '🟢 **Salud Financiera Excelente**';
    diagnosis = `¡Vas por excelente camino! Estás ahorrando el **${metrics.savingsRatePercentage}%** de tus ingresos (${formatCurrency(metrics.monthlyCashFlowCents, currency)} netos), superando el 20% recomendado.`;
  } else {
    healthBadge = '🟡 **Salud Financiera Moderada**';
    diagnosis = `Estás ahorrando el **${metrics.savingsRatePercentage}%** (${formatCurrency(metrics.monthlyCashFlowCents, currency)} netos). Tu margen es positivo pero ajustado.`;
  }

  const topText = categoryBreakdown.length > 0 ? `\n- **Mayor gasto:** ${categoryBreakdown[0].name} (${categoryBreakdown[0].amount})` : '';

  return {
    answer: `${healthBadge}\n\n${diagnosis}\n\n**Tus cifras clave en ${currentMonth}:**\n- **Saldo total disponible:** ${formatCurrency(metrics.totalBalanceCents, currency)}\n- **Ingresos del mes:** ${formatCurrency(metrics.monthlyIncomeCents, currency)}\n- **Gastos del mes:** ${formatCurrency(metrics.monthlyExpenseCents, currency)}\n- **Flujo de caja neto:** ${formatCurrency(metrics.monthlyCashFlowCents, currency)}\n- **Obligaciones pendientes:** ${formatCurrency(metrics.committedObligationsCents, currency)}${topText}\n\nPuedes preguntarme cualquier duda específica sobre tus gastos, cuentas o proyecciones.`,
    suggestedActions: [
      '¿Qué opinas de mis gastos?',
      '¿En qué gasté más este mes?',
      '¿Cuál es mi saldo por cuenta?',
      '¿Cuáles son mis próximos pagos?',
    ],
  };
}

/**
 * FinTrack Asistente IA: Asistente financiero inteligente impulsado por IA conversacional
 * con razonamiento sobre datos deterministas reales y ejecución en lenguaje natural.
 */
export async function askCopilot(userId: string, question: string, currency: string = 'COP'): Promise<CopilotResponse> {
  const norm = normalizeQuery(question);
  const currentMonth = getBogotaCurrentMonth(); // YYYY-MM en Bogota

  // =========================================================================
  // FASE 1: DETECCIÓN DE REGISTRO DE MOVIMIENTOS EN LENGUAJE NATURAL
  // =========================================================================
  const isPureQuestion =
    norm.startsWith('en que gaste') ||
    norm.startsWith('cuanto gaste') ||
    norm.startsWith('cuanto puedo gastar') ||
    norm.startsWith('cual es mi saldo') ||
    norm.startsWith('que presupuesto') ||
    norm.startsWith('cuales son mis') ||
    norm.startsWith('que opinas') ||
    norm.startsWith('como van') ||
    norm.startsWith('como estan') ||
    norm.startsWith('puedo gastar') ||
    norm.startsWith('me alcanza');

  const hasRecordKeywords = /(?:registra|anota|anotar|agrega|agregaron|consignaron|transfirieron|gast[ée]|pagu[ée]|compr[ée]|recib[íi]|ingres[oó]|abono|sueldo|salario|almuerzo|comida|gasolina|uber|didi|mercado|presupuesto|presupuestar|factura|vence|vencimiento|tengo que pagar|saldo en|actualizar saldo|deuda)/i.test(question);

  if (hasRecordKeywords && !isPureQuestion) {
    try {
      const parsedItems = await parseNaturalLanguageWithAI(question);
      if (parsedItems.length > 0 && parsedItems[0].amountCents > 0) {
        const item = parsedItems[0];
        const now = new Date().toISOString();

        // 1. Resolver Categoría
        let categoryId: string | null = null;
        if (item.categorySuggestion) {
          const cleanCat = item.categorySuggestion.split('|')[0].trim();
          let cat = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND LOWER(name) = LOWER(?) LIMIT 1`,
            [userId, cleanCat]
          );
          if (!cat) {
            cat = await queryOne<{ id: string; name: string }>(
              `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND (LOWER(name) LIKE ? OR LOWER(?) LIKE LOWER(CONCAT('%', name, '%'))) LIMIT 1`,
              [userId, `%${cleanCat.toLowerCase()}%`, cleanCat]
            );
          }
          if (cat) {
            categoryId = cat.id;
            item.categorySuggestion = cat.name;
          }
        }

        // 2. ACCIÓN SEGÚN INTENCIÓN DETECTADA

        // A. OBLIGACIÓN / PAGO PENDIENTE
        if (item.intent === 'OBLIGATION') {
          const id = crypto.randomUUID();
          const dueDate = item.dueDate || item.date || now.substring(0, 10);
          await execute(
            `INSERT INTO payment_obligations (id, user_id, name, amount_cents, due_date, frequency, category_id, account_id, status, is_subscription, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'PENDING', ?, ?)`,
            [id, userId, item.description.trim(), item.amountCents, dueDate, item.frequency || 'MONTHLY', categoryId, Boolean(item.isSubscription), now]
          );

          return {
            answer: `✅ **Obligación programada exitosamente**:\n\n- **Concepto:** ${item.description}\n- **Monto:** ${formatCurrency(item.amountCents, currency)}\n- **Fecha de vencimiento:** ${dueDate}\n- **Categoría:** ${item.categorySuggestion || 'Servicios Públicos'}\n\nHa sido programada en tus Obligaciones y Pagos pendientes.`,
            suggestedActions: [
              '¿Cuáles son mis próximos pagos?',
              '¿Cuánto dinero puedo gastar hasta fin de mes?',
              'Ver obligaciones',
            ],
          };
        }

        // B. PRESUPUESTO MENSUAL
        if (item.intent === 'BUDGET') {
          const monthYear = item.monthYear || currentMonth;
          if (!categoryId) {
            const defCat = await queryOne<{ id: string }>(
              `SELECT id FROM categories WHERE user_id = ? OR is_system = true ORDER BY id ASC LIMIT 1`,
              [userId]
            );
            categoryId = defCat?.id || null;
          }

          if (categoryId) {
            const existing = await queryOne<{ id: string }>(
              `SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month_year = ?`,
              [userId, categoryId, monthYear]
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
                [id, userId, categoryId, monthYear, item.amountCents, now]
              );
            }

            return {
              answer: `✅ **Presupuesto asignado exitosamente**:\n\n- **Categoría:** ${item.categorySuggestion || 'Alimentación'}\n- **Monto asignado:** ${formatCurrency(item.amountCents, currency)}\n- **Mes:** ${monthYear}\n\nEl seguimiento de este presupuesto ya se encuentra activo en tu Dashboard.`,
              suggestedActions: [
                '¿Qué presupuestos tengo excedidos?',
                '¿En qué gasté más este mes?',
                'Ver presupuestos',
              ],
            };
          }
        }

        // C. ACTUALIZACIÓN DE CUENTA / DEUDA
        if (item.intent === 'ACCOUNT') {
          const accName = item.accountName || item.paymentMethod || 'Efectivo';
          let targetAccount = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM accounts WHERE user_id = ? AND is_active = true AND LOWER(name) LIKE ? LIMIT 1`,
            [userId, `%${accName.toLowerCase()}%`]
          );

          if (!targetAccount) {
            const newAccId = crypto.randomUUID();
            const cleanName = accName.charAt(0).toUpperCase() + accName.slice(1);
            const accType = item.accountType || 'CHECKING';
            const color = accType === 'CREDIT_CARD' ? '#f59e0b' : '#10b981';
            await execute(
              `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, true, ?)`,
              [newAccId, userId, cleanName, accType, item.amountCents, item.amountCents, color, now]
            );
            targetAccount = { id: newAccId, name: cleanName };
          } else {
            const existing = await queryOne<any>(`SELECT * FROM accounts WHERE id = ?`, [targetAccount.id]);
            const incomes = await queryOne<{ total: string | number }>(
              `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type = 'INCOME'`,
              [targetAccount.id]
            );
            const expenses = await queryOne<{ total: string | number }>(
              `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE')`,
              [targetAccount.id]
            );
            const totalIncome = Number(incomes?.total || 0);
            const totalExpense = Number(expenses?.total || 0);
            const newInitial = existing.type === 'CREDIT_CARD'
              ? item.amountCents - totalExpense
              : item.amountCents - totalIncome + totalExpense;

            await execute(
              `UPDATE accounts SET initial_balance_cents = ? WHERE id = ?`,
              [newInitial, targetAccount.id]
            );
            await recalculateAccountBalance(targetAccount.id);
          }

          return {
            answer: `✅ **Cuenta actualizada exitosamente**:\n\n- **Cuenta:** ${targetAccount.name}\n- **Nuevo Saldo:** ${formatCurrency(item.amountCents, currency)}\n\nTus saldos e indicadores consolidados se han sincronizado con exactitud.`,
            suggestedActions: [
              '¿Cuál es mi saldo por cuenta?',
              '¿Cuánto dinero puedo gastar hasta fin de mes?',
              'Ver todas las cuentas',
            ],
          };
        }

        // D. MOVIMIENTO HABITUAL (GASTO / INGRESO)
        let targetAccount: { id: string; name: string } | null = null;
        if (item.paymentMethod && item.paymentMethod.toLowerCase() !== 'efectivo') {
          targetAccount = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM accounts WHERE user_id = ? AND is_active = true AND LOWER(name) LIKE ? LIMIT 1`,
            [userId, `%${item.paymentMethod.toLowerCase()}%`]
          );
        }

        if (!targetAccount && item.paymentMethod && ['nequi', 'daviplata'].includes(item.paymentMethod.toLowerCase())) {
          const newAccId = crypto.randomUUID();
          const accName = item.paymentMethod.charAt(0).toUpperCase() + item.paymentMethod.slice(1);
          const accColor = item.paymentMethod.toLowerCase() === 'nequi' ? '#e11d48' : '#dc2626';
          await execute(
            `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
             VALUES (?, ?, ?, 'CHECKING', 0, 0, ?, true, ?)`,
            [newAccId, userId, accName, accColor, now]
          );
          targetAccount = { id: newAccId, name: accName };
        }

        if (!targetAccount) {
          targetAccount = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM accounts WHERE user_id = ? AND is_active = true ORDER BY current_balance_cents DESC LIMIT 1`,
            [userId]
          );
        }

        if (targetAccount) {
          const txId = crypto.randomUUID();
          const safeAmountCents = Math.round(Number(item.amountCents)) || 0;
          await execute(
            `INSERT INTO transactions 
             (id, user_id, account_id, category_id, type, amount_cents, date, description, payment_method, status, notes, source, is_recurring, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLEARED', ?, 'NLP_COPILOT', false, ?)`,
            [
              txId,
              userId,
              targetAccount.id,
              categoryId,
              item.type,
              safeAmountCents,
              item.date,
              item.description,
              item.paymentMethod || 'Efectivo',
              `Registrado por FinTrack Asistente IA: "${question}"`,
              now,
            ]
          );

          await recalculateAccountBalance(targetAccount.id);

          return {
            answer: `✅ **${item.type === 'INCOME' ? 'Ingreso registrado' : 'Gasto registrado'} exitosamente**:\n\n- **Descripción:** ${item.description}\n- **Monto:** ${formatCurrency(item.amountCents, currency)}\n- **Tipo:** ${item.type === 'INCOME' ? 'Ingreso 💰' : 'Gasto 🛒'}\n- **Cuenta:** ${targetAccount.name}\n- **Categoría:** ${item.categorySuggestion || 'General'}\n- **Fecha:** ${item.date}\n\nTu saldo y tus métricas se han actualizado con exactitud.`,
            suggestedActions: [
              '¿Cuál es mi saldo por cuenta?',
              '¿En qué gasté más este mes?',
              'Ver movimientos',
            ],
          };
        }
      }
    } catch (locErr) {
      console.error('[Copilot] Falló registro inteligente de movimiento:', locErr);
    }
  }

  // =========================================================================
  // FASE 2: MOTOR DE INTELIGENCIA ARTIFICIAL NATIVO (GROQ LPU / LLM)
  // =========================================================================
  // Recopilar contexto financiero integral del usuario
  const context = await getFullFinancialContext(userId, currentMonth, currency);

  // Intentar responder con la IA de Groq (openai/gpt-oss-120b)
  const aiAnswer = await queryGroqFinancialAI(question, currency, currentMonth, context);
  if (aiAnswer) {
    return {
      answer: aiAnswer,
      categoryData: context.categoryBreakdown.length > 0 ? context.categoryBreakdown : undefined,
      suggestedActions: [
        '¿En qué gasté más este mes?',
        '¿Cuál es mi saldo por cuenta?',
        '¿Cuánto dinero puedo gastar hasta fin de mes?',
        '¿Cuáles son mis próximos vencimientos?',
      ],
    };
  }

  // =========================================================================
  // FASE 3: RESPALDO DETERMINISTA RESILIENTE (CUANDO NO HAY IA DISPONIBLE)
  // =========================================================================
  return getDeterministicFallback(norm, question, currency, currentMonth, context);
}
