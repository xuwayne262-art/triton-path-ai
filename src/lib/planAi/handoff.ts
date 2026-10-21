/**
 * A request typed somewhere else — /discover — carried into Plan with AI.
 *
 * It rides in this tab's sessionStorage, not the URL: a request can say
 * more about a student than an address bar or a server log should, and the
 * tab survives the sign-in round trip. It is read once and removed, and an
 * old one is ignored rather than run by surprise.
 */

export const HANDOFF_KEY = "ucsdplans-plan-ai-request";
const TTL_MS = 30 * 60 * 1000;
const MAX = 600;

export function storeHandoff(text: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ text: text.slice(0, MAX), at: now }));
  } catch {
    /* Nothing kept: the page opens empty instead. */
  }
}

/** The waiting request, once; null when there is none or it is old. */
export function takeHandoff(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof v.text !== "string" || typeof v.at !== "number") return null;
    if (now - v.at < 0 || now - v.at > TTL_MS) return null;
    return v.text.trim().slice(0, MAX) || null;
  } catch {
    return null;
  }
}
