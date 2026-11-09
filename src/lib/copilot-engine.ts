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
      answer: `Soy **FinTrack Asistente IA**, tu asistente financiero inteligente. Analizo tus transacciones y cuentas en tiempo real.\n\nPuedes preguntarme:\n- **"¿En qué gasté más este mes?"** o **"Gasto por categorías"**\n- **"¿Cuál es mi saldo por cuenta?"** o **"Mis cuentas"**\n- **"¿Cuánto puedo gastar hasta fin de mes?"**\n- **"¿Qué presupuestos tengo excedidos?"**\n- **"¿Cuáles son mis próximos pagos o vencimientos?"**\n- **"¿Qué suscripciones estoy pagando?"**\n- **"¿Cómo voy comparado con el mes anterior?"**\n- **"¿Cuál es mi ahorro o flujo de efectivo?"**`,
      suggestedActions: [
        '¿En qué gasté más este mes?',
        '¿Cuál es mi saldo por cuenta?',
        '¿Qué presupuestos están excedidos?',
        '¿Cómo voy comparado con el mes anterior?',
      ],
    };
  }

  // =========================================================================
  // INTENCIÓN ESPECIAL: REGISTRO DE MOVIMIENTOS POR CHAT (NLP / GROQ AI)
  // =========================================================================
  const isPureQuestion =
    norm.startsWith('en que gaste') ||
    norm.startsWith('cuanto gaste') ||
    norm.startsWith('cuanto puedo gastar') ||
    norm.startsWith('cual es mi saldo') ||
    norm.startsWith('que presupuesto') ||
    norm.startsWith('cuales son mis') ||
    norm.startsWith('que opinas');

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
      `SELECT name, type, current_balance_cents, color FROM accounts WHERE user_id = ? AND is_active IS TRUE ORDER BY current_balance_cents DESC`,
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
      .reduce((sum, a) => sum + Number(a.current_balance_cents || 0), 0);

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

    const exceeded = budgetsWithSpent.filter((b) => Number(b.spent_cents) > Number(b.allocated_cents));
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
       WHERE user_id = ? AND is_subscription IS TRUE AND status != 'CANCELLED'`,
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
  // INTENCIÓN 9: OPINIÓN, ANÁLISIS Y CONSEJOS SOBRE GASTOS Y FINANZAS
  // =========================================================================
  const isOpinionQuery =
    norm.includes('que opinas') ||
    norm.includes('tu opinion') ||
    norm.includes('que piensas') ||
    norm.includes('como voy') ||
    norm.includes('como van mis') ||
    norm.includes('analisis') ||
    norm.includes('diagnostico') ||
    norm.includes('consejo') ||
    norm.includes('recomendacion') ||
    norm.includes('como ves mis') ||
    norm.includes('como estan mis') ||
    norm.includes('estoy gastando');

  if (isOpinionQuery) {
    let metrics = {
      totalBalanceCents: 0,
      monthlyIncomeCents: 0,
      monthlyExpenseCents: 0,
      monthlyCashFlowCents: 0,
      committedObligationsCents: 0,
      savingsRatePercentage: 0,
    };

    try {
      metrics = await getDashboardMetrics(userId, currentMonth);
    } catch (mErr) {
      console.warn('[Copilot] Error obteniendo métricas:', mErr);
    }

    let topCategories: { name: string; total: number }[] = [];
    let topCatsText = '- Sin gastos registrados aún este mes';
    try {
      topCategories = await queryAll<{ name: string; total: number }>(
        `SELECT c.name, COALESCE(SUM(t.amount_cents), 0) as total
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = ? AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE') AND t.date::text LIKE ?
         GROUP BY c.id, c.name ORDER BY total DESC LIMIT 3`,
        [userId, `${currentMonth}%`]
      );
      if (topCategories.length > 0) {
        topCatsText = topCategories.map((c) => `- ${c.name}: ${formatCurrency(c.total, currency)}`).join('\n');
      }
    } catch (cErr) {
      console.warn('[Copilot] Error obteniendo topCategories:', cErr);
    }

    let pendingBills: { name: string; amount_cents: number; due_date: string }[] = [];
    let pendingBillsText = '- No tienes pagos pendientes';
    try {
      pendingBills = await queryAll<{ name: string; amount_cents: number; due_date: string }>(
        `SELECT name, amount_cents, due_date FROM payment_obligations
         WHERE user_id = ? AND status = 'PENDING' ORDER BY due_date ASC LIMIT 3`,
        [userId]
      );
      if (pendingBills.length > 0) {
        pendingBillsText = pendingBills.map((b) => `- ${b.name}: ${formatCurrency(b.amount_cents, currency)} (Vence: ${b.due_date})`).join('\n');
      }
    } catch (bErr) {
      console.warn('[Copilot] Error obteniendo obligaciones:', bErr);
    }

    // 1. Intentar con Groq AI usando los modelos activos en la cuenta (openai/gpt-oss-120b, openai/gpt-oss-20b)
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (apiKey) {
      const systemPrompt = `Eres FinTrack Asistente IA, un asesor financiero personal experto, empático y cuantitativo para usuarios en Colombia.
