'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Download, FileText } from 'lucide-react';

export default function ReportsPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  const handleDownloadCsv = () => {
    window.location.href = `/api/reports?format=csv&month=${selectedMonth}`;
  };

  const handleDownloadAllCsv = () => {
    window.location.href = `/api/reports?format=csv`;
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full">
        <div className="border-b border-slate-800/80 pb-6">
          <h1 className="text-xl sm:text-2xl font-black text-white">Informes Financieros y Exportación</h1>
          <p className="text-xs text-slate-400 mt-1">
            Descarga tus estados de cuenta e informes de movimientos en formato CSV para análisis en Excel u hojas de cálculo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Exportar Mes Seleccionado */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <span>Informe Mensual Específico</span>
            </h2>
            <p className="text-xs text-slate-400">
              Genera y descarga un archivo CSV con todos los movimientos registrados en el período elegido.
            </p>

            <div className="pt-2">
              <label className="block text-xs text-slate-400 mb-1.5">Seleccionar Mes:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={handleDownloadCsv}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Descargar CSV ({selectedMonth})</span>
            </button>
          </div>

          {/* Exportar Historial Completo */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-400" />
              <span>Copia Completa de Seguridad</span>
            </h2>
            <p className="text-xs text-slate-400">
              Exporta el historial histórico absoluto de todas tus transacciones, cuentas y categorías sin límite de fecha.
            </p>

            <div className="pt-8">
              <button
                onClick={handleDownloadAllCsv}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Exportar Histórico Completo</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
