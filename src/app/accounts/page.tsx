'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Wallet, Plus, CreditCard, Banknote, Landmark, AlertCircle, Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, dollarsToCents, centsToDollars } from '@/lib/currency';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('SAVINGS');
  const [formBalance, setFormBalance] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState('');
  const [formColor, setFormColor] = useState('#10b981');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/accounts');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error cargando cuentas');
      }
      setAccounts(json.accounts || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleOpenNew = () => {
    setEditingAccount(null);
    setFormName('');
    setFormType('SAVINGS');
    setFormBalance('');
    setFormCreditLimit('');
    setFormColor('#10b981');
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (acc: any) => {
    setEditingAccount(acc);
    setFormName(acc.name);
    setFormType(acc.type);
    setFormBalance(String(centsToDollars(acc.current_balance_cents)));
    setFormCreditLimit(acc.credit_limit_cents ? String(centsToDollars(acc.credit_limit_cents)) : '');
    setFormColor(acc.color || '#10b981');
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const url = '/api/accounts';
      const method = editingAccount ? 'PUT' : 'POST';
      const payload: any = {
        name: formName,
        type: formType,
        color: formColor,
      };

      if (editingAccount) {
        payload.id = editingAccount.id;
        payload.currentBalance = parseFloat(formBalance || '0');
        if (formType === 'CREDIT_CARD') {
          payload.creditLimit = parseFloat(formCreditLimit || '0');
        }
      } else {
        payload.initialBalance = parseFloat(formBalance || '0');
        if (formType === 'CREDIT_CARD') {
          payload.creditLimit = parseFloat(formCreditLimit || '0');
        }
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || (editingAccount ? 'Error actualizando cuenta' : 'Error creando cuenta'));
      }

      setShowModal(false);
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al procesar cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (accId: string) => {
    if (!confirm('¿Seguro que deseas desactivar esta cuenta?')) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/accounts?id=${accId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al eliminar cuenta');
      }
      setShowModal(false);
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error eliminando cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Cuentas y Tarjetas</h1>
            <p className="text-xs text-slate-400 mt-1">
              Saldos sincronizados de cuentas de ahorro, corriente, efectivo, billeteras y tarjetas de crédito.
            </p>
          </div>

          <button
            onClick={handleOpenNew}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Cuenta</span>
          </button>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-500 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Cargando cuentas financieras...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
            <Wallet className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">No tienes cuentas registradas</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Crea tu primera cuenta de ahorros, billetera o tarjeta de crédito para comenzar a registrar transacciones.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => {
              const isCredit = acc.type === 'CREDIT_CARD';
              return (
                <div
                  key={acc.id}
                  className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${acc.color || '#10b981'}20`,
                            color: acc.color || '#10b981',
                          }}
                        >
                          {acc.type}
                        </span>
                        {isCredit ? (
                          <CreditCard className="w-4 h-4 text-slate-400" />
                        ) : acc.type === 'CASH' ? (
                          <Banknote className="w-4 h-4 text-slate-400" />
                        ) : (
                          <Landmark className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-xs"
                        title="Editar cuenta"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    </div>

                    <h3 className="text-lg font-bold text-white mt-4">{acc.name}</h3>

                    <div className="mt-6 pt-4 border-t border-slate-800/80">
                      <p className="text-xs text-slate-500">
                        {isCredit ? 'Deuda Acumulada' : 'Saldo Disponible Actual'}
                      </p>
                      <p
                        className={`text-2xl font-black mt-1 ${
                          isCredit ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatCurrency(acc.current_balance_cents)}
                      </p>
                      {isCredit && acc.credit_limit_cents > 0 && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Cupo total: {formatCurrency(acc.credit_limit_cents)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Creación / Edición */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-white">
                  {editingAccount ? 'Editar Cuenta o Deuda' : 'Añadir Cuenta Financiera'}
                </h2>
                {editingAccount && (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingAccount.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    title="Desactivar cuenta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                )}
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Nombre de la Cuenta</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Bancolombia Ahorros / Nequi / Efectivo"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tipo de Cuenta</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="SAVINGS">Cuenta de Ahorros</option>
                    <option value="CHECKING">Cuenta Corriente</option>
                    <option value="WALLET">Billetera Digital (Nequi/Daviplata)</option>
                    <option value="CASH">Efectivo</option>
                    <option value="CREDIT_CARD">Tarjeta de Crédito</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    {formType === 'CREDIT_CARD'
                      ? 'Deuda Actual Acumulada ($)'
                      : (editingAccount ? 'Saldo Actual Disponible ($)' : 'Saldo Inicial ($)')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formBalance}
                    onChange={(e) => setFormBalance(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {formType === 'CREDIT_CARD' && (
                  <div>
                    <label className="block text-slate-400 mb-1">Cupo / Límite de Crédito ($)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={formCreditLimit}
                      onChange={(e) => setFormCreditLimit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

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
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{submitting ? 'Guardando...' : (editingAccount ? 'Guardar Cambios' : 'Crear Cuenta')}</span>
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
