export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const fkeys = await queryAll(`
      SELECT
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name IN ('accounts', 'categories', 'transactions', 'payment_obligations', 'budgets', 'users')
        AND tc.constraint_type = 'FOREIGN KEY'
    `);

    const usersCount = await queryAll(`SELECT count(*) FROM users`);
    const accountsCount = await queryAll(`SELECT count(*) FROM accounts`);

    return NextResponse.json({ fkeys, usersCount, accountsCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
