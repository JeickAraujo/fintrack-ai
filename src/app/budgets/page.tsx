'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { PiggyBank, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { formatCurrency, dollarsToCents } from '@/lib/currency';

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [currentMonth, setCurrentMonth] = useState(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).substring(0, 7);
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/budgets?month=${currentMonth}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error cargando presupuestos');
      }
      setBudgets(json.budgets || []);
      const expenseCats = json.categories?.filter((c: any) => c.type === 'EXPENSE') || [];
      setCategories(expenseCats);
      if (expenseCats.length > 0 && !selectedCatId) {
        setSelectedCatId(expenseCats[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId || !allocatedAmount) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCatId,
          monthYear: currentMonth,
          allocatedAmount: parseFloat(allocatedAmount),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error guardando presupuesto');
      }

      setShowModal(false);
      setAllocatedAmount('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al guardar presupuesto');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-2xl font-black text-white">Presupuestos y Categorías</h1>
            <p className="text-xs text-slate-400 mt-1">
              Control mensual por categorías y alertas tempranas del 70%, 90% y 100%.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => {
                setErrorMsg(null);
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Asignar Presupuesto</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-300 font-bold hover:underline">
              Cerrar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <p className="text-xs font-medium">Cargando presupuestos asignados...</p>
          </div>
        ) : budgets.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
            <PiggyBank className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">Sin presupuestos asignados para {currentMonth}</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
              Define metas de gasto mensuales por categoría para evitar sobrecostos y maximizar tu ahorro.
            </p>
            <button
              onClick={() => {
                setErrorMsg(null);
                setShowModal(true);
              }}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              Asignar primer presupuesto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {budgets.map((b) => {
              const spent = b.spent_cents || 0;
              const allocated = b.allocated_cents || 1;
              const pct = Math.round((spent / allocated) * 100);
              const remaining = Math.max(0, allocated - spent);
              const isExceeded = spent > allocated;

              return (
                <div key={b.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: b.category_color || '#10b981' }}
                      />
                      <h3 className="text-sm font-bold text-white">{b.category_name}</h3>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isExceeded
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : pct >= 90
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {pct}% usado
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isExceeded ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-1">
                    <div>
                      <p className="text-slate-500">Gastado</p>
                      <p className="font-bold text-slate-200">{formatCurrency(spent)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500">Presupuesto</p>
                      <p className="font-bold text-slate-200">{formatCurrency(allocated)}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Restante:</span>
                    <span className={`font-bold ${isExceeded ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isExceeded ? `Excedido por ${formatCurrency(spent - allocated)}` : formatCurrency(remaining)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Asignación */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-4">Asignar Presupuesto Mensual</h2>
              <form onSubmit={handleSaveBudget} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Categoría</label>
                  <select
                    value={selectedCatId}
                    onChange={(e) => setSelectedCatId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Monto Asignado</label>
                  <input
                    type="number"
                    required
                    step="any"
                    placeholder="Ej. 600000"
                    value={allocatedAmount}
                    onChange={(e) => setAllocatedAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Guardar</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
