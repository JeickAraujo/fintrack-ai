'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  CalendarClock,
  PiggyBank,
  Wallet,
  Sparkles,
  FileSpreadsheet,
  FileText,
  LogOut,
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Movimientos', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Obligaciones y Pagos', href: '/obligations', icon: CalendarClock },
  { name: 'Presupuestos', href: '/budgets', icon: PiggyBank },
  { name: 'Cuentas y Deudas', href: '/accounts', icon: Wallet },
  { name: 'FinTrack Copilot', href: '/copilot', icon: Sparkles, badge: 'IA' },
  { name: 'Importar Extracto', href: '/import', icon: FileSpreadsheet },
  { name: 'Informes y CSV', href: '/reports', icon: FileText },
];

export function Sidebar({ user }: { user?: { name: string; email: string; currency: string } }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar menú móvil al navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevenir scroll del body cuando el menú móvil está abierto
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    document.cookie = 'fintrack_auth_token=; path=/; max-age=0;';
    window.location.href = '/login';
  };

  const navContent = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Security Banner & User Footer */}
      <div className="p-4 border-t border-slate-800 space-y-3 shrink-0">
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Cifrado y centavos reales</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="overflow-hidden pr-2">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || 'Usuario'}</p>
            <p className="text-[11px] text-slate-500 truncate">{user?.email || 'cuenta@fintrack.ai'}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Barra Superior Móvil (Visible solo en pantallas < md) */}
      <header className="md:hidden sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black text-lg">
            F
          </div>
          <span className="text-base font-bold text-white tracking-tight flex items-center gap-1">
            FinTrack <span className="text-emerald-400 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 border border-emerald-500/20">AI</span>
          </span>
        </Link>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Abrir menú"
          className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/70 border border-slate-700/60 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5 text-emerald-400" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Drawer Móvil Desplegable */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop con desenfoque */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />

          {/* Menú lateral */}
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 h-full flex flex-col shadow-2xl z-10">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-base">
                  F
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">FinTrack AI</h2>
                  <p className="text-[10px] text-slate-400">Menú de Navegación</p>
                </div>
              </div>

              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {navContent}
          </aside>
        </div>
      )}

      {/* Sidebar de Escritorio (Visible en md+) */}
      <aside className="hidden md:flex w-64 bg-slate-900/80 backdrop-blur-md border-r border-slate-800 flex-col h-screen sticky top-0 shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black text-xl">
              F
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                FinTrack <span className="text-emerald-400 text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">AI</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">Finanzas Inteligentes</p>
            </div>
          </div>
        </div>

        {navContent}
      </aside>
    </>
  );
}
