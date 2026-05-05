const API_URL = process.env.DB_API_URL!;
const API_KEY = process.env.DB_API_KEY!;

export async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ sql }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Query failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  // Handle both plain array and { rows: [] } shaped responses
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}
