import { queryAll, queryOne } from './db';
import { formatCurrency, centsToDollars } from './currency';
import { getDashboardMetrics, getBogotaCurrentMonth } from './financial-engine';

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

/**
 * FinTrack Copilot: Asistente financiero inteligente que consulta datos reales,
 * normaliza preguntas, y soporta fallback opcional a Anthropic Claude si existe ANTHROPIC_API_KEY.
 */
export async function askCopilot(userId: string, question: string, currency: string = 'COP'): Promise<CopilotResponse> {
  const norm = normalizeQuery(question);
  const currentMonth = getBogotaCurrentMonth(); // YYYY-MM en Bogota

  // =========================================================================
  // INTENCIÓN 0: AYUDA Y CAPACIDADES
  // =========================================================================
  if (
    norm === 'ayuda' ||
    norm.includes('que puedes hacer') ||
    norm.includes('como funciona') ||
    norm.includes('que preguntas') ||
    norm.includes('comandos')
  ) {
    return {
      answer: `Soy **FinTrack Copilot**, tu copiloto financiero inteligente. Analizo tus transacciones y cuentas en tiempo real.\n\nPuedes preguntarme:\n- **"¿En qué gasté más este mes?"** o **"Gasto por categorías"**\n- **"¿Cuál es mi saldo por cuenta?"** o **"Mis cuentas"**\n- **"¿Cuánto puedo gastar hasta fin de mes?"**\n- **"¿Qué presupuestos tengo excedidos?"**\n- **"¿Cuáles son mis próximos pagos o vencimientos?"**\n- **"¿Qué suscripciones estoy pagando?"**\n- **"¿Cómo voy comparado con el mes anterior?"**\n- **"¿Cuál es mi ahorro o flujo de efectivo?"**`,
      suggestedActions: [
        '¿En qué gasté más este mes?',
        '¿Cuál es mi saldo por cuenta?',
        '¿Qué presupuestos están excedidos?',
        '¿Cómo voy comparado con el mes anterior?',
      ],
    };
  }

  // =========================================================================
  // INTENCIÓN 1: GASTO POR CATEGORÍA / EN QUÉ GASTÉ MÁS
  // =========================================================================
  if (
    norm.includes('gaste mas') ||
    norm.includes('mayor gasto') ||
    norm.includes('categoria con mas gasto') ||
    norm.includes('gastos por categoria') ||
    norm.includes('en que gaste')
  ) {
    const topCategories = await queryAll<{ name: string; total: number; color: string }>(
      `SELECT c.name, COALESCE(SUM(t.amount_cents), 0) as total, c.color
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE') AND t.date::text LIKE ?
       GROUP BY c.id, c.name, c.color
       ORDER BY total DESC
       LIMIT 5`,
      [userId, `${currentMonth}%`]
    );

    if (topCategories.length === 0) {
      return {
        answer: `No he encontrado registros de gastos en el mes en curso (${currentMonth}). Puedes registrar tus compras manualmente o importar tu extracto bancario.`,
        suggestedActions: ['Registrar gasto rápido', 'Importar archivo CSV'],
      };
    }

    const totalExpenseRow = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total 
       FROM transactions 
       WHERE user_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE') AND date::text LIKE ?`,
      [userId, `${currentMonth}%`]
    );
    const totalMonth = totalExpenseRow?.total || 1;

    const top = topCategories[0];
    const topPct = Math.round((top.total / totalMonth) * 100);

    const breakdown = topCategories.map((c) => ({
      name: c.name,
      amount: formatCurrency(c.total, currency),
      percentage: Math.round((c.total / totalMonth) * 100),
    }));

    return {
      answer: `Tu mayor gasto durante este mes (${currentMonth}) corresponde a la categoría **${top.name}**, con un total acumulado de **${formatCurrency(top.total, currency)}** (**${topPct}%** del total del mes).`,
      categoryData: breakdown,
      suggestedActions: [
        `Ver movimientos de ${top.name}`,
        `Ajustar presupuesto para ${top.name}`,
        'Exportar informe mensual',
      ],
    };
  }

  // =========================================================================
  // INTENCIÓN 2: SALDO POR CUENTA / MIS CUENTAS
  // =========================================================================
  if (
    norm.includes('saldo por cuenta') ||
    norm.includes('saldos') ||
    norm.includes('mis cuentas') ||
    norm.includes('cuanto tengo en cada cuenta') ||
    norm.includes('saldo disponible')
  ) {
    const userAccounts = await queryAll<{ name: string; type: string; current_balance_cents: number; color: string }>(
      `SELECT name, type, current_balance_cents, color FROM accounts WHERE user_id = ? AND is_active = 1 ORDER BY current_balance_cents DESC`,
      [userId]
    );

    if (userAccounts.length === 0) {
      return {
        answer: 'No tienes cuentas financieras activas registradas actualmente. Agrega una cuenta en la sección "Cuentas y Deudas".',
        suggestedActions: ['Crear nueva cuenta', 'Ir a cuentas'],
      };
    }

    const list = userAccounts
      .map((a) => {
        const isCredit = a.type === 'CREDIT_CARD';
        return `- **${a.name}** (${a.type}): ${formatCurrency(a.current_balance_cents, currency)} ${isCredit ? '(Deuda)' : '(Disponible)'}`;
      })
      .join('\n');

    const totalAssets = userAccounts
      .filter((a) => a.type !== 'CREDIT_CARD')
      .reduce((sum, a) => sum + a.current_balance_cents, 0);

    return {
      answer: `Aquí está el desglose de tus saldos actuales:\n\n${list}\n\n**Saldo líquido total disponible:** ${formatCurrency(totalAssets, currency)}.`,
      suggestedActions: ['Registrar transferencia', 'Ver todas las cuentas'],
    };
  }

  // =========================================================================
  // INTENCIÓN 3: PRESUPUESTOS EXCEDIDOS / CONTROL DE PRESUPUESTO
  // =========================================================================
  if (
    norm.includes('presupuesto') ||
    norm.includes('excedido') ||
    norm.includes('sobrecosto') ||
    norm.includes('limite')
  ) {
    const budgetsWithSpent = await queryAll<{
      category_name: string;
      allocated_cents: number;
      spent_cents: number;
    }>(
      `SELECT c.name as category_name, b.allocated_cents,
              COALESCE((
                SELECT SUM(t.amount_cents) 
                FROM transactions t 
                WHERE t.user_id = b.user_id 
                  AND t.category_id = b.category_id 
                  AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE')
                  AND t.date::text LIKE ?
              ), 0) as spent_cents
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ? AND b.month_year = ?`,
      [`${currentMonth}%`, userId, currentMonth]
    );

    if (budgetsWithSpent.length === 0) {
      return {
        answer: `No tienes presupuestos asignados para el mes de ${currentMonth}. Asigna metas de gasto en el módulo de "Presupuestos" para tener alertas automáticas.`,
        suggestedActions: ['Asignar presupuesto mensual', 'Ver categorías'],
      };
    }

    const exceeded = budgetsWithSpent.filter((b) => b.spent_cents > b.allocated_cents);
    const warning = budgetsWithSpent.filter(
      (b) => b.spent_cents <= b.allocated_cents && b.spent_cents >= b.allocated_cents * 0.8
    );

    if (exceeded.length === 0 && warning.length === 0) {
      return {
        answer: `¡Excelente control! Ninguno de tus presupuestos está excedido para ${currentMonth}. Todos se encuentran por debajo del 80% de su límite asignado.`,
        suggestedActions: ['Ver estado de presupuestos', '¿Cuánto dinero puedo gastar?'],
      };
    }

    let report = '';
    if (exceeded.length > 0) {
      report += `⚠️ **Presupuestos Excedidos:**\n` + exceeded
        .map(
          (b) =>
            `- **${b.category_name}**: Gastado ${formatCurrency(b.spent_cents, currency)} de ${formatCurrency(b.allocated_cents, currency)} (+${formatCurrency(b.spent_cents - b.allocated_cents, currency)})`
        )
        .join('\n') + '\n\n';
    }

    if (warning.length > 0) {
      report += `⚡ **Cerca del límite (≥80%):**\n` + warning
        .map(
          (b) =>
            `- **${b.category_name}**: ${Math.round((b.spent_cents / b.allocated_cents) * 100)}% consumido (${formatCurrency(b.spent_cents, currency)} / ${formatCurrency(b.allocated_cents, currency)})`
        )
        .join('\n');
    }

    return {
      answer: report.trim(),
      suggestedActions: ['Ajustar presupuestos', 'Ver movimientos'],
    };
  }

  // =========================================================================
  // INTENCIÓN 4: DINERO DISPONIBLE / GASTO HASTA FIN DE MES
  // =========================================================================
  if (norm.includes('puedo gastar') || norm.includes('disponible') || norm.includes('fin de mes')) {
    const metrics = await getDashboardMetrics(userId, currentMonth);
    const availableCents = metrics.totalBalanceCents - metrics.committedObligationsCents;

    // Días restantes en el mes en Bogota
    const [yStr, mStr] = currentMonth.split('-');
    const nowBogota = new Date();
    const daysInMonth = new Date(parseInt(yStr), parseInt(mStr), 0).getDate();
    const currentDay = parseInt(nowBogota.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).substring(8, 10));
    const daysRemaining = Math.max(1, daysInMonth - currentDay);
    const dailyAvailableCents = Math.max(0, Math.round(availableCents / daysRemaining));

    return {
      answer: `Tienes un saldo total en cuentas de **${formatCurrency(metrics.totalBalanceCents, currency)}**, con **${formatCurrency(metrics.committedObligationsCents, currency)}** ya comprometidos en pagos pendientes. 
      \nPor lo tanto, tu saldo seguro disponible hasta fin de mes es de **${formatCurrency(Math.max(0, availableCents), currency)}**. Esto te permite un gasto diario recomendado de **${formatCurrency(dailyAvailableCents, currency)}/día** durante los próximos ${daysRemaining} días.`,
      suggestedActions: ['Ver obligaciones pendientes', 'Consultar presupuestos'],
    };
  }

  // =========================================================================
  // INTENCIÓN 5: SUSCRIPCIONES
  // =========================================================================
  if (norm.includes('suscripci') || norm.includes('netflix') || norm.includes('recurrente')) {
    const subscriptions = await queryAll<{ name: string; amount_cents: number; due_date: string; frequency: string }>(
      `SELECT name, amount_cents, due_date, frequency 
       FROM payment_obligations 
       WHERE user_id = ? AND is_subscription = 1 AND status != 'CANCELLED'`,
      [userId]
    );

    if (subscriptions.length === 0) {
      return {
        answer: 'No tienes suscripciones activas registradas en tus obligaciones de pago. Puedes añadir servicios como Netflix, Spotify o membresías desde el módulo de Pagos y Obligaciones.',
        suggestedActions: ['Registrar suscripción', 'Ver todas las obligaciones'],
      };
    }

    const totalSubCents = subscriptions.reduce((sum, s) => sum + s.amount_cents, 0);
    const subList = subscriptions
      .map((s) => `- **${s.name}**: ${formatCurrency(s.amount_cents, currency)} (${s.frequency})`)
      .join('\n');

    return {
      answer: `Actualmente tienes registradas **${subscriptions.length} suscripciones activas** que suman un total de **${formatCurrency(totalSubCents, currency)}** periódicos:\n\n${subList}`,
      suggestedActions: ['Optimizar gastos recurrentes', 'Añadir nueva suscripción'],
    };
  }

  // =========================================================================
  // INTENCIÓN 6: PRÓXIMOS PAGOS Y VENCIMIENTOS
  // =========================================================================
  if (
    norm.includes('proximos pagos') ||
    norm.includes('vencimiento') ||
    norm.includes('debo pagar') ||
    norm.includes('pendientes')
  ) {
    const upcoming = await queryAll<{ name: string; amount_cents: number; due_date: string; status: string }>(
      `SELECT name, amount_cents, due_date, status 
       FROM payment_obligations 
       WHERE user_id = ? AND status IN ('PENDING', 'DUE_SOON', 'OVERDUE')
       ORDER BY due_date ASC 
       LIMIT 5`,
      [userId]
    );

    if (upcoming.length === 0) {
      return {
        answer: '¡Excelente noticia! No tienes obligaciones de pago pendientes ni vencidas para los próximos días.',
        suggestedActions: ['Crear nuevo compromiso', 'Ver historial de pagos'],
      };
    }

    const list = upcoming
      .map(
        (b) =>
          `- **${b.name}**: ${formatCurrency(b.amount_cents, currency)} — Vence el ${b.due_date} (${b.status === 'OVERDUE' ? '⚠️ Vencido' : 'Pendiente'})`
      )
      .join('\n');

    return {
      answer: `Aquí están tus próximos compromisos de pago:\n\n${list}`,
      suggestedActions: ['Marcar como pagado', 'Gestionar cuentas bancarias'],
    };
  }

  // =========================================================================
  // INTENCIÓN 7: COMPARACIÓN CON MES ANTERIOR
  // =========================================================================
  if (
    norm.includes('mes anterior') ||
    norm.includes('comparado') ||
    norm.includes('comparacion') ||
    norm.includes('como voy con respecto')
  ) {
    const metrics = await getDashboardMetrics(userId, currentMonth);
    const change = metrics.expenseChangePercentage;
    const diffCents = Math.abs(metrics.monthlyExpenseCents - metrics.prevMonthExpenseCents);
    const direction = change > 0 ? 'aumentado' : change < 0 ? 'disminuido' : 'mantenido igual';

    return {
      answer: `En comparación con el mes anterior:\n- **Gasto este mes (${currentMonth}):** ${formatCurrency(metrics.monthlyExpenseCents, currency)}\n- **Gasto mes anterior:** ${formatCurrency(metrics.prevMonthExpenseCents, currency)}\n\nTus gastos han **${direction} un ${Math.abs(change)}%** (${formatCurrency(diffCents, currency)} de diferencia).`,
      suggestedActions: ['Ver gráficos de gastos', 'Ajustar presupuestos'],
    };
  }

  // =========================================================================
  // INTENCIÓN 8: AHORRO Y FLUJO DE EFECTIVO
  // =========================================================================
  if (norm.includes('ahorro') || norm.includes('ahorrado') || norm.includes('flujo de efectivo')) {
    const metrics = await getDashboardMetrics(userId, currentMonth);
    return {
      answer: `Durante este mes (${currentMonth}), has ingresado **${formatCurrency(metrics.monthlyIncomeCents, currency)}** y gastado **${formatCurrency(metrics.monthlyExpenseCents, currency)}**.
      \nTu flujo de caja neto es de **${formatCurrency(metrics.monthlyCashFlowCents, currency)}**, logrando una tasa de ahorro del **${metrics.savingsRatePercentage}%**.`,
      suggestedActions: ['Ver evolución de ahorros', 'Definir objetivo financiero'],
    };
  }

  // =========================================================================
  // FALLBACK OPCIONAL: ANTHROPIC CLAUDE SI EXISTE ANTHROPIC_API_KEY
  // =========================================================================
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const metrics = await getDashboardMetrics(userId, currentMonth);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: `Eres FinTrack Copilot, asistente financiero. Datos reales del usuario para ${currentMonth} (Moneda: ${currency}):
- Saldo: ${formatCurrency(metrics.totalBalanceCents, currency)}
- Ingresos: ${formatCurrency(metrics.monthlyIncomeCents, currency)}
- Gastos: ${formatCurrency(metrics.monthlyExpenseCents, currency)}
- Pagos pendientes: ${formatCurrency(metrics.committedObligationsCents, currency)}
- Tasa de ahorro: ${metrics.savingsRatePercentage}%

Pregunta del usuario: "${question}". Responde en español conciso, profesional y con base estricta en estos datos.`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text;
        if (text) {
          return {
            answer: text,
            suggestedActions: ['Ver movimientos', 'Revisar presupuestos'],
          };
        }
      }
    } catch (err) {
      console.warn('Anthropic API fallback failed, returning deterministic unknown response', err);
    }
  }

  // =========================================================================
  // RESPUESTA EXPLÍCITA CUANDO NO SE RECONOCE LA PREGUNTA
  // =========================================================================
  return {
    answer: `No entendí tu pregunta ("${question}"). Como asistente financiero basado en datos reales, puedo responderte consultas precisas sobre tus finanzas.\n\nPrueba preguntándome:\n- **"¿En qué gasté más este mes?"**\n- **"¿Cuál es mi saldo por cuenta?"**\n- **"¿Qué presupuestos tengo excedidos?"**\n- **"¿Cuáles son mis próximos vencimientos?"**\n- **"¿Qué suscripciones estoy pagando?"**\n- **"¿Cómo voy comparado con el mes anterior?"**\n- **"Escribe 'ayuda' para ver la guía completa."**`,
    suggestedActions: [
      '¿En qué gasté más este mes?',
      '¿Cuál es mi saldo por cuenta?',
      '¿Cuáles son mis próximos vencimientos?',
      'Ayuda',
    ],
  };
}
