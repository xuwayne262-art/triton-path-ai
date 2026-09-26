import {
  MAX_BODY_BYTES, MAX_OPEN_PER_OWNER, buildListing, checkListing, isListed, listingState, toPublic,
} from "@/lib/housing/listing";
import { housingStore, newListingId, photoBelongsTo } from "@/lib/housing/store";
import { todayInSanDiego } from "@/lib/housing/terms";
import { failed, json, readJson, signInFirst, unavailable, viewer } from "@/lib/housing/viewer";

/**
 * `/api/housing` — the sublets and rooms students have posted.
 *
 * GET   every listing another student can see, plus all of the caller's own
 *       whatever their state, each marked `mine` and with its `state`. Contact
 *       details are left out; /api/housing/:id has them.
 * POST  a new listing; 201 with what was stored
 *
 * The poster's identity — the email a listing may show, the name on it, the
 * owner it is filed under — comes from the verified session, never the body.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const me = await viewer();
  if (!me) return signInFirst();
  const store = housingStore();
  if (!store) return unavailable();

  try {
    const today = todayInSanDiego();
    const now = Date.now();
    const listings = (await store.all())
      .map((l) => toPublic(l, me.key, today, now, { withContact: false }))
      .filter((l) => l.mine || isListed(l.state))
      .sort((a, b) => b.created.localeCompare(a.created));
    return json({ listings });
  } catch (err) {
    return failed("load listings", err);
  }
}

export async function POST(request: Request): Promise<Response> {
  const me = await viewer();
  if (!me) return signInFirst();

  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.res;

  const today = todayInSanDiego();
  const checked = checkListing(read.body, today);
  if (!checked.ok) return json({ error: checked.error, field: checked.field, code: "HOUSING_INVALID" }, 422);
  if (!checked.fields.photos.every((ref) => photoBelongsTo(ref, me.key))) {
    return json({ error: "One of those photos is not yours to use.", field: "photos", code: "HOUSING_INVALID" }, 422);
  }

  const store = housingStore();
  if (!store) return unavailable();

  try {
    const now = Date.now();
    const open = (await store.all()).filter(
      (l) => l.owner === me.key && l.status === "open" && listingState(l, today, now) !== "ended",
    );
    if (open.length >= MAX_OPEN_PER_OWNER) {
      return json(
        {
          error: `You already have ${open.length} open listings. Mark one as taken or delete it first.`,
          code: "HOUSING_LIMIT",
        },
        409,
      );
    }

    const listing = buildListing(
      checked.fields,
      { owner: me.key, email: me.email, name: me.name },
      { id: newListingId(), now: new Date(now).toISOString() },
    );
    await store.put(listing);
    return json({ listing: toPublic(listing, me.key, today, now) }, 201);
  } catch (err) {
    return failed("save the listing", err);
  }
}
