# Release checklist: UX and trust release candidate

Branch `claude/practical-babbage-69outs`. Nothing here has been deployed,
merged or run against a production database. Follow the steps in order;
each names what to check before going on.

## What needs doing outside the code

| Item | Where | Required? |
| --- | --- | --- |
| Run `supabase/007_housing_photo_rate.sql` | Supabase SQL editor, staging first, then production (`acvensugaqcdpbccouhm`) | **Yes.** Without it, `POST /api/housing/photos` answers 503 ("Photo uploads are paused"). That is deliberate: the shared limit fails closed. Do not "fix" it by removing the limit. |
| `sharp` dependency | Installed by `npm ci`; Vercel installs the linux-x64 binary from the lockfile | Yes, nothing to configure. Check the Vercel build log shows no sharp install warnings. |
| Environment variables | Vercel project settings | **No new variables.** |
| `PLAN_AI_ENABLED` | Vercel | Leave it as it is today. Before turning it on, verify Google's current Gemini API terms and the project's tier in AI Studio (not done here). The request boundary no longer depends on that, but the zero-cost and data-use rules still do. |
| Data files | `public/data/plat/` | Already regenerated on this branch: `nl`/`pp` in `index.json`, a `v` stamp in each subject file. If merging conflicts with the scheduled data updates on `main`, take `main`'s data, then run `node scripts/backfill-lecture-options.mjs` and `node scripts/backfill-subject-version.mjs`, then `node scripts/check-data.mjs`. The next scheduled rebuild writes the same fields itself. |

## Order

1. **Staging database.** In a staging Supabase project (not production), run
   migrations 001–007 if it is fresh, or only 007 if it mirrors production. Then:
   ```sql
   -- must fail for both roles: permission denied
   set role anon;          select public.reserve_housing_photo('owner_check_01', 40);
   reset role; set role authenticated; select public.reserve_housing_photo('owner_check_01', 40);
   reset role;
   -- must succeed and count
   set role service_role;  select public.reserve_housing_photo('owner_check_01', 40);
   reset role;
   select bucket, owner, n from public.housing_photo_rate where owner = 'owner_check_01';
   delete from public.housing_photo_rate where owner = 'owner_check_01';
   ```
2. **Preview deploy** of this branch on Vercel pointing at staging (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, Google OAuth credentials with the preview
   callback URL added). Run the smoke tests below with a synthetic @ucsd.edu
   test account.
3. **Production database.** Run 007 in the production project. It is
   idempotent and touches no existing table, so running it before the code is
   live is safe; the current code does not call it.
4. **Merge and deploy.** Then repeat the smoke tests on ucsdplans.com with a
   test account, and delete what they created.

## Smoke tests (staging, then production)

- Signed out: `/`, `/courses/ECON`, `/course/ECON/110B`, `/ge`, `/compare?c=CSE 11,CSE 12` open; `/planner` redirects to `/login`; `GET /api/plan` is 401.
- Sign in with Google (@ucsd.edu). `/login` for a personal address shows the "ucsd_only" message.
- Course page: choose ECON 110B lecture B + discussion B03, Add. The notice says "Added ECON 110B…" and "Saved to your account"; Undo removes it; add again; View plan shows it; reload; sign in on a second browser and see it there.
- `/ge`: Sixth College, Humanities, Also DEI; reload keeps it; switch to University requirements; Back returns.
- Housing: upload a JPEG taken on a phone (with location on). Download the stored photo from the listing and check it has no EXIF/GPS (`exiftool` or any EXIF viewer). Upload 41 photos within an hour from one account: the 41st is refused with a time to try again.
- Academic History: paste, save, paste a partial copy (warning and checkbox), delete with confirmation.
- Account menu: Sign out returns to `/`; Use another account goes to `/login`.

## Rollback

