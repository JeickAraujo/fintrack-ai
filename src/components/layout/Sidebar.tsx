'use client';

import React from 'react';
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
  Bell,
  ShieldCheck
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

  const handleLogout = async () => {
    document.cookie = 'fintrack_auth_token=; path=/; max-age=0;';
    window.location.href = '/login';
  };

  return (
    <aside className="w-64 bg-slate-900/80 backdrop-blur-md border-r border-slate-800 flex flex-col h-screen sticky top-0 shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
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
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Datos cifrados y cálculos en centavos reales</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || 'Usuario'}</p>
            <p className="text-[11px] text-slate-500 truncate">{user?.email || 'cuenta@fintrack.ai'}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
