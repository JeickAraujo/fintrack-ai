'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Wallet, Plus, CreditCard, Banknote, Landmark } from 'lucide-react';
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

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/accounts');
      const json = await res.json();
      setAccounts(json.accounts || []);
    } catch (err) {
      console.error(err);
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

      if (res.ok) {
        setShowModal(false);
        setFormName('');
        setFormBalance('');
        setFormCreditLimit('');
        loadAccounts();
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
            <h1 className="text-2xl font-black text-white">Cuentas y Tarjetas</h1>
            <p className="text-xs text-slate-400 mt-1">
              Saldos sincronizados de cuentas de ahorro, corriente, efectivo, billeteras y tarjetas de crédito.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Cuenta</span>
          </button>
        </div>

        {/* Tarjetas de Cuentas */}
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
                      {acc.type.replace('_', ' ')}
                    </span>
                    <Wallet className="w-4 h-4 text-slate-500" />
                  </div>

                  <h3 className="text-base font-bold text-white mt-4">{acc.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Saldo inicial: {formatCurrency(acc.initial_balance_cents)}
                  </p>

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

        {/* Modal de Creación */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
              <h2 className="text-base font-bold text-white mb-4">Añadir Cuenta Financiera</h2>
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
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                  >
                    Crear Cuenta
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
