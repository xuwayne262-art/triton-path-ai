-- Apply before enabling AI_COURSE_SEARCH_ENABLED. No addresses or prompts are stored.
create table if not exists public.course_search_usage (
  day date not null,
  owner text not null,
  attempts integer not null check (attempts >= 0),
  primary key (day, owner)
);
alter table public.course_search_usage enable row level security;
revoke all on public.course_search_usage from public, anon, authenticated;
grant select, insert, update, delete on public.course_search_usage to service_role;

create or replace function public.reserve_course_search(owner_key text)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  global_used integer;
  user_used integer;
begin
  if owner_key is null or owner_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid owner';
  end if;
  -- One shared transaction lock makes both counters atomic across serverless instances.
  perform pg_advisory_xact_lock(812630521);
  select attempts into global_used from public.course_search_usage where day = today and owner = 'global';
  select attempts into user_used from public.course_search_usage where day = today and owner = owner_key;
  -- Hard caps: 10 attempts/student/day; 200 across the site/day. Failed model calls count.
  if coalesce(global_used, 0) >= 200 or coalesce(user_used, 0) >= 10 then return false; end if;
  insert into public.course_search_usage(day, owner, attempts) values (today, 'global', 1), (today, owner_key, 1)
    on conflict (day, owner) do update set attempts = public.course_search_usage.attempts + 1;
  delete from public.course_search_usage where day < today - 30;
  return true;
end;
$$;
revoke all on function public.reserve_course_search(text) from public, anon, authenticated;
grant execute on function public.reserve_course_search(text) to service_role;
notify pgrst, 'reload schema';
