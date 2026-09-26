This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Signing in

UCSDPlans is private. Every page, API route and dataset file under `/data`
requires a signed-in Google account whose **verified** email ends exactly in
`@ucsd.edu`. Only the login page, `/api/auth/*` and the login page's own assets
are public.

`alice@eng.ucsd.edu` is rejected — `.ucsd.edu` is not `@ucsd.edu`. There is no
approval list and no student/faculty check; the domain is the whole rule, and
it is applied on the server against Google's ID token, never against anything
the browser sends.

### Google OAuth client

Production domain: **ucsdplans.com**. The Google Cloud project is `ucsdplans`.

**Authorised JavaScript origins**
- `https://ucsdplans.com`
- `http://localhost:3000` — add this if you want to sign in during development

**Authorised redirect URIs** (the path is fixed by Auth.js — do not invent one)
- `https://ucsdplans.com/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google` — same, for development

The only scopes needed are `openid`, `email` and `profile`. All three are
non-sensitive, so publishing the consent screen does **not** require Google's
verification review.

> **The consent screen must be External and Published.** While it is *Internal*
> it only admits accounts in your own Google Workspace organisation, and while
> it is *Testing* it only admits addresses on the test-user list. Either way
> `@ucsd.edu` students are locked out even though the code would accept them.

### Environment

```bash
AUTH_SECRET=          # 32 random bytes; generate with: npx auth secret
AUTH_GOOGLE_ID=       # ...apps.googleusercontent.com
AUTH_GOOGLE_SECRET=   # GOCSPX-...

# Where imported Academic Histories are stored — see "Storing them", below.
# Vercel's Supabase integration injects both of these; the second is NOT the
# anon key. Without a store, `next dev` writes to ./.history-store and
# production refuses to save rather than dropping a record silently.
SUPABASE_URL=                # or NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=   # service role, never the anon key

# Alternative: any Upstash-dialect Redis REST endpoint, e.g. Vercel KV.
# Used only when the Supabase pair above is absent.
KV_REST_API_URL=      # or UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=    # or UPSTASH_REDIS_REST_TOKEN
```

`.env.local` covers development and is gitignored, along with any
`client_secret_*.json` downloaded from the Google console. **Those files never
reach the server**, so the same three variables must also be set in the hosting
provider's own environment settings before the deployed site can sign anyone
in. `trustHost` is enabled, so `AUTH_URL` is only needed if a proxy in front of
the app does not forward the real host.

Until all three are set the login page says so and shows the exact callback URI
for the current host — it does not offer a button that cannot work, and nothing
else on the site is reachable.

## Where the course data comes from

Every source is first-party UCSD and needs no key. Rebuild with
`npm run build:data`, which reads `.data-cache/` and writes `public/data/plat/`.

