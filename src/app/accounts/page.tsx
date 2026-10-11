'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Wallet, Plus, CreditCard, Banknote, Landmark, AlertCircle, Loader2 } from 'lucide-react';
import { formatCurrency, dollarsToCents } from '@/lib/currency';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          type: formType,
          initialBalance: parseFloat(formBalance || '0'),
          creditLimit: parseFloat(formCreditLimit || '0'),
          color: formColor,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error creando cuenta');
      }

      setShowModal(false);
      setFormName('');
      setFormBalance('');
      setFormCreditLimit('');
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al guardar cuenta');
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
            onClick={() => {
              setErrorMsg(null);
              setShowModal(true);
            }}
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
            <h3 className="text-base font-bold text-slate-300">No tienes cuentas registradas</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Crea tu primera cuenta bancaria, billetera digital (Nequi, Daviplata) o tarjeta de crédito para comenzar a registrar movimientos.
            </p>
            <button
              onClick={() => {
                setErrorMsg(null);
                setShowModal(true);
              }}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir mi primera cuenta</span>
            </button>
          </div>
        ) : (
          /* Tarjetas de Cuentas */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {accounts.map((acc) => {
              const isCredit = acc.type === 'CREDIT_CARD';
              return (
                <div
                  key={acc.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden"
                >
                  <div>
                    <div className="flex items-center justify-between">
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
                        <CreditCard className="w-5 h-5 text-slate-400" />
                      ) : acc.type === 'CASH' ? (
                        <Banknote className="w-5 h-5 text-slate-400" />
                      ) : (
                        <Landmark className="w-5 h-5 text-slate-400" />
                      )}
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

        {/* Modal de Creación */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <h2 className="text-base font-bold text-white mb-4">Añadir Cuenta Financiera</h2>

              {errorMsg && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4 text-xs">
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
                  <label className="block text-slate-400 mb-1">Saldo Inicial</label>
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
                    <label className="block text-slate-400 mb-1">Cupo / Límite de Crédito</label>
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
                    <span>{submitting ? 'Creando...' : 'Crear Cuenta'}</span>
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
