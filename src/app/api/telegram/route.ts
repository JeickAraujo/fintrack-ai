export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryOne, queryAll, execute } from '@/lib/db';
import { formatCurrency, centsToDollars } from '@/lib/currency';
import { parseNaturalLanguageWithAI } from '@/lib/nlp-parser';
import { askCopilot } from '@/lib/copilot-engine';
import { recalculateAccountBalance } from '@/lib/financial-engine';
import {
  getTelegramBotToken,
  sendTelegramMessage,
  sendChatAction,
  downloadTelegramFile,
  transcribeAudioWithGroq,
  setTelegramWebhook,
  getTelegramWebhookInfo,
} from '@/lib/telegram';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isSetup = searchParams.get('setup') === 'true';

  if (isSetup) {
    const host = req.headers.get('host') || 'fintrack-ai-kohl.vercel.app';
    const proto = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${proto}://${host}/api/telegram`;
    const result = await setTelegramWebhook(webhookUrl);
    return NextResponse.json({
      configured: result.ok,
      webhookUrl,
      result,
    });
  }

  const info = await getTelegramWebhookInfo();
  return NextResponse.json({
    status: 'Telegram Bot API endpoint active',
    botTokenConfigured: Boolean(getTelegramBotToken()),
    info,
  });
}

export async function POST(req: Request) {
  try {
    const update = await req.json();
    const message = update.message;
    if (!message || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const fromName = message.from?.first_name || 'Usuario';

    // 1. Verificar si el chat_id ya está enlazado a un usuario en FinTrack
    let user = await queryOne<{ id: string; name: string; email: string; currency: string }>(
      `SELECT id, name, email, currency FROM users WHERE telegram_chat_id = ? LIMIT 1`,
      [String(chatId)]
    );

    // Texto o transcripción de audio
    let rawText = (message.text || message.caption || '').trim();

    // 2. Procesar audio / nota de voz si se envió
    if (message.voice || message.audio) {
      await sendChatAction(chatId, 'record_voice');
      const fileId = (message.voice || message.audio).file_id;
      const fileData = await downloadTelegramFile(fileId);

      if (fileData) {
        try {
          const transcribed = await transcribeAudioWithGroq(fileData.buffer, fileData.fileName);
          if (transcribed) {
            rawText = transcribed;
            await sendTelegramMessage(
              chatId,
              `🎤 <i>"${rawText}"</i>`
            );
          }
        } catch (whisperErr: any) {
          console.error('[Telegram] Error transcribiendo audio:', whisperErr);
          await sendTelegramMessage(
            chatId,
            '⚠️ No pude transcribir la nota de voz. Por favor asegúrate de hablar claro o escríbelo en texto.'
          );
          return NextResponse.json({ ok: true });
        }
      }
    }

    if (!rawText) {
      return NextResponse.json({ ok: true });
    }

    // 3. Manejo de vinculación de cuenta si aún no está enlazado
    if (!user) {
      // Si el usuario escribe /conectar <email>
      if (rawText.toLowerCase().startsWith('/conectar') || rawText.toLowerCase().startsWith('/link')) {
        const parts = rawText.split(/\s+/);
        const emailArg = parts[1]?.toLowerCase().trim();

        if (!emailArg || !emailArg.includes('@')) {
          await sendTelegramMessage(
            chatId,
            '⚠️ Por favor indica tu correo de FinTrack.\n\n<b>Uso:</b>\n<code>/conectar tu_correo@email.com</code>'
          );
          return NextResponse.json({ ok: true });
        }

        const foundUser = await queryOne<{ id: string; name: string; email: string; currency: string }>(
          `SELECT id, name, email, currency FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
          [emailArg]
        );

        if (!foundUser) {
          await sendTelegramMessage(
            chatId,
            `❌ No encontramos ninguna cuenta registrada con el correo <code>${emailArg}</code> en FinTrack.\n\nVerifica tu correo registrado en la app e intenta nuevamente.`
          );
          return NextResponse.json({ ok: true });
        }

        // Vincular usuario
        await execute(
          `UPDATE users SET telegram_chat_id = ? WHERE id = ?`,
          [String(chatId), foundUser.id]
        );

        await sendTelegramMessage(
          chatId,
          `🎉 <b>¡Cuenta vinculada con éxito!</b>\n\nHola <b>${foundUser.name}</b>, tu cuenta de FinTrack ha sido enlazada a este chat.\n\nYa puedes enviarme:\n• 🛒 Gastos: <i>"Gasté en nequi 18k salchipapa"</i>\n• 💰 Ingresos: <i>"Me agregaron 100k a nequi"</i>\n• 📅 Pagos: <i>"Pagar internet 80k el 15"</i>\n• 🎯 Presupuestos: <i>"Presupuesto 500k comida"</i>\n• 🎤 <b>¡O notas de voz directamente!</b>`
        );
        return NextResponse.json({ ok: true });
      }

      // Sugerencia de conexión amigable
      const allUsers = await queryAll<{ email: string; name: string }>(
        `SELECT email, name FROM users ORDER BY created_at ASC LIMIT 2`
      );

      let hint = '';
      if (allUsers.length === 1) {
        hint = `\n\n¿Eres <b>${allUsers[0].name}</b>? Solo escribe:\n<code>/conectar ${allUsers[0].email}</code>`;
      } else {
        hint = `\n\nPara empezar, escribe:\n<code>/conectar tu_correo@email.com</code>`;
      }

      await sendTelegramMessage(
        chatId,
        `👋 ¡Hola <b>${fromName}</b>! Soy <b>FinTrack Asistente IA</b> en Telegram.${hint}`
      );
      return NextResponse.json({ ok: true });
    }

    // 4. Usuario ya vinculado: Procesar comandos rápidos
    const norm = rawText.toLowerCase().trim();

    if (norm === '/ayuda' || norm === '/start' || norm === 'ayuda') {
      await sendTelegramMessage(
        chatId,
        `🤖 <b>FinTrack Asistente IA en Telegram</b>\n\nPuedes enviarme texto o <b>notas de voz</b>:\n\n` +
        `• <b>Registrar gasto:</b> <i>"Gasté 18k en salchipapa con Nequi"</i>\n` +
        `• <b>Registrar ingreso:</b> <i>"Me agregaron 100k a nequi"</i>\n` +
        `• <b>Programar pago:</b> <i>"Tengo que pagar internet 80k el 15"</i>\n` +
        `• <b>Fijar presupuesto:</b> <i>"Presupuesto 600k comida este mes"</i>\n` +
        `• <b>Actualizar saldo:</b> <i>"Mi saldo en Nequi ahora es 350.000"</i>\n\n` +
        `<b>Comandos rápidos:</b>\n` +
        `• /saldo — Ver saldos actuales por cuenta\n` +
        `• /gastos — Ver en qué has gastado más este mes\n` +
        `• /desconectar — Desvincular este chat de Telegram`
      );
      return NextResponse.json({ ok: true });
    }

    if (norm === '/saldo' || norm === 'saldo') {
      await sendChatAction(chatId, 'typing');
      const response = await askCopilot(user.id, 'Cuál es mi saldo por cuenta', user.currency);
      await sendTelegramMessage(chatId, markdownToTelegramHtml(response.answer));
      return NextResponse.json({ ok: true });
    }

    if (norm === '/gastos' || norm === 'gastos') {
      await sendChatAction(chatId, 'typing');
      const response = await askCopilot(user.id, 'En qué gasté más este mes', user.currency);
      await sendTelegramMessage(chatId, markdownToTelegramHtml(response.answer));
      return NextResponse.json({ ok: true });
    }

    if (norm === '/desconectar') {
      await execute(`UPDATE users SET telegram_chat_id = NULL WHERE id = ?`, [user.id]);
      await sendTelegramMessage(
        chatId,
        '👋 Tu cuenta de FinTrack ha sido desvinculada de Telegram. Si deseas volver a usarlo, escribe <code>/conectar tu_email</code>.'
      );
      return NextResponse.json({ ok: true });
    }

    // 5. Preguntas conversacionales al Copilot (si no parece registro de transacción)
    const isQuestion =
      norm.startsWith('en que gaste') ||
      norm.startsWith('cuanto gaste') ||
      norm.startsWith('cuanto puedo gastar') ||
      norm.startsWith('cual es mi saldo') ||
      norm.startsWith('que presupuesto') ||
      norm.startsWith('cuales son mis') ||
      norm.startsWith('que opinas');

    if (isQuestion) {
      await sendChatAction(chatId, 'typing');
      const response = await askCopilot(user.id, rawText, user.currency);
      await sendTelegramMessage(chatId, markdownToTelegramHtml(response.answer));
      return NextResponse.json({ ok: true });
    }

    // 6. Extracción y ejecución multi-intención (Transacciones, Obligaciones, Presupuestos, Cuentas)
    await sendChatAction(chatId, 'typing');
    const items = await parseNaturalLanguageWithAI(rawText);

    if (items.length === 0 || (items[0].amountCents <= 0 && items[0].intent === 'TRANSACTION')) {
      // Fallback a Copilot conversacional por si era una pregunta libre
      const response = await askCopilot(user.id, rawText, user.currency);
      await sendTelegramMessage(chatId, markdownToTelegramHtml(response.answer));
      return NextResponse.json({ ok: true });
    }

    const now = new Date().toISOString();

    for (const item of items) {
      // A. OBLIGACIÓN / PAGO PENDIENTE
      if (item.intent === 'OBLIGATION') {
        const id = crypto.randomUUID();
        const dueDate = item.dueDate || item.date || now.substring(0, 10);
        let categoryId: string | null = null;

        if (item.categorySuggestion) {
          const cat = await queryOne<{ id: string }>(
            `SELECT id FROM categories WHERE (user_id = ? OR is_system = true) AND LOWER(name) LIKE ? LIMIT 1`,
            [user.id, `%${item.categorySuggestion.toLowerCase()}%`]
          );
          categoryId = cat?.id || null;
        }

        await execute(
          `INSERT INTO payment_obligations (id, user_id, name, amount_cents, due_date, frequency, category_id, account_id, status, is_subscription, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'PENDING', ?, ?)`,
          [id, user.id, item.description.trim(), item.amountCents, dueDate, item.frequency || 'MONTHLY', categoryId, Boolean(item.isSubscription), now]
        );

        await sendTelegramMessage(
          chatId,
          `✅ <b>Obligación programada exitosamente</b>\n\n` +
          `📋 <b>Concepto:</b> ${escapeHtml(item.description)}\n` +
          `💵 <b>Monto:</b> ${formatCurrency(item.amountCents, user.currency)}\n` +
          `📅 <b>Vencimiento:</b> ${dueDate}\n` +
          `🏷️ <b>Categoría:</b> ${escapeHtml(item.categorySuggestion || 'Servicios')}\n\n` +
          `<i>Se ha añadido a tus pagos pendientes en FinTrack.</i>`
        );
        continue;
      }

      // B. PRESUPUESTO MENSUAL
      if (item.intent === 'BUDGET') {
        const monthYear = item.monthYear || now.substring(0, 7);
        let categoryId: string | null = null;
        let categoryName = item.categorySuggestion || 'Alimentación';

        if (item.categorySuggestion) {
          const cat = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND LOWER(name) LIKE ? LIMIT 1`,
            [user.id, `%${item.categorySuggestion.toLowerCase()}%`]
          );
          if (cat) {
            categoryId = cat.id;
            categoryName = cat.name;
          }
        }

        if (!categoryId) {
          const defCat = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM categories WHERE user_id = ? OR is_system = true ORDER BY id ASC LIMIT 1`,
            [user.id]
          );
          categoryId = defCat?.id || null;
          if (defCat) categoryName = defCat.name;
        }

        if (categoryId) {
          const existing = await queryOne<{ id: string }>(
            `SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month_year = ?`,
            [user.id, categoryId, monthYear]
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
              [id, user.id, categoryId, monthYear, item.amountCents, now]
            );
          }

          await sendTelegramMessage(
            chatId,
            `✅ <b>Presupuesto asignado exitosamente</b>\n\n` +
            `🎯 <b>Categoría:</b> ${escapeHtml(categoryName)}\n` +
            `💵 <b>Límite mensual:</b> ${formatCurrency(item.amountCents, user.currency)}\n` +
            `📅 <b>Mes:</b> ${monthYear}\n\n` +
            `<i>Seguimiento activo en tu Dashboard.</i>`
          );
        }
        continue;
      }

      // C. ACTUALIZACIÓN DE SALDO O CUENTA
      if (item.intent === 'ACCOUNT') {
        const accName = item.accountName || item.paymentMethod || 'Efectivo';
        let targetAccount = await queryOne<{ id: string; name: string }>(
          `SELECT id, name FROM accounts WHERE user_id = ? AND is_active = true AND LOWER(name) LIKE ? LIMIT 1`,
          [user.id, `%${accName.toLowerCase()}%`]
        );

        if (!targetAccount) {
          const newAccId = crypto.randomUUID();
          const cleanName = accName.charAt(0).toUpperCase() + accName.slice(1);
          const accType = item.accountType || 'CHECKING';
          const color = accType === 'CREDIT_CARD' ? '#f59e0b' : '#10b981';
          await execute(
            `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, true, ?)`,
            [newAccId, user.id, cleanName, accType, item.amountCents, item.amountCents, color, now]
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
          const incomingTransfers = await queryOne<{ total: string | number }>(
            `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE destination_account_id = ? AND type = 'TRANSFER'`,
            [targetAccount.id]
          );
          const outgoingTransfers = await queryOne<{ total: string | number }>(
            `SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE account_id = ? AND type = 'TRANSFER'`,
            [targetAccount.id]
          );
          const totalIncome = Number(incomes?.total || 0) + Number(incomingTransfers?.total || 0);
          const totalExpense = Number(expenses?.total || 0) + Number(outgoingTransfers?.total || 0);

          let initialBalCents = 0;
          if (existing.type === 'CREDIT_CARD') {
            initialBalCents = item.amountCents - Number(expenses?.total || 0) + Number(incomingTransfers?.total || 0);
          } else {
            initialBalCents = item.amountCents - totalIncome + totalExpense;
          }

          await execute(
            `UPDATE accounts SET initial_balance_cents = ? WHERE id = ?`,
            [initialBalCents, targetAccount.id]
          );
          await recalculateAccountBalance(targetAccount.id);
        }

        await sendTelegramMessage(
          chatId,
          `✅ <b>Cuenta sincronizada exitosamente</b>\n\n` +
          `💳 <b>Cuenta:</b> ${escapeHtml(targetAccount.name)}\n` +
          `💵 <b>Nuevo saldo disponible:</b> ${formatCurrency(item.amountCents, user.currency)}`
        );
        continue;
      }

      // D. MOVIMIENTO HABITUAL (GASTO / INGRESO)
      let targetAccount: { id: string; name: string } | null = null;
      if (item.paymentMethod && item.paymentMethod.toLowerCase() !== 'efectivo') {
        targetAccount = await queryOne<{ id: string; name: string }>(
          `SELECT id, name FROM accounts WHERE user_id = ? AND is_active = true AND LOWER(name) LIKE ? LIMIT 1`,
          [user.id, `%${item.paymentMethod.toLowerCase()}%`]
        );
      }

      if (!targetAccount && item.paymentMethod && ['nequi', 'daviplata'].includes(item.paymentMethod.toLowerCase())) {
        const newAccId = crypto.randomUUID();
        const accName = item.paymentMethod.charAt(0).toUpperCase() + item.paymentMethod.slice(1);
        const accColor = item.paymentMethod.toLowerCase() === 'nequi' ? '#e11d48' : '#dc2626';
        await execute(
          `INSERT INTO accounts (id, user_id, name, type, initial_balance_cents, current_balance_cents, color, is_active, created_at)
           VALUES (?, ?, ?, 'CHECKING', 0, 0, ?, true, ?)`,
          [newAccId, user.id, accName, accColor, now]
        );
        targetAccount = { id: newAccId, name: accName };
      }

      if (!targetAccount) {
        targetAccount = await queryOne<{ id: string; name: string }>(
          `SELECT id, name FROM accounts WHERE user_id = ? AND is_active = true ORDER BY current_balance_cents DESC LIMIT 1`,
          [user.id]
        );
      }

      if (targetAccount) {
        let categoryId: string | null = null;
        let categoryName = item.categorySuggestion || 'General';

        if (item.categorySuggestion) {
          const cleanCat = item.categorySuggestion.split('|')[0].trim();
          let cat = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND LOWER(name) = LOWER(?) LIMIT 1`,
            [user.id, cleanCat]
          );
          if (!cat) {
            cat = await queryOne<{ id: string; name: string }>(
              `SELECT id, name FROM categories WHERE (user_id = ? OR is_system = true) AND (LOWER(name) LIKE ? OR LOWER(?) LIKE LOWER(CONCAT('%', name, '%'))) LIMIT 1`,
              [user.id, `%${cleanCat.toLowerCase()}%`, cleanCat]
            );
          }
          if (cat) {
            categoryId = cat.id;
            categoryName = cat.name;
          }
        }

        const txId = crypto.randomUUID();
        const safeAmountCents = Math.round(Number(item.amountCents)) || 0;

        await execute(
          `INSERT INTO transactions 
           (id, user_id, account_id, category_id, type, amount_cents, date, description, payment_method, status, notes, source, is_recurring, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLEARED', 'Registrado desde Telegram Bot', 'TELEGRAM', false, ?)`,
          [
            txId,
            user.id,
            targetAccount.id,
            categoryId,
            item.type,
            safeAmountCents,
            item.date,
            item.description,
            item.paymentMethod || 'Efectivo',
            now,
          ]
        );

        const newBal = await recalculateAccountBalance(targetAccount.id);

        const isInc = item.type === 'INCOME';
        await sendTelegramMessage(
          chatId,
          `✅ <b>${isInc ? 'Ingreso registrado 💰' : 'Gasto registrado 🛒'}</b>\n\n` +
          `🛍️ <b>Concepto:</b> ${escapeHtml(item.description)}\n` +
          `💵 <b>Monto:</b> ${formatCurrency(item.amountCents, user.currency)}\n` +
          `💳 <b>Cuenta:</b> ${escapeHtml(targetAccount.name)}\n` +
          `🏷️ <b>Categoría:</b> ${escapeHtml(categoryName)}\n` +
          `📅 <b>Fecha:</b> ${item.date}\n\n` +
          `💰 <i>Tu saldo actual en ${escapeHtml(targetAccount.name)} es: ${formatCurrency(newBal, user.currency)}</i>`
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram] Error en webhook handler:', err);
    return NextResponse.json({ ok: true, error: err?.message || String(err) });
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';
  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Negrita **texto** -> <b>texto</b>
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Cursiva *texto* o _texto_
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
  html = html.replace(/_([^_]+)_/g, '<i>$1</i>');

  // Código `código` -> <code>código</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  return html;
}
