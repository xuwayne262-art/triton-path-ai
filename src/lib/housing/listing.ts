import type { LatLng } from "@/lib/campus";
import { areaForAddress, inSanDiego } from "./geocode";
import { daysBetween, formatDay, isIsoDate, todayInSanDiego } from "./terms";

/**
 * A place a student is offering, and the rules for accepting one.
 *
 * Listings are the first thing on UCSDPlans that one student writes for other
 * students to read, so the server treats the form like any other request body:
 * it rebuilds the listing field by field, drops anything it does not know,
 * and fills in everything that identifies the poster — their email, their
 * name — from the verified session, never from what the page sent.
 */

export const KINDS = {
  sublet: "Sublet",
  takeover: "Lease takeover",
  room: "Room for rent",
  whole: "Whole place",
} as const;
export type ListingKind = keyof typeof KINDS;

export const KIND_HINT: Record<ListingKind, string> = {
  sublet: "Your room while you are away. You stay on the lease.",
  takeover: "Someone replaces you on the lease for the rest of its term.",
  room: "An open room in a shared place, on a lease of its own.",
  whole: "A studio, or an entire apartment or house.",
};

export type Share = "private" | "shared";
export type Laundry = "unit" | "building" | "none";

export const LAUNDRY: Record<Laundry, string> = {
  unit: "In-unit laundry",
  building: "Laundry on site",
  none: "No laundry",
};

export interface Contact {
  /** The poster's own @ucsd.edu address, when they chose to show it. */
  email: string | null;
  phone: string | null;
  /** "Instagram @name", "WeChat: name" — whatever else they answer on. */
  other: string | null;
}

/** Everything the poster fills in. */
export interface ListingFields {
  kind: ListingKind;
  /** US dollars a month for the space offered — one bed, if the room is shared. */
  rent: number;
  /** Dollars a month on top of rent: 0 means included, null means not stated. */
  utilities: number | null;
  address: string;
  ll: LatLng;
  /** First and last night, YYYY-MM-DD. */
  from: string;
  to: string;
  room: Share;
  bath: Share;
  /** Bedrooms in the unit; 0 is a studio. */
  bedrooms: number | null;
  /** People already living there. */
  housemates: number | null;
  furnished: boolean;
  laundry: Laundry;
  parking: boolean;
  pets: boolean;
  title: string;
  about: string;
  showEmail: boolean;
  phone: string | null;
  other: string | null;
  /** Photo refs from /api/housing/photos, in the order to show them. */
  photos: string[];
}

export interface Listing extends Omit<ListingFields, "showEmail" | "phone" | "other"> {
  id: string;
  /** "University City" — worked out from the address, not typed. */
  area: string;
  contact: Contact;
  /** "Alex Y." — first name and initial from the Google account. */
  poster: string;
  created: string;
  /** Last time the poster said it is still available. */
  confirmed: string;
  status: "open" | "taken";
}

export interface StoredListing extends Listing {
  /** Hash of the poster's address; see ownerKey in store.ts. */
  owner: string;
  /** Hashes of the students who reported it, one each. */
  reports: string[];
  v: 1;
}

/**
 * Where a listing stands. Only "live" and "stale" are shown to other students;
 * the rest are shown to their owner alone, with what to do about them.
 */
export type ListingState = "live" | "stale" | "expired" | "ended" | "taken" | "hidden";

/**
 * What the page receives: never the owner's hash, never who reported it. The
 * list leaves contact details out — they are one click away on the listing —
 * so a single request cannot collect every poster's phone number.
 */
export interface PublicListing extends Omit<Listing, "contact"> {
  contact: Contact | null;
  mine: boolean;
  state: ListingState;
}

/**
 * Freshness is the thing group chats get wrong: a post from July still reads
 * as available in September. A listing nobody has vouched for in two weeks is
 * flagged, and after thirty days it drops off the list until its owner says
 * it is still there.
 */
export const STALE_DAYS = 14;
export const EXPIRE_DAYS = 30;
/** Distinct students reporting a listing before it is hidden pending review. */
export const REPORT_LIMIT = 3;
/** Open listings one student may have at once. */
export const MAX_OPEN_PER_OWNER = 3;

