/**
 * Size-bounded JSON body reading.
 *
 * The point is to stop reading an oversized body rather than to notice
 * afterwards: a hostile client can send `Content-Length: 10` and then stream
 * megabytes, so the header is only an early exit, never the enforcement.
 */

/** 128 KiB of actual received bytes. A full 4-year plan plus a 4,000-character
 *  message is well under 20 KiB, so this leaves generous headroom while keeping
 *  a single request from buffering unbounded memory. */
export const MAX_BODY_BYTES = 128 * 1024;

export type BodyFailure = {
  ok: false;
  status: 400 | 413 | 415;
  code: string;
  error: string;
};

export type BodyResult = { ok: true; value: unknown } | BodyFailure;

const TOO_LARGE: BodyFailure = {
  ok: false,
  status: 413,
  code: "REQUEST_TOO_LARGE",
  error: "Request body is too large.",
};

const MALFORMED: BodyFailure = {
  ok: false,
  status: 400,
  code: "INVALID_JSON",
  error: "Request body must be valid JSON.",
};

/** `application/json` with any parameters (charset, etc.). */
function isJsonContentType(header: string | null): boolean {
  if (!header) return false;
  const mediaType = header.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json";
}

export type BytesResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "too-large" | "unreadable" };

/**
 * The request body as bytes, never more than `maxBytes` of them. Counting
 * happens as the bytes arrive, so a missing or false Content-Length cannot
 * make the server buffer an unbounded body; the header is only an early exit.
 */
export async function readBoundedBytes(req: Request, maxBytes: number): Promise<BytesResult> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too-large" };

  const body = req.body;
  if (!body) return { ok: false, reason: "unreadable" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > maxBytes) {
        // Stop pulling immediately; do not buffer or parse the remainder.
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    // Client hung up or the stream errored — nothing safe to use.
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
  return { ok: true, bytes: concat(chunks, received) };
}

/**
 * The body as parsed JSON, read through {@link readBoundedBytes}. The value's
 * *shape* is still unknown and must be validated separately.
 */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too-large" | "unreadable" | "malformed" }> {
  const read = await readBoundedBytes(req, maxBytes);
  if (!read.ok) return read;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(read.bytes);
    if (text.trim() === "") return { ok: false, reason: "malformed" };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/**
 * Reads the request body, refusing to buffer more than {@link MAX_BODY_BYTES}.
 *
 * Returns the parsed JSON value — its *shape* is still unknown and must be
 * validated separately.
 */
export async function readJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyResult> {
  if (!isJsonContentType(req.headers.get("content-type"))) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      error: "Content-Type must be application/json.",
    };
  }

  const read = await readBoundedBytes(req, maxBytes);
  if (!read.ok) return read.reason === "too-large" ? TOO_LARGE : MALFORMED;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(read.bytes);
  } catch {
    return MALFORMED;
  }

  if (text.trim() === "") return MALFORMED;

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return MALFORMED;
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
