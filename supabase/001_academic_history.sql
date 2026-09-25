-- UCSDPlans — storage for imported Academic Histories.
--
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). It is idempotent, so running it again is harmless.
--
-- The application reaches this table through PostgREST using the SERVICE ROLE
-- key, from server code only. See src/lib/history/store.ts.

create table if not exists public.academic_history (
  -- sha256(AUTH_SECRET || lowercased email), so this table holds no addresses
  -- and its keyspace cannot be enumerated by guessing @ucsd.edu names.
  key         text        primary key,
  -- The sanitised record from src/lib/history/record.ts. jsonb rather than
  -- text so Postgres rejects anything that is not valid JSON at the door.
  record      jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- WHY THIS IS NOT OPTIONAL
-- Supabase publishes the anon key to every browser that loads the site. With
-- RLS off, that key can read this entire table — every student's transcript —
-- because PostgREST exposes any table in the public schema. Turning RLS on and
-- writing NO policy denies anon and authenticated outright; the service role
-- bypasses RLS, so the app keeps working and nothing else can touch it.
alter table public.academic_history enable row level security;

-- Belt and braces: even if a policy is added later by mistake, the API roles
-- have no table privileges to fall back on.
revoke all on public.academic_history from anon, authenticated;

-- One row per student, replaced on re-import, so this only grows with users.
comment on table public.academic_history is
  'UCSDPlans: one imported Academic History per student, keyed by a salted hash of their email. Service-role access only.';
