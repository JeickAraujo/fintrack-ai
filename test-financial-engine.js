const assert = require('assert');
const crypto = require('crypto');

console.log('🧪 Iniciando batería completa de pruebas unitarias e integración para FinTrack AI...\n');

// 1. Pruebas de Precisión Monetaria en Centavos
console.log('1. Verificando integridad aritmética y eliminación de decimales flotantes...');
function dollarsToCents(amount) {
  if (typeof amount === 'string') {
    const cleanStr = amount.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleanStr);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return Math.round(amount * 100);
}

function centsToDollars(cents) {
  return cents / 100;
}

const val1 = dollarsToCents(18000);
const val2 = dollarsToCents(7000.50);
const sumCents = val1 + val2;
assert.strictEqual(sumCents, 2500050, 'La suma exacta en centavos debe ser 2500050');
assert.strictEqual(centsToDollars(sumCents), 25000.5, 'La conversión de vuelta a unidades debe ser 25000.5');
console.log('   ✓ Precisión monetaria garantizada en centavos.');

// 2. Pruebas de Procesamiento de Lenguaje Natural (NLP)
console.log('\n2. Verificando parsing de lenguaje natural ("Hoy gasté 18.000 pesos en almuerzo y 7.000 en transporte")...');
function parseNaturalLanguageInput(text) {
  const results = [];
  const todayStr = new Date().toISOString().substring(0, 10);
  const clauses = text.split(/\s+(?:y|además|tambien|también)\s+|,\s*/i);

  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (!trimmed) continue;

    const amountMatch = trimmed.match(/(?:\$|\s|^)([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:k|mil)?)(?:\s*(?:pesos|cop|usd|dólares|dolares))?/i);
    if (amountMatch) {
      let rawVal = amountMatch[1].toLowerCase();
      let multiplier = 1;
      if (rawVal.endsWith('k') || rawVal.endsWith('mil')) {
        rawVal = rawVal.replace(/(?:k|mil)/, '');
        multiplier = 1000;
      }
      const cleanVal = rawVal.replace(/\./g, '').replace(',', '.');
      const numericVal = parseFloat(cleanVal) * multiplier;

      if (!isNaN(numericVal) && numericVal > 0) {
        const isIncome = /(?:recib[íi]|gan[ée]|ingres[oó]|sueldo|abono|consignaci[oó]n|me pagaron)/i.test(trimmed);
        let desc = trimmed
          .replace(/(?:hoy|ayer|gast[ée]|compr[ée]|recib[íi]|gan[ée]|pagu[ée]|en|de|por|\$|pesos|cop|usd)/gi, '')
          .replace(amountMatch[0], '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!desc) {
          desc = isIncome ? 'Ingreso registrado' : 'Gasto registrado';
        } else {
          desc = desc.charAt(0).toUpperCase() + desc.slice(1);
        }

        let category = isIncome ? 'Salario / Sueldo' : 'Alimentación';
        if (/almuerzo|cena|comida|restaurante/i.test(trimmed)) {
          category = 'Alimentación';
        } else if (/transporte|uber|taxi|gasolina/i.test(trimmed)) {
          category = 'Transporte';
        }

        results.push({
          description: desc,
          amountCents: dollarsToCents(numericVal),
          type: isIncome ? 'INCOME' : 'EXPENSE',
          categorySuggestion: category,
          confidence: 0.9,
          date: todayStr,
        });
      }
    }
  }
  return results;
}

const nlpTest = 'Hoy gasté 18.000 pesos en almuerzo y 7.000 en transporte';
const parsedItems = parseNaturalLanguageInput(nlpTest);

assert.strictEqual(parsedItems.length, 2, 'Debe identificar exactamente 2 movimientos');
assert.strictEqual(parsedItems[0].amountCents, 1800000, 'El primer movimiento debe ser de 18.000 (1800000 centavos)');
assert.strictEqual(parsedItems[0].categorySuggestion, 'Alimentación', 'Debe clasificar en Alimentación');
assert.strictEqual(parsedItems[1].amountCents, 700000, 'El segundo movimiento debe ser de 7.000 (700000 centavos)');
assert.strictEqual(parsedItems[1].categorySuggestion, 'Transporte', 'Debe clasificar en Transporte');
console.log('   ✓ Extracción y descomposición de transacciones NLP superada.');

// 3. Pruebas de Parser de Notificación Bancaria
console.log('\n3. Verificando extracción de notificaciones bancarias...');
function parseBankNotification(text) {
  const amountMatch = text.match(/\$\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+)/);
  if (!amountMatch) return null;
  const rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
  const amount = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) return null;

  const merchantMatch = text.match(/(?:en|a favor de|hacia|comercio:?)\s+([A-Za-z0-9\s._-]+?)(?:\s+(?:el|por|con|\*|\d{2}\/)|$)/i);
  let merchant = merchantMatch ? merchantMatch[1].trim() : 'Compra comercio';
  return {
    description: merchant.toUpperCase(),
    amountCents: dollarsToCents(amount),
    type: 'EXPENSE',
    confidence: 0.95,
  };
}

