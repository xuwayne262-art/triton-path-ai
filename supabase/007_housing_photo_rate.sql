-- UCSDPlans: one shared limit on housing photo uploads.
--
-- Run this ONCE in the Supabase SQL editor of the project that serves
-- ucsdplans.com (the one with housing_listing): Dashboard -> SQL Editor ->
-- New query -> paste -> Run. It is idempotent, so running it again is
-- harmless.
--
-- /api/housing/photos used to count uploads in each server instance's memory.
-- Serverless instances share no memory, so that was a brake, not a limit.
-- This counts them here, in one transaction per upload, so every instance
-- sees the same count. Without it the upload route answers 503 rather than
-- running with no limit.
--
-- Stored: a keyed hash of the uploader (no address) and a count per hour.
-- Rows are kept two days.

create table if not exists public.housing_photo_rate (
  -- 'hour:2026-11-02T17' (a UTC hour).
  bucket text not null,
  owner text not null,
  n integer not null default 0 check (n >= 0),
  created_at timestamptz not null default now(),
  primary key (bucket, owner)
);

alter table public.housing_photo_rate enable row level security;
revoke all on public.housing_photo_rate from public, anon, authenticated;
grant select, insert, update, delete on public.housing_photo_rate to service_role;

create or replace function public.reserve_housing_photo(owner_key text, per_hour integer)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  hour_bucket text := 'hour:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24');
  used integer;
begin
  if owner_key is null or owner_key !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'Invalid owner';
  end if;
  if per_hour is null or per_hour < 1 or per_hour > 500 then
    raise exception 'Invalid limit';
  end if;
  insert into public.housing_photo_rate (bucket, owner, n) values (hour_bucket, owner_key, 1)
    on conflict (bucket, owner) do update set n = public.housing_photo_rate.n + 1
    returning n into used;
  delete from public.housing_photo_rate where created_at < now() - interval '2 days';
  if used > per_hour then
    return jsonb_build_object('ok', false, 'retry_after',
      greatest(1, ceil(extract(epoch from (date_trunc('hour', now()) + interval '1 hour' - now())))::integer));
  end if;
  return jsonb_build_object('ok', true, 'remaining', per_hour - used);
end;
$$;

revoke all on function public.reserve_housing_photo(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_housing_photo(text, integer) to service_role;
notify pgrst, 'reload schema';
