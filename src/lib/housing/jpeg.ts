import sharp from "sharp";

/**
 * A listing photo as the server will store it: decoded, turned upright,
 * bounded in size, and encoded afresh from its pixels, so nothing of the
 * uploaded file survives but the picture.
 *
 * An earlier version walked the JPEG's markers and cut out metadata segments
 * itself. It stopped at the first scan and copied the rest unchanged, so a
 * progressive JPEG carrying EXIF between its scans kept it. Parsing a file
 * format to remove what it may hold is the wrong shape for this guarantee;
 * decoding to pixels and encoding new bytes is the right one, and libvips
 * (through sharp, which Next.js already ships for image optimisation) is a
 * maintained decoder that also validates the file as it reads it.
 *
 * What comes out has no EXIF, XMP, IPTC, ICC or comment: sharp writes none
 * unless asked. The browser still re-encodes before upload; this does not
 * depend on it.
 */

/** Uploads are re-encoded at most this large on their longer side (the browser sends 1600). */
export const MAX_SIDE = 1600;
/** Refused before decoding beyond this many pixels: a small file can declare a huge image. */
export const MAX_PIXELS = 40_000_000;
/** Refused when either side is smaller than this; nothing useful is that small. */
const MIN_SIDE = 64;

export type PhotoCheck =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: "not-jpeg" | "unreadable" | "too-large" | "too-small" };

export async function sanitizePhoto(input: Uint8Array, limits = { maxPixels: MAX_PIXELS }): Promise<PhotoCheck> {
  let meta: sharp.Metadata;
  try {
    // limitInputPixels makes libvips refuse an oversized image before
    // allocating it; failOn "warning" refuses truncated or corrupt data.
    meta = await sharp(input, { limitInputPixels: limits.maxPixels, failOn: "warning" }).metadata();
  } catch (err) {
    return { ok: false, reason: /pixel limit/i.test(String(err)) ? "too-large" : "unreadable" };
  }
  if (meta.format !== "jpeg") return { ok: false, reason: "not-jpeg" };
  if (!meta.width || !meta.height) return { ok: false, reason: "unreadable" };
  if (meta.width * meta.height > limits.maxPixels) return { ok: false, reason: "too-large" };
  if (Math.min(meta.width, meta.height) < MIN_SIDE) return { ok: false, reason: "too-small" };
  try {
    const { data, info } = await sharp(input, { limitInputPixels: limits.maxPixels, failOn: "warning" })
      .rotate() // applies the EXIF orientation to the pixels; the tag itself is not written back
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: false, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
