"use client";

import { Suspense, createElement, useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveTerm, storeTerm, storedTerm, type ResolvedTerm } from "@/lib/terms";

/**
 * The term on screen, shared by every component that shows one quarter's
 * schedule (see lib/terms.ts for how it is chosen).
 *
 * One value for the whole page, so a search, a course list and the planner
 * beside them can never disagree. It is read again after every navigation
 * and on back/forward, so the address stays the source of truth: a link with
 * ?term=WI27 opens Winter in any tab.
 */

let current: ResolvedTerm | null = null;
const listeners = new Set<() => void>();

const fromAddress = () => new URLSearchParams(window.location.search).get("term");

function compute(): ResolvedTerm {
  return resolveTerm(fromAddress(), storedTerm());
}

function refresh(): void {
  const next = compute();
  if (current && next.term === current.term && next.source === current.source && next.unknown === current.unknown) return;
  current = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("popstate", refresh);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("popstate", refresh);
  };
}

function getSnapshot(): ResolvedTerm {
  if (!current) current = compute();
  return current;
}

/** The server knows no address query or stored choice; pages wait for the browser's. */
const getServerSnapshot = (): ResolvedTerm | null => null;

/** The term on screen, or null while the page has not reached the browser yet. */
export function useTerm(): ResolvedTerm | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * A quarter chosen with the picker: shown at once, kept for the next visit,
 * and written into the address so a copied link or a reload shows the same.
 * The address is replaced, not pushed: switching quarters is not a page.
 */
export function chooseTerm(code: string): void {
  storeTerm(code);
  const url = new URL(window.location.href);
  url.searchParams.set("term", code);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  refresh();
}

/**
 * Re-reads the address after a client-side navigation, which changes it
 * without any event a store could hear. Rendered once, in the root layout;
 * the Suspense boundary is what useSearchParams needs on a static page.
 */
function TermAddressWatcher(): null {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  useEffect(() => {
    refresh();
  }, [pathname, query]);
  return null;
}

export function TermAddressSync() {
  return createElement(Suspense, { fallback: null }, createElement(TermAddressWatcher));
}
