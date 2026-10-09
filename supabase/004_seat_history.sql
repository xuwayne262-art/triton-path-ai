-- UCSDPlans — each course's seats, once a day, so a course page can show how
-- fast it filled across the enrollment passes.
--
-- Run this ONCE in the Supabase SQL editor of the project that serves
-- ucsdplans.com (ref acvensugaqcdpbccouhm): Dashboard -> SQL Editor -> New
-- query -> paste -> Run. It is idempotent, so running it again is harmless.
--
-- Written by /api/cron/seats (Vercel Cron, daily) and read by /api/seats,
-- both through PostgREST with the SERVICE ROLE key from server code only.
-- See src/lib/seats/store.ts.

create table if not exists public.seat_history (
  -- "FA26"
  term         text        not null,
  -- "CSE 12"
  course       text        not null,
  -- The San Diego date the count was taken. One row per course per day: a
  -- second run the same day replaces the numbers instead of adding a point.
  day          date        not null,
  -- Lectures summed when the course has them (a lecture's count already
  -- includes its discussions), otherwise every section.
  enrolled     integer     not null check (enrolled >= 0),
  capacity     integer     not null check (capacity >= 0),
  waitlist     integer     not null default 0 check (waitlist >= 0),
  recorded_at  timestamptz not null default now(),
  primary key (term, course, day)
);

-- Public course data, but written only by the server: RLS on with no policy
-- leaves the service role as the only thing that can read or write it.
alter table public.seat_history enable row level security;
revoke all on public.seat_history from anon, authenticated;
grant select, insert, update on public.seat_history to service_role;

comment on table public.seat_history is
  'UCSDPlans: daily enrolled / capacity / waitlist per course, from UCSD Class Planner. Service-role access only.';

notify pgrst, 'reload schema';
