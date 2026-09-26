import { housingStore, newPhotoRef } from "@/lib/housing/store";
import { failed, json, signInFirst, unavailable, viewer } from "@/lib/housing/viewer";

/**
 * `POST /api/housing/photos` — one listing photo, as JPEG bytes. 201 { ref }.
 *
 * The page re-encodes every photo in the browser before it is sent: scaled to
 * 1600 px, and drawn onto a canvas, which is what strips the EXIF block — and
 * with it the GPS position a phone writes into every picture it takes. So the
 * server only ever accepts JPEG, and only at the size that re-encode produces.
 *
 * Uploads are counted per student per server instance. That is a brake, not a
 * quota — serverless instances do not share memory — but every uploader is a
 * signed-in @ucsd.edu student, and a photo that never joins a listing is small.
 */

export const dynamic = "force-dynamic";

const MAX_BYTES = 700 * 1024;
const MIN_BYTES = 1024;
const PER_HOUR = 40;
const recent = new Map<string, number[]>();

function allow(owner: string, now = Date.now()): boolean {
  const hour = now - 3_600_000;
  const times = (recent.get(owner) ?? []).filter((t) => t > hour);
  if (times.length >= PER_HOUR) {
    recent.set(owner, times);
    return false;
  }
  times.push(now);
  recent.set(owner, times);
  if (recent.size > 5_000) recent.delete(recent.keys().next().value!);
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const me = await viewer();
  if (!me) return signInFirst();

  if (request.headers.get("content-type")?.split(";")[0].trim() !== "image/jpeg") {
    return json({ error: "Photos are sent as JPEG.", code: "PHOTO_TYPE" }, 415);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ error: "That photo is too large.", code: "PHOTO_TOO_LARGE" }, 413);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BYTES) return json({ error: "That photo is too large.", code: "PHOTO_TOO_LARGE" }, 413);
  // A JPEG opens with a start-of-image marker; anything else is not one,
  // whatever its header claimed.
  if (bytes.length < MIN_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return json({ error: "That is not a photo we can use.", code: "PHOTO_TYPE" }, 415);
  }
  if (!allow(me.key)) {
    return json({ error: "That is a lot of photos for one hour. Try again later.", code: "PHOTO_RATE" }, 429);
  }

  const store = housingStore();
  if (!store) return unavailable();
  const ref = newPhotoRef(me.key);
  try {
    await store.putPhoto(ref, bytes);
    return json({ ref }, 201);
  } catch (err) {
    return failed("upload the photo", err);
  }
}
