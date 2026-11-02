/**
 * A listing photo as the server will store it: a well-formed JPEG with every
 * metadata segment removed.
 *
 * The browser re-encodes photos through a canvas, which drops the EXIF block
 * and the GPS position a phone writes into it. The server used to trust that
 * and check only the first three bytes, so any client that skipped the page —
 * or a browser that keeps metadata — could store a photo that says where it
 * was taken. Here the file is walked marker by marker: APP1 (EXIF, XMP),
 * APP2–APP13 and APP15 (ICC, IPTC, maker notes) and comments are cut out, and
 * anything that is not a complete JPEG is refused.
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
/** APP0 (JFIF) says how to read the file and APP14 (Adobe) its colour transform; neither says anything about the photographer. */
const KEEP_APP = new Set([0xe0, 0xee]);

export type JpegCheck = { ok: true; bytes: Uint8Array; removed: number } | { ok: false; reason: string };

export function cleanJpeg(input: Uint8Array): JpegCheck {
  const b = input;
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) return { ok: false, reason: "not a JPEG" };
  const out: number[][] = [[0xff, SOI]];
  let i = 2;
  let removed = 0;
  let sawFrame = false;
  while (i < b.length) {
    if (b[i] !== 0xff) return { ok: false, reason: "broken marker" };
    // Fill bytes before a marker are allowed.
    while (i < b.length && b[i] === 0xff) i++;
    const marker = b[i++];
    if (marker === undefined) return { ok: false, reason: "truncated" };
    if (marker === EOI) return { ok: false, reason: "no image data" };
    if (marker >= 0xd0 && marker <= 0xd7) return { ok: false, reason: "stray restart marker" };
    if (i + 2 > b.length) return { ok: false, reason: "truncated" };
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) return { ok: false, reason: "bad segment length" };
    const segment = b.subarray(i - 2, i + len);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if ((isApp && !KEEP_APP.has(marker)) || isComment) {
      removed++;
    } else {
      out.push(Array.from(segment));
    }
    // Baseline, extended, progressive or lossless frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) sawFrame = true;
    i += len;
    if (marker === SOS) {
      if (!sawFrame) return { ok: false, reason: "no frame header" };
      // Entropy-coded data to the end: it must finish with EOI.
      if (b.length < i + 2 || b[b.length - 2] !== 0xff || b[b.length - 1] !== EOI) return { ok: false, reason: "truncated image data" };
      const total = out.reduce((n, s) => n + s.length, 0) + (b.length - i);
      const bytes = new Uint8Array(total);
      let o = 0;
      for (const s of out) { bytes.set(s, o); o += s.length; }
      bytes.set(b.subarray(i), o);
      return { ok: true, bytes, removed };
    }
  }
  return { ok: false, reason: "truncated" };
}
