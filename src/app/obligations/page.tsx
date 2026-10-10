'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { CalendarClock, Plus, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { formatCurrency, dollarsToCents } from '@/lib/currency';

export default function ObligationsPage() {
  const [obligations, setObligations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New obligation modal
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formFrequency, setFormFrequency] = useState('MONTHLY');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formIsSub, setFormIsSub] = useState(false);

  // Payment confirmation modal
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payAccountId, setPayAccountId] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [obRes, accRes, budRes] = await Promise.all([
        fetch('/api/obligations'),
        fetch('/api/accounts'),
        fetch('/api/budgets'),
      ]);
      const obJson = await obRes.json();
      const accJson = await accRes.json();
      const budJson = await budRes.json();

      setObligations(obJson.obligations || []);
      setAccounts(accJson.accounts || []);
      setCategories(budJson.categories || []);

      if (accJson.accounts?.length > 0 && !formAccountId) {
        setFormAccountId(accJson.accounts[0].id);
        setPayAccountId(accJson.accounts[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formAmount || !formDueDate) return;

    try {
      const res = await fetch('/api/obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          amountCents: dollarsToCents(formAmount),
          dueDate: formDueDate,
          frequency: formFrequency,
          categoryId: formCategoryId || null,
          accountId: formAccountId || null,
          isSubscription: formIsSub,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setFormName('');
        setFormAmount('');
        setFormDueDate('');
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecutePayment = async () => {
    if (!payTarget || !payAccountId) return;

    try {
      const res = await fetch('/api/obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay',
          obligationId: payTarget.id,
          accountId: payAccountId,
        }),
      });

      if (res.ok) {
        setPayTarget(null);
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-2xl font-black text-white">Pagos y Obligaciones</h1>
            <p className="text-xs text-slate-400 mt-1">
              Servicios públicos, arriendos, cuotas de préstamos y suscripciones digitales sin duplicidad contable.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Obligación</span>
          </button>
        </div>

        {/* Lista de Obligaciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {obligations.map((item) => {
            const isPaid = item.status === 'PAID';
            return (
              <div
                key={item.id}
                className={`bg-slate-900/60 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                  isPaid ? 'border-slate-800/50 opacity-60' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        isPaid
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : item.status === 'OVERDUE'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {isPaid ? 'Pagado' : item.status === 'OVERDUE' ? 'Vencido' : 'Pendiente'}
                    </span>

                    {item.is_subscription === 1 && (
                      <span className="text-[10px] bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded font-semibold">
                        Suscripción
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white mt-3">{item.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Vence: {item.due_date} ({item.frequency})</p>

                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <p className="text-xs text-slate-500">Monto del compromiso</p>
                    <p className="text-xl font-black text-amber-400">
                      {formatCurrency(item.amount_cents)}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  {!isPaid ? (
                    <button
                      onClick={() => setPayTarget(item)}
                      className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Marcar como Pagado</span>
                    </button>
                  ) : (
                    <div className="text-center py-2 text-xs text-slate-500 font-medium">
                      ✓ Pagado y deducido de saldo
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal de Creación */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-4">Nueva Obligación de Pago</h2>
              <form onSubmit={handleCreate} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Nombre o Servicio</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Factura de Internet / Netflix"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Monto</label>
                    <input
                      type="number"
                      required
                      step="any"
                      placeholder="0.00"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Fecha de Vencimiento</label>
                    <input
                      type="date"
                      required
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Frecuencia</label>
                    <select
                      value={formFrequency}
                      onChange={(e) => setFormFrequency(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="MONTHLY">Mensual</option>
                      <option value="WEEKLY">Semanal</option>
                      <option value="ANNUAL">Anual</option>
                      <option value="ONCE">Pago Único</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Categoría</label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => setFormCategoryId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecciona...</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isSub"
                    checked={formIsSub}
                    onChange={(e) => setFormIsSub(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                  />
                  <label htmlFor="isSub" className="text-slate-300">
                    Es una suscripción recurrente digital
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Confirmación de Pago */}
        {payTarget && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-2">Confirmar Pago de Obligación</h2>
              <p className="text-xs text-slate-400 mb-4">
                Se registrará el gasto de{' '}
                <strong className="text-emerald-400">{formatCurrency(payTarget.amount_cents)}</strong> en la cuenta
                seleccionada y se marcará como saldada.
              </p>

              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1">Pagar desde la cuenta:</label>
                <select
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(a.current_balance_cents)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPayTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleExecutePayment}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                >
                  Confirmar Pago
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
