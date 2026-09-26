"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, CalendarCheck, Check, Eye, List, Loader2, Map as MapIcon, MapPin, Pencil, Plus, RotateCcw,
  Search, Trash2, X,
} from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { useTheme } from "@/components/plat/theme";
import { usePref } from "@/components/planner/usePref";
import ListingCard, { street } from "@/components/housing/ListingCard";
import SafetyNote from "@/components/housing/SafetyNote";
import { useTermSchedule } from "@/components/housing/useTermSchedule";
import { MAX_CHECKED, letterFor, useCheckedPlaces } from "@/components/housing/useCheckedPlaces";
import {
  CommuteLine, DAY_SHORT, ModeToggle, measureCost, measureFrom, type Measure,
} from "@/components/housing/parts";
import type { ClassPin, HomePin, Spoke } from "@/components/housing/HousingMap";
import { LIBRARY_WALK, isMode, type Mode } from "@/lib/housing/commute";
import { coverage, quarterByKey, todayInSanDiego, upcomingQuarters } from "@/lib/housing/terms";
import { dollars, headline, isListed, type ListingState, type PublicListing } from "@/lib/housing/listing";
import type { Place } from "@/lib/housing/geocode";

const HousingMap = dynamic(() => import("@/components/housing/HousingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-slate-100 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the map…
    </div>
  ),
});

type Space = "any" | "private" | "shared" | "whole";
type Sort = "commute" | "rent" | "newest";

const SPACES: Record<Space, string> = {
  any: "Any space",
  private: "Private room",
  shared: "Shared room",
  whole: "Whole place",
};

