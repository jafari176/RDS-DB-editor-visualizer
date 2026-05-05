import { runQuery } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(
  req: Request,
  { params }: { params: { name: string } }
) {
  const name = params.name.replace(/[^a-zA-Z0-9_]/g, '');
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const [rows, countRows] = await Promise.all([
      runQuery(`SELECT * FROM "${name}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`),
      runQuery(`SELECT COUNT(*) AS count FROM "${name}"`),
    ]);
    const total = parseInt(String(countRows[0]?.count ?? '0'), 10);
    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
