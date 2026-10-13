"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Bath, BedDouble, Car, Check, Flag, Heart, House, Loader2, Mail, MessageCircle, PawPrint, Pencil, Phone,
  RotateCcw, Sofa, Trash2, Users, WashingMachine,
} from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { PAGE_PAD, PAGE_TITLE, SECTION_TITLE } from "@/components/plat/typeScale";
import { useTheme } from "@/components/plat/theme";
import { usePref } from "@/components/planner/usePref";
import CommuteWeek from "@/components/housing/CommuteWeek";
import SafetyNote from "@/components/housing/SafetyNote";
import { photoUrl } from "@/components/housing/ListingCard";
import { forgetListings, useBoardHref } from "@/components/housing/boardState";
import { useTermSchedule } from "@/components/housing/useTermSchedule";
import { DAY_SHORT, CoverageChips, measureFrom } from "@/components/housing/parts";
import type { ClassPin, HomePin, Spoke } from "@/components/housing/HousingMap";
import { LIBRARY_WALK, isMode, type Mode } from "@/lib/housing/commute";
import { formatStay } from "@/lib/housing/terms";
import {
  KINDS, KIND_HINT, PHOTO_LABELS, dollars, headline, listedUntil, type Laundry, type PhotoLabel, type PublicListing,
} from "@/lib/housing/listing";

const LAUNDRY_SHORT: Record<Laundry, string> = { unit: "In unit", building: "On site", none: "None" };

