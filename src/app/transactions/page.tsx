'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Plus, Filter, Search, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency, dollarsToCents } from '@/lib/currency';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Form modal
  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState('EXPENSE');
  const [formAmount, setFormAmount] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().substring(0, 10));
  const [formAccountId, setFormAccountId] = useState('');
  const [formDestAccountId, setFormDestAccountId] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Delete confirmation
  const [deleteModalTx, setDeleteModalTx] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [txRes, accRes, budRes] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/accounts'),
        fetch('/api/budgets'),
      ]);

      const txJson = await txRes.json();
      const accJson = await accRes.json();
      const budJson = await budRes.json();

      if (!txRes.ok) throw new Error(txJson.error || 'Error cargando transacciones');
      if (!accRes.ok) throw new Error(accJson.error || 'Error cargando cuentas');

      setTransactions(txJson.transactions || []);
      setAccounts(accJson.accounts || []);
      setCategories(budJson.categories || []);

      if (accJson.accounts?.length > 0 && !formAccountId) {
        setFormAccountId(accJson.accounts[0].id);
        if (accJson.accounts.length > 1) {
          setFormDestAccountId(accJson.accounts[1].id);
        }
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

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || !formDesc || !formAccountId) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: formAccountId,
          destinationAccountId: formType === 'TRANSFER' ? formDestAccountId : null,
          categoryId: formCategoryId || null,
          type: formType,
          amountCents: dollarsToCents(formAmount),
          date: formDate,
          description: formDesc,
          notes: formNotes,
          source: 'MANUAL',
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error registrando transacción');
      }

      setShowModal(false);
      setFormAmount('');
      setFormDesc('');
      setFormNotes('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deleteModalTx) return;
    try {
      setDeleting(true);
      setErrorMsg(null);
      const res = await fetch(`/api/transactions?id=${deleteModalTx.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al eliminar movimiento');
      }
      setTransactions((prev) => prev.filter((t) => t.id !== deleteModalTx.id));
      setDeleteModalTx(null);
      // Recargar datos en segundo plano para actualizar balances de cuentas
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error eliminando movimiento');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = transactions.filter((tx) => {
    const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType ? tx.type === selectedType : true;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Registro de Movimientos</h1>
            <p className="text-xs text-slate-400 mt-1">
              Control exhaustivo de ingresos, gastos, transferencias y compras a crédito.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Movimiento</span>
          </button>
        </div>

        {/* Barra de Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar por descripción o comercio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Todos los tipos</option>
            <option value="EXPENSE">Gastos</option>
            <option value="INCOME">Ingresos</option>
            <option value="TRANSFER">Transferencias</option>
            <option value="CREDIT_PURCHASE">Compras a Crédito</option>
          </select>
        </div>

        {/* Tabla de Movimientos */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No se encontraron movimientos registrados con los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold">
                    <th className="py-3 px-3 sm:px-4 whitespace-nowrap">Fecha</th>
                    <th className="py-3 px-2 sm:px-4">Tipo</th>
                    <th className="py-3 px-3 sm:px-4 min-w-[120px]">Descripción</th>
                    <th className="py-3 px-3 sm:px-4 hidden md:table-cell">Categoría</th>
                    <th className="py-3 px-3 sm:px-4 hidden sm:table-cell">Cuenta</th>
                    <th className="py-3 px-3 sm:px-4 hidden lg:table-cell">Origen</th>
                    <th className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">Valor</th>
                    <th className="py-3 px-2 sm:px-4 text-center whitespace-nowrap">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((tx) => {
                    const isIncome = tx.type === 'INCOME' || tx.type === 'REFUND';
                    const isTransfer = tx.type === 'TRANSFER';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 sm:px-4 text-slate-400 whitespace-nowrap">{tx.date}</td>
                        <td className="py-3 px-2 sm:px-4">
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              isIncome
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isTransfer
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {tx.type === 'CREDIT_PURCHASE' ? 'CRÉDITO' : tx.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4 font-semibold text-slate-200">
                          {tx.description}
                          <div className="sm:hidden text-[10px] text-slate-400 font-normal mt-0.5">
                            {tx.account_name} {tx.category_name ? `• ${tx.category_name}` : ''}
                          </div>
                          {tx.notes && <p className="text-[10px] text-slate-500 font-normal">{tx.notes}</p>}
                        </td>
                        <td className="py-3 px-3 sm:px-4 hidden md:table-cell">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-medium"
                            style={{
                              backgroundColor: `${tx.category_color || '#64748b'}20`,
                              color: tx.category_color || '#cbd5e1',
                            }}
                          >
                            {tx.category_name || 'Sin Categoría'}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-slate-400 hidden sm:table-cell">{tx.account_name}</td>
                        <td className="py-3 px-3 sm:px-4 text-[10px] text-slate-500 hidden lg:table-cell">{tx.source}</td>
                        <td
                          className={`py-3 px-3 sm:px-4 text-right font-bold whitespace-nowrap ${
                            isIncome
                              ? 'text-emerald-400'
                              : isTransfer
                              ? 'text-blue-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {isIncome ? '+' : isTransfer ? '⇄ ' : '-'}{formatCurrency(tx.amount_cents)}
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center whitespace-nowrap">
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

        {/* Modal de Creación */}
        {showModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-white mb-4">Registrar Movimiento</h2>
              <form onSubmit={handleCreateTransaction} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Tipo de Movimiento</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['EXPENSE', 'INCOME', 'TRANSFER', 'CREDIT_PURCHASE'].map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setFormType(t)}
                        className={`py-2 rounded-xl font-semibold transition-all ${
                          formType === t
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-950 border border-slate-800 text-slate-400'
                        }`}
                      >
                        {t === 'EXPENSE'
                          ? 'Gasto'
                          : t === 'INCOME'
                          ? 'Ingreso'
                          : t === 'TRANSFER'
                          ? 'Transfer'
                          : 'Crédito'}
                      </button>
                    ))}
                  </div>
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
                    <label className="block text-slate-400 mb-1">Fecha</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Descripción / Concepto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Almuerzo corporativo"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Cuenta</label>
                    <select
                      value={formAccountId}
                      onChange={(e) => setFormAccountId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {formType === 'TRANSFER' ? (
                    <div>
                      <label className="block text-slate-400 mb-1">Cuenta Destino</label>
                      <select
                        value={formDestAccountId}
                        onChange={(e) => setFormDestAccountId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        {accounts
                          .filter((a) => a.id !== formAccountId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.type})
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-slate-400 mb-1">Categoría</label>
                      <select
                        value={formCategoryId}
                        onChange={(e) => setFormCategoryId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Selecciona categoría...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Notas Opcionales</label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Detalles adicionales..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
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
                    {formatCurrency(deleteModalTx.amount_cents)}
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
