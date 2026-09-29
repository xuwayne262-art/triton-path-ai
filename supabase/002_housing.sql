-- UCSDPlans — storage for housing listings and their photos.
--
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). It is idempotent, so running it again is harmless.
--
-- The application reaches both the table and the bucket with the SERVICE ROLE
-- key, from server code only. See src/lib/housing/store.ts.

create table if not exists public.housing_listing (
  -- The random id in the listing's URL, /housing/<id>.
  id          text        primary key,
  -- sha256(AUTH_SECRET || "housing" || lowercased email): who may edit it,
  -- without this table holding who that is.
  owner       text        not null,
  -- The listing as src/lib/housing/listing.ts rebuilt it. It includes the
  -- contact details the poster chose to publish to signed-in students.
  record      jsonb       not null,
  updated_at  timestamptz not null default now()
);

create index if not exists housing_listing_owner_idx on public.housing_listing (owner);

-- Same rule as academic_history, for the same reason: the anon key is public,
-- PostgREST serves every table in `public`, and listings carry students' phone
-- numbers and addresses. RLS on with NO policy leaves the service role as the
-- only thing that can read or write this table.
alter table public.housing_listing enable row level security;
revoke all on public.housing_listing from anon, authenticated;

-- The service role bypasses RLS but still needs table privileges. Supabase
-- normally grants them to new tables by default; saying so explicitly keeps
-- this working in a project where that default has been turned off. The app
-- reads, upserts (insert + update) and deletes listings.
grant select, insert, update, delete on public.housing_listing to service_role;

comment on table public.housing_listing is
  'UCSDPlans: sublets and rooms posted by signed-in @ucsd.edu students. Service-role access only.';

-- Listing photos: a PRIVATE bucket. Students see them through
-- /api/housing/photos/<ref>, behind the same sign-in as every other page;
-- nothing here is reachable with the anon key. The browser re-encodes each
-- photo to JPEG (which strips its GPS data) before upload, so JPEG is all the
-- bucket needs to accept.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('housing-photos', 'housing-photos', false, 716800, array['image/jpeg'])
on conflict (id) do nothing;

-- The app reaches the table through Supabase's REST API, which answers from a
-- cached copy of the schema. This makes sure the table is usable the moment
-- this script finishes rather than "not found" until the cache catches up.
notify pgrst, 'reload schema';
