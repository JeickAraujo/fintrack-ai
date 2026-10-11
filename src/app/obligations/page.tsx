'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { CalendarClock, Plus, CheckCircle2, Trash2, Edit3, AlertCircle, Loader2 } from 'lucide-react';
import { formatCurrency, dollarsToCents, centsToDollars } from '@/lib/currency';

export default function ObligationsPage() {
  const [obligations, setObligations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal de creación / edición
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formFrequency, setFormFrequency] = useState('MONTHLY');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formIsSub, setFormIsSub] = useState(false);

  // Modal de pago
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payAccountId, setPayAccountId] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [obRes, accRes, budRes] = await Promise.all([
        fetch('/api/obligations'),
        fetch('/api/accounts'),
        fetch('/api/budgets'),
      ]);

      const obJson = await obRes.json();
      const accJson = await accRes.json();
      const budJson = await budRes.json();

      if (!obRes.ok) throw new Error(obJson.error || 'Error cargando obligaciones');
      if (!accRes.ok) throw new Error(accJson.error || 'Error cargando cuentas');

      setObligations(obJson.obligations || []);
      setAccounts(accJson.accounts || []);
      setCategories(budJson.categories || []);

      if (accJson.accounts?.length > 0 && !formAccountId) {
        setFormAccountId(accJson.accounts[0].id);
        setPayAccountId(accJson.accounts[0].id);
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
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setFormName('');
    setFormAmount('');
    setFormDueDate('');
    setFormFrequency('MONTHLY');
    setFormCategoryId('');
    setFormIsSub(false);
    if (accounts.length > 0) {
      setFormAccountId(accounts[0].id);
    }
    setErrorMsg(null);
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormAmount(String(centsToDollars(item.amount_cents)));
    setFormDueDate(item.due_date);
    setFormFrequency(item.frequency || 'MONTHLY');
    setFormCategoryId(item.category_id || '');
    setFormAccountId(item.account_id || (accounts[0]?.id || ''));
    setFormIsSub(item.is_subscription === 1);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formAmount || !formDueDate) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const url = '/api/obligations';
      const method = editingId ? 'PUT' : 'POST';
      const bodyPayload: any = {
        name: formName,
        amountCents: dollarsToCents(formAmount),
        dueDate: formDueDate,
        frequency: formFrequency,
        categoryId: formCategoryId || null,
        accountId: formAccountId || null,
        isSubscription: formIsSub,
      };

      if (editingId) {
        bodyPayload.id = editingId;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error guardando obligación');
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error procesando solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta obligación de pago?')) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const res = await fetch(`/api/obligations?id=${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error eliminando obligación');
      }

      await loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al eliminar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecutePayment = async () => {
    if (!payTarget || !payAccountId) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const res = await fetch('/api/obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay',
          obligationId: payTarget.id,
          accountId: payAccountId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al procesar el pago');
      }

      setPayTarget(null);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al efectuar pago');
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
            <h1 className="text-2xl font-black text-white">Pagos y Obligaciones</h1>
            <p className="text-xs text-slate-400 mt-1">
              Servicios públicos, arriendos, cuotas de préstamos y suscripciones digitales sin duplicidad contable.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Obligación</span>
          </button>
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
            <p className="text-xs font-medium">Cargando compromisos financieros...</p>
          </div>
        ) : obligations.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
            <CalendarClock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">Sin obligaciones de pago registradas</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
              Registra tus suscripciones y servicios para recibir alertas y evitar cortes o intereses de mora.
            </p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              Crear primera obligación
            </button>
          </div>
        ) : (
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

                      <div className="flex items-center gap-1.5">
                        {item.is_subscription === 1 && (
                          <span className="text-[10px] bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded font-semibold">
                            Suscripción
                          </span>
                        )}
                        {!isPaid && (
                          <button
                            onClick={() => openEditModal(item)}
                            title="Editar"
                            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          title="Eliminar"
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                        onClick={() => {
                          setPayTarget(item);
                          if (item.account_id) setPayAccountId(item.account_id);
                        }}
                        disabled={submitting}
                        className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Marcar como Pagado</span>
                      </button>
                    ) : (
                      <div className="text-center py-2 text-xs text-emerald-400/80 font-medium">
                        ✓ Pagado y registrado en transacciones
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Creación / Edición */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-4">
                {editingId ? 'Editar Obligación de Pago' : 'Nueva Obligación de Pago'}
              </h2>
              <form onSubmit={handleSave} className="space-y-4 text-xs">
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
                      <option value="ONCE">Única Vez</option>
                      <option value="WEEKLY">Semanal</option>
                      <option value="ANNUAL">Anual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Categoría</label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => setFormCategoryId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">(Sin Categoría)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Cuenta Preferida</label>
                  <select
                    value={formAccountId}
                    onChange={(e) => setFormAccountId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecciona cuenta...</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.current_balance_cents)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isSub"
                    checked={formIsSub}
                    onChange={(e) => setFormIsSub(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-800 text-emerald-500 focus:ring-0 bg-slate-950"
                  />
                  <label htmlFor="isSub" className="text-slate-300 cursor-pointer">
                    Es una suscripción recurrente (Netflix, Spotify, etc.)
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingId ? 'Guardar Cambios' : 'Crear Obligación'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Marcación de Pago */}
        {payTarget && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-2">Confirmar Pago de Obligación</h2>
              <p className="text-xs text-slate-400 mb-4">
                Se registrará un gasto de <strong className="text-white">{formatCurrency(payTarget.amount_cents)}</strong> por concepto de{' '}
                <strong className="text-white">{payTarget.name}</strong> y se descontará del saldo de tu cuenta.
              </p>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Deducir de la cuenta</label>
                  <select
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.current_balance_cents)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPayTarget(null)}
                    className="px-4 py-2 text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleExecutePayment}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirmar y Descontar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
