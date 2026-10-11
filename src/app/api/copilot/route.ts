export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { askCopilot } from '@/lib/copilot-engine';

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 });
    }

    const response = await askCopilot(session.id, question, session.currency || 'COP');
    return NextResponse.json(response);
  } catch (err: any) {
    console.error('Copilot API error:', err);
    return NextResponse.json({ error: 'Error procesando consulta con Copilot' }, { status: 500 });
  }
}
