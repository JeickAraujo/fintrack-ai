'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Sparkles, Send, Bot, User, ArrowRight } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  data?: any;
  actions?: string[];
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy **FinTrack Copilot**, tu asistente financiero inteligente. Consulto tus saldos reales, presupuestos y movimientos en tiempo real para darte análisis cuantificados y responder cualquier inquietud.',
      actions: [
        '¿En qué gasté más este mes?',
        '¿Cuánto dinero puedo gastar hasta fin de mes?',
        '¿Qué suscripciones estoy pagando?',
        '¿Cuáles son mis próximos pagos?',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });

      const json = await res.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: json.answer || 'No pude obtener una respuesta en este momento.',
        data: json.categoryData,
        actions: json.suggestedActions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Ocurrió un error al consultar tus datos. Por favor intenta de nuevo.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden p-8 max-w-5xl mx-auto w-full">
        <div className="border-b border-slate-800/80 pb-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">FinTrack Copilot</h1>
              <p className="text-xs text-slate-400">
                Consultas deterministas basadas en tus datos financieros reales
              </p>
            </div>
          </div>
        </div>

        {/* Área de Mensajes */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>

                {m.data && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                    {m.data.map((cat: any) => (
                      <div key={cat.name} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-300">{cat.name}</span>
                        <span className="font-bold text-emerald-400">
                          {cat.amount} ({cat.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {m.actions && m.actions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                    {m.actions.map((act: string, i: number) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(act)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-center text-xs text-slate-500">
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <p>Analizando registros en la base de datos...</p>
            </div>
          )}
        </div>

        {/* Input Footer */}
        <div className="pt-4 border-t border-slate-800/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Haz una pregunta financiera (ej. ¿En qué gasté más este mes?)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Preguntar</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