export const MAX_BODY_BYTES = 16 * 1024;
const MAX_ABOUT = 2000;
const MAX_TITLE = 80;
const MAX_ADDRESS = 160;
const MAX_OTHER = 60;
export const MAX_PHOTOS = 6;
/** What a photo ref looks like; whose it is is checked with the secret, in photos.ts. */
export const PHOTO_REF = /^[A-Za-z0-9_-]{16,64}$/;
/** How far ahead a place can be offered, and how long a stay can run. */
const MAX_LEAD_DAYS = 550;
const MAX_STAY_DAYS = 800;

export function listingState(
  l: Pick<StoredListing, "status" | "to" | "confirmed"> & { reports?: string[] },
  today: string,
  now = Date.now(),
): ListingState {
  if (l.status === "taken") return "taken";
  if ((l.reports?.length ?? 0) >= REPORT_LIMIT) return "hidden";
  if (l.to < today) return "ended";
  const idle = (now - Date.parse(l.confirmed)) / 86_400_000;
  if (!(idle < EXPIRE_DAYS)) return "expired";
  return idle >= STALE_DAYS ? "stale" : "live";
}

export const isListed = (s: ListingState) => s === "live" || s === "stale";

/** "Oct 27": when a listing confirmed at `now` leaves the list, unless it is confirmed again. */
export const listedUntil = (now = Date.now()) =>
  formatDay(todayInSanDiego(new Date(now + EXPIRE_DAYS * 86_400_000)));

export function toPublic(
  l: StoredListing,
  viewer: string | null,
  today: string,
  now = Date.now(),
  { withContact = true } = {},
): PublicListing {
  const mine = viewer != null && viewer === l.owner;
  // Built by naming every field, so a property added to StoredListing later
  // cannot leak to the page by default.
  return {
    id: l.id, kind: l.kind, rent: l.rent, utilities: l.utilities,
    address: l.address, area: l.area, ll: l.ll, from: l.from, to: l.to,
    room: l.room, bath: l.bath, bedrooms: l.bedrooms, housemates: l.housemates,
    furnished: l.furnished, laundry: l.laundry, parking: l.parking, pets: l.pets,
    title: l.title, about: l.about, poster: l.poster, photos: l.photos,
    contact: withContact || mine ? { ...l.contact } : null,
    created: l.created, confirmed: l.confirmed, status: l.status,
    mine,
    state: listingState(l, today, now),
  };
}

// ── Accepting a listing ──────────────────────────────────────────────────────

/** One line of text: whitespace collapsed, control characters gone. */
const line = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

/** Paragraphs survive; runs of blank lines and stray control characters do not. */
const prose = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max)
    : "";

/** A whole number within bounds, or null when missing; undefined when invalid. */
function count(v: unknown, lo: number, hi: number): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) return undefined;
  return n;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

/** "(858) 555-0123" stays readable; it must hold 10 to 15 digits. */
function phoneNumber(v: unknown): string | null | undefined {
  const s = line(v, 24);
  if (!s) return null;
  if (!/^[+\d\s().-]+$/.test(s)) return undefined;
  const digits = s.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 15 ? s : undefined;
}

export type Checked =
  | { ok: true; fields: ListingFields }
  | { ok: false; field: string; error: string };

const bad = (field: string, error: string): Checked => ({ ok: false, field, error });

/**
 * The listing a request describes, or the first thing wrong with it. The
 * error names a field and is written for the student filling in the form.
 */
