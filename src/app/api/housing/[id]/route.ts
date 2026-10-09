import {
  MAX_BODY_BYTES, MAX_INTERESTED, REPORT_LIMIT, buildListing, checkListing, isListed, listingState, toPublic,
  type StoredListing,
} from "@/lib/housing/listing";
import { housingStore, photoBelongsTo, type HousingStore } from "@/lib/housing/store";
import { todayInSanDiego } from "@/lib/housing/terms";
import { failed, json, readJson, signInFirst, unavailable, viewer, type Viewer } from "@/lib/housing/viewer";

/**
 * `/api/housing/:id` — one listing.
 *
 * GET     the listing, if the caller may see it
 * PUT     its owner replaces what it says
 * PATCH   { action: "confirm" }  its owner vouches it is still available
 *         { action: "taken" }    its owner takes it down, keeping the record
 *         { action: "reopen" }   ...and puts it back up
 *         { action: "report" }   anyone else flags it; enough distinct
 *                                reports hide it pending review
 *         { action: "interest" } anyone else says they are interested, or
 *                                takes it back; the listing shows a count
 * DELETE  its owner removes it and its photos for good
 *
 * A listing the caller may not see answers 404, not 403, so ids of hidden or
 * expired listings cannot be probed for.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ID = /^[A-Za-z0-9_-]{6,24}$/;

const notFound = () => json({ error: "That listing is not available.", code: "HOUSING_NOT_FOUND" }, 404);
const notYours = () => json({ error: "Only the student who posted this can change it.", code: "HOUSING_NOT_OWNER" }, 403);

type Loaded =
  | { ok: true; me: Viewer; store: HousingStore; listing: StoredListing }
  | { ok: false; res: Response };

async function load(ctx: Ctx): Promise<Loaded> {
  const me = await viewer();
  if (!me) return { ok: false, res: signInFirst() };
  const { id } = await ctx.params;
  if (!ID.test(id)) return { ok: false, res: notFound() };
  const store = housingStore();
  if (!store) return { ok: false, res: unavailable() };
  try {
    const listing = await store.get(id);
    if (!listing) return { ok: false, res: notFound() };
    const visible = listing.owner === me.key || isListed(listingState(listing, todayInSanDiego()));
    return visible ? { ok: true, me, store, listing } : { ok: false, res: notFound() };
  } catch (err) {
    return { ok: false, res: failed("load the listing", err) };
  }
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const got = await load(ctx);
  if (!got.ok) return got.res;
  return json({ listing: toPublic(got.listing, got.me.key, todayInSanDiego()) });
}

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const got = await load(ctx);
  if (!got.ok) return got.res;
  const { me, store, listing: prev } = got;
  if (prev.owner !== me.key) return notYours();

  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.res;
  const today = todayInSanDiego();
  const checked = checkListing(read.body, today);
  if (!checked.ok) return json({ error: checked.error, field: checked.field, code: "HOUSING_INVALID" }, 422);
  if (!checked.fields.photos.every((ref) => photoBelongsTo(ref, me.key))) {
    return json({ error: "One of those photos is not yours to use.", field: "photos", code: "HOUSING_INVALID" }, 422);
  }

  try {
    const next = buildListing(
      checked.fields,
      { owner: me.key, email: me.email, name: me.name },
      { id: prev.id, now: new Date().toISOString(), previous: prev },
    );
    await store.put(next);
    // Photos taken off the listing are deleted, not orphaned.
    await dropPhotos(store, prev.photos.filter((ref) => !next.photos.includes(ref)), me.key);
    return json({ listing: toPublic(next, me.key, today) });
  } catch (err) {
    return failed("save the listing", err);
  }
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const got = await load(ctx);
  if (!got.ok) return got.res;
  const { me, store, listing } = got;

  const read = await readJson(request, 1024);
  if (!read.ok) return read.res;
  const action = (read.body as { action?: unknown } | null)?.action;
  const now = new Date();
  const today = todayInSanDiego(now);
  let next: StoredListing;

  if (action === "report") {
    if (listing.owner === me.key) return json({ error: "You cannot report your own listing.", code: "HOUSING_OWN" }, 400);
    // One report per student; the reporter is kept as a hash, like the owner.
    next = listing.reports.includes(me.key)
      ? listing
      : { ...listing, reports: [...listing.reports, me.key].slice(0, REPORT_LIMIT * 4) };
  } else if (action === "interest") {
    if (listing.owner === me.key) return json({ error: "That is your own listing.", code: "HOUSING_OWN" }, 400);
    // One mark per student, kept as a hash like a report; pressing again takes it back.
    const current = listing.interested ?? [];
    next = current.includes(me.key)
      ? { ...listing, interested: current.filter((k) => k !== me.key) }
      : { ...listing, interested: [...current, me.key].slice(-MAX_INTERESTED) };
  } else if (action === "confirm" || action === "taken" || action === "reopen") {
    if (listing.owner !== me.key) return notYours();
    if (action === "taken") next = { ...listing, status: "taken" };
    else {
      if (listing.to < today) {
        return json({ error: "Its dates are over — edit them to list it again.", code: "HOUSING_ENDED" }, 409);
      }
      next = { ...listing, status: "open", confirmed: now.toISOString() };
    }
  } else {
    return json({ error: "Unknown action.", code: "HOUSING_BAD_ACTION" }, 400);
  }

  try {
    if (next !== listing) await store.put(next);
    if (action === "report") return json({ reported: true });
    return json({ listing: toPublic(next, me.key, today, now.getTime()) });
  } catch (err) {
    return failed("update the listing", err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const got = await load(ctx);
  if (!got.ok) return got.res;
  const { me, store, listing } = got;
  if (listing.owner !== me.key) return notYours();
  try {
    await store.del(listing.id);
    await dropPhotos(store, listing.photos, me.key);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return failed("delete the listing", err);
  }
}

/**
 * Deletes photos, but only ones that prove they were uploaded by `owner` — a
 * listing record is data, and data is not allowed to name someone else's file.
 * A photo that fails to delete is logged, not fatal: the listing is already
 * saved, and an orphaned file is not worth failing the student over.
 */
async function dropPhotos(store: HousingStore, refs: string[], owner: string) {
  for (const ref of refs) {
    if (!photoBelongsTo(ref, owner)) continue;
    try {
      await store.delPhoto(ref);
    } catch (err) {
      console.error(`[housing] could not delete a photo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
