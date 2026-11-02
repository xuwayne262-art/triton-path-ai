import { housingStore, newPhotoRef } from "@/lib/housing/store";
import { failed, json, signInFirst, unavailable, viewer } from "@/lib/housing/viewer";
import { readBoundedBytes } from "@/lib/ai/httpBody";
import { crossSiteResponse, fromAnotherSite } from "@/lib/http/origin";
import { cleanJpeg } from "@/lib/housing/jpeg";
import { reservePhoto } from "@/lib/housing/photoRate";

/**
 * `POST /api/housing/photos` — one listing photo, as JPEG bytes. 201 { ref }.
 *
 * The page re-encodes every photo in the browser before it is sent: scaled to
 * 1600 px, and drawn onto a canvas, which strips the EXIF block — and with it
 * the GPS position a phone writes into every picture. The server does not rely
 * on that: it reads at most MAX_BYTES as they arrive, refuses anything that is
 * not a complete JPEG, and cuts every metadata segment out itself (jpeg.ts)
 * before storing it.
 *
 * Uploads are limited per student per hour in a store every server instance
 * shares (photoRate.ts). When that count cannot be kept, uploads are refused
 * rather than unlimited.
 */

export const dynamic = "force-dynamic";

const MAX_BYTES = 700 * 1024;
const MIN_BYTES = 1024;

export async function POST(request: Request): Promise<Response> {
  const me = await viewer();
  if (!me) return signInFirst();
  if (fromAnotherSite(request)) return crossSiteResponse();

  if (request.headers.get("content-type")?.split(";")[0].trim() !== "image/jpeg") {
    return json({ error: "Photos are sent as JPEG.", code: "PHOTO_TYPE" }, 415);
  }
  const read = await readBoundedBytes(request, MAX_BYTES);
  if (!read.ok) {
    return read.reason === "too-large"
      ? json({ error: "That photo is too large.", code: "PHOTO_TOO_LARGE" }, 413)
      : json({ error: "That photo didn't arrive whole. Try again.", code: "PHOTO_UNREADABLE" }, 400);
  }
  if (read.bytes.length < MIN_BYTES) return json({ error: "That is not a photo we can use.", code: "PHOTO_TYPE" }, 415);
  const clean = cleanJpeg(read.bytes);
  if (!clean.ok) return json({ error: "That is not a photo we can use.", code: "PHOTO_TYPE" }, 415);

  const store = housingStore();
  if (!store) return unavailable();

  const rate = await reservePhoto(me.key.replace(/^own:/, ""));
  if (!rate.ok) {
    if ("unavailable" in rate) {
      return json({ error: "Photo uploads are paused for a moment. Your listing is kept; try adding photos again shortly.", code: "PHOTO_LIMIT_UNAVAILABLE" }, 503, { "Retry-After": "60" });
    }
    const minutes = Math.ceil(rate.retryAfter / 60);
    return json(
      { error: `That is a lot of photos for one hour. You can add more in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`, code: "PHOTO_RATE", retryAfter: rate.retryAfter },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  const ref = newPhotoRef(me.key);
  try {
    await store.putPhoto(ref, clean.bytes);
    return json({ ref }, 201);
  } catch (err) {
    return failed("upload the photo", err);
  }
}
