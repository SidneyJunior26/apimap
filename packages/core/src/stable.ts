/** JSON with sorted object keys and undefined values dropped, for structural comparison. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

export const sameValue = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);
