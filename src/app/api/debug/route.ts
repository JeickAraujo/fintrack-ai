export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const con = await queryAll(`
      SELECT
        conname AS constraint_name,
        conrelid::regclass AS table_name,
        confrelid::regclass AS foreign_table_name,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname LIKE '%accounts%' OR conrelid::regclass::text LIKE '%accounts%'
    `);

    const users = await queryAll(`SELECT id, email FROM users LIMIT 10`);

    return NextResponse.json({ con, users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
