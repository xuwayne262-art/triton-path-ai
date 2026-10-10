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
| `requirements.json` | `fetch-requirements.mjs` | The AHI and DEI course lists (needs `pdftotext`) |
| `data.json`, `ge-courses.json` | — | `ucsd-easy-a-radar`, for RateMyProfessors scores and the colleges' GE lists only. It has no licence, so the build never downloads them: it uses copies already in `.data-cache/`, or without them carries that part of the published dataset over unchanged |

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

The GE lists (`ge-courses.json`) sometimes name a course by an older code:
Political Science added a "D" to its lower-division numbers, so a list saying
"POLI 13R" means POLI 13DR. The build resolves a code that matches no course to
its "D" form when that course exists, and prints both the renumbered codes and
any still unknown (GSS 23 and GSS 26 today). The GE page lists unknown codes
under the results rather than dropping them. A course the current catalog does
not list carries `ct: 0` in `index.json`; off this term's schedule too, it is
retired or renumbered and its prerequisites are unknown, so it is never labelled
"no prereq".

Every course list opens on every course — this term's schedule is a switch in
plain sight, never a hidden default — and "Best grades" sorts by the average the
letter is read from, so letters and GPAs descend together. Each letter has one
colour (A dark green, A− green, B+ amber, B and B− orange, C+ and below red).

### Automatic updates

`.github/workflows/update-data.yml` keeps `public/data/plat/` in step with Class
Planner without anyone running the scripts:

- **Every half hour** `scripts/watch-classplanner.mjs` asks Class Planner, in two
  or three small requests, whether a rebuild is due: the next quarter's listings
  are out (and hold at least 60% of the current term's courses — quarters are
  often published department by department), the term's course, section or
  meeting count changed, or seats were recounted on the busiest courses at least
  three hours after the dataset's. **Once a day** (17:20 UTC, after UCSD's own
  refresh) it rebuilds on any refresh, to catch an instructor or room changing.
- A rebuild fetches the term, builds, then must pass `scripts/check-data.mjs`
  and `npm test`. The checker fails an update on files that do not parse,
  impossible times or seat counts, courses the index and subject files disagree
  about, broken GE lists, and drops against the published dataset (a tenth of the
  term's courses, any grade records, the professors' ratings, or a new quarter
  too thinly listed to switch to).
- `scripts/data-changed.mjs` sets aside the times sources were read; if nothing
  else changed, nothing is published. Otherwise the workflow commits to `main`
  — authored as the site's owner, which Vercel requires to deploy a private
  repository — and Vercel deploys it.
- **A failure publishes nothing.** The site keeps its data, and an issue labelled
  `data-update` explains what failed, with a link to the run. Later failures edit
  that issue rather than opening more, rebuilds pause for six hours after one, and
  the next good update closes it. *Actions → Update course data → Run workflow*
  (with "force") rebuilds at once.

When the dataset moves to a new quarter, the planner puts each student's picks
for the old one away under that term (`src/lib/plan/term.ts`): a section code
like "A01" names a different section every term.

Seat counts are only as fresh as Class Planner's last recount from TSS, which can
lag its schedule by days — on Oct 10, 2026 every Fall course still showed Sep 21's
counts, and Class Planner's own refresh was failing ("Academic History returned
HTTP 404"). The dataset records each course's count time (`seatsAt`) and the
term's oldest (`meta.seatsAsOf`), and the site says "seats as of" that date. TSS
itself needs a UCSD sign-in, so nothing here reads it directly.