const HousingMap = dynamic(() => import("@/components/housing/HousingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-slate-100 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the map…
    </div>
  ),
});

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function ListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const schedule = useTermSchedule();
  const [mode, setMode] = usePref<Mode>("ucsdplans-housing-mode", "walk", isMode);
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardHref = useBoardHref();

  // A tab or a bookmark should say which place this is, not just the site.
  useEffect(() => {
    if (listing) document.title = `${headline(listing)} — UCSDPlans housing`;
  }, [listing]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/housing/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { listing?: PublicListing; error?: string };
      if (!res.ok || !body.listing) throw new Error(body.error ?? "That listing is not available.");
      setListing(body.listing);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That listing is not available.");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const placed = useMemo(
    () => schedule.events.filter((e) => e.buildingCode && schedule.buildings[e.buildingCode]),
    [schedule],
  );
  const measure = useMemo(
    () => (listing ? measureFrom(listing.ll, placed.length ? schedule : null, mode) : null),
    [listing, placed.length, schedule, mode],
  );

  const homes = useMemo((): HomePin[] => listing
    ? [{ id: listing.id, ll: listing.ll, label: dollars(listing.rent), kind: "listing", title: listing.address, mine: listing.mine }]
    : [], [listing]);
  const classPins = useMemo((): ClassPin[] => {
    const seen = new Map<string, ClassPin>();
    for (const e of placed) {
      const b = schedule.buildings[e.buildingCode];
      if (!seen.has(e.buildingCode)) seen.set(e.buildingCode, { code: e.buildingCode, ll: b.ll, name: b.n });
    }
    return [...seen.values()];
  }, [placed, schedule.buildings]);
  const spokes = useMemo((): Spoke[] => {
    if (!measure) return [];
    if (measure.kind === "campus") return [{ to: LIBRARY_WALK, label: `${measure.trip.minutes} min` }];
    const by = new Map<string, { to: [number, number]; minutes: number; days: string[] }>();
    for (const d of measure.week.days) {
      const hit = by.get(d.first.event.buildingCode);
      if (hit) hit.days.push(DAY_SHORT[d.day]);
      else by.set(d.first.event.buildingCode, { to: d.first.building.ll, minutes: d.there.minutes, days: [DAY_SHORT[d.day]] });
    }
    return [...by.values()].map((b) => ({ to: b.to, label: `${b.days.join("")} · ${b.minutes} min` }));
  }, [measure]);

  return (
    <PlatShell>
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${PAGE_PAD}`}>
        <Link href={boardHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> All housing
        </Link>

        {error ? (
          <div className="mt-10 rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-white/15">
            <p className="text-sm font-bold">{error}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">It may have been taken, deleted, or not confirmed for a while.</p>
            <Link href={boardHref} className="mt-4 inline-block text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
              See everything that is listed →
            </Link>
          </div>
        ) : !listing || !measure ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-12">
            <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5 lg:col-span-7" />
            <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5 lg:col-span-5" />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            {/* ── The place ──────────────────────────────────────────────── */}
            <div className="space-y-8 lg:col-span-7">
              <Gallery photos={listing.photos} labels={listing.photoLabels} />

              <header>
                <div className="flex flex-wrap items-center gap-2">
                  <span title={KIND_HINT[listing.kind]} className="rounded-full bg-[#182B49]/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#182B49] dark:bg-[#FFCD00]/10 dark:text-[#FFCD00]">
                    {KINDS[listing.kind]}
                  </span>
                  {listing.state === "stale" && (
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      Not reconfirmed in over two weeks — ask if it is still available
                    </span>
                  )}
                  {listing.mine && listing.state !== "live" && listing.state !== "stale" && (
                    <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      Not shown to other students ({listing.state})
                    </span>
                  )}
                </div>
                <h1 className={`mt-2 ${PAGE_TITLE}`}>{headline(listing)}</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {listing.address} · {listing.area}
                </p>
              </header>

              <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
                <div>
                  <p className="text-3xl font-black tabular-nums tracking-tight">
                    {dollars(listing.rent)}
                    <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">a month</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {listing.utilities === 0
                      ? "Utilities included"
                      : listing.utilities
                        ? `Plus about ${dollars(listing.utilities)} a month in utilities`
                        : "Utilities not stated — ask"}
                    {listing.room === "shared" && " · price is for one bed in a shared room"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatStay(listing.from, listing.to)}</p>
                  <CoverageChips from={listing.from} to={listing.to} className="mt-1 justify-end" />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Fact icon={<BedDouble className="h-4 w-4" />} label="Room" value={listing.room === "private" ? "Private" : "Shared"} />
                <Fact icon={<Bath className="h-4 w-4" />} label="Bathroom" value={listing.bath === "private" ? "Private" : "Shared"} />
                <Fact icon={<House className="h-4 w-4" />} label="Bedrooms" value={listing.bedrooms == null ? "—" : listing.bedrooms === 0 ? "Studio" : String(listing.bedrooms)} />
                <Fact icon={<Users className="h-4 w-4" />} label="Housemates" value={listing.housemates == null ? "—" : String(listing.housemates)} />
                <Fact icon={<Sofa className="h-4 w-4" />} label="Furnished" value={listing.furnished ? "Yes" : "No"} />
                <Fact icon={<WashingMachine className="h-4 w-4" />} label="Laundry" value={LAUNDRY_SHORT[listing.laundry]} />
                <Fact icon={<Car className="h-4 w-4" />} label="Parking" value={listing.parking ? "Yes" : "No"} />
                <Fact icon={<PawPrint className="h-4 w-4" />} label="Pets" value={listing.pets ? "Allowed" : "No"} />
              </dl>

              {listing.about && (
                <section>
                  <h2 className={SECTION_TITLE}>About the place</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-200">{listing.about}</p>
                </section>
              )}

              <Interest listing={listing} onChanged={setListing} />

              <ContactCard listing={listing} />

              {listing.mine ? <OwnerControls listing={listing} onChanged={load} onDeleted={() => router.push(boardHref)} /> : <ReportButton id={listing.id} />}

              <SafetyNote />
            </div>

            {/* ── Your week from it ──────────────────────────────────────── */}
            <div className="space-y-6 lg:col-span-5">
              <div className="h-72 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                <HousingMap
                  darkMode={theme === "dark"}
                  homes={homes}
                  classes={classPins}
                  focus={listing.id}
                  spokes={spokes}
                  fitKey={`${listing.id}|${classPins.map((c) => c.code).join(",")}`}
                  label="Map of this place and your classes"
                  frame="all"
                />
              </div>
              <CommuteWeek home={listing.ll} measure={measure} mode={mode} onMode={setMode} schedule={schedule} />
            </div>
          </div>
        )}
      </div>
    </PlatShell>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {icon}{label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function Gallery({ photos, labels }: { photos: string[]; labels: PhotoLabel[] }) {
  const [shown, setShown] = useState(0);
  if (!photos.length) return null;
  const at = Math.min(shown, photos.length - 1);
  const main = photos[at];
  const labelOf = (i: number) => (labels[i] ? PHOTO_LABELS[labels[i] as keyof typeof PHOTO_LABELS] : "");
  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100 dark:bg-white/5">
        <Image src={photoUrl(main)} alt={labelOf(at)} fill unoptimized sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" priority />
        {labelOf(at) && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
            {labelOf(at)}
          </span>
        )}
        {photos.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
            {at + 1} / {photos.length}
          </span>
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 grid grid-cols-6 gap-2">
          {photos.map((ref, i) => (
            <button
              key={ref}
              type="button"
              onClick={() => setShown(i)}
              aria-label={labelOf(i) ? `Photo ${i + 1}: ${labelOf(i)}` : `Photo ${i + 1}`}
              aria-pressed={i === shown}
              className="text-left"
            >
              <span className={`relative block aspect-square overflow-hidden rounded-lg ring-offset-2 transition dark:ring-offset-[#0d1420] ${
                i === shown ? "ring-2 ring-[#182B49] dark:ring-[#FFCD00]" : "opacity-80 hover:opacity-100"
              }`}>
                <Image src={photoUrl(ref)} alt="" fill unoptimized sizes="96px" className="object-cover" />
              </span>
              {labelOf(i) && <span className="mt-1 block truncate text-xs text-gray-600 dark:text-gray-300">{labelOf(i)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "12 students interested", and a way to be one of them. A count, never who:
 * the poster learns there is demand, and a student learns the place is
 * wanted, without anyone's name leaving the server.
 */
function Interest({ listing, onChanged }: { listing: PublicListing; onChanged: (l: PublicListing) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = listing.interested;
  const says = count === 0
    ? "Nobody has marked this yet"
    : `${count} ${count === 1 ? "student is" : "students are"} interested`;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/housing/${listing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "interest" }),
      });
      const body = (await res.json().catch(() => ({}))) as { listing?: PublicListing; error?: string };
      if (!res.ok || !body.listing) throw new Error(body.error ?? "That did not go through.");
      onChanged(body.listing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-white/10">
      <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <Heart className={`h-4 w-4 ${count ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} aria-hidden />
        {says}
        {listing.youInterested && <span className="text-gray-500 dark:text-gray-400">· including you</span>}
      </p>
      {!listing.mine && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={listing.youInterested}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${
            listing.youInterested
              ? "border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              : "bg-[#182B49] text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]"
          }`}
        >
          <Heart className="h-4 w-4" aria-hidden />
          {listing.youInterested ? "Not interested any more" : "I’m interested"}
        </button>
      )}
      {error && <p className="w-full text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  );
}

function ContactCard({ listing }: { listing: PublicListing }) {
  const c = listing.contact;
  const subject = `Your UCSDPlans listing: ${headline(listing)}`;
  return (
    <section className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#182B49] text-sm font-bold text-white dark:bg-[#FFCD00] dark:text-[#182B49]">
          {listing.poster.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{listing.poster}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Signed in with @ucsd.edu · listed {ago(listing.created)} · poster confirmed it available {ago(listing.confirmed)}
          </p>
        </div>
      </div>
      {c && (c.email || c.phone || c.other) ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {c.email && (
            <li>
              <a href={`mailto:${c.email}?subject=${encodeURIComponent(subject)}`} className="inline-flex items-center gap-2 font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                <Mail className="h-4 w-4" /> {c.email}
              </a>
            </li>
          )}
          {c.phone && (
            <li>
              <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                <Phone className="h-4 w-4" /> {c.phone}
              </a>
            </li>
          )}
          {c.other && (
            <li className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-200">
              <MessageCircle className="h-4 w-4 text-gray-400" /> {c.other}
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No contact details on this listing.</p>
      )}
    </section>
  );
}

function OwnerControls({ listing, onChanged, onDeleted }: { listing: PublicListing; onChanged: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "Still available" changes nothing on screen, so it says what it did. */
  const [confirmedUntil, setConfirmedUntil] = useState<string | null>(null);
  const act = async (action: "confirm" | "taken" | "reopen" | "delete") => {
    if (action === "delete" && !window.confirm("Delete this listing and its photos for good?")) return;
    setBusy(true);
    setError(null);
    setConfirmedUntil(null);
    try {
      const res = await fetch(`/api/housing/${listing.id}`, action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That did not work.");
      }
      // The board's kept list no longer matches this listing.
      forgetListings();
      if (action === "confirm") setConfirmedUntil(listedUntil());
      if (action === "delete") onDeleted();
      else onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5";
  return (
    <section className="rounded-2xl border border-[#182B49]/20 bg-[#182B49]/[0.03] p-4 dark:border-[#FFCD00]/25 dark:bg-[#FFCD00]/[0.04]">
      <p className="text-sm font-bold">This is your listing</p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Confirm it every couple of weeks: after 30 days without a confirmation it leaves the list.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/housing/new?edit=${listing.id}`} className={btn}><Pencil className="h-3.5 w-3.5" /> Edit</Link>
        {listing.status === "taken" ? (
          <button type="button" disabled={busy} onClick={() => act("reopen")} className={btn}><RotateCcw className="h-3.5 w-3.5" /> List again</button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => act("confirm")} className={`${btn} text-emerald-700 dark:text-emerald-300`}><Check className="h-3.5 w-3.5" /> Still available</button>
            <button type="button" disabled={busy} onClick={() => act("taken")} className={btn}>Mark as taken</button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => act("delete")} className={`${btn} text-rose-600 dark:text-rose-400`}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
      </div>
      {confirmedUntil && (
        <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          Confirmed — it stays listed until {confirmedUntil}.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  );
}

function ReportButton({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const report = async () => {
    if (!window.confirm("Report this listing as a scam, spam or not a real place? Three reports take it down.")) return;
    setState("busy");
    try {
      const res = await fetch(`/api/housing/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "report" }),
      });
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  };
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400">
      {state === "done" ? (
        "Thanks — reported. It is hidden once three students report it."
      ) : (
        <button type="button" onClick={report} disabled={state === "busy"} className="inline-flex items-center gap-1.5 font-semibold hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-400">
          <Flag className="h-3.5 w-3.5" /> {state === "failed" ? "That did not go through — try again" : "Report this listing"}
        </button>
      )}
    </p>
  );
}