const notifSample = 'Bancolombia: Compra por $45.000 en EXITO CALLE 80 con tarjeta *1234';
const parsedNotif = parseBankNotification(notifSample);
assert.ok(parsedNotif !== null, 'Debe extraer datos válidos de la notificación');
assert.strictEqual(parsedNotif.amountCents, 4500000, 'Monto debe ser 4500000 centavos');
assert.ok(parsedNotif.description.includes('EXITO'), 'Comercio debe contener EXITO');
console.log('   ✓ Notificaciones bancarias analizadas con éxito.');

// 4. Pruebas de Deduplicación Criptográfica y Parseo CSV
console.log('\n4. Verificando algoritmo de deduplicación criptográfica y no duplicación CSV...');
function generateTransactionHash(userId, accountId, date, amountCents, description) {
  const normalizedDesc = description.trim().toLowerCase().replace(/\s+/g, ' ');
  const raw = `${userId}|${accountId}|${date}|${amountCents}|${normalizedDesc}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const hash1 = generateTransactionHash('user-1', 'acc-1', '2026-10-10', 500000, 'Netflix Subscription');
const hash2 = generateTransactionHash('user-1', 'acc-1', '2026-10-10', 500000, '  netflix subscription  ');
const hash3 = generateTransactionHash('user-1', 'acc-1', '2026-10-10', 600000, 'Netflix Subscription');

assert.strictEqual(hash1, hash2, 'Misma transacción con espacios y mayúsculas debe generar el mismo hash');
assert.notStrictEqual(hash1, hash3, 'Diferente monto debe generar hash distinto');

// Simular importación doble de CSV
const sampleCsv = `Fecha,Descripcion,Valor\n2026-10-01,Supermercado Exito,50000\n2026-10-02,Gasolina Terpel,30000`;
const existingHashes = new Set();
let importedCountPass1 = 0;
let importedCountPass2 = 0;

for (let pass = 1; pass <= 2; pass++) {
  const lines = sampleCsv.split('\n').slice(1);
  for (const line of lines) {
    const [date, desc, val] = line.split(',');
    const cents = dollarsToCents(parseFloat(val));
    const h = generateTransactionHash('user-1', 'acc-1', date, cents, desc);
    if (!existingHashes.has(h)) {
      existingHashes.add(h);
      if (pass === 1) importedCountPass1++;
    } else {
      if (pass === 2) importedCountPass2++;
    }
  }
}
assert.strictEqual(importedCountPass1, 2, 'Primer pase debe importar 2 filas');
assert.strictEqual(importedCountPass2, 2, 'Segundo pase debe detectar las 2 filas como duplicadas sin insertarlas de nuevo');
console.log('   ✓ Algoritmo de hash y deduplicación robusto verificado.');

// 5. Pruebas de Normalización y Reconocimiento de Intenciones del Copilot
console.log('\n5. Verificando normalización y respuestas del FinTrack Copilot...');
function normalizeQuery(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,:;_\-\/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectIntent(q) {
  const norm = normalizeQuery(q);
  if (norm === 'ayuda' || norm.includes('que puedes hacer')) return 'HELP';
  if (norm.includes('gaste mas') || norm.includes('mayor gasto')) return 'TOP_EXPENSE';
  if (norm.includes('saldo') || norm.includes('mis cuentas')) return 'ACCOUNTS_BALANCE';
  if (norm.includes('presupuesto') || norm.includes('excedido')) return 'BUDGET_OVERRUN';
  if (norm.includes('vencimiento') || norm.includes('proximos pagos')) return 'UPCOMING_BILLS';
  if (norm.includes('suscripci') || norm.includes('netflix')) return 'SUBSCRIPTIONS';
  if (norm.includes('mes anterior') || norm.includes('comparado')) return 'MONTH_COMPARISON';
  return 'UNKNOWN';
}

assert.strictEqual(detectIntent('¿En qué gasté más este mes?'), 'TOP_EXPENSE');
assert.strictEqual(detectIntent('en que gaste mas este mes'), 'TOP_EXPENSE');
assert.strictEqual(detectIntent('¿Cuál es mi saldo por cuenta?'), 'ACCOUNTS_BALANCE');
assert.strictEqual(detectIntent('¿Tengo presupuestos excedidos?'), 'BUDGET_OVERRUN');
assert.strictEqual(detectIntent('¿Cuáles son mis próximos vencimientos de pago?'), 'UPCOMING_BILLS');
assert.strictEqual(detectIntent('¿Qué suscripciones tengo activas?'), 'SUBSCRIPTIONS');
assert.strictEqual(detectIntent('¿Cómo voy comparado con el mes anterior?'), 'MONTH_COMPARISON');
assert.strictEqual(detectIntent('ayuda'), 'HELP');
assert.strictEqual(detectIntent('¿Cuál es la capital de Francia?'), 'UNKNOWN', 'Pregunta fuera de dominio debe producir UNKNOWN explícito');
console.log('   ✓ 8 intenciones del Copilot y fallback a UNKNOWN verificados.');

console.log('\n🎉 ¡TODAS LAS PRUEBAS UNITARIAS E INTEGRACIÓN PASARON EXITOSAMENTE!');
