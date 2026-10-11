'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export default function ImportPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);

  // Notificación bancaria rápida
  const [notificationText, setNotificationText] = useState('');
  const [parsedNotification, setParsedNotification] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/accounts')
      .then((res) => res.json())
      .then((data) => {
        setAccounts(data.accounts || []);
        if (data.accounts?.length > 0) {
          setSelectedAccountId(data.accounts[0].id);
        }
      });
  }, []);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csvContent || !selectedAccountId) {
      setErrorMsg('Debes seleccionar un archivo CSV y una cuenta de destino.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview_csv',
          csvContent,
          accountId: selectedAccountId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al procesar el archivo CSV');
      }
      setPreviewResult(json);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error analizando extracto');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewResult || !selectedAccountId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_import',
          rows: previewResult.validRows,
          accountId: selectedAccountId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al importar movimientos');
      }
      setImportSuccess(json.importedCount);
      setPreviewResult(null);
      setCsvContent('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error importando');
    } finally {
      setLoading(false);
    }
  };

  const handleParseNotification = async () => {
    if (!notificationText.trim()) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parse_notification',
          text: notificationText,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error analizando notificación');
      }
      if (!json.item) {
        throw new Error('No se pudo detectar un monto válido en el texto de la notificación.');
      }
      setParsedNotification(json.item);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error procesando notificación');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotificationTx = async () => {
    if (!parsedNotification || !selectedAccountId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          type: parsedNotification.type,
          amountCents: parsedNotification.amountCents,
          date: parsedNotification.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
          description: parsedNotification.description,
          source: 'NOTIFICATION',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error registrando movimiento');
      }
      setParsedNotification(null);
      setNotificationText('');
      setImportSuccess(1);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error registrando transacción');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto space-y-8">
        <div className="border-b border-slate-800/80 pb-6">
          <h1 className="text-2xl font-black text-white">Importación de Extractos y Notificaciones</h1>
          <p className="text-xs text-slate-400 mt-1">
            Motor de ingesta bancaria con detección automática de encabezados, normalización y deduplicación criptográfica.
          </p>
        </div>

        {importSuccess !== null && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Se importaron exitosamente {importSuccess} movimientos sin duplicados.</span>
            </div>
            <button onClick={() => setImportSuccess(null)} className="font-bold underline">
              Cerrar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Creador 1: Importar Archivo CSV Bancario */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-emerald-400" />
              <span>Cargar Extracto Bancario CSV</span>
            </h2>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Asignar a la Cuenta:</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Seleccionar archivo .CSV:</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
              />
            </div>

            <button
              onClick={handlePreview}
              disabled={loading || !csvContent}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs transition-colors"
            >
              {loading ? 'Analizando cabeceras y duplicados...' : 'Analizar y Previsualizar'}
            </button>
          </div>

          {/* Creador 2: Pegar Notificación de SMS / Bancaria */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <span>Pegar Notificación Bancaria</span>
            </h2>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Texto de notificación bancaria:</label>
              <textarea
                rows={3}
                placeholder='Ej: "Bancolombia: Compra por $45.000 en EXITO CALLE 80 con tarjeta *1234"'
                value={notificationText}
                onChange={(e) => setNotificationText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={handleParseNotification}
              disabled={!notificationText.trim()}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs transition-colors"
            >
              Extraer Datos
            </button>

            {parsedNotification && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">{parsedNotification.description}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatCurrency(parsedNotification.amountCents)} • Confianza: 95%
                  </p>
                </div>
                <button
                  onClick={handleSaveNotificationTx}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  Confirmar y Guardar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabla de Previsualización CSV y Deduplicación */}
        {previewResult && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Previsualización de Movimientos</h3>
                <p className="text-xs text-slate-400">
                  {previewResult.validRows.length} movimientos procesados • {previewResult.duplicateCount} duplicados detectados
                </p>
              </div>

              <button
                onClick={handleConfirmImport}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
              >
                Confirmar Importación
              </button>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2 px-3">Fecha</th>
                    <th className="pb-2 px-3">Descripción</th>
                    <th className="pb-2 px-3">Sugerencia Categoría</th>
                    <th className="pb-2 px-3">Estado de Duplicado</th>
                    <th className="pb-2 px-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {previewResult.validRows.map((r: any, idx: number) => (
                    <tr key={idx} className={r.isDuplicate ? 'opacity-40 bg-rose-500/5' : ''}>
                      <td className="py-2.5 px-3 text-slate-400">{r.date}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">{r.description}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                          {r.categorySuggestion} ({Math.round(r.confidence * 100)}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {r.isDuplicate ? (
                          <span className="text-[10px] text-rose-400 font-bold">⚠️ DUPLICADO DETECTADO</span>
                        ) : (
                          <span className="text-[10px] text-emerald-400">Nuevo movimiento</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                        {formatCurrency(r.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
