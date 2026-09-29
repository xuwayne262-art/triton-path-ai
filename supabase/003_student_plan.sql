-- UCSDPlans — each student's plan, so it follows them between devices.
--
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). It is idempotent, so running it again is harmless.
--
-- The application reaches this table through PostgREST using the SERVICE ROLE
-- key, from server code only. See src/lib/plan/store.ts.

create table if not exists public.student_plan (
  -- sha256(AUTH_SECRET || "plan" || lowercased email), so this table holds no
  -- addresses and cannot be joined to academic_history on its key.
  key         text        primary key,
  -- Bumped by every save. A save names the revision it started from and is
  -- refused if the row has moved on, so a stale device cannot overwrite newer
  -- work from another one.
  rev         integer     not null check (rev > 0),
  -- The planner, starred courses and the student's own instructor ratings, as
  -- src/lib/plan/record.ts rebuilt them.
  record      jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- Same rule as the other tables, for the same reason: the anon key is public
-- and PostgREST serves every table in `public`. RLS on with NO policy leaves
-- the service role as the only thing that can read or write a plan.
alter table public.student_plan enable row level security;
revoke all on public.student_plan from anon, authenticated;

-- The service role bypasses RLS but still needs table privileges. Supabase
-- normally grants them to new tables by default; saying so explicitly keeps
-- this working in a project where that default has been turned off.
grant select, insert, update on public.student_plan to service_role;

comment on table public.student_plan is
  'UCSDPlans: one saved plan per student (planner, starred courses, own ratings), keyed by a salted hash of their email. Service-role access only.';

-- The app reaches this table through Supabase's REST API, which answers from a
-- cached copy of the schema. Supabase usually refreshes that cache on its own
-- after a CREATE TABLE; this makes sure, so the table is usable the moment
-- this script finishes rather than "not found" until the cache catches up.
notify pgrst, 'reload schema';
