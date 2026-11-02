import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanJpeg } from "./jpeg";

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const exif = seg(0xe1, [..."Exif\0\0".split("").map((c) => c.charCodeAt(0)), 1, 2, 3, 4]);
const jfif = seg(0xe0, [..."JFIF\0".split("").map((c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const frame = seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
const scan = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
const data = [0x12, 0x34, 0xff, 0x00, 0x56];
const jpeg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat(), ...data, 0xff, 0xd9]);

test("removes EXIF and comments, keeps JFIF and the image", () => {
  const r = cleanJpeg(jpeg(jfif, exif, seg(0xfe, [65, 66]), frame, scan));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.removed, 2);
  const text = String.fromCharCode(...r.bytes);
  assert.ok(!text.includes("Exif"));
  assert.ok(text.includes("JFIF"));
  assert.deepEqual(Array.from(r.bytes.slice(-7)), [...data, 0xff, 0xd9]);
});

test("a clean photo comes back unchanged", () => {
  const input = jpeg(jfif, frame, scan);
  const r = cleanJpeg(input);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.bytes, input);
});

test("refuses what is not a whole JPEG", () => {
  assert.equal(cleanJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).ok, false);
  assert.equal(cleanJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, 1, 2])).ok, false);
  const noEnd = jpeg(jfif, frame, scan).slice(0, -2);
  assert.equal(cleanJpeg(noEnd).ok, false);
  assert.equal(cleanJpeg(jpeg(jfif, scan)).ok, false);
});