const matchesSpace = (l: PublicListing, s: Space) =>
  s === "any" ? true : s === "whole" ? l.kind === "whole" : l.kind !== "whole" && l.room === s;

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

  const [listings, setListings] = useState<PublicListing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quarter, setQuarter] = useState("any");
  const [maxRent, setMaxRent] = useState("");
  const [space, setSpace] = useState<Space>("any");
  const [sort, setSort] = useState<Sort>("commute");
  const [focus, setFocus] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState<"list" | "map">("list");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/housing", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { listings?: PublicListing[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load listings.");
      setListings(body.listings ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load listings.");
      setListings((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const today = useMemo(() => todayInSanDiego(), []);
  const quarters = useMemo(() => upcomingQuarters(today, 4), [today]);
  const chosenQuarter = quarterByKey(quarter);
  const rentCap = Number.parseInt(maxRent, 10);

  const listed = useMemo(() => (listings ?? []).filter((l) => isListed(l.state)), [listings]);
  const mine = useMemo(() => (listings ?? []).filter((l) => l.mine), [listings]);

  const shown = useMemo(() => {
    const rows = listed
      .filter((l) => !chosenQuarter || coverage(l.from, l.to, chosenQuarter) !== "none")
      .filter((l) => !Number.isFinite(rentCap) || l.rent <= rentCap)
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

  const filtering = quarter !== "any" || maxRent !== "" || space !== "any";

  return (
    <PlatShell>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:border-white/10 dark:from-[#101a2b] dark:via-[#0d1420] dark:to-[#101a2b]">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#FFC72C]/[0.08] blur-3xl" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2C4F]/15 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B2C4F] shadow-sm dark:border-[#FFC72C]/25 dark:bg-white/5 dark:text-[#FFC72C]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFC72C]" />
              New · Housing
            </span>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
              Live closer to
              <span className="text-[#1B2C4F] dark:text-[#FFC72C]"> your 8 a.m.</span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">
              Sublets and rooms from verified @ucsd.edu students, each one measured against the classes on
              your schedule: when you would leave every morning, how long the trip is, and how many hours a
              quarter you would spend making it.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/housing/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#182B49] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
            >
              <Plus className="h-4 w-4" /> List your place
            </Link>
            <a
              href="#check"
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            >
              <Search className="h-4 w-4" /> Check an address
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <ScheduleBanner schedule={schedule} placedCount={placed.length} mode={mode} onMode={setMode} />

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

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ── The list ─────────────────────────────────────────────────── */}
          <div className={`space-y-5 lg:col-span-5 ${phoneView === "map" ? "max-lg:hidden" : ""}`}>
            {mine.length > 0 && <MyListings rows={mine} onChanged={load} />}

            <CheckAddress
              rows={checkedRows}
              mode={mode}
              focus={focus}
              onFocus={setFocus}
              onAdd={(p) => { const added = checked.add(p); setFocus(added.id); }}
              onRemove={checked.remove}
            />

            <section aria-labelledby="listings-h">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="listings-h" className="text-base font-bold">Posted by students</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {listings ? `${shown.length} ${shown.length === 1 ? "place" : "places"}` : "Loading…"}
                </p>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="When">
                  <Chip on={quarter === "any"} onClick={() => setQuarter("any")}>Any time</Chip>
                  {quarters.map((q) => (
                    <Chip key={q.key} on={quarter === q.key} onClick={() => setQuarter(q.key)}>{q.name}</Chip>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative">
                    <span className="sr-only">Most you would pay a month</span>
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    <input
                      inputMode="numeric"
                      value={maxRent}
                      onChange={(e) => setMaxRent(e.target.value.replace(/\D/g, "").slice(0, 5))}
                      placeholder="Max / mo"
                      className="w-28 rounded-lg border border-gray-200 bg-white py-1.5 pl-5 pr-2 text-xs outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:focus:border-[#FFCD00] max-md:text-base"
                    />
                  </label>
                  <select
                    value={space}
                    onChange={(e) => setSpace(e.target.value as Space)}
                    aria-label="Kind of space"
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-[#101a2b] max-md:text-base"
                  >
                    {(Object.keys(SPACES) as Space[]).map((s) => <option key={s} value={s}>{SPACES[s]}</option>)}
                  </select>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    aria-label="Sort by"
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-[#101a2b] max-md:text-base"
                  >
                    <option value="commute">{placed.length ? "Shortest week" : "Closest to campus"}</option>
                    <option value="rent">Lowest rent</option>
                    <option value="newest">Newest</option>
                  </select>
                  {filtering && (
                    <button
                      type="button"
                      onClick={() => { setQuarter("any"); setMaxRent(""); setSpace("any"); }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    >
                      <X className="h-3 w-3" /> Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-2.5">
                {loadError && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    {loadError}
                  </p>
                )}
                {!listings ? (
                  [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />)
                ) : shown.length ? (
                  shown.map(({ l, m }) => (
                    <ListingCard key={l.id} listing={l} measure={m} mode={mode} focused={focus === l.id} onFocus={setFocus} />
                  ))
                ) : filtering && listed.length ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
                    Nothing matches those filters yet.
                  </div>
                ) : (
                  <FirstPost />
                )}
              </div>
            </section>

            <SafetyNote />
          </div>

          {/* ── The map ──────────────────────────────────────────────────── */}
          <div className={`lg:col-span-7 ${phoneView === "list" ? "max-lg:hidden" : ""}`}>
            <div className="h-[70dvh] overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 lg:sticky lg:top-24 lg:h-[calc(100dvh-8rem)]">
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        on
          ? "border-[#182B49] bg-[#182B49] text-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:text-[#182B49]"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

/** What every commute on the page is measured against, and the one control for how you travel. */
function ScheduleBanner({
  schedule, placedCount, mode, onMode,
}: {
  schedule: ReturnType<typeof useTermSchedule>;
  placedCount: number;
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const days = new Set(schedule.events.filter((e) => e.buildingCode && schedule.buildings[e.buildingCode]).map((e) => e.day));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#182B49]/[0.06] text-[#182B49] dark:bg-[#FFCD00]/10 dark:text-[#FFCD00]">
          <CalendarCheck className="h-5 w-5" />
        </span>
        {schedule.status === "loading" ? (
          <p className="pt-2 text-xs text-gray-500">Reading your schedule…</p>
        ) : placedCount ? (
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Measured to your {schedule.termName} classes
              <span className="font-normal text-gray-500 dark:text-gray-400">
                {" "}· {days.size} {days.size === 1 ? "day" : "days"} on campus
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
    setBusy(true);
    setError(null);
    setChoices(null);
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
    <section id="check" aria-labelledby="check-h" className="scroll-mt-24 rounded-2xl border border-[#182B49]/15 bg-[#182B49]/[0.025] p-4 dark:border-[#FFCD00]/20 dark:bg-[#FFCD00]/[0.03]">
      <h2 id="check-h" className="flex items-center gap-2 text-sm font-bold">
        <MapPin className="h-4 w-4 text-[#182B49] dark:text-[#FFCD00]" />
        Found a place somewhere else?
      </h2>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
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
        <button
          type="submit"
          disabled={busy || q.trim().length < 5}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1e3a63] disabled:opacity-40 dark:bg-[#FFCD00] dark:text-[#182B49]"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Check
        </button>
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
        <ul className="mt-3 space-y-2">
          {rows.map(({ p, letter, m }) => (
            <li
              key={p.id}
              onMouseEnter={() => onFocus(p.id)}
              onMouseLeave={() => onFocus(null)}
              className={`flex items-start gap-2.5 rounded-xl border bg-white p-2.5 transition dark:bg-white/[0.03] ${
                focus === p.id ? "border-[#B38F00] dark:border-[#FFCD00]" : "border-gray-200 dark:border-white/10"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFCD00] text-xs font-black text-[#182B49]">
                {letter}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{street(p.address)}</p>
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{p.area}</p>
                <div className="mt-1.5"><CommuteLine measure={m} mode={mode} /></div>
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
      <p className="mt-3 text-[10px] leading-snug text-gray-400">
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

  const act = async (id: string, action: "confirm" | "taken" | "reopen" | "delete") => {
    if (action === "delete" && !window.confirm("Delete this listing and its photos for good?")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/housing/${id}`, action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That did not work.");
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/10";

  return (
    <section aria-labelledby="mine-h" className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <h2 id="mine-h" className="text-sm font-bold">Your listings</h2>
      <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
        {rows.map((l) => {
          const s = STATE_LABEL[l.state];
          return (
            <li key={l.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/housing/${l.id}`} className="min-w-0 truncate text-xs font-semibold hover:underline">
                  {dollars(l.rent)} · {headline(l)}
                </Link>
                <span className={`shrink-0 text-[10px] font-semibold ${s.tone}`}>{s.text}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {l.state !== "taken" && l.state !== "ended" && (
                  <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "confirm")} className={`${btn} text-emerald-700 dark:text-emerald-300`}>
                    <Check className="h-3 w-3" /> Still available
                  </button>
                )}
                {l.state === "taken" ? (
                  <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "reopen")} className={btn}>
                    <RotateCcw className="h-3 w-3" /> List again
                  </button>
                ) : (
                  <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "taken")} className={btn}>
                    <Eye className="h-3 w-3" /> Mark taken
                  </button>
                )}
                <Link href={`/housing/new?edit=${l.id}`} className={btn}>
                  <Pencil className="h-3 w-3" /> Edit
                </Link>
                <button type="button" disabled={busy === l.id} onClick={() => act(l.id, "delete")} className={`${btn} text-rose-600 dark:text-rose-400`}>
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  );
}

/** An empty board, said plainly, with the reason to be first. */
function FirstPost() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-center dark:border-white/15">
      <p className="text-sm font-bold">No places posted yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Studying abroad next quarter, or leaving a lease early? Post it here, and every student looking sees
        exactly how far it is from their own classes.
      </p>
      <Link
        href="/housing/new"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]"
      >
        List your place <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
