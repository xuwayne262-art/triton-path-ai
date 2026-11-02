/**
 * Which courses are being compared: the address is the record (?c=CSE 11,
 * CSE 12), so a comparison reloads, goes Back and can be sent to a friend.
 * At most three, because a fourth column stops being readable on a laptop
 * and a phone stacks them anyway.
 */

export const MAX_COMPARE = 3;

const CODE = /^([A-Z]{2,5})\s*(\d{1,3}[A-Z]{0,4})$/;

/** "cse11" or " CSE 11 " -> "CSE 11"; null for anything else. */
export function normalizeCode(raw: string): string | null {
  const m = CODE.exec(raw.trim().toUpperCase());
  return m ? `${m[1]} ${m[2]}` : null;
}

/** The courses an address names, cleaned, without repeats, at most three. */
export function parseCompare(param: string | null, exists: (code: string) => boolean = () => true): { codes: string[]; dropped: string[] } {
  const codes: string[] = [];
  const dropped: string[] = [];
  for (const piece of (param ?? "").split(",").slice(0, 12)) {
    if (!piece.trim()) continue;
    const code = normalizeCode(piece);
    if (!code || !exists(code)) { dropped.push(piece.trim().slice(0, 20)); continue; }
    if (!codes.includes(code) && codes.length < MAX_COMPARE) codes.push(code);
  }
  return { codes, dropped };
}

/** The last comparison, per browser, so "Compare" on a course page adds to it. A convenience only. */
export const COMPARE_KEY = "ucsdplans-compare";

export function rememberCompare(codes: string[]): void {
  try { localStorage.setItem(COMPARE_KEY, codes.join(",")); } catch { /* not remembered */ }
}
export function rememberedCompare(): string {
  try { return localStorage.getItem(COMPARE_KEY) ?? ""; } catch { return ""; }
}

export const compareHref = (codes: string[]) =>
  codes.length ? `/compare?c=${codes.map((c) => encodeURIComponent(c)).join(",")}` : "/compare";

/** The list with `code` added at the end (oldest dropped past three), or removed. */
export function withCode(codes: string[], code: string): string[] {
  if (codes.includes(code)) return codes;
  return [...codes, code].slice(-MAX_COMPARE);
}
export const withoutCode = (codes: string[], code: string) => codes.filter((c) => c !== code);
