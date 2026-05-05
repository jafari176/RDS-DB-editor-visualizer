import { runQuery } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await runQuery(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    return NextResponse.json({ tables: rows.map(r => r.table_name as string) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
