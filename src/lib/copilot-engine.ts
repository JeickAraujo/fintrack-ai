import { queryAll, queryOne } from './db';
import { formatCurrency, centsToDollars } from './currency';
import { getDashboardMetrics } from './financial-engine';

export interface CopilotResponse {
  answer: string;
  categoryData?: { name: string; amount: string; percentage: number }[];
  suggestedActions?: string[];
  metrics?: Record<string, string | number>;
}

/**
 * FinTrack Copilot: Asistente financiero inteligente que consulta datos reales
 * y genera respuestas cuantificadas sin inventar información.
 */
export async function askCopilot(userId: string, question: string, currency: string = 'COP'): Promise<CopilotResponse> {
  const q = question.toLowerCase();
  const currentMonth = new Date().toISOString().substring(0, 7);

  // 1. ¿En qué gasté más este mes?
  if (q.includes('gasté más') || q.includes('gaste mas') || q.includes('mayor gasto') || q.includes('categoria con mas gasto')) {
    const topCategories = await queryAll<{ name: string; total: number; color: string }>(
      `SELECT c.name, COALESCE(SUM(t.amount_cents), 0) as total, c.color
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE') AND t.date LIKE ?
       GROUP BY c.id
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
       WHERE user_id = ? AND type IN ('EXPENSE', 'CREDIT_PURCHASE') AND date LIKE ?`,
      [userId, `${currentMonth}%`]
    );
    const totalMonth = totalExpenseRow?.total || 1;

    const top = topCategories[0];
    const topPct = Math.round((top.total / totalMonth) * 100);

    const breakdown = topCategories.map(c => ({
      name: c.name,
      amount: formatCurrency(c.total, currency),
      percentage: Math.round((c.total / totalMonth) * 100),
    }));

    return {
      answer: `Tu mayor gasto durante este mes corresponde a la categoría **${top.name}**, con un total acumulado de **${formatCurrency(top.total, currency)}**, lo que representa el **${topPct}%** de tus gastos totales del mes.`,
      categoryData: breakdown,
      suggestedActions: [
        `Ver movimientos de ${top.name}`,
        `Ajustar presupuesto para ${top.name}`,
        'Exportar informe mensual',
      ],
    };
  }

  // 2. ¿Cuánto dinero puedo gastar hasta fin de mes? / Dinero disponible
  if (q.includes('puedo gastar') || q.includes('disponible') || q.includes('fin de mes')) {
    const metrics = await getDashboardMetrics(userId, currentMonth);
    const availableCents = metrics.totalBalanceCents - metrics.committedObligationsCents;

    // Días restantes en el mes
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - now.getDate());
    const dailyAvailableCents = Math.max(0, Math.round(availableCents / daysRemaining));

    return {
      answer: `Tienes un saldo total en cuentas de **${formatCurrency(metrics.totalBalanceCents, currency)}**, con **${formatCurrency(metrics.committedObligationsCents, currency)}** ya comprometidos en pagos pendientes. 
      \nPor lo tanto, tu saldo seguro disponible hasta fin de mes es de **${formatCurrency(Math.max(0, availableCents), currency)}**. Esto te permite un gasto diario recomendado de **${formatCurrency(dailyAvailableCents, currency)}/día** durante los próximos ${daysRemaining} días.`,
      suggestedActions: ['Ver obligaciones pendientes', 'Consultar presupuestos'],
    };
  }

  // 3. ¿Qué suscripciones estoy pagando?
  if (q.includes('suscripci') || q.includes('netflix') || q.includes('recurrente')) {
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
      .map(s => `- **${s.name}**: ${formatCurrency(s.amount_cents, currency)} (${s.frequency})`)
      .join('\n');

    return {
      answer: `Actualmente tienes registradas **${subscriptions.length} suscripciones activas** que suman un total de **${formatCurrency(totalSubCents, currency)}** mensuales:\n\n${subList}`,
      suggestedActions: ['Optimizar gastos recurrentes', 'Añadir nueva suscripción'],
    };
  }

  // 4. Próximos pagos y vencimientos
  if (q.includes('proximos pagos') || q.includes('próximos pagos') || q.includes('vencimiento') || q.includes('debo pagar')) {
    const today = new Date().toISOString().substring(0, 10);
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
      .map(b => `- **${b.name}**: ${formatCurrency(b.amount_cents, currency)} — Vence el ${b.due_date} (${b.status === 'OVERDUE' ? '⚠️ Vencido' : 'Pendiente'})`)
      .join('\n');

    return {
      answer: `Aquí están tus próximos compromisos de pago:\n\n${list}`,
      suggestedActions: ['Marcar como pagado', 'Gestionar cuentas bancarias'],
    };
  }

  // 5. ¿Cuánto he ahorrado o cuál es mi flujo de efectivo?
  if (q.includes('ahorro') || q.includes('ahorrado') || q.includes('flujo de efectivo')) {
    const metrics = await getDashboardMetrics(userId, currentMonth);
    return {
      answer: `Durante este mes (${currentMonth}), has ingresado **${formatCurrency(metrics.monthlyIncomeCents, currency)}** y gastado **${formatCurrency(metrics.monthlyExpenseCents, currency)}**.
      \nTu flujo de caja neto es de **${formatCurrency(metrics.monthlyCashFlowCents, currency)}**, logrando una tasa de ahorro del **${metrics.savingsRatePercentage}%**.`,
      suggestedActions: ['Ver evolución de ahorros', 'Definir objetivo financiero'],
    };
  }

  // Respuesta general con análisis situacional
  const metrics = await getDashboardMetrics(userId, currentMonth);
  return {
    answer: `Hola, soy **FinTrack Copilot**. Con base en tus finanzas reales:
    \n- **Saldo total disponible:** ${formatCurrency(metrics.totalBalanceCents, currency)}
    \n- **Ingresos del mes:** ${formatCurrency(metrics.monthlyIncomeCents, currency)}
    \n- **Gastos del mes:** ${formatCurrency(metrics.monthlyExpenseCents, currency)}
    \n- **Compromisos pendientes:** ${formatCurrency(metrics.committedObligationsCents, currency)}
    \n\nPuedes preguntarme por tus suscripciones, en qué categoría gastaste más, o cuánto dinero puedes gastar hasta fin de mes.`,
    suggestedActions: [
      '¿En qué gasté más este mes?',
      '¿Cuánto dinero puedo gastar hasta fin de mes?',
      '¿Qué suscripciones estoy pagando?',
      '¿Cuáles son mis próximos pagos?',
    ],
  };
}
