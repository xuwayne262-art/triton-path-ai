"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, MapPin, Search, X } from "lucide-react";
import { useTheme } from "@/components/plat/theme";
import { usePref } from "@/components/planner/usePref";
import ListingCard, { photoUrl } from "./ListingCard";
import { forgetListings, useBoardHref } from "./boardState";
import { useTermSchedule } from "./useTermSchedule";
import { CoverageChips, measureFrom } from "./parts";
import { isMode, type Mode } from "@/lib/housing/commute";
import { parseAddressQuery, type Place } from "@/lib/housing/geocode";
import {
  KINDS, KIND_HINT, LAUNDRY, MAX_PHOTOS, PHOTO_LABELS,
  type Laundry, type ListingKind, type PhotoLabel, type PublicListing, type Share,
} from "@/lib/housing/listing";
import { isIsoDate, todayInSanDiego } from "@/lib/housing/terms";

const HousingMap = dynamic(() => import("./HousingMap"), { ssr: false });

/**
 * Posting a place, or editing one.
 *
 * The form asks for what a student deciding would ask first — what kind of
 * place, where, which dates, how much — and nothing that identifies the poster:
 * their name and address come from their sign-in, and they choose which way
 * to be reached. The address has to be found on the map before it can be
 * posted, so every listing can be measured against every visitor's classes.
 */

interface Photo {
  ref: string;
  /** A local preview of a photo uploaded in this visit; null for one already saved. */
  preview: string | null;
  /** What it shows, as the poster labels it. */
  label: PhotoLabel;
}

type UtilityMode = "included" | "amount" | "unknown";

const input = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#182B49] dark:border-white/10 dark:bg-[#0d1420] dark:focus:border-[#FFCD00] max-md:text-base";
const labelText = "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-200";

