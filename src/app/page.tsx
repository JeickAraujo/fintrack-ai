'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  AlertCircle,
  Plus,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Layers,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/currency';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de registro rápido
  const [quickInput, setQuickInput] = useState('');
  const [nlpLoading, setNlpLoading] = useState(false);
  const [proposedItems, setProposedItems] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Delete transaction modal
  const [deleteModalTx, setDeleteModalTx] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const json = await res.json();
      setData(json);

      // Cargar cuentas para selector
      const accRes = await fetch('/api/accounts');
      const accJson = await accRes.json();
      setAccounts(accJson.accounts || []);
      if (accJson.accounts?.length > 0) {
        setSelectedAccountId(accJson.accounts[0].id);
      }
    } catch (err: any) {
      setError('Error conectando con el servicio financiero.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleNlpParse = async () => {
    if (!quickInput.trim()) return;
    try {
      setNlpLoading(true);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse_nlp', text: quickInput }),
      });
      const json = await res.json();
      setProposedItems(json.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setNlpLoading(false);
    }
  };

  const handleConfirmItem = async (item: any) => {
    if (!selectedAccountId) {
      alert('Por favor selecciona una cuenta');
      return;
    }
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          type: item.type,
          amountCents: item.amountCents,
          date: item.date,
          description: item.description,
          source: 'NLP',
        }),
      });
      if (res.ok) {
        setProposedItems(proposedItems.filter((p) => p !== item));
        if (proposedItems.length <= 1) setQuickInput('');
        fetchDashboard();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deleteModalTx) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/transactions?id=${deleteModalTx.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al eliminar movimiento');
      }
      setDeleteModalTx(null);
      await fetchDashboard();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error eliminando movimiento');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-950 items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Cargando métricas financieras en tiempo real...</p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalBalanceCents: 0,
    monthlyIncomeCents: 0,
    monthlyExpenseCents: 0,
    committedObligationsCents: 0,
    monthlyCashFlowCents: 0,
    savingsRatePercentage: 0,
    expenseChangePercentage: 0,
  };
  const currency = data?.user?.currency || 'COP';

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-950 text-slate-100">
      <Sidebar user={data?.user} />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full">
        {/* Header con Saludo y Acciones Rápidas */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Hola, {data?.user?.name || 'Usuario'} 👋
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Aquí está el balance consolidado y las previsiones de tus finanzas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <Link
              href="/copilot"
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500/50 text-slate-200 hover:text-white transition-all text-xs sm:text-sm font-medium shadow-sm flex-1 sm:flex-initial justify-center"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Copilot IA</span>
            </Link>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-all text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex-1 sm:flex-initial justify-center"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Movimiento</span>
            </Link>
          </div>
        </div>

        {/* Barra Rápida de Registro con Lenguaje Natural */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-2 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Registro Rápido en Lenguaje Natural</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder='Ej: "Hoy gasté 18.000 en almuerzo y 7.000 en transporte"'
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNlpParse()}
              className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              onClick={handleNlpParse}
              disabled={nlpLoading || !quickInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium text-sm transition-colors shrink-0"
            >
              {nlpLoading ? 'Analizando...' : 'Interpretar'}
            </button>
          </div>

          {/* Propuestas interpretadas para confirmar */}
          {proposedItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300">
                  Movimientos identificados ({proposedItems.length}). Confirma antes de guardar:
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Cuenta de destino:</span>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatCurrency(acc.current_balance_cents, currency)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {proposedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                            item.type === 'INCOME'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {item.type === 'INCOME' ? 'Ingreso' : 'Gasto'}
                        </span>
                        <p className="text-sm font-semibold text-slate-200">{item.description}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatCurrency(item.amountCents, currency)} • Cat: {item.categorySuggestion || 'General'}
                      </p>
                    </div>

                    <button
                      onClick={() => handleConfirmItem(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Guardar</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tarjetas Principales de Métricas Financieras (Calculadas exactamente) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Saldo Total Disponible */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Saldo Total Disponible</span>
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-white">
              {formatCurrency(metrics.totalBalanceCents, currency)}
            </p>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <span className="text-emerald-400 font-semibold">{accounts.length}</span> cuentas activas
            </p>
          </div>

          {/* 2. Ingresos del Mes */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Ingresos del Mes</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400">
              +{formatCurrency(metrics.monthlyIncomeCents, currency)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Tasa de ahorro: <span className="text-emerald-400 font-semibold">{metrics.savingsRatePercentage}%</span>
            </p>
          </div>

          {/* 3. Gastos del Mes */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Gastos del Mes</span>
              <ArrowUpRight className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-2xl font-black text-rose-400">
              -{formatCurrency(metrics.monthlyExpenseCents, currency)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {metrics.expenseChangePercentage >= 0 ? '+' : ''}{metrics.expenseChangePercentage}% vs mes previo
            </p>
          </div>

          {/* 4. Dinero Comprometido en Obligaciones */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Dinero Comprometido</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black text-amber-400">
              {formatCurrency(metrics.committedObligationsCents, currency)}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Pendiente por pagar este mes
            </p>
          </div>
        </div>

        {/* Sección de Gastos por Categoría y Próximos Vencimientos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Gastos por Categoría (2 columnas) */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-bold text-white">Distribución de Gastos</h2>
                <p className="text-xs text-slate-400">Consolidado por categoría del mes en curso</p>
              </div>
              <Link href="/reports" className="text-xs text-emerald-400 hover:underline font-semibold flex items-center gap-1">
                <span>Ver reporte completo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {data?.expensesByCategory?.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No hay gastos registrados en el mes actual. Registra uno arriba.
              </div>
            ) : (
              <div className="space-y-4">
                {data?.expensesByCategory?.map((cat: any) => {
                  const pct = metrics.monthlyExpenseCents > 0
                    ? Math.round((cat.total / metrics.monthlyExpenseCents) * 100)
                    : 0;
                  return (
                    <div key={cat.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-300">{cat.name}</span>
                        <span className="text-slate-400">
                          {formatCurrency(cat.total, currency)} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: cat.color || '#10b981',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Próximos Pagos y Obligaciones (1 columna) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-white">Próximos Vencimientos</h2>
                <Link href="/obligations" className="text-xs text-emerald-400 hover:underline font-semibold">
                  Ver todas
                </Link>
              </div>

              {data?.upcomingBills?.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No tienes obligaciones pendientes por vencer.
                </div>
              ) : (
                <div className="space-y-3">
                  {data?.upcomingBills?.map((bill: any) => (
                    <div
                      key={bill.id}
                      className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-200">{bill.name}</p>
                        <p className="text-slate-400 mt-0.5">Vence: {bill.due_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-amber-400">
                          {formatCurrency(bill.amount_cents, currency)}
                        </p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {bill.status === 'OVERDUE' ? 'Vencido' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800">
              <Link
                href="/obligations"
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <span>Administrar Obligaciones</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Movimientos Recientes */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white">Movimientos Recientes</h2>
              <p className="text-xs text-slate-400">Últimas transacciones registradas</p>
            </div>
            <Link href="/transactions" className="text-xs text-emerald-400 hover:underline font-semibold flex items-center gap-1">
              <span>Ver todas las transacciones</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data?.recentTransactions?.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No hay movimientos todavía. Usa el registro rápido o importa tu extracto bancario.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3 px-3">Fecha</th>
                    <th className="pb-3 px-3">Descripción</th>
                    <th className="pb-3 px-3">Categoría</th>
                    <th className="pb-3 px-3">Cuenta</th>
                    <th className="pb-3 px-3">Origen</th>
                    <th className="pb-3 px-3 text-right">Monto</th>
                    <th className="pb-3 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data?.recentTransactions?.map((tx: any) => {
                    const isIncome = tx.type === 'INCOME' || tx.type === 'REFUND';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 text-slate-400">{tx.date}</td>
                        <td className="py-3 px-3 font-semibold text-slate-200">{tx.description}</td>
                        <td className="py-3 px-3">
                          <span
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                            style={{
                              backgroundColor: `${tx.category_color || '#64748b'}20`,
                              color: tx.category_color || '#cbd5e1',
                            }}
                          >
                            {tx.category_name || 'Sin Categoría'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">{tx.account_name}</td>
                        <td className="py-3 px-3">
                          <span className="text-[10px] text-slate-500 uppercase">{tx.source}</span>
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${isIncome ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {isIncome ? '+' : '-'}{formatCurrency(tx.amount_cents, currency)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setDeleteModalTx(tx)}
                            title="Eliminar movimiento"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Confirmación de Eliminación */}
        {deleteModalTx && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Eliminar Movimiento</h3>
                  <p className="text-xs text-slate-400">Esta acción no se puede deshacer</p>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Concepto:</span>
                  <span className="font-semibold text-slate-200 text-right truncate max-w-[200px]">
                    {deleteModalTx.description}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Monto:</span>
                  <span className="font-bold text-white">
                    {formatCurrency(deleteModalTx.amount_cents, currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Fecha:</span>
                  <span className="text-slate-300">{deleteModalTx.date}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Cuenta:</span>
                  <span className="text-slate-300">{deleteModalTx.account_name}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                El saldo de la cuenta será recalculado automáticamente para reflejar la eliminación de este movimiento.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteModalTx(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteTransaction}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Sí, eliminar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
