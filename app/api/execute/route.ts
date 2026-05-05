import { NextResponse } from 'next/server';

const API_URL = process.env.DB_API_URL!;
const API_KEY = process.env.DB_API_KEY!;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sql: string = body.sql?.trim();
  if (!sql) return NextResponse.json({ error: 'No SQL provided' }, { status: 400 });

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ sql }),
      cache: 'no-store',
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.message ?? data?.error ?? data?.detail ?? res.statusText;
      return NextResponse.json({ rows: [], rowCount: 0, error: msg });
    }

    if (Array.isArray(data)) return NextResponse.json({ rows: data, rowCount: data.length });
    if (Array.isArray(data?.rows)) return NextResponse.json({ rows: data.rows, rowCount: data.rows.length });
    return NextResponse.json({ rows: [], rowCount: data?.rowCount ?? data?.count ?? 0 });
  } catch (e) {
    return NextResponse.json({ rows: [], rowCount: 0, error: String(e) });
  }
}
