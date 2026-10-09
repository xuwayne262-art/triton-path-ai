"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck, List, Loader2, Map as MapIcon, Plus, RotateCw, Search, X } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import { SECTION_TITLE } from "@/components/plat/typeScale";
import { useTheme } from "@/components/plat/theme";
import { usePref } from "@/components/planner/usePref";
import ListingCard, { street } from "@/components/housing/ListingCard";
import RentSlider from "@/components/housing/RentSlider";
import SafetyNote from "@/components/housing/SafetyNote";
import { keepListings, keptListings, useBoardFilters } from "@/components/housing/boardState";
import { useTermSchedule } from "@/components/housing/useTermSchedule";
import { MAX_CHECKED, letterFor, useCheckedPlaces } from "@/components/housing/useCheckedPlaces";
import {
  CommuteLine, DAY_SHORT, ModeToggle, measureCost, measureFrom, type Measure,
} from "@/components/housing/parts";
import type { ClassPin, HomePin, Spoke } from "@/components/housing/HousingMap";
import { LIBRARY_WALK, isMode, type Mode } from "@/lib/housing/commute";
import { NO_FILTERS, SPACES, type Sort, type Space } from "@/lib/housing/filters";
import { coverage, quarterByKey, todayInSanDiego, upcomingQuarters } from "@/lib/housing/terms";
import {
  dollars, headline, isListed, listedUntil, type ListingState, type PublicListing,
} from "@/lib/housing/listing";
import { parseAddressQuery, type Place } from "@/lib/housing/geocode";

const HousingMap = dynamic(() => import("@/components/housing/HousingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-slate-100 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the map…
    </div>
  ),
});

const matchesSpace = (l: PublicListing, s: Space) =>
  s === "any" ? true : s === "whole" ? l.kind === "whole" : l.kind !== "whole" && l.room === s;

/** The filter row's selects and input; 16px on phones so iOS does not zoom into them. */
const FIELD =
  "rounded-lg border border-gray-200 bg-white py-1.5 text-xs outline-none transition focus:border-[#182B49] " +
  "dark:border-white/10 dark:bg-[#101a2b] dark:focus:border-[#FFCD00] max-md:text-base";

/**
 * Housing, measured against your week.
 *
 * UCSBPlat bolted a sublet board onto its course site; the two halves never
 * meet. Here they do: the planner already knows which rooms a student's
 * sections meet in, so every place on this page — posted by a verified
 * @ucsd.edu student, or typed in from anywhere else — is ranked by the trip
 * to *their* classes, with the time they would have to leave each morning.
 */
