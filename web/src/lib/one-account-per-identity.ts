/**
 * One account per public identity: the one that reported in most recently.
 *
 * An identity (slug) can own several accounts — an owner who re-created their
 * wallet mints a new one and the old row stays "armed" in `agents` forever.
 * Listing both put the same agent on the board twice, the abandoned twin
 * captioned "no deposit" (Zug, 2026-09-27: 0x9A98…, empty and never deployed,
 * beside the funded 0xaD19…). Accounts with no slug are left as they are.
 */
export function oneAccountPerIdentity<T extends { smart_account: string; beat_at: number | null }>(
  rows: readonly T[],
  slugFor: ReadonlyMap<string, string>,
): T[] {
  const best = new Map<string, T>();
  const out: T[] = [];
  for (const r of rows) {
    const slug = slugFor.get(r.smart_account.toLowerCase());
    if (!slug) {
      out.push(r);
      continue;
    }
    const seen = best.get(slug);
    if (!seen || (r.beat_at ?? 0) > (seen.beat_at ?? 0)) best.set(slug, r);
  }
  // Keep the input's order for the survivors.
  const keep = new Set(best.values());
  return rows.filter((r) => keep.has(r) || out.includes(r));
}