Tienes acceso a los datos financieros REALES del usuario para el mes ${currentMonth} (Moneda: ${currency}):
- Saldo total disponible: ${formatCurrency(metrics.totalBalanceCents, currency)}
- Ingresos de este mes: ${formatCurrency(metrics.monthlyIncomeCents, currency)}
- Gastos de este mes: ${formatCurrency(metrics.monthlyExpenseCents, currency)}
- Flujo de caja neto: ${formatCurrency(metrics.monthlyCashFlowCents, currency)}
- Compromisos u obligaciones pendientes: ${formatCurrency(metrics.committedObligationsCents, currency)}
- Tasa de ahorro actual: ${metrics.savingsRatePercentage}%
- Categorías con mayor gasto:
${topCatsText}
- Próximos vencimientos de pago:
${pendingBillsText}

Instrucciones:
1. Responde de manera clara, concisa, profesional y en español formal-amable usando formato Markdown con viñetas.
2. Basa tus observaciones y opiniones estrictamente en estas cifras reales.
3. Si el usuario te pide consejos o análisis sobre sus gastos o situación, dale recomendaciones prácticas y cuantificadas sobre sus números actuales.
4. No inventes transacciones ni datos inexistentes.`;

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
              max_tokens: 500,
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
              return {
                answer: text,
                suggestedActions: [
                  '¿En qué gasté más este mes?',
                  '¿Cuál es mi saldo por cuenta?',
                  '¿Qué presupuestos tengo excedidos?',
                  '¿Cuáles son mis próximos vencimientos?',
                ],
              };
            }
          } else {
            console.warn(`[Copilot-Opinion] Groq ${model} falló con status ${res.status}:`, await res.text().catch(() => ''));
          }
        } catch (groqErr) {
          console.warn('[Copilot-Opinion] Error conectando a Groq:', groqErr);
        }
      }
    }

    // 2. Fallback Determinista Cuantitativo de Alta Calidad (si Groq no responde)
    let healthBadge = '🟢 **Salud Financiera Positiva**';
    let diagnosis = '';

    if (metrics.monthlyIncomeCents === 0 && metrics.monthlyExpenseCents === 0) {
      diagnosis = `Aún no registras ingresos ni gastos este mes (${currentMonth}). Cuando empieces a registrar tus movimientos diarios o importes tu extracto bancario, podré darte análisis detallados de tu flujo de caja.`;
    } else if (metrics.monthlyIncomeCents === 0 && metrics.monthlyExpenseCents > 0) {
      healthBadge = '⚠️ **Solo Egresos Registrados**';
      diagnosis = `Llevas un acumulado de **${formatCurrency(metrics.monthlyExpenseCents, currency)}** en gastos durante ${currentMonth}, pero aún no has registrado tus ingresos del mes. Te sugiero anotar tus ingresos para calcular tu tasa de ahorro real.`;
    } else if (metrics.monthlyCashFlowCents < 0) {
      healthBadge = '🔴 **Atención a tu Flujo de Caja**';
      const deficit = Math.abs(metrics.monthlyCashFlowCents);
      diagnosis = `Tus gastos del mes (**${formatCurrency(metrics.monthlyExpenseCents, currency)}**) están superando a tus ingresos (**${formatCurrency(metrics.monthlyIncomeCents, currency)}**) por **${formatCurrency(deficit, currency)}**. Es prioritario reducir compras discrecionales para mantener un flujo positivo.`;
    } else if (metrics.savingsRatePercentage >= 20) {
      healthBadge = '🟢 **Salud Financiera Excelente**';
      diagnosis = `¡Vas por excelente camino! Estás ahorrando el **${metrics.savingsRatePercentage}%** de tus ingresos (${formatCurrency(metrics.monthlyCashFlowCents, currency)} netos), superando el estándar recomendado del 20%.`;
    } else {
      healthBadge = '🟡 **Salud Financiera Moderada**';
      diagnosis = `Estás logrando un ahorro del **${metrics.savingsRatePercentage}%** (${formatCurrency(metrics.monthlyCashFlowCents, currency)} netos). Tu margen es positivo pero ajustado; revisar tus mayores rubros de gasto te permitirá elevar tu ahorro.`;
    }

    let topCatDetail = '';
    if (topCategories.length > 0) {
      topCatDetail = `\n\n**Tus mayores focos de gasto este mes:**\n` +
        topCategories.map((c) => `- **${c.name}:** ${formatCurrency(c.total, currency)}`).join('\n');
    }

    let billsDetail = '';
    if (pendingBills.length > 0) {
      billsDetail = `\n\n**Próximos compromisos por pagar:**\n` +
        pendingBills.map((b) => `- **${b.name}:** ${formatCurrency(b.amount_cents, currency)} (Vence: ${b.due_date})`).join('\n');
    }

    const answer = `${healthBadge}\n\n${diagnosis}\n\n**Resumen financiero del mes (${currentMonth}):**\n- **Saldo total disponible:** ${formatCurrency(metrics.totalBalanceCents, currency)}\n- **Ingresos del mes:** ${formatCurrency(metrics.monthlyIncomeCents, currency)}\n- **Gastos del mes:** ${formatCurrency(metrics.monthlyExpenseCents, currency)}\n- **Flujo de caja neto:** ${formatCurrency(metrics.monthlyCashFlowCents, currency)}\n- **Obligaciones pendientes:** ${formatCurrency(metrics.committedObligationsCents, currency)}${topCatDetail}${billsDetail}\n\n**Recomendaciones:**\n1. Mantén un seguimiento diario de tus gastos mayores.\n2. Asegura el respaldo de tus obligaciones pendientes antes de su vencimiento.\n3. Define presupuestos mensuales para fijar alertas tempranas.`;

    return {
      answer,
      suggestedActions: [
        '¿En qué gasté más este mes?',
        '¿Cuál es mi saldo por cuenta?',
        '¿Cuáles son mis próximos vencimientos?',
        '¿Cuánto dinero puedo gastar hasta fin de mes?',
      ],
    };
  }

// =========================================================================
  // FALLBACK 1: GROQ AI (LLaMA 3.3 / LLaMA 3.1) CON CONTEXTO FINANCIERO REAL
  // =========================================================================
  if (process.env.GROQ_API_KEY) {
    try {
      let metrics = {
        totalBalanceCents: 0,
        monthlyIncomeCents: 0,
        monthlyExpenseCents: 0,
        monthlyCashFlowCents: 0,
        committedObligationsCents: 0,
        savingsRatePercentage: 0,
      };

      try {
        metrics = await getDashboardMetrics(userId, currentMonth);
      } catch (mErr) {
        console.warn('[Copilot] No se pudieron obtener métricas para Groq:', mErr);
      }

      // Top 3 categorías de mayor gasto (usar t.date::text para compatibilidad con Postgres)
      let topCatsText = '- Sin gastos registrados aún este mes';
      try {
        const topCategories = await queryAll<{ name: string; total: number }>(
          `SELECT c.name, COALESCE(SUM(t.amount_cents), 0) as total
           FROM transactions t
           JOIN categories c ON t.category_id = c.id
           WHERE t.user_id = ? AND t.type IN ('EXPENSE', 'CREDIT_PURCHASE') AND t.date::text LIKE ?
           GROUP BY c.name ORDER BY total DESC LIMIT 3`,
          [userId, `${currentMonth}%`]
        );
        if (topCategories.length > 0) {
          topCatsText = topCategories.map((c) => `- ${c.name}: ${formatCurrency(c.total, currency)}`).join('\n');
        }
      } catch (cErr) {
        console.warn('[Copilot] No se pudieron obtener topCategories para Groq:', cErr);
      }

      // Obligaciones pendientes
      let pendingBillsText = '- No tienes pagos pendientes';
      try {
        const pendingBills = await queryAll<{ name: string; amount_cents: number; due_date: string }>(
          `SELECT name, amount_cents, due_date FROM payment_obligations
           WHERE user_id = ? AND status = 'PENDING' ORDER BY due_date ASC LIMIT 3`,
          [userId]
        );
        if (pendingBills.length > 0) {
          pendingBillsText = pendingBills.map((b) => `- ${b.name}: ${formatCurrency(b.amount_cents, currency)} (Vence: ${b.due_date})`).join('\n');
        }
      } catch (bErr) {
        console.warn('[Copilot] No se pudieron obtener obligaciones para Groq:', bErr);
      }

      const systemPrompt = `Eres FinTrack Asistente IA, un asesor financiero personal experto, empático y cuantitativo para usuarios en Colombia.
