/**
 * Which quarter's schedule a page shows.
 *
 * UCSDPlans serves more than one quarter at a time: Fall 2026 is under way
 * while students book Winter 2027. The terms the site has a schedule for are
 * listed in public/data/plat/terms.json, written by scripts/build-term-data.mjs
 * and bundled here, since every data update is a deploy of its own.
 *
 * The term a page uses is, in order:
 *   1. the address's ?term=, so a shared link, a new tab and the back button
 *      all show what was on screen — an explicit address always wins;
 *   2. the student's own last choice, kept in this browser;
 *   3. otherwise the newest quarter with a published schedule: during
 *      November booking that is Winter, while the campus clock still says
 *      Fall is in progress.
 * A ?term= the site has no schedule for is reported as such, never quietly
 * replaced with another quarter's sections.
 */

import manifestFile from "../../public/data/plat/terms.json" with { type: "json" };
import { QUARTERS, todayInSanDiego, type Quarter } from "@/lib/housing/terms";

export interface TermFeatures {
  /** Meeting buildings and rooms are published, so rooms, maps and walks can be shown. */
  rooms: boolean;
  /** Each section's seat count says when it was taken. */
  seatTimes: boolean;
  /** Exact TSS booking links can be built. */
  booking: boolean;
}

export interface TermEntry {
  /** "WI27" */
  code: string;
  /** "Winter 2027" */
  name: string;
  /** Where its files are, under /data/plat; null for the shared dataset itself. */
  path: string | null;
  /** The snapshot the files were built from; every file of the term carries it. */
  v: string;
  /** When UCSD last refreshed the term, as its API writes it: "2026-11-06 01:38:11+00". */
  refreshed?: string | null;
  /** When the site read it, ISO-8601, when known. */
  retrieved?: string | null;
  counts?: Record<string, number | null> | null;
  /** UCSD's own summary counts, which can differ from what its search returns. */
  summary?: { courses: number | null; sections: number | null; meetings: number | null } | null;
  features: TermFeatures;
  /** Kept as last built: its source routes now need a sign-in. */
  frozen?: boolean;
}

export interface TermManifest {
  terms: TermEntry[];
}

export const MANIFEST: TermManifest = manifestFile as TermManifest;

/** Calendar order: "FA26" < "WI27" < "SP27". */
export function termRank(code: string): number {
  const seasons = ["WI", "SP", "S1", "S2", "S3", "SA", "SU", "FA"];
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(String(code || ""));
  return m ? Number(m[2]) * 10 + Math.max(0, seasons.indexOf(m[1])) : -1;
}

/** The terms the site has a schedule for, oldest first. */
export const termsServed = (manifest: TermManifest = MANIFEST): TermEntry[] =>
  [...manifest.terms].sort((a, b) => termRank(a.code) - termRank(b.code));

export const termEntry = (code: string | null | undefined, manifest: TermManifest = MANIFEST): TermEntry | null =>
  manifest.terms.find((t) => t.code === code) ?? null;

/** The term the shared files (index.json, subject/*.json) carry: Fall 2026. */
export const BASE_TERM: string = MANIFEST.terms.find((t) => t.path === null)?.code ?? "FA26";

/** A term code from an address: "wi27", "WI27" -> "WI27"; anything else null. */
export function parseTerm(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z][A-Z0-9]\d{2}$/.test(code) ? code : null;
}

/** The newest quarter with a published schedule: what a first visit plans for. */
export function defaultTerm(manifest: TermManifest = MANIFEST): string {
  const served = termsServed(manifest);
  return served.length ? served[served.length - 1].code : BASE_TERM;
}

export type TermSource = "url" | "stored" | "default";

export interface ResolvedTerm {
  /** The term to show. Never one the site has no schedule for. */
  term: string;
  source: TermSource;
  /** A ?term= the site has no schedule for, so the page can say so and offer the others. */
  unknown: string | null;
}

/** The term a page shows, from its address, the stored choice and the default (see top). */
export function resolveTerm(url: string | null | undefined, stored: string | null | undefined, manifest: TermManifest = MANIFEST): ResolvedTerm {
  const asked = url == null || url === "" ? null : parseTerm(url) ?? String(url).slice(0, 12);
  if (asked && termEntry(asked, manifest)) return { term: asked, source: "url", unknown: null };
  const saved = parseTerm(stored);
  if (saved && termEntry(saved, manifest)) return { term: saved, source: "stored", unknown: asked };
  return { term: defaultTerm(manifest), source: "default", unknown: asked };
}

// ── Where each term is in its year ───────────────────────────────────────────

export type TermPhase = "upcoming" | "in-progress" | "ended";

export const quarterOf = (code: string): Quarter | null => QUARTERS.find((q) => q.key === code) ?? null;

/** Whether a quarter is still ahead, under way or over, on San Diego's calendar. */
export function termPhase(code: string, today: string = todayInSanDiego()): TermPhase | null {
  const q = quarterOf(code);
  if (!q) return null;
  if (today < q.begins) return "upcoming";
  if (today > q.end) return "ended";
  return "in-progress";
}

/** "In progress", "Upcoming", "Ended": the word beside a term's name. */
export function phaseLabel(phase: TermPhase | null): string | null {
  return phase === "in-progress" ? "In progress" : phase === "upcoming" ? "Upcoming" : phase === "ended" ? "Ended" : null;
}

/** "?term=WI27" added to an address, keeping its own query and hash; unchanged when no term. */
export function withTerm(href: string, term: string | null | undefined): string {
  if (!term) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const path = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const q = path.indexOf("?");
  const params = new URLSearchParams(q >= 0 ? path.slice(q + 1) : "");
  params.set("term", term);
  return `${q >= 0 ? path.slice(0, q) : path}?${params.toString()}${hash}`;
}

// ── The browser's copy of the choice ─────────────────────────────────────────

export const TERM_KEY = "ucsdplans-term";

/** The stored choice, or null; storage that throws (private mode, blocked) counts as none. */
export function storedTerm(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(TERM_KEY);
  } catch {
    return null;
  }
}

export function storeTerm(code: string): void {
  try {
    window.localStorage.setItem(TERM_KEY, code);
  } catch {
    /* The choice still holds for this visit through the address. */
  }
}