- **Code:** Vercel → Deployments → promote the previous production deployment (instant rollback). The previous code never calls 007's function, so the table can stay.
- **Data files:** they ship with the code and roll back with it. Old clients ignore `nl`, `pp` and `v`.
- **007, only if it must go:**
  ```sql
  drop function if exists public.reserve_housing_photo(text, integer);
  drop table if exists public.housing_photo_rate;
  ```
  Dropping it while the new code is live makes photo uploads answer 503 (fail closed).
- **Stored plans and histories:** this release adds no migration to them. Plans written by the course page's in-place add use the same record format and change log the Planner uses.

## What was verified, and how

| Evidence | What |
| --- | --- |
| Unit and integration tests (Node test runner, mocked transports and stores) | 789 tests: AI request boundary with a recording model transport (`boundary.test.ts`), image re-encoding of generated baseline/progressive/rotated/corrupt JPEGs (`jpeg.test.ts`), shared photo limit client (`photoRate.test.ts`), apply reconciliation, plan sync (expired session, storage denied, offline, conflicts), on-device add/undo, conflict detection, units, compare, GE modes, history duplicates. |
| Local PostgreSQL 16 (not Supabase) | 001 and 003–007 apply in order (002 needs Supabase's `storage` schema); 007 is idempotent; anon/authenticated are denied the function and table; bad input is refused; 60 concurrent reservations from 60 connections with a limit of 40 gave exactly 40 accepted and 20 refused; a refusal carries the seconds to the next hour; the rollback statements run. |
| Local browser (Playwright, Chromium; `next dev` and `next start`; synthetic session cookie, file-backed dev stores) | Course page add/undo/View plan on a phone viewport and the account copy afterwards; compare at 1400 and 390px; `/ge` modes, reload, Back and an old `?req=` bookmark; planner conflict list and keyboard actions; Academic History paste/duplicates/smaller copy/failed paste/delete; housing board, listing page, owner controls; photo upload route storing metadata-free bytes. |
| Lab performance (Lighthouse 12.2.1, mobile, simulated throttling, `next start`, median of 3) | See the table below. Lab numbers, not field data. |
| **Not verified** | Real Google sign-in; any Supabase project (RLS, PostgREST, storage, quota RPCs over HTTP); a successful real Gemini request and the provider's current terms; map tiles and UCSD walking routes (blocked in the test sandbox); screen readers; a real phone and software keyboard; production. |

### Lab performance, before and after (same conditions)

| Page | Before (commit 4e0cc28) | After (this branch, final build) |
| --- | --- | --- |
| `/course/ECON/110B` | perf 51/58/34, LCP 7.5 s, CLS 0.001, TBT 812 ms, 1,066 KB | perf 64/71/71, LCP 4.6 s, CLS 0.005, TBT 510 ms, 1,091 KB |
| `/ge` | perf 64/64/63, LCP 6.1 s, CLS 0.001, TBT 557 ms, 723 KB | perf 79/81/81, LCP 4.1 s, CLS 0.001, TBT 283 ms, 723 KB |
| `/` | — | perf 82/86/84, LCP 2.9 s, CLS 0.039, TBT 447 ms |

Total bytes barely change: the index and professor list still load, but after
the course is on screen rather than in front of it.

LCP on the course page is still above the 2.5 s "good" threshold: the subject
file is requested only after the JavaScript runs. Rendering course pages on the
server (or statically) is the next step and was not attempted.

## Remaining risks

- The AI request boundary is a constructed, closed vocabulary, so typed words outside it never leave the browser. But a sentence made only of planning words still means what it says, and the boundary cannot make that meaning private.
- Photo uploads now decode and re-encode images on the server. Measured locally: about 50 ms for a 1600×1200 photo (the size the browser sends), about 150 ms for a 4000×3000 one. The per-student hourly limit bounds the total.
- The planner's 4-year grid still moves courses between quarters by drag and drop (keyboard dragging comes from the library: Space, the arrow keys, Space). Plan with AI's "move" and the remove buttons are the alternatives.
