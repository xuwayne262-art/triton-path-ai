"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { PublicListing } from "@/lib/housing/listing";
import { readFilters, writeFilters, type BoardFilters } from "@/lib/housing/filters";

/**
 * What the housing board keeps between visits in one tab.
 *
 * Opening a place and coming back is the most common thing anyone does on
 * the board, so it should return as it was left: the same filters — kept in
 * the address bar, so Back, a reload and a shared link all agree — and the
 * same list, on screen at once while a fresh copy loads.
 */

const BOARD_PATH = "/housing";
const SESSION_KEY = "ucsdplans-housing-board";
const EVENT = "ucsdplans-housing-board";
/** A dragged slider changes the filters many times a second; the address bar follows once it settles. */
const ADDRESS_DELAY_MS = 200;

/** The query the mounted board is showing; null until it reads its own address. */
let live: string | null = null;
let boards = 0;
let addressTimer: number | undefined;

function recall(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function remember(query: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, query);
  } catch {
    /* storage refused: the address bar still carries the filters */
  }
}

/** The address wins, since it is what Back and a shared link carry; with none, this tab's last visit. */
function snapshot(): string {
  if (live === null) live = window.location.search.slice(1) || recall();
  return live;
}

function subscribe(onChange: () => void) {
  boards++;
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    // The next board to mount reads its own address again.
    if (--boards === 0) live = null;
  };
}

/** The board's filters and their setter, read from and written to the address bar. */
export function useBoardFilters(quarterKeys: readonly string[]) {
  const query = useSyncExternalStore(subscribe, snapshot, () => "");
  const filters = useMemo(() => readFilters(query, quarterKeys), [query, quarterKeys]);

  // Arrived by a plain link with filters remembered from earlier in the tab: the address says so
  // too, so copying it shares what is on screen.
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname === BOARD_PATH && !search && query) window.history.replaceState(null, "", `${pathname}?${query}${hash}`);
  }, [query]);

  const setFilters = useCallback((next: BoardFilters) => {
    const q = writeFilters(next);
    live = q;
    remember(q);
    window.dispatchEvent(new Event(EVENT));
    window.clearTimeout(addressTimer);
    addressTimer = window.setTimeout(() => {
      // Left the board in the meantime: the address belongs to another page now.
      if (!boards || window.location.pathname !== BOARD_PATH) return;
      const { pathname, search, hash } = window.location;
      const url = `${pathname}${q ? `?${q}` : ""}${hash}`;
      if (url !== `${pathname}${search}${hash}`) window.history.replaceState(null, "", url);
    }, ADDRESS_DELAY_MS);
  }, []);

  return [filters, setFilters] as const;
}

const noSubscribe = () => () => {};

/** Where "All housing" should go: the board with this tab's filters, or the bare board before hydration. */
export function useBoardHref(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const q = recall();
      return q ? `${BOARD_PATH}?${q}` : BOARD_PATH;
    },
    () => BOARD_PATH,
  );
}

let kept: PublicListing[] | null = null;

/** The list this tab loaded last, shown at once while a fresh one loads. */
export const keptListings = () => kept;

export function keepListings(list: PublicListing[]) {
  kept = list;
}

/** A listing changed elsewhere, so the kept list is out of date: the board waits for a fresh one. */
export function forgetListings() {
  kept = null;
}
