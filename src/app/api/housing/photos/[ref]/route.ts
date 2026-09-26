import { housingStore, photoBelongsTo } from "@/lib/housing/store";
import { PHOTO_REF } from "@/lib/housing/listing";
import { failed, json, signInFirst, unavailable, viewer } from "@/lib/housing/viewer";

/**
 * `/api/housing/photos/:ref`
 *
 * GET     the photo, to any signed-in student. A ref never changes what it
 *         points at, so the browser may keep it for a year.
 * DELETE  its uploader removes a photo that is not on any listing yet — one
 *         added to the form and taken off again before saving. Photos already
 *         on a listing go when the listing is edited or deleted.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ref: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  if (!(await viewer())) return signInFirst();
  const { ref } = await ctx.params;
  if (!PHOTO_REF.test(ref)) return json({ error: "No such photo.", code: "PHOTO_NOT_FOUND" }, 404);
  const store = housingStore();
  if (!store) return unavailable();
  try {
    const bytes = await store.getPhoto(ref);
    if (!bytes) return json({ error: "No such photo.", code: "PHOTO_NOT_FOUND" }, 404);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return failed("load the photo", err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const me = await viewer();
  if (!me) return signInFirst();
  const { ref } = await ctx.params;
  if (!photoBelongsTo(ref, me.key)) return json({ error: "No such photo.", code: "PHOTO_NOT_FOUND" }, 404);
  const store = housingStore();
  if (!store) return unavailable();
  try {
    if ((await store.all()).some((l) => l.photos.includes(ref))) {
      return json({ error: "That photo is on a listing; edit the listing to remove it.", code: "PHOTO_IN_USE" }, 409);
    }
    await store.delPhoto(ref);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return failed("delete the photo", err);
  }
}