| Cache file | Script | Source |
| --- | --- | --- |
| `classplanner.json` | `fetch-classplanner.mjs` | [Class Planner](https://classplanner.apps.ucsd.edu) — this term's sections, per-section instructors, live seats and waitlists, prerequisites, restrictions, TSS module ids, building coordinates (→ `buildings.json`) |
| `as-grades.json` | `fetch-as-grades.mjs` | [AS Instructor Grade Archive](https://asmain.ucsd.edu/Home/InstructorGradeArchive) — 2015–2026 grade distributions |
| `catalog.json` | `fetch-catalog.mjs` | [General Catalog](https://catalog.ucsd.edu/front/courses.html) — every catalogued course |
| `data.json` | — | `ucsd-easy-a-radar`, now read for RateMyProfessors scores only |

**The legacy Schedule of Classes cannot supply this term.** `act.ucsd.edu`'s
term list stops at SU26 — enrolment moved to TSS for Fall 2026, and Class
Planner is UCSD's own front end for it. Its API is unauthenticated and
continuously refreshed, so it is both the first-party source and the freshest
one. It is also the true upstream other UCSD planners publish snapshots of.

`fetch-classplanner.mjs` also harvests the TSS **module id** and per-section
**event package id** behind every *Book on TSS* link. Those only appear on
`/api/v1/schedules/{ref}`, and that endpoint refuses a ref whose section ids are
not sorted, and caps a schedule at 15 distinct courses — hence the batch size.

Four things about Class Planner's data that the build has to get right:

- **`waitlist_only` is not cancelled.** It means full but still taking a
  waitlist. Reading every status other than `AC` as cancelled once hid 231
  sections — all of CSE 11 among them — so the planner had nothing to offer.
  Only an explicit cancellation removes a section.
- **A meeting with a `specific_date` happens once.** Midterms, finals and the
  odd one-off session (MGT 18, PHYS 2A) are written as dated rows (`FI`, `MI`,
  or `OT` with a date in the days column), never as weekly slots. MATH 20A's
  two evening midterms used to appear as a weekly Monday 8pm lecture.
- **Buildings are keyed by code.** A room is `LEDDN AUD`, its meeting says
  "Ledden Auditorium", and UCSD's map files the same code under "Humanities and
  Social Sciences". The code is the one key all three share, so
  `buildings.json` maps code → name, map name, coordinates and address. A few
  buildings (CALIT, TASB, OAR, SWC-25) have no coordinates in UCSD's map; the
  planner lists those meetings as "not on the map" rather than guessing.
- **A topics course is listed once per topic.** CSE 190 arrives as three
  catalog entries ("How the Web Tracks You", "Unsupervised Learning", …) and
  ECON 286 as six. Keying them by course code kept only the last, silently
  dropping 148 sections across 48 courses. They are merged — Class Planner's
  own schedule view treats them as one course with one TSS module, and TSS
  never reuses a section code across the entries — and each section keeps its
  topic in tuple position 19, which the planner shows on the lecture option.

## Campus map

The term workspace has a map drawer on the right (the **Map** button, the
pull tab on the calendar's edge, or <kbd>M</kbd>). It pins every building the
chosen sections meet in and, for each weekday, draws the walk between
consecutive classes, flagging any walk longer than the break before it.

- **Tiles** come from [OpenFreeMap](https://openfreemap.org) — vector tiles, no
  key, no view limits, with light and dark styles — drawn by MapLibre GL, which
  is loaded only when the drawer opens. CARTO's basemaps now require an API key
  and OpenStreetMap's own tile servers block apps under their usage policy, so
  neither works for a deployed site.
- **Walking routes** come from Class Planner itself: `GET /api/walk?term=…&ids=…`
  builds the schedule ref from the chosen TSS section ids and returns only the
  routed legs (distance, minutes, walkway geometry). Class Planner sends no
  CORS headers, which is why this goes through the server. Input is validated
  before any request, identical schedules are served from memory, and a slow
  upstream is cut off after eight seconds. Nothing but section ids is sent.
- **When UCSD cannot route a leg**, the planner estimates it from the
  straight-line distance × 1.37 at 80 m/min — calibrated on 20 of UCSD's own
  routed legs — and labels it as an estimate.
- **Building outlines** are cut out of the map's own vector tiles
  (`src/lib/footprint.ts`), and a tile feature is never one building: to keep
  tiles small, a z14 tile merges every building of the same height into one
  MultiPolygon (1,384 of them in the tile holding most of campus), and a z13
  tile fuses neighbours into blobs. Filling "the feature under the pin" once
  lit up most of La Jolla. So only the polygon the pin stands in is kept —
  or, where UCSD pins a courtyard (HSS), the wings around it — and only from
  the deepest tiles; a building a tile edge cuts in two (Price Center, SERF,
  DIB) is stitched back from each tile's share, drawn without anti-aliasing so
  the halves meet with no seam. Outlines found once are remembered, so they
  still show when the map zooms out to fit the week. All 71 buildings in use
  this term resolve; the outlines are OpenStreetMap data, credited on the map.

## Importing an Academic History

`/import` takes a **paste**, not a file. The record is already on screen on
TritonLink; downloading a PDF, finding it and dragging it back are three steps
that exist only to move that text, and each is a place a student gives up.

The parse runs in the browser (`src/lib/history/parse.ts`). Only the structured
result is sent to `/api/history` — never the raw paste, which carries the
student's name and PID. The parser keeps neither.

The server rebuilds every record field by field and **recomputes all totals**
(`src/lib/history/record.ts`) — a caller cannot put a GPA of its choosing on a
student's dashboard. A line the parser cannot read is surfaced to the student
rather than dropped, because a silently short transcript reads as a complete
one.

### Storing them

Records are keyed by `sha256(AUTH_SECRET ‖ email)`, so the database holds no
addresses and its keyspace cannot be enumerated by guessing `@ucsd.edu` names.
`src/lib/history/store.ts` picks a driver at runtime — Supabase, then KV, then
the dev filesystem — and returns null rather than a silent no-op when none is
configured. `storeDiagnosis()` names the missing variable in the server log;
the student only ever sees "it did not save".

**Supabase** is the primary path and needs one setup step: run
[`supabase/001_academic_history.sql`](supabase/001_academic_history.sql) once in
the Supabase SQL editor. It creates the table and **enables row-level security
with no policy**, which is the part that matters — Supabase publishes the anon
key to every browser, and PostgREST will serve any table in the `public` schema,
so without RLS that key could read every student's transcript. The app connects
with the service role key, which bypasses RLS, from server code only.

The driver talks to PostgREST with plain `fetch`, so neither store adds a
dependency.

## Hosted AI is turned off

All three AI endpoints answer **503** with `Cache-Control: no-store`:

| Endpoint | Code |
| --- | --- |
| `POST /api/chat` | `AI_CHAT_UNAVAILABLE` |
| `POST /api/advisor` | `AI_AUDIT_UNAVAILABLE` |
| `POST /api/generate-plan` | `AI_PLAN_GENERATION_UNAVAILABLE` |

They were reachable by anyone on the internet with no authentication and no
usage limit, so any visitor could spend the project's model budget. Each POST
handler now takes no `Request` argument at all, which makes reading the body,
loading course data, building a provider client or starting generation
structurally impossible. The refusal does not depend on whether
`ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is configured, and no request field,
header, cookie or query parameter can lift it.

**This is a shutdown, not a security feature.** It is not authentication and it
is not rate limiting — nothing here identifies a caller or counts their usage.

Before hosted AI chat may be reopened, all three of these must exist:

1. **Genuine server-side authentication** — a session the server verifies
   itself. A client-supplied user id, email, header or flag is not one.
2. **Eligibility enforcement** — who is allowed to spend model budget.
3. **Durable usage limits** — per-user and global, surviving restarts and
   shared across serverless instances. An in-memory counter is not one.

The chat generation path itself is fixed and tested (validation, size limits,
lazy provider construction, timeouts, cancellation, sanitized errors). It lives
in `src/lib/ai/chatHandler.ts` and is exercised by `npm test` with a mocked
provider. No route wires it up; wiring it up is step 4, after the three above.

`GET /api/chat` is a read-only availability probe (`{"available": false, ...}`)
so the UI can show an honest state instead of guessing.

## Checks

```bash
npm test        # Node's built-in runner; Anthropic is always mocked
npm run typecheck
npm run lint
npm run build
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
