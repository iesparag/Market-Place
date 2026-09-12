/**
 * Case-insensitive substring match against any of the given fields — the local
 * (client-side) search used on admin list pages that load their full list up front.
 */
export function matchesSearch(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}