The checks cost about a minute of GitHub Actions each (≈1,600 minutes a month with the daily rebuilds,
inside the free plan's 2,000 for a private repository); a rebuild takes about
five, and fetches the grade archive, catalog and requirement lists only once a
week.

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

## On a phone

Below 768 px the term workspace shows one pane at a time — **Courses**,
**Week**, **Map** — switched from a tab bar at the bottom of the screen; three
side-by-side panes cannot fit, and the course rail alone is wider than the
calendar would be. The week draws compact five-day columns, a day picker opens
any one day at full width, and tapping a class opens its details in a sheet
(section, time, room, instructor, change sections, directions, remove), since
a touch screen has no hover. The four-year plan stacks its years, with degree
progress after them.

Three iPhone-specific rules hold across the site: the planner is sized with
`dvh`, not `vh` (100vh on iOS is the height with Safari's toolbar hidden);
every text field is 16 px on touch screens, because Safari zooms the page into
any smaller field on focus; and hover-only controls either have a touch
equivalent or show on coarse pointers. Adding the site to the Home Screen uses
`public/apple-touch-icon.png`.

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

**Degree progress counts it.** The 4-year plan's progress panel adds every
course the saved history shows completed — a passing grade or a P, each course
once, at the units earned (`completedCourses` in `src/lib/plannerBridge.ts`) —
to the plan and this term's schedule. Transfer and AP credit is not counted: a
row can grant several UCSD courses at once, and splitting its units would be a
guess. With every bar at zero and nothing saved, the panel links to `/import`.

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

**All three migrations (001, 002, 003) must run in the Supabase project that the
deployment's `SUPABASE_URL` points at** — for ucsdplans.com that is the project
whose URL starts `acvensugaqcdpbccouhm`. They are idempotent, so running one
again is harmless. A table created in any other project leaves the matching page
failing on every load: `/import` says it could not load the saved Academic
History, `/housing` that it could not load the listings, and the server log
shows `PGRST205` ("Could not find the table") for the file that was missed.

The driver talks to PostgREST with plain `fetch`, so neither store adds a
dependency.

## Your plan follows your account

The planner (program, this term's courses and sections, the four-year plan),
the courses a student stars and their own instructor ratings are saved to their
account, so signing in on a phone shows the plan built on a laptop. They used
to live only in the browser that made them.

Each browser still keeps its own copy in localStorage — that is what makes the
planner instant and lets it work offline — and `src/lib/plan/sync.ts` keeps
that copy in step with `/api/plan`:

- **On load, and whenever a tab comes back into view,** it fetches the
  account's plan and merges it in. Hiding or closing a tab saves at once.
- **After an edit** it saves within a second, naming the revision the edit was
  based on. A save from an old revision — a laptop tab left open while the
  phone was used — is refused and answered with the current plan; the two are
  merged (`src/lib/plan/merge.ts`: a change on either side survives, removals
  included, and a true conflict goes to the device in use) and the result is
  saved. Nothing is overwritten blind.
- **A plan made before syncing existed** joins the account's rather than
  replacing it, so two devices that each built part of a plan end up with all
  of it. An untouched planner never counts as a plan.
- **A shared browser** never carries one student's plan into another's
  account: each copy is tagged with the account it belongs to.

The planner header shows a small cloud while the plan is saved, and says so in
words when it is not. View choices (rail tab, map, theme) and the housing
board's checked addresses stay per browser.

**Setup: run [`supabase/003_student_plan.sql`](supabase/003_student_plan.sql)
once** in the Supabase SQL editor. Like the other tables it has RLS on with no
policy and is keyed by a salted hash of the email. Until it exists `/api/plan`
answers 502 with the file named in the server log, and the planner keeps
working in each browser while saying "Not saved yet". `next dev` with no
Supabase variables uses `.history-store/plan/`.

## Housing

`/housing` is a sublet and room board for @ucsd.edu students, and it knows
each visitor's week. Every place is measured against the sections chosen in
the term workspace: the trip to each day's first class, the trip home from the
last, the time to leave, and the hours that adds up to over a quarter. Nothing
is stored about the visitor to do this — `useTermSchedule` reads the planner's
own localStorage, read-only, so the housing pages can never change a schedule.
With no schedule, trips go to Library Walk.

- **Commute times are estimates**, labelled as such: straight-line distance ×
  1.37 (the campus-map calibration) at 80 m/min walking or 250 m/min cycling.
  Bus and trolley times are a Google Maps link, with its real timetables.
- **Check an address** places anything a student found elsewhere on the same
  map with the same numbers. Addresses go to the U.S. Census Bureau's geocoder
  (`/api/geocode`, no key, public-domain results) and nowhere else; the checked
  list stays in that browser.
- **Availability is by quarter**, from the Registrar's calendars on
  blink.ucsd.edu. A stay covers a quarter only from the first day of classes to
  the end of finals. `QUARTERS` in `src/lib/housing/terms.ts` needs the next
  academic year added each spring.

Listings (`/api/housing`) follow the Academic History rules: the owner is a
keyed hash of their email, the server rebuilds every field
(`src/lib/housing/listing.ts`), and the poster's name ("Alex Y.") and email come
from the session, never the form. A poster chooses whether their email shows;
contact details appear only on a listing's own page, not in the list response,
so one request cannot collect everyone's phone number.

- **Freshness:** a listing not reconfirmed for 14 days is flagged, and after 30
  it leaves the list until its owner clicks *Still available*. Ended and taken
  listings are shown to their owner only.
- **Reports:** three distinct students reporting a listing hide it. There is no
  admin screen; to restore one, empty `reports` in its record.
- **Limits:** three open listings per student, 2,000-character descriptions,
  six photos.
- **Photos** are re-encoded to JPEG in the browser (at most 1600 px), which also
  strips the EXIF block and the GPS position phones write into it. The server
  accepts JPEG only. A photo's ref carries an HMAC of its uploader, so a listing
  can only attach — and deleting one can only remove — photos its owner uploaded.

**Setup: run [`supabase/002_housing.sql`](supabase/002_housing.sql) once** in the
Supabase SQL editor before deploying. It creates the `housing_listing` table
(RLS on, no policy, like `academic_history`) and a private `housing-photos`
Storage bucket. Without it, the board answers 502 and the server log names the
file to run. `next dev` with no Supabase variables uses
`.history-store/housing/` instead.

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
