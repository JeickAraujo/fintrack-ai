/**
 * Utilidades monetarias para FinTrack AI.
 * Para cumplir con los requerimientos financieros de precisión, todos los montos se
 * almacenan internamente como números enteros en centavos (amount_cents).
 * Esto erradica por completo los fallos de redondeo de punto flotante de JavaScript.
 */

export function dollarsToCents(amount: number | string): number {
  if (typeof amount === 'string') {
    // Normalizar formato: limpiar signos de moneda, espacios y comas de miles
    const cleanStr = amount.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleanStr);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatCurrency(
  cents: number,
  currency: string = 'COP',
  locale: string = 'es-CO'
): string {
  const value = centsToDollars(cents);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'COP',
      maximumFractionDigits: currency === 'COP' ? 0 : 2,
      minimumFractionDigits: currency === 'COP' ? 0 : 2,
    }).format(value);
  } catch {
    // Fallback genérico
    return `$${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}