export default function HousingPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const schedule = useTermSchedule();
  const [mode, setMode] = usePref<Mode>("ucsdplans-housing-mode", "walk", isMode);
  const checked = useCheckedPlaces();

  // Coming back from a listing shows the list this tab already has, then refreshes it.
  const [listings, setListings] = useState<PublicListing[] | null>(keptListings);
  /** Why the list did not load: the API's code, or OFFLINE when nothing answered. */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** A request for the list is in flight — so "Retry" can show that it is trying. */
  const [fetching, setFetching] = useState(false);
  /** Retries pressed since the list last loaded; only the student's own presses count. */
  const [retries, setRetries] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState<"list" | "map">("list");

  const today = useMemo(() => todayInSanDiego(), []);
  const quarters = useMemo(() => upcomingQuarters(today, 4), [today]);
  const quarterKeys = useMemo(() => quarters.map((q) => q.key), [quarters]);
  const [filters, setFilters] = useBoardFilters(quarterKeys);
  const { quarter, space, rentCap, sort } = filters;

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/housing", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { listings?: PublicListing[]; code?: string };
      if (!res.ok) {
        setLoadError(body.code ?? "FAILED");
        return;
      }
      keepListings(body.listings ?? []);
      setListings(body.listings ?? []);
      setLoadError(null);
      setRetries(0);
    } catch {
      // No answer at all: offline, or the request never reached the server.
      setLoadError("OFFLINE");
    } finally {
      // A failed load leaves `listings` as it was — null when nothing ever
      // loaded. It used to become [], which put "0 places" above the error, as
      // if the board had been checked and found empty.
      setFetching(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setRetries((n) => n + 1);
    load();
  };

  // ── What every place is measured against ──────────────────────────────────
  const placed = useMemo(
    () => schedule.events.filter((e) => e.buildingCode && schedule.buildings[e.buildingCode]),
    [schedule],
  );
  const against = useMemo(
    () => (placed.length ? { events: schedule.events, buildings: schedule.buildings } : null),
    [placed.length, schedule],
  );
  const measure = useCallback((ll: [number, number]) => measureFrom(ll, against, mode), [against, mode]);

  const chosenQuarter = quarterByKey(quarter);

  const listed = useMemo(() => (listings ?? []).filter((l) => isListed(l.state)), [listings]);
  const mine = useMemo(() => (listings ?? []).filter((l) => l.mine), [listings]);

  const shown = useMemo(() => {
    const rows = listed
      .filter((l) => !chosenQuarter || coverage(l.from, l.to, chosenQuarter) !== "none")
      .filter((l) => rentCap === null || l.rent <= rentCap)
      .filter((l) => matchesSpace(l, space))
      .map((l) => ({ l, m: measure(l.ll) }));
    // With a quarter chosen, places that cover all of it come before partial ones.
    const full = (l: PublicListing) => (chosenQuarter && coverage(l.from, l.to, chosenQuarter) !== "full" ? 1 : 0);
    const key = (r: { l: PublicListing; m: Measure }) =>
      sort === "rent" ? r.l.rent : sort === "newest" ? -Date.parse(r.l.created) : measureCost(r.m);
    return rows.sort((a, b) => full(a.l) - full(b.l) || key(a) - key(b));
  }, [listed, chosenQuarter, rentCap, space, sort, measure]);

  const checkedRows = useMemo(
    () => checked.places.map((p, i) => ({ p, letter: letterFor(i), m: measure(p.ll) })),
    [checked.places, measure],
  );

  // ── The map ───────────────────────────────────────────────────────────────
  const homes = useMemo((): HomePin[] => [
    ...shown.map(({ l }) => ({
      id: l.id, ll: l.ll, label: dollars(l.rent), kind: "listing" as const, mine: l.mine, dim: l.state === "stale",
      title: `${dollars(l.rent)} a month — ${headline(l)}, ${street(l.address)}`,
    })),
    ...checkedRows.map(({ p, letter }) => ({
      id: p.id, ll: p.ll, label: letter, kind: "checked" as const, title: `${letter}: ${p.address}`,
    })),
  ], [shown, checkedRows]);

  const classPins = useMemo((): ClassPin[] => {
    const seen = new Map<string, ClassPin>();
    for (const e of placed) {
      if (!seen.has(e.buildingCode)) {
        const b = schedule.buildings[e.buildingCode];
        seen.set(e.buildingCode, { code: e.buildingCode, ll: b.ll, name: b.n });
      }
    }
    return [...seen.values()];
  }, [placed, schedule.buildings]);

  const focusMeasure = useMemo((): Measure | null => {
    if (!focus) return null;
    const l = shown.find((r) => r.l.id === focus);
    if (l) return l.m;
    return checkedRows.find((r) => r.p.id === focus)?.m ?? null;
  }, [focus, shown, checkedRows]);

  const spokes = useMemo((): Spoke[] => {
    if (!focusMeasure) return [];
    if (focusMeasure.kind === "campus") return [{ to: LIBRARY_WALK, label: `${focusMeasure.trip.minutes} min` }];
    const byBuilding = new Map<string, { to: [number, number]; minutes: number; days: string[] }>();
    for (const d of focusMeasure.week.days) {
      const hit = byBuilding.get(d.first.event.buildingCode);
      if (hit) hit.days.push(DAY_SHORT[d.day]);
      else byBuilding.set(d.first.event.buildingCode, { to: d.first.building.ll, minutes: d.there.minutes, days: [DAY_SHORT[d.day]] });
    }
    return [...byBuilding.values()].map((b) => ({ to: b.to, label: `${b.days.join("")} · ${b.minutes} min` }));
  }, [focusMeasure]);

  // Which places are on the map, not their order: re-sorting the list is not a reason to re-frame it.
  const fitKey = `${homes.map((h) => h.id).sort().join(",")}|${classPins.map((c) => c.code).join(",")}`;

  const onSelect = (id: string) => {
    if (id.startsWith("chk-")) setFocus(id);
    else router.push(`/housing/${id}`);
  };

  const filtering = quarter !== "any" || rentCap !== null || space !== "any";
  const clearFilters = () => setFilters({ ...NO_FILTERS, sort });

  /**
   * What the list shows. A failure and an empty board never appear together:
   * the board is only called empty once it has answered, and a refresh that
   * failed with nothing on screen is a failure, not "0 places".
   */
  const board: "loading" | "error" | "ready" =
    listings === null ? (loadError ? "error" : "loading")
    : loadError && shown.length === 0 ? "error"
    : "ready";

  return (
    <PlatShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* The site bar already marks Housing as new; the page says what it holds and gets out of the way. */}
        <PageHeader
          title="Housing"
          description="Sublets and rooms from verified @ucsd.edu students, each one measured by the trip to the classes on your schedule."
          actions={
            <>
              <Link
                href="/housing/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
              >
                <Plus className="h-4 w-4" /> List your place
              </Link>
              <a
                href="#check"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
              >
                <Search className="h-4 w-4" /> Check an address
              </a>
            </>
          }
        />

        <ScheduleBanner schedule={schedule} placedCount={placed.length} mode={mode} onMode={setMode} className="mt-5" />

        {/* Phones get one pane at a time, like the planner. */}
        <div className="mt-4 flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/10 lg:hidden" role="tablist" aria-label="View">
          {(["list", "map"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={phoneView === v}
              onClick={() => setPhoneView(v)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                phoneView === v ? "bg-white text-[#182B49] shadow-sm dark:bg-white/20 dark:text-white" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {v === "list" ? <List className="h-3.5 w-3.5" /> : <MapIcon className="h-3.5 w-3.5" />}
              {v === "list" ? "List" : "Map"}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* ── The list ─────────────────────────────────────────────────── */}
          <div className={`space-y-8 lg:col-span-5 ${phoneView === "map" ? "max-lg:hidden" : ""}`}>
            {mine.length > 0 && <MyListings rows={mine} onChanged={load} />}

            <section aria-labelledby="listings-h">
              <h2 id="listings-h" className={SECTION_TITLE}>Posted by students</h2>
              {/* The count and the order share a line: both describe the list, neither is a filter. */}
              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {board === "ready"
                    ? `${shown.length} ${shown.length === 1 ? "place" : "places"}`
                    : board === "loading" ? "Loading…" : "Listings unavailable"}
                  {filtering && board === "ready" && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </p>
                <label
                  className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                  title={placed.length
                    ? "Shortest commute: least time a week getting to and from your classes"
                    : "Closest to campus: shortest trip to Library Walk"}
                >
                  Sort:
                  <select
                    value={sort}
                    onChange={(e) => setFilters({ ...filters, sort: e.target.value as Sort })}
                    className="cursor-pointer rounded-md bg-transparent py-0.5 font-semibold text-gray-800 outline-none transition hover:text-[#182B49] focus-visible:ring-2 focus-visible:ring-[#FFCD00] dark:text-gray-100 dark:hover:text-[#FFCD00] max-md:text-base max-md:font-medium"
                  >
                    <option value="commute">{placed.length ? "Shortest commute" : "Closest to campus"}</option>
                    <option value="rent">Lowest rent</option>
                    <option value="newest">Newest</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select value={quarter} onChange={(e) => setFilters({ ...filters, quarter: e.target.value })} aria-label="Quarter you need it for" className={`${FIELD} w-full px-2.5 sm:w-auto`}>
                  <option value="any">Any quarter</option>
                  {quarters.map((q) => <option key={q.key} value={q.key}>{q.name}</option>)}
                </select>
                <select value={space} onChange={(e) => setFilters({ ...filters, space: e.target.value as Space })} aria-label="Kind of space" className={`${FIELD} w-full px-2.5 sm:w-auto`}>
                  {(Object.keys(SPACES) as Space[]).map((s) => <option key={s} value={s}>{SPACES[s]}</option>)}
                </select>
                {/* Its own row: a slider needs the width to be draggable with any precision. */}
                <RentSlider value={rentCap} onChange={(v) => setFilters({ ...filters, rentCap: v })} className="col-span-2 mt-1 sm:basis-full" />
              </div>

              <div className="mt-4 space-y-3">
                {board === "loading" ? (
                  <div className="h-44 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
                ) : board === "error" && loadError ? (
                  // Instead of the list, never beside an empty one: inviting a post
                  // the board could not show would mislead.
                  <LoadFailed code={loadError} retries={retries} retrying={fetching} onRetry={retry} />
                ) : (
                  <>
                    {loadError && (
                      <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        <p>Couldn&rsquo;t refresh the listings, so these are the ones loaded earlier.</p>
                        <RetryButton retrying={fetching} onRetry={retry} quiet />
                      </div>
                    )}
                    {shown.length ? (
                      shown.map(({ l, m }) => (
                        <ListingCard key={l.id} listing={l} measure={m} mode={mode} focused={focus === l.id} onFocus={setFocus} />
                      ))
                    ) : (
                      <EmptyBoard filtered={listed.length > 0} onClear={clearFilters} />
                    )}
                  </>
                )}
              </div>
            </section>

            <CheckAddress
              rows={checkedRows}
              mode={mode}
              focus={focus}
              onFocus={setFocus}
              onAdd={(p) => { const added = checked.add(p); setFocus(added.id); }}
              onRemove={checked.remove}
            />

            <SafetyNote />
          </div>

          {/* ── The map ──────────────────────────────────────────────────── */}
          <div className={`lg:col-span-7 ${phoneView === "list" ? "max-lg:hidden" : ""}`}>
            {/* Pinned 24px under the 56px site bar, ending 24px above the window's foot. */}
            <div className="h-[70dvh] overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 lg:sticky lg:top-20 lg:h-[calc(100dvh-6.5rem)]">
              <HousingMap
                darkMode={theme === "dark"}
                homes={homes}
                classes={classPins}
                focus={focus}
                spokes={spokes}
                fitKey={fitKey}
                onHover={setFocus}
                onSelect={onSelect}
              />
            </div>
            <p className="mt-2 text-[10px] leading-snug text-gray-400">
              Gold-ringed dots are the buildings your classes meet in. Hover a place to see the trip to each
              morning&rsquo;s first class. Map data © OpenStreetMap contributors, tiles by OpenFreeMap.
            </p>
          </div>
        </div>
      </div>
    </PlatShell>
  );
}

/** What every commute on the page is measured against, and the one control for how you travel. */
function ScheduleBanner({
  schedule, placedCount, mode, onMode, className = "",
}: {
  schedule: ReturnType<typeof useTermSchedule>;
  placedCount: number;
  mode: Mode;
  onMode: (m: Mode) => void;
  className?: string;
}) {
  const days = new Set(schedule.events.filter((e) => e.buildingCode && schedule.buildings[e.buildingCode]).map((e) => e.day));
  return (
    <div className={`flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#182B49] dark:text-[#FFCD00]" />
        {schedule.status === "loading" ? (
          <p className="text-xs text-gray-500">Reading your schedule…</p>
        ) : placedCount ? (
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Measured to your {schedule.termName} classes
              <span className="font-normal text-gray-500 dark:text-gray-400">
                {" "}· <span className="whitespace-nowrap">{days.size} {days.size === 1 ? "day" : "days"} on campus</span>
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {schedule.courses.join(", ")}
              {schedule.undecided.length > 0 && ` · no section yet for ${schedule.undecided.join(", ")}`}
              {" · "}
              <Link href="/planner" className="font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">Change</Link>
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-semibold">Trips go to Library Walk for now</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {schedule.undecided.length
                ? `Pick sections for ${schedule.undecided.join(", ")} and every place is measured to your own classrooms instead. `
                : "Add your classes in the planner and every place is measured to your own classrooms instead. "}
              <Link href="/planner" className="font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">Open the planner →</Link>
            </p>
          </div>
        )}
      </div>
      <div className="self-start sm:self-auto">
        <ModeToggle mode={mode} onMode={onMode} />
      </div>
    </div>
  );
}

/** Addresses from anywhere, measured the same way as the listings. */
function CheckAddress({
  rows, mode, focus, onFocus, onAdd, onRemove,
}: {
  rows: { p: Place & { id: string }; letter: string; m: Measure }[];
  mode: Mode;
  focus: string | null;
  onFocus: (id: string | null) => void;
  onAdd: (p: Place) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Place[] | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setChoices(null);
    // The same check the server makes, so an address that cannot work is answered at once.
    const parsed = parseAddressQuery(q);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const body = (await res.json().catch(() => ({}))) as { places?: Place[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "The address lookup failed.");
      const places = body.places ?? [];
      if (!places.length) setError("No match in San Diego. Check the street number and name, and add the city if it is not San Diego.");
      else if (places.length === 1) { onAdd(places[0]); setQ(""); }
      else setChoices(places);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The address lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="check" aria-labelledby="check-h" className="scroll-mt-28 lg:scroll-mt-20">
      <h2 id="check-h" className={SECTION_TITLE}>Found a place somewhere else?</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
        Paste its address and see your commute from there, next to everything listed here.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Street address</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. 3990 Nobel Dr"
            autoComplete="street-address"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-[#0d1420] dark:focus:border-[#FFCD00] max-md:text-base"
          />
        </label>
        {/* The reason sits on a wrapper: a disabled button shows no tooltip in every browser. */}
        <span
          className="inline-flex shrink-0"
          title={q.trim().length < 5
            ? "Type a street address first — at least 5 characters, e.g. 3990 Nobel Dr"
            : "See the trip to your classes from this address"}
        >
          <button
            type="submit"
            disabled={busy || q.trim().length < 5}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1e3a63] disabled:opacity-40 dark:bg-[#FFCD00] dark:text-[#182B49]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Check
          </button>
        </span>
      </form>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {choices && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] font-semibold text-gray-500">Which one?</p>
          {choices.map((c) => (
            <button
              key={c.address}
              type="button"
              onClick={() => { onAdd(c); setChoices(null); setQ(""); }}
              className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-left text-xs hover:border-[#182B49] dark:border-white/10 dark:bg-white/5"
            >
              {c.address} <span className="text-gray-400">· {c.area}</span>
            </button>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="-mx-3 mt-3 space-y-1">
          {rows.map(({ p, letter, m }) => (
            <li
              key={p.id}
              onMouseEnter={() => onFocus(p.id)}
              onMouseLeave={() => onFocus(null)}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                focus === p.id ? "bg-slate-50 dark:bg-white/5" : ""
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFCD00] text-xs font-black text-[#182B49]">
                {letter}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{street(p.address)}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.area}</p>
                <div className="mt-2"><CommuteLine measure={m} mode={mode} /></div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.address}`}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
        Up to {MAX_CHECKED} addresses, kept in this browser only. Looked up with the U.S. Census Bureau&rsquo;s
        geocoder; nothing else is sent.
      </p>
    </section>
  );
}

const STATE_LABEL: Record<ListingState, { text: string; tone: string }> = {
  live: { text: "Listed", tone: "text-emerald-700 dark:text-emerald-300" },
  stale: { text: "Listed · confirm it is still available", tone: "text-amber-700 dark:text-amber-300" },
  expired: { text: "Hidden · not confirmed in 30 days", tone: "text-rose-700 dark:text-rose-300" },
  ended: { text: "Ended · its dates are over", tone: "text-gray-500" },
  taken: { text: "Taken · not shown", tone: "text-gray-500" },
  hidden: { text: "Hidden after reports from students", tone: "text-rose-700 dark:text-rose-300" },
};

/** The student's own listings, with the one-click upkeep that keeps the board honest. */
function MyListings({ rows, onChanged }: { rows: PublicListing[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** "Still available" changes nothing on screen, so it says what it did. */
  const [confirmed, setConfirmed] = useState<{ id: string; until: string } | null>(null);

  const act = async (id: string, action: "confirm" | "taken" | "reopen" | "delete") => {
    if (action === "delete" && !window.confirm("Delete this listing and its photos for good?")) return;
    setBusy(id);
    setError(null);
    setConfirmed(null);
    try {
      const res = await fetch(`/api/housing/${id}`, action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That did not work.");
      }
      if (action === "confirm") setConfirmed({ id, until: listedUntil() });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  // Plain words in a row: the upkeep is routine, so it should not shout.
  const base = "font-semibold transition disabled:opacity-40";
  const btn = `${base} text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white`;

  return (
    <section aria-labelledby="mine-h" className="rounded-2xl border border-gray-200 p-4 dark:border-white/10 sm:p-5">
      <h2 id="mine-h" className={SECTION_TITLE}>Your listings</h2>
      <ul className="mt-1 divide-y divide-gray-100 dark:divide-white/5">
        {rows.map((l) => {
          const s = STATE_LABEL[l.state];
          return (
            <li key={l.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/housing/${l.id}`} className="min-w-0 truncate text-sm font-semibold hover:underline">
                  {dollars(l.rent)} · {headline(l)}
                </Link>
                <span className={`shrink-0 text-[11px] font-semibold ${s.tone}`}>{s.text}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {l.state !== "taken" && l.state !== "ended" && (
                  <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "confirm")} className={`${base} text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200`}>
                    Still available
                  </button>
                )}
                {l.state === "taken" ? (
                  <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "reopen")} className={btn}>
                    List again
                  </button>
                ) : (
                  <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "taken")} className={btn}>
                    Mark taken
                  </button>
                )}
                <Link href={`/housing/new?edit=${l.id}`} className={btn}>Edit</Link>
                <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "delete")} className={`${base} text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400`}>
                  Delete
                </button>
              </div>
              {confirmed?.id === l.id && (
                <p role="status" className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                  Confirmed — it stays listed until {confirmed.until}.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  );
}

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-2 text-xs font-semibold text-white transition " +
  "hover:bg-[#1e3a63] disabled:opacity-60 dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]";
const SECONDARY =
  "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold " +
  "text-gray-700 transition hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-200";

/** Says it is trying while it tries, so a second failure does not look like a dead button. */
function RetryButton({ retrying, onRetry, quiet = false }: { retrying: boolean; onRetry: () => void; quiet?: boolean }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className={quiet ? "inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-60" : PRIMARY}
    >
      {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
      {retrying ? "Retrying…" : "Retry"}
    </button>
  );
}

/**
 * The board could not answer: said in place of the list, with the one thing to
 * do about it. `code` is the API's (AUTH_REQUIRED, HOUSING_STORE_…), OFFLINE
 * when nothing answered at all.
 */
function LoadFailed({
  code, retries, retrying, onRetry,
}: { code: string; retries: number; retrying: boolean; onRetry: () => void }) {
  const signedOut = code === "AUTH_REQUIRED";
  const title = signedOut
    ? "You’re signed out"
    : code === "HOUSING_STORE_UNCONFIGURED" ? "Housing isn’t available right now" : "Couldn’t load the listings";
  const body = signedOut
    ? "Your sign-in expired, so the listings can’t be shown. Sign in again to see them."
    : code === "OFFLINE"
      ? "Your device didn’t reach UCSDPlans. Check your connection, then retry."
      : "Something went wrong on our side, not yours. Your filters and checked addresses are kept.";

  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-7 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="text-sm font-bold text-amber-900 dark:text-amber-100">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-amber-800 dark:text-amber-200">{body}</p>
      {/* A retry that fails again looks like a dead button unless something says it tried. */}
      {!signedOut && retries > 0 && !retrying && (
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-amber-800 dark:text-amber-200">
          Still not loading after {retries === 1 ? "a retry" : `${retries} retries`}. If it keeps happening, tell us
          through Contact in the top bar.
        </p>
      )}
      <div className="mt-4">
        {signedOut ? (
          <a href="/login?next=%2Fhousing" className={PRIMARY}>Sign in again</a>
        ) : (
          <RetryButton retrying={retrying} onRetry={onRetry} />
        )}
      </div>
    </div>
  );
}

/**
 * The board answered and nothing is shown: said plainly, with what to do next.
 * `filtered` means places exist but the filters hide every one of them.
 */
function EmptyBoard({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-center dark:border-white/15">
      <p className="text-sm font-bold">{filtered ? "No places match your filters" : "No places posted yet"}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {filtered
          ? "Try another quarter, a higher max rent or any kind of space — or clear the filters to see every place posted."
          : "Studying abroad next quarter, or leaving a lease early? Post it here, and every student looking sees exactly how far it is from their own classes."}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {filtered && (
          <button type="button" onClick={onClear} className={PRIMARY}>
            Clear filters
          </button>
        )}
        <Link href="/housing/new" className={filtered ? SECONDARY : PRIMARY}>
          List your place <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
