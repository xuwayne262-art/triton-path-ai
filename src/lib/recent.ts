/**
 * What this browser looked at last, so the home page can offer it back.
 *
 * A per-browser convenience, like the theme: it never leaves the browser and
 * needs no sign-in, which is what lets a visitor who arrived from a shared
 * link pick up where they left off. Nothing here is part of the plan saved to
 * a student's account.
 */

export type RecentKind = "course" | "professor" | "department" | "search";

export interface RecentItem {
  kind: RecentKind;
  /** "CSE 12", a professor's name, a department id, or the words searched for. */
  key: string;
  /** What to show: a course's title, a department's name. */
  label: string;
  /** Where it goes. */
  href: string;
  /** Epoch ms. */
  at: number;
}

export const RECENT_KEY = "ucsdplans-recent";
export const RECENT_EVENT = "ucsdplans-recent-change";

/** Enough to be useful without turning into a history page. */
export const MAX_VISITS = 8;
export const MAX_SEARCHES = 5;

const KINDS: RecentKind[] = ["course", "professor", "department", "search"];

/** Stored data is untrusted: anything malformed is dropped rather than shown. */
export function cleanRecent(raw: unknown): RecentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentItem[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (!KINDS.includes(r.kind as RecentKind)) continue;
    if (typeof r.key !== "string" || !r.key.trim() || r.key.length > 120) continue;
    if (typeof r.href !== "string" || !r.href.startsWith("/") || r.href.startsWith("//")) continue;
    out.push({
      kind: r.kind as RecentKind,
      key: r.key,
      label: typeof r.label === "string" ? r.label.slice(0, 160) : r.key,
      href: r.href,
      at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
    });
  }
  return out;
}

/**
 * The list with `item` added at the front. A second visit moves an item up
 * rather than listing it twice, and each kind keeps its own cap so a burst of
 * searches cannot push every course off the list.
 */
export function withVisit(list: RecentItem[], item: RecentItem): RecentItem[] {
  const rest = list.filter((r) => !(r.kind === item.kind && r.key.toLowerCase() === item.key.toLowerCase()));
  const next = [item, ...rest];
  const searches = next.filter((r) => r.kind === "search").slice(0, MAX_SEARCHES);
  const visits = next.filter((r) => r.kind !== "search").slice(0, MAX_VISITS);
  const keep = new Set([...searches, ...visits]);
  return next.filter((r) => keep.has(r));
}

/** "3 minutes ago", "yesterday" — how long ago, in the words a person would use. */
export function agoLabel(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}