/** Brings a field with a problem into view and puts the cursor in it, ready to fix. */
function showField(field: string) {
  const el = document.getElementById(`f-${field}`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus({ preventScroll: true });
}

/** Re-encoded on a canvas: scaled down, and stripped of the EXIF block that carries a phone's GPS fix. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 650 * 1024) return blob;
  }
  throw new Error("too large");
}

export default function ListingForm({ email, editId }: { email: string; editId: string | null }) {
  const router = useRouter();
  const { theme } = useTheme();
  const schedule = useTermSchedule();
  const boardHref = useBoardHref();
  const [mode] = usePref<Mode>("ucsdplans-housing-mode", "walk", isMode);
  const today = useMemo(() => todayInSanDiego(), []);
  /** Set by the student's first edit, so leaving asks first; loading an edit does not count. */
  const [touched, setTouched] = useState(false);
  const touch = () => setTouched(true);

  const [loading, setLoading] = useState(Boolean(editId));
  const [kind, setKind] = useState<ListingKind>("sublet");
  const [room, setRoom] = useState<Share>("private");
  const [bath, setBath] = useState<Share>("shared");
  const [bedrooms, setBedrooms] = useState("");
  const [housemates, setHousemates] = useState("");
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [choices, setChoices] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rent, setRent] = useState("");
  const [utilityMode, setUtilityMode] = useState<UtilityMode>("amount");
  const [utilities, setUtilities] = useState("");
  const [furnished, setFurnished] = useState(false);
  const [laundry, setLaundry] = useState<Laundry>("building");
  const [parking, setParking] = useState(false);
  const [pets, setPets] = useState(false);
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [showEmail, setShowEmail] = useState(true);
  const [phone, setPhone] = useState("");
  const [other, setOther] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<{ field: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  /** Photos uploaded in this visit, not yet saved onto the listing. */
  const uploadedHere = useRef(new Set<string>());

  // ── Editing: start from what is saved ─────────────────────────────────────
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch(`/api/housing/${encodeURIComponent(editId)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { listing?: PublicListing; error?: string };
        const l = body.listing;
        if (!res.ok || !l) throw new Error(body.error ?? "That listing is not available.");
        if (!l.mine) throw new Error("Only the student who posted this can edit it.");
        setKind(l.kind); setRoom(l.room); setBath(l.bath);
        setBedrooms(l.bedrooms == null ? "" : String(l.bedrooms));
        setHousemates(l.housemates == null ? "" : String(l.housemates));
        setPlace({ address: l.address, ll: l.ll, zip: "", area: l.area });
        setFrom(l.from); setTo(l.to); setRent(String(l.rent));
        setUtilityMode(l.utilities === 0 ? "included" : l.utilities == null ? "unknown" : "amount");
        setUtilities(l.utilities ? String(l.utilities) : "");
        setFurnished(l.furnished); setLaundry(l.laundry); setParking(l.parking); setPets(l.pets);
        setTitle(l.title); setAbout(l.about);
        setShowEmail(Boolean(l.contact?.email)); setPhone(l.contact?.phone ?? ""); setOther(l.contact?.other ?? "");
        setPhotos(l.photos.map((ref, i) => ({ ref, preview: null, label: l.photoLabels?.[i] ?? "" })));
      } catch (err) {
        setError({ field: "form", text: err instanceof Error ? err.message : "That listing is not available." });
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  // Photos uploaded in this visit and never saved onto a listing are deleted
  // when the student leaves, rather than left behind as orphans.
  useEffect(() => {
    const refs = uploadedHere.current;
    return () => {
      if (saved.current) return;
      for (const ref of refs) fetch(`/api/housing/photos/${ref}`, { method: "DELETE", keepalive: true }).catch(() => {});
      refs.clear();
    };
  }, []);

  // Leaving a half-filled form loses it, photos included, so it asks first: the
  // browser's own prompt for a reload or a closed tab, and this one for links.
  useEffect(() => {
    if (!touched) return;
    const question = editId
      ? "Leave without saving your changes?"
      : "Leave without posting? What you have filled in will be lost.";
    const onUnload = (e: BeforeUnloadEvent) => {
      if (saved.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (saved.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const to = new URL(link.href, window.location.href);
      // Another site unloads the page, which the browser asks about; the same page is not leaving.
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      if (!window.confirm(question)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [touched, editId]);

  // ── Address ───────────────────────────────────────────────────────────────
  const find = async () => {
    if (finding || query.trim().length < 5) return;
    setChoices(null);
    // The server's own check, run here first so an address that cannot work is answered at once.
    const parsed = parseAddressQuery(query);
    if (!parsed.ok) {
      setError({ field: "address", text: parsed.error });
      return;
    }
    setFinding(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = (await res.json().catch(() => ({}))) as { places?: Place[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "The address lookup failed.");
      const places = body.places ?? [];
      if (!places.length) {
        setError({ field: "address", text: "No match in San Diego. Check the street number and name, and add the city if it is not San Diego." });
      } else if (places.length === 1) {
        setPlace(places[0]);
      } else {
        setChoices(places);
      }
    } catch (err) {
      setError({ field: "address", text: err instanceof Error ? err.message : "The address lookup failed." });
    } finally {
      setFinding(false);
    }
  };

  // ── Photos ────────────────────────────────────────────────────────────────
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    touch();
    setPhotoError(null);
    const slots = MAX_PHOTOS - photos.length - uploading;
    const batch = [...files].slice(0, Math.max(0, slots));
    if (files.length > batch.length) setPhotoError(`Up to ${MAX_PHOTOS} photos.`);
    setUploading((n) => n + batch.length);
    for (const file of batch) {
      try {
        const jpeg = await toJpeg(file);
        const res = await fetch("/api/housing/photos", { method: "POST", headers: { "content-type": "image/jpeg" }, body: jpeg });
        const body = (await res.json().catch(() => ({}))) as { ref?: string; error?: string };
        if (!res.ok || !body.ref) throw new Error(body.error ?? "upload failed");
        uploadedHere.current.add(body.ref);
        const ref = body.ref;
        setPhotos((prev) => [...prev, { ref, preview: URL.createObjectURL(jpeg), label: "" }]);
      } catch (err) {
        const text = err instanceof Error && err.message !== "too large" && err.message !== "upload failed"
          ? err.message
          : "Could not use one of those photos. JPEG or PNG works best.";
        setPhotoError(text);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removePhoto = (ref: string) => {
    touch();
    setPhotos((prev) => prev.filter((p) => p.ref !== ref));
    // A photo uploaded this visit can go now; a saved one goes when the edit is saved.
    if (uploadedHere.current.delete(ref)) {
      fetch(`/api/housing/photos/${ref}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const labelPhoto = (ref: string, label: PhotoLabel) => {
    touch();
    setPhotos((prev) => prev.map((p) => (p.ref === ref ? { ...p, label } : p)));
  };

  const movePhoto = (ref: string, by: -1 | 1) => {
    touch();
    setPhotos((prev) => {
      const i = prev.findIndex((p) => p.ref === ref);
      const j = i + by;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const body = () => ({
    kind, room, bath,
    bedrooms: bedrooms === "" ? null : Number(bedrooms),
    housemates: housemates === "" ? null : Number(housemates),
    address: place?.address ?? "",
    ll: place?.ll ?? null,
    from, to,
    rent: Number(rent),
    utilities: utilityMode === "included" ? 0 : utilityMode === "unknown" || utilities === "" ? null : Number(utilities),
    furnished, laundry, parking, pets,
    title, about,
    showEmail, phone, other,
    photos: photos.map((p) => p.ref),
    photoLabels: photos.map((p) => p.label),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploading) return;
    if (!place) {
      setError({ field: "address", text: "Find the address on the map first." });
      showField("address");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editId ? `/api/housing/${encodeURIComponent(editId)}` : "/api/housing", {
        method: editId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      const out = (await res.json().catch(() => ({}))) as { listing?: PublicListing; error?: string; field?: string };
      if (!res.ok || !out.listing) {
        const field = out.field ?? "form";
        setError({ field, text: out.error ?? "That did not save. Try again in a moment." });
        // A problem with the listing as a whole is said beside the button that was just pressed.
        if (field !== "form") showField(field);
        return;
      }
      saved.current = true;
      // The board's kept list does not have this change yet.
      forgetListings();
      router.push(`/housing/${out.listing.id}`);
    } catch {
      setError({ field: "form", text: "That did not save. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  // ── Live preview: the card as other students will see it ─────────────────
  const preview = useMemo((): PublicListing | null => {
    if (!place) return null;
    const now = new Date().toISOString();
    return {
      // Rent and dates not given yet stay blank ("$—", "Dates to come") rather than read as $0 and today.
      id: "preview", kind, rent: Number(rent) || 0, utilities: null, address: place.address, area: place.area, ll: place.ll,
      from: isIsoDate(from) && isIsoDate(to) ? from : "", to: isIsoDate(from) && isIsoDate(to) ? to : "",
      room, bath, bedrooms: bedrooms === "" ? null : Number(bedrooms), housemates: null,
      furnished, laundry, parking, pets, title, about, contact: null, poster: "", photos: [], photoLabels: [],
      created: now, confirmed: now, status: "open", mine: false, state: "live", interested: 0, youInterested: false,
    };
  }, [place, kind, rent, from, to, room, bath, bedrooms, furnished, laundry, parking, pets, title, about]);

  const placed = schedule.events.some((e) => e.buildingCode && schedule.buildings[e.buildingCode]);
  const previewMeasure = preview ? measureFrom(preview.ll, placed ? schedule : null, mode) : null;

  const err = (field: string) =>
    error?.field === field ? <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{error.text}</p> : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your listing…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <Link href={boardHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> All housing
      </Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight">{editId ? "Edit your listing" : "List your place"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
        Only signed-in @ucsd.edu students can see it. Each of them sees how far it is from their own classes.
      </p>
      {error?.field === "form" && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error.text}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <form onSubmit={submit} onChange={touch} className="space-y-8 lg:col-span-7" noValidate>
          {/* ── What ── */}
          <fieldset id="f-kind" className="space-y-3">
            <legend className="text-sm font-bold">What are you offering?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(KINDS) as ListingKind[]).map((k) => (
                <label
                  key={k}
                  className={`cursor-pointer rounded-xl border p-3 transition ${
                    kind === k ? "border-[#182B49] bg-[#182B49]/[0.04] dark:border-[#FFCD00] dark:bg-[#FFCD00]/[0.06]" : "border-gray-200 hover:border-gray-300 dark:border-white/10"
                  }`}
                >
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                  <span className="block text-sm font-semibold">{KINDS[k]}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400">{KIND_HINT[k]}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label id="f-room">
                <span className={labelText}>Room</span>
                <select value={room} onChange={(e) => setRoom(e.target.value as Share)} className={input}>
                  <option value="private">Private</option>
                  <option value="shared">Shared</option>
                </select>
              </label>
              <label id="f-bath">
                <span className={labelText}>Bathroom</span>
                <select value={bath} onChange={(e) => setBath(e.target.value as Share)} className={input}>
                  <option value="private">Private</option>
                  <option value="shared">Shared</option>
                </select>
              </label>
              <label id="f-bedrooms">
                <span className={labelText}>Bedrooms</span>
                <select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={input}>
                  <option value="">—</option>
                  <option value="0">Studio</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label id="f-housemates">
                <span className={labelText}>Housemates</span>
                <select value={housemates} onChange={(e) => setHousemates(e.target.value)} className={input}>
                  <option value="">—</option>
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {err("kind")}{err("room")}{err("bath")}{err("bedrooms")}{err("housemates")}
          </fieldset>

          {/* ── Where ── */}
          <fieldset id="f-address" className="space-y-3">
            <legend className="text-sm font-bold">Where is it?</legend>
            {place ? (
              <div className="rounded-xl border border-gray-200 dark:border-white/10">
                <div className="flex items-start gap-2 p-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#182B49] dark:text-[#FFCD00]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{place.address}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{place.area}</p>
                  </div>
                  <button type="button" onClick={() => { touch(); setPlace(null); setQuery(place.address.split(",")[0]); }} className="text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                    Change
                  </button>
                </div>
                <div className="h-44 overflow-hidden rounded-b-xl border-t border-gray-200 dark:border-white/10">
                  <HousingMap
                    darkMode={theme === "dark"}
                    homes={[{ id: "here", ll: place.ll, label: "Here", kind: "listing", title: place.address }]}
                    classes={[]}
                    focus={null}
                    spokes={[]}
                    fitKey={place.address}
                    label="Where the place is"
                    frame="all"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(); } }}
                    placeholder="Street address, e.g. 3990 Nobel Dr"
                    autoComplete="street-address"
                    aria-label="Street address"
                    className={input}
                  />
                  {/* The reason sits on a wrapper: a disabled button shows no tooltip in every browser. */}
                  <span
                    className="inline-flex shrink-0"
                    title={query.trim().length < 5
                      ? "Type the street address first — at least 5 characters, e.g. 3990 Nobel Dr"
                      : "Find this address on the map"}
                  >
                    <button
                      type="button"
                      onClick={find}
                      disabled={finding || query.trim().length < 5}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-[#FFCD00] dark:text-[#182B49]"
                    >
                      {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
                    </button>
                  </span>
                </div>
                {choices && (
                  <div className="space-y-1">
                    {choices.map((c) => (
                      <button key={c.address} type="button" onClick={() => { touch(); setPlace(c); setChoices(null); }} className="block w-full rounded-lg border border-gray-200 px-3 py-1.5 text-left text-xs hover:border-[#182B49] dark:border-white/10">
                        {c.address} <span className="text-gray-400">· {c.area}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  The building&rsquo;s street address — leave the unit number for the description. Looked up with the U.S. Census Bureau&rsquo;s geocoder.
                </p>
              </>
            )}
            {err("address")}
          </fieldset>

          {/* ── When ── */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">When is it available?</legend>
            <div className="grid grid-cols-2 gap-3">
              <label id="f-from">
                <span className={labelText}>First day</span>
                <input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} className={input} />
              </label>
              <label id="f-to">
                <span className={labelText}>Last day</span>
                <input type="date" value={to} min={from || today} onChange={(e) => setTo(e.target.value)} className={input} />
              </label>
            </div>
            {isIsoDate(from) && isIsoDate(to) && to >= from && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Students searching by quarter will find it under
                <CoverageChips from={from} to={to} />
              </p>
            )}
            {err("from")}{err("to")}
          </fieldset>

          {/* ── Money ── */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">What does it cost?</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label id="f-rent">
                <span className={labelText}>Rent a month{room === "shared" ? " (for one bed)" : ""}</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="1150" className={`${input} pl-6`} />
                </span>
              </label>
              <div id="f-utilities">
                <span className={labelText}>Utilities</span>
                <div className="flex gap-2">
                  <select value={utilityMode} onChange={(e) => setUtilityMode(e.target.value as UtilityMode)} className={input} aria-label="Utilities">
                    <option value="amount">About…</option>
                    <option value="included">Included</option>
                    <option value="unknown">Not sure</option>
                  </select>
                  {utilityMode === "amount" && (
                    <span className="relative block w-32 shrink-0">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                      <input inputMode="numeric" value={utilities} onChange={(e) => setUtilities(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="80" aria-label="Utilities a month" className={`${input} pl-6`} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            {err("rent")}{err("utilities")}
          </fieldset>

          {/* ── Details ── */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">Details</legend>
            <div className="flex flex-wrap gap-2">
              {([["Furnished", furnished, setFurnished], ["Parking", parking, setParking], ["Pets allowed", pets, setPets]] as const).map(([label, on, set]) => (
                <label key={label} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${on ? "border-[#182B49] bg-[#182B49]/[0.04] dark:border-[#FFCD00] dark:bg-[#FFCD00]/[0.06]" : "border-gray-200 dark:border-white/10"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-[#182B49]" />
                  {label}
                </label>
              ))}
              <select value={laundry} onChange={(e) => setLaundry(e.target.value as Laundry)} aria-label="Laundry" className={`${input} w-auto`}>
                {(Object.keys(LAUNDRY) as Laundry[]).map((k) => <option key={k} value={k}>{LAUNDRY[k]}</option>)}
              </select>
            </div>
            <label id="f-title" className="block">
              <span className={labelText}>Headline <span className="font-normal text-gray-400">(optional)</span></span>
              <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Sunny room, five minutes from the trolley" className={input} />
            </label>
            <label id="f-about" className="block">
              <span className={labelText}>Description</span>
              <textarea
                value={about}
                maxLength={2000}
                onChange={(e) => setAbout(e.target.value)}
                rows={6}
                placeholder="Who you live with, what is included, the unit number, move-in details, anything a student would ask."
                className={input}
              />
              <span className="mt-1 block text-right text-[10px] text-gray-400">{about.length}/2000</span>
            </label>
          </fieldset>

          {/* ── Photos ── */}
          <fieldset id="f-photos" className="space-y-3">
            <legend className="text-sm font-bold">Photos <span className="font-normal text-gray-400">(up to {MAX_PHOTOS})</span></legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {photos.map((p, i) => (
                <div key={p.ref} className="space-y-1">
                  <div className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5">
                    <Image src={p.preview ?? photoUrl(p.ref)} alt={`Photo ${i + 1}`} fill unoptimized sizes="120px" className="object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">Cover</span>}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 p-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                      <button type="button" onClick={() => movePhoto(p.ref, -1)} disabled={i === 0} aria-label="Move earlier" className="rounded px-1 text-xs font-bold text-white disabled:opacity-30">‹</button>
                      <button type="button" onClick={() => removePhoto(p.ref)} aria-label="Remove photo" className="rounded p-0.5 text-white"><X className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => movePhoto(p.ref, 1)} disabled={i === photos.length - 1} aria-label="Move later" className="rounded px-1 text-xs font-bold text-white disabled:opacity-30">›</button>
                    </div>
                  </div>
                  {/* What the photo shows, so students know which room is which. */}
                  <select
                    value={p.label}
                    onChange={(e) => labelPhoto(p.ref, e.target.value as PhotoLabel)}
                    aria-label={`What photo ${i + 1} shows`}
                    className="w-full rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-white/10 dark:bg-[#0d1420]"
                  >
                    <option value="">No label</option>
                    {Object.entries(PHOTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <div key={`up-${i}`} className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ))}
              {photos.length + uploading < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 text-[11px] font-semibold text-gray-500 transition hover:border-[#182B49] hover:text-[#182B49] dark:border-white/15 dark:text-gray-400 dark:hover:border-[#FFCD00] dark:hover:text-[#FFCD00]"
                >
                  <ImagePlus className="h-5 w-5" /> Add
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Photos are resized in your browser before upload, which also removes the location your phone stores in them.
            </p>
            {photoError && <p className="text-xs text-rose-600 dark:text-rose-400">{photoError}</p>}
            {err("photos")}
          </fieldset>

          {/* ── Contact ── */}
          <fieldset id="f-contact" className="space-y-3">
            <legend className="text-sm font-bold">How should students reach you?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} className="mt-1 accent-[#182B49]" />
              <span>
                Show my email, <b>{email || "your @ucsd.edu address"}</b>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">Only signed-in @ucsd.edu students can see it.</span>
              </span>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label id="f-phone">
                <span className={labelText}>Phone <span className="font-normal text-gray-400">(optional)</span></span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(858) 555-0123" className={input} />
              </label>
              <label id="f-other">
                <span className={labelText}>Anything else <span className="font-normal text-gray-400">(optional)</span></span>
                <input value={other} maxLength={60} onChange={(e) => setOther(e.target.value)} placeholder="Instagram @name, WeChat…" className={input} />
              </label>
            </div>
            {err("contact")}{err("phone")}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6 dark:border-white/10">
            <button
              type="submit"
              disabled={saving || uploading > 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#182B49] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e3a63] disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49]"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId ? "Save changes" : "Post listing"}
            </button>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              It stays up for 30 days at a time — one click from you keeps it there.
            </p>
            {error?.field === "form" && (
              <p role="alert" className="w-full text-sm font-medium text-rose-600 dark:text-rose-400">{error.text}</p>
            )}
          </div>
        </form>

        {/* ── Preview ── */}
        <aside className="lg:col-span-5">
          <div className="space-y-3 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Preview</p>
            {preview && previewMeasure ? (
              <>
                {/* A picture of the card, not a way off a half-filled form: it cannot be clicked or tabbed into. */}
                <div inert>
                  <ListingCard listing={preview} measure={previewMeasure} mode={mode} focused={false} onFocus={() => {}} />
                </div>
                <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  The commute line is worked out for whoever is looking — this one is from your own schedule. A
                  student with an 8am in Pepper Canyon sees something different from one with a noon class at Scripps.
                </p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-xs text-gray-400 dark:border-white/10">
                Find the address to see your listing as students will.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