Tienes acceso a los datos financieros REALES del usuario para el mes ${currentMonth} (Moneda: ${currency}):
- Saldo total disponible: ${formatCurrency(metrics.totalBalanceCents, currency)}
- Ingresos de este mes: ${formatCurrency(metrics.monthlyIncomeCents, currency)}
- Gastos de este mes: ${formatCurrency(metrics.monthlyExpenseCents, currency)}
- Flujo de caja neto: ${formatCurrency(metrics.monthlyCashFlowCents, currency)}
- Compromisos u obligaciones pendientes: ${formatCurrency(metrics.committedObligationsCents, currency)}
- Tasa de ahorro actual: ${metrics.savingsRatePercentage}%
- Categorías con mayor gasto:
${topCatsText}
- Próximos vencimientos de pago:
${pendingBillsText}

Instrucciones:
1. Responde de manera clara, concisa, profesional y en español formal-amable usando formato Markdown con viñetas.
2. Basa tus recomendaciones estrictamente en las cifras reales anteriores.
3. Si el usuario te pide consejos o análisis sobre sus gastos o ahorros, dale observaciones prácticas y cuantificadas sobre sus números actuales.
4. No inventes transacciones ni datos inexistentes.`;

      const apiKey = process.env.GROQ_API_KEY.trim();
      // En Groq los modelos compatibles son llama-3.3-70b-versatile y llama-3.1-8b-instant
      const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
      let groqRes: Response | null = null;

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
              max_tokens: 450,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question },
              ],
            }),
          });
          if (res.ok) {
            groqRes = res;
            break;
          } else {
            console.warn(`[Copilot] Modelo ${model} falló con status ${res.status}`);
          }
        } catch (fetchErr) {
          console.warn(`[Copilot] Error intentando con modelo ${model}:`, fetchErr);
        }
      }

      if (groqRes && groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData.choices?.[0]?.message?.content;
        if (text) {
          return {
            answer: text,
            suggestedActions: [
              '¿En qué gasté más este mes?',
              '¿Cuál es mi saldo por cuenta?',
              '¿Qué presupuestos tengo excedidos?',
            ],
          };
        }
      } else if (groqRes) {
        const errText = await groqRes.text();
        console.error('[Copilot] Groq API error response:', errText);
      }
    } catch (err) {
      console.error('[Copilot] Excepción en Groq API fallback:', err);
    }
  }

  // =========================================================================
  // FALLBACK 2: ANTHROPIC CLAUDE SI EXISTE ANTHROPIC_API_KEY
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
              content: `Eres FinTrack Asistente IA, asistente financiero. Datos reales del usuario para ${currentMonth} (Moneda: ${currency}):
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
