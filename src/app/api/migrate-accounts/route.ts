export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { execute, queryAll } from '@/lib/db';

export async function GET(req: Request) {
  try {
    let dropErr = null;
    let addErr = null;

    try {
      await execute(`ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_user_id_fkey`);
    } catch (e: any) {
      dropErr = e.message;
    }

    try {
      await execute(`ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`);
    } catch (e: any) {
      addErr = e.message;
    }

    const con = await queryAll(`
      SELECT conname, confrelid::regclass::text AS target
      FROM pg_constraint
      WHERE conname = 'accounts_user_id_fkey'
    `);

    return NextResponse.json({ dropErr, addErr, con });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