export function checkListing(body: unknown, today: string): Checked {
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("form", "That was not a listing.");
  const b = body as Record<string, unknown>;

  const kind = oneOf(b.kind, Object.keys(KINDS) as ListingKind[]);
  if (!kind) return bad("kind", "Say what kind of place this is.");

  const rent = count(b.rent, 100, 10_000);
  if (rent == null) return bad("rent", "Rent must be a whole number of dollars a month, $100 to $10,000.");

  const utilities = count(b.utilities, 0, 2_000);
  if (utilities === undefined) return bad("utilities", "Utilities must be $0 to $2,000 a month, or left blank.");

  const address = line(b.address, MAX_ADDRESS);
  if (address.length < 5) return bad("address", "Add the street address.");
  const ll = b.ll;
  if (
    !Array.isArray(ll) || ll.length !== 2 ||
    !ll.every((x) => typeof x === "number" && Number.isFinite(x)) ||
    !inSanDiego(ll as LatLng)
  ) {
    return bad("address", "Find the address on the map first — it has to be in the San Diego area.");
  }

  const from = b.from;
  const to = b.to;
  if (!isIsoDate(from)) return bad("from", "Pick the first day it is available.");
  if (!isIsoDate(to)) return bad("to", "Pick the last day it is available.");
  if (to < from) return bad("to", "The last day comes before the first.");
  if (to < today) return bad("to", "Those dates are already over.");
  if (daysBetween(today, from) > MAX_LEAD_DAYS) return bad("from", "That is more than eighteen months away.");
  if (daysBetween(from, to) > MAX_STAY_DAYS) return bad("to", "A stay can run for at most two years.");

  const room = oneOf(b.room, ["private", "shared"] as const);
  if (!room) return bad("room", "Say whether the room is private or shared.");
  const bath = oneOf(b.bath, ["private", "shared"] as const);
  if (!bath) return bad("bath", "Say whether the bathroom is private or shared.");

  const bedrooms = count(b.bedrooms, 0, 10);
  if (bedrooms === undefined) return bad("bedrooms", "Bedrooms must be 0 (a studio) to 10.");
  const housemates = count(b.housemates, 0, 15);
  if (housemates === undefined) return bad("housemates", "Housemates must be 0 to 15.");

  const laundry = oneOf(b.laundry, ["unit", "building", "none"] as const);
  if (!laundry) return bad("laundry", "Say where the laundry is.");

  const phone = phoneNumber(b.phone);
  if (phone === undefined) return bad("phone", "That phone number does not look right.");
  const other = line(b.other, MAX_OTHER) || null;
  const showEmail = b.showEmail === true;
  if (!showEmail && !phone && !other) {
    return bad("contact", "Leave at least one way for students to reach you.");
  }

  const photos = Array.isArray(b.photos) ? b.photos : [];
  if (photos.length > MAX_PHOTOS) return bad("photos", `At most ${MAX_PHOTOS} photos.`);
  if (!photos.every((r) => typeof r === "string" && PHOTO_REF.test(r))) {
    return bad("photos", "One of the photos did not upload properly. Remove it and add it again.");
  }

  return {
    ok: true,
    fields: {
      kind, rent, utilities, address, ll: [ll[0] as number, ll[1] as number],
      from, to, room, bath, bedrooms, housemates,
      furnished: b.furnished === true,
      laundry,
      parking: b.parking === true,
      pets: b.pets === true,
      title: line(b.title, MAX_TITLE),
      about: prose(b.about, MAX_ABOUT),
      showEmail, phone, other,
      photos: [...new Set(photos as string[])],
    },
  };
}

/** "Alex Yaitanes" -> "Alex Y." Only ever built from the verified session. */
export function posterName(name: unknown): string {
  const parts = line(name, 80).split(" ").filter(Boolean);
  if (!parts.length) return "A UCSD student";
  const first = parts[0].slice(0, 24);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/**
 * The listing to store: the poster's fields, plus everything the server
 * decides — who they are, how to reach them, where the address is.
 */
export function buildListing(
  fields: ListingFields,
  who: { owner: string; email: string; name: unknown },
  meta: { id: string; now: string; previous?: StoredListing | null },
): StoredListing {
  const { showEmail, phone, other, ...rest } = fields;
  const prev = meta.previous ?? null;
  return {
    ...rest,
    id: meta.id,
    area: areaForAddress(fields.address),
    contact: { email: showEmail ? who.email : null, phone, other },
    poster: posterName(who.name),
    created: prev?.created ?? meta.now,
    // Editing a listing is its owner vouching for it.
    confirmed: meta.now,
    status: prev?.status ?? "open",
    owner: who.owner,
    reports: prev?.reports ?? [],
    v: 1,
  };
}

/** "Private room in a 3-bed place", when the poster wrote no title. */
export function headline(l: Pick<Listing, "title" | "kind" | "room" | "bedrooms">): string {
  if (l.title) return l.title;
  if (l.kind === "whole") {
    return l.bedrooms === 0 ? "Studio" : l.bedrooms ? `Whole ${l.bedrooms}-bed place` : "Whole place";
  }
  const room = l.room === "private" ? "Private room" : "Shared room";
  return l.bedrooms ? `${room} in a ${l.bedrooms}-bed place` : room;
}

/** "$1,150" */
export const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;
