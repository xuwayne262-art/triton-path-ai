import { geocoderUrl, parseAddressQuery, shapePlaces, type Place } from "@/lib/housing/geocode";

/**
 * `/api/geocode?q=3990 Nobel Dr` — a street address, as points on the map.
 *
 *   200 { places }   zero or more matches in the San Diego area
 *   400 { error }    not something that can be an address; nothing was sent
 *   502 { error }    the Census geocoder did not answer
 *
 * Asked by the server, not the browser, so the student's address goes to the
 * Census Bureau alone and the answer can be remembered: the same address is
 * checked by everyone looking at the same listing. Only the address is sent.
 */

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1_000;
const memo = new Map<string, { at: number; places: Place[] }>();

const NO_STORE = { "Cache-Control": "no-store" } as const;
const CACHEABLE = { "Cache-Control": "private, max-age=86400" } as const;

export async function GET(req: Request): Promise<Response> {
  const parsed = parseAddressQuery(new URL(req.url).searchParams.get("q"));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: NO_STORE });

  const key = parsed.address.toLowerCase();
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json({ places: hit.places }, { headers: CACHEABLE });

  try {
    const res = await fetch(geocoderUrl(parsed.address), {
      headers: { accept: "application/json", "user-agent": "UCSDPlans housing (student project)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return unavailable();
    const places = shapePlaces(await res.json());
    memo.delete(key);
    memo.set(key, { at: Date.now(), places });
    while (memo.size > MAX_ENTRIES) memo.delete(memo.keys().next().value!);
    return Response.json({ places }, { headers: CACHEABLE });
  } catch {
    return unavailable();
  }
}

function unavailable(): Response {
  return Response.json(
    { error: "The address lookup is not answering right now. Try again in a moment.", code: "GEOCODER_UNAVAILABLE" },
    { status: 502, headers: NO_STORE },
  );
}
