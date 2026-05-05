import { runQuery } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  const name = params.name.replace(/[^a-zA-Z0-9_]/g, '');
  try {
    const [columns, pkRows] = await Promise.all([
      runQuery(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = '${name}' AND table_schema = 'public'
         ORDER BY ordinal_position`
      ),
      runQuery(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_name = '${name}'
           AND tc.table_schema = 'public'
         ORDER BY kcu.ordinal_position`
      ),
    ]);
    return NextResponse.json({
      columns,
      primaryKeys: pkRows.map(r => r.column_name as string),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
