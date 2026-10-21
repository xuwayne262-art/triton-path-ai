-- UCSDPlans: Plan with AI's model budget, its shared counters, and daily
-- operational metrics.
--
-- Run this ONCE in the Supabase SQL editor of the project that serves
-- ucsdplans.com (ref acvensugaqcdpbccouhm, the one with student_plan):
-- Dashboard -> SQL Editor -> New query -> paste -> Run. It is idempotent,
-- so running it again is harmless. Run it before setting PLAN_AI_ENABLED.
--
-- Every model call is reserved here first, against three limits checked in
-- one transaction: per student per day, site-wide per day, and site-wide per
-- minute. Days follow Pacific time, as Gemini's daily quota does. Set the
-- limits in plan_ai_budget BELOW the free-tier limits Google AI Studio shows
-- for the project's model, with room to spare; these defaults are
-- deliberately low. Failed model calls still count.
--
-- Stored: a keyed hash per student (no address, no request text), counts,
-- and per-day event totals. Usage rows are kept 35 days.

create table if not exists public.plan_ai_budget (
  id boolean primary key default true check (id),
  per_student_daily integer not null default 20 check (per_student_daily >= 0),
  site_daily integer not null default 150 check (site_daily >= 0),
  site_per_minute integer not null default 8 check (site_per_minute >= 0),
  updated_at timestamptz not null default now()
);
insert into public.plan_ai_budget (id) values (true) on conflict (id) do nothing;

create table if not exists public.plan_ai_usage (
  -- 'day:2026-10-21' (a Pacific day) or 'min:2026-10-21T17:05' (a UTC minute).
  bucket text not null,
  -- A keyed hash of the student, or 'site'.
  owner text not null,
  n integer not null default 0 check (n >= 0),
  created_at timestamptz not null default now(),
  primary key (bucket, owner)
);

create table if not exists public.plan_ai_metric (
  day date not null,
  event text not null,
  n bigint not null default 0,
  primary key (day, event)
);

alter table public.plan_ai_budget enable row level security;
alter table public.plan_ai_usage enable row level security;
alter table public.plan_ai_metric enable row level security;
revoke all on public.plan_ai_budget, public.plan_ai_usage, public.plan_ai_metric from public, anon, authenticated;
grant select, insert, update, delete on public.plan_ai_budget, public.plan_ai_usage, public.plan_ai_metric to service_role;

create or replace function public.reserve_plan_ai(owner_key text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  b public.plan_ai_budget;
  local_now timestamp := now() at time zone 'America/Los_Angeles';
  day_bucket text := 'day:' || to_char(local_now, 'YYYY-MM-DD');
  min_bucket text := 'min:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  until_midnight integer := greatest(1, ceil(extract(epoch from (date_trunc('day', local_now) + interval '1 day' - local_now)))::integer);
  site_minute integer;
  site_day integer;
  student_day integer;
begin
  if owner_key is null or owner_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid owner';
  end if;
  -- One lock makes all three counters atomic across serverless instances.
  perform pg_advisory_xact_lock(812630522);
  select * into b from public.plan_ai_budget where id;
  select n into site_minute from public.plan_ai_usage where bucket = min_bucket and owner = 'site';
  select n into site_day from public.plan_ai_usage where bucket = day_bucket and owner = 'site';
  select n into student_day from public.plan_ai_usage where bucket = day_bucket and owner = owner_key;
  if coalesce(site_minute, 0) >= b.site_per_minute then
    return jsonb_build_object('ok', false, 'reason', 'site_minute', 'retry_after', greatest(1, 60 - floor(extract(second from now()))::integer));
  end if;
  if coalesce(site_day, 0) >= b.site_daily then
    return jsonb_build_object('ok', false, 'reason', 'site_day', 'retry_after', until_midnight);
  end if;
  if coalesce(student_day, 0) >= b.per_student_daily then
    return jsonb_build_object('ok', false, 'reason', 'student_day', 'retry_after', until_midnight);
  end if;
  insert into public.plan_ai_usage (bucket, owner, n)
    values (min_bucket, 'site', 1), (day_bucket, 'site', 1), (day_bucket, owner_key, 1)
    on conflict (bucket, owner) do update set n = public.plan_ai_usage.n + 1;
  delete from public.plan_ai_usage
    where (bucket like 'min:%' and created_at < now() - interval '1 day')
       or created_at < now() - interval '35 days';
  return jsonb_build_object('ok', true, 'remaining', b.per_student_daily - coalesce(student_day, 0) - 1);
end;
$$;

create or replace function public.bump_plan_ai_metric(event_name text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if event_name is null or event_name !~ '^[a-z_]{3,40}$' then
    raise exception 'Invalid event';
  end if;
  insert into public.plan_ai_metric (day, event, n)
    values ((now() at time zone 'America/Los_Angeles')::date, event_name, 1)
    on conflict (day, event) do update set n = public.plan_ai_metric.n + 1;
end;
$$;

revoke all on function public.reserve_plan_ai(text) from public, anon, authenticated;
revoke all on function public.bump_plan_ai_metric(text) from public, anon, authenticated;
grant execute on function public.reserve_plan_ai(text) to service_role;
grant execute on function public.bump_plan_ai_metric(text) to service_role;
notify pgrst, 'reload schema';

-- To see the last week of Plan with AI (no student data in it):
--   select * from public.plan_ai_metric where day > current_date - 7 order by day desc, event;
-- To change the limits:
--   update public.plan_ai_budget set per_student_daily = 20, site_daily = 150, site_per_minute = 8, updated_at = now();
