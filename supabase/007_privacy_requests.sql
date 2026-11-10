-- UCSDPlans: let a student's "delete my data" request be completed, and remove
-- counters left behind by a retired feature.
--
-- Run this ONCE in the Supabase SQL editor of the project that serves
-- ucsdplans.com (ref acvensugaqcdpbccouhm): Dashboard -> SQL Editor -> New
-- query -> paste -> Run. It is idempotent, so running it again is harmless.

-- 1. scripts/student-data.ts deletes a student's saved plan when they ask. The
--    app itself never deletes a plan (it only saves new revisions), so
--    003_student_plan.sql gave the service role no DELETE on the table.
grant delete on public.student_plan to service_role;

-- 2. The AI course search on /discover was retired on 2026-10-21 (Plan with AI
--    replaced it). Its table kept a keyed hash per student and daily counts,
--    and only that feature ever cleared old rows, so they would now stay
--    forever. The Privacy Policy says usage counts last 35 days: drop them.
drop function if exists public.reserve_course_search(text);
drop table if exists public.course_search_usage;

-- The app reaches tables through Supabase's REST API, which answers from a
-- cached copy of the schema; refresh it now rather than later.
notify pgrst, 'reload schema';
