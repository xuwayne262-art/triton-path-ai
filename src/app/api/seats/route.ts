import { seatStore } from "@/lib/seats/store";

/**
 * `/api/seats?course=CSE%2012&term=FA26` — one course's daily seat counts,
 * oldest first: { term, points: [{ day, enrolled, capacity, waitlist }] }.
 *
 * Public, like the course page that reads it; it holds nothing but UCSD's own
 * published counts. With no store configured it answers an empty list, and
 * the page shows the dataset's own snapshot alone.
 */

export const dynamic = "force-dynamic";

const COURSE = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,4}$/;
const TERM = /^[A-Z][A-Z0-9]\d{2}$/;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const course = (url.searchParams.get("course") ?? "").trim().toUpperCase();
  const term = (url.searchParams.get("term") ?? "").trim().toUpperCase();
  if (!COURSE.test(course) || !TERM.test(term)) {
    return Response.json({ error: "Name a course like CSE 12 and a term like FA26." }, { status: 400 });
  }

  const store = seatStore();
  if (!store) return Response.json({ term, points: [] });

  try {
    const points = await store.history(term, course);
    return Response.json(
      { term, points },
      // A new point arrives once a day, so an hour's caching costs nothing.
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    console.error(`[seats] history failed (store=${store.name}): ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ term, points: [] }, { status: 502 });
  }
}
