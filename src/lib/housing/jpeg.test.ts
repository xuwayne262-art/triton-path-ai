import { test, describe } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MAX_SIDE, sanitizePhoto } from "./jpeg";

/** A synthetic photo: a gradient, so orientation can be checked from its pixels. */
async function photo(width: number, height: number, opts: { progressive?: boolean; orientation?: number; exif?: boolean } = {}) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    // Red increases left to right; blue marks the top rows.
    raw[i] = Math.round((x / (width - 1)) * 255);
    raw[i + 1] = 60;
    raw[i + 2] = y < height / 4 ? 255 : 0;
  }
  let img = sharp(raw, { raw: { width, height, channels: 3 } });
  if (opts.exif || opts.orientation) {
    img = img.withMetadata({
      ...(opts.orientation ? { orientation: opts.orientation } : {}),
      ...(opts.exif ? { exif: { IFD0: { ImageDescription: "SYNTHETIC_PRIVATE_METADATA", Artist: "SYNTHETIC_ARTIST" } } } : {}),
    });
  }
  return img.jpeg({ progressive: opts.progressive ?? false, quality: 90 }).toBuffer();
}

/** An APPn or COM segment carrying `text`. */
const segment = (marker: number, text: string) => {
  const payload = Buffer.from(text, "latin1");
  return Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);
};

/** Inserts a segment just before the n-th Start of Scan (1-based). */
function beforeScan(jpeg: Buffer, n: number, seg: Buffer): Buffer {
  let seen = 0;
  for (let i = 2; i < jpeg.length - 1; i++) {
    if (jpeg[i] === 0xff && jpeg[i + 1] === 0xda && ++seen === n) return Buffer.concat([jpeg.subarray(0, i), seg, jpeg.subarray(i)]);
  }
  throw new Error(`no scan ${n}`);
}

const PRIVATE = ["SYNTHETIC_PRIVATE_METADATA", "SYNTHETIC_ARTIST", "SYNTHETIC_XMP", "SYNTHETIC_IPTC", "SYNTHETIC_COMMENT", "Exif", "http://ns.adobe.com/xap"];

async function assertClean(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("latin1");
  for (const p of PRIVATE) assert.ok(!text.includes(p), `output still contains ${p}`);
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(meta.icc, undefined);
  assert.equal(meta.comments, undefined);
  // It decodes to pixels.
  assert.ok((await sharp(bytes).raw().toBuffer()).length > 0);
}

describe("sanitizePhoto", () => {
  test("R2: metadata between the scans of a progressive JPEG is gone from the stored bytes", async () => {
    const prog = await photo(128, 128, { progressive: true });
    const evil = beforeScan(prog, 2, segment(0xe1, "Exif\0\0SYNTHETIC_PRIVATE_METADATA"));
    assert.ok(evil.length > 1024, "larger than the route's minimum");
    assert.ok((await sharp(evil).raw().toBuffer()).length > 0, "the fixture decodes");
    const r = await sanitizePhoto(evil);
    assert.ok(r.ok);
    if (r.ok) await assertClean(r.bytes);
  });

  test("EXIF, XMP, IPTC and comments before and between scans are all removed", async () => {
    const prog = await photo(200, 150, { progressive: true, exif: true });
    let f = beforeScan(prog, 1, segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<x>SYNTHETIC_XMP</x>"));
    f = beforeScan(f, 1, segment(0xed, "Photoshop 3.0\0SYNTHETIC_IPTC"));
    f = beforeScan(f, 1, segment(0xfe, "SYNTHETIC_COMMENT"));
    f = beforeScan(f, 3, segment(0xfe, "SYNTHETIC_COMMENT"));
    f = beforeScan(f, 4, segment(0xe1, "Exif\0\0SYNTHETIC_PRIVATE_METADATA"));
    const r = await sanitizePhoto(f);
    assert.ok(r.ok);
    if (r.ok) await assertClean(r.bytes);
  });

  test("a baseline photo with EXIF comes back clean and the same size", async () => {
    const r = await sanitizePhoto(await photo(320, 240, { exif: true }));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual([r.width, r.height], [320, 240]);
    await assertClean(r.bytes);
  });

  test("a rotated phone photo is turned upright, and the tag is not kept", async () => {
    // Orientation 6: the stored pixels are 240x160 and display rotated 90° clockwise, as 160x240.
    const r = await sanitizePhoto(await photo(240, 160, { orientation: 6 }));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual([r.width, r.height], [160, 240]);
    const meta = await sharp(r.bytes).metadata();
    assert.ok(meta.orientation === undefined || meta.orientation === 1);
    // The blue top rows of the stored image are now the right-hand columns.
    const { data, info } = await sharp(r.bytes).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * info.channels + 2];
    assert.ok(px(info.width - 5, 120) > 150, "blue on the right");
    assert.ok(px(5, 120) < 100, "not on the left");
  });

  test("a large photo is scaled to fit, never enlarged", async () => {
    const r = await sanitizePhoto(await photo(2400, 1200));
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual([r.width, r.height], [MAX_SIDE, 800]);
  });

  test("an image beyond the pixel limit is refused before it is decoded", async () => {
    const r = await sanitizePhoto(await photo(1000, 1000), { maxPixels: 500_000 });
    assert.deepEqual(r, { ok: false, reason: "too-large" });
  });

  test("truncated, corrupt, empty and non-JPEG input is refused", async () => {
    const good = await photo(128, 128, { progressive: true });
    const corrupt = Buffer.from(good);
    for (let i = Math.floor(corrupt.length / 2); i < corrupt.length - 2; i += 7) corrupt[i] = 0xff;
    const png = await sharp(Buffer.alloc(128 * 128 * 3, 200), { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
    const cases: [string, Uint8Array][] = [
      ["truncated", good.subarray(0, Math.floor(good.length * 0.6))],
      ["corrupt scan data", corrupt],
      ["empty frame", Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9])],
      ["png", png],
      ["text", Buffer.from("not a photo at all, just some text that is long enough")],
    ];
    for (const [name, bytes] of cases) {
      const r = await sanitizePhoto(bytes);
      assert.equal(r.ok, false, name);
    }
  });

  test("a tiny image is refused as too small", async () => {
    assert.deepEqual(await sanitizePhoto(await photo(32, 32)), { ok: false, reason: "too-small" });
  });
});
