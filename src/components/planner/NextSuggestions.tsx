"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { usePlanner, type Quarter, type Year } from "@/app/planner/PlannerProvider";
import { MAJOR_REQUIREMENTS } from "@/data/requirements";
import { collegeName, type CourseDetail } from "@/lib/plat";
import { loadSubjectFor } from "@/lib/termData";
import { programLabel } from "@/data/ucsdMajorsMinors";
import { studentRecord } from "@/lib/planAi/eligibility";
import { platRowToCourse } from "@/lib/plannerBridge";
import { BUCKET_LABEL, buildSuggestions, candidates, subjectsFor, type Bucket, type Suggestion } from "@/lib/history/suggest";
import { planYearOf, slotKey } from "@/lib/history/planLayer";
import { termQuarter } from "@/lib/planSlot";
import { termStarted } from "@/lib/history/terms";
import { DEGREE_AUDIT_URL } from "@/lib/links";

const PER_BUCKET = 3;
const PLAN_ORDER: Record<Quarter, number> = { Fall: 0, Winter: 1, Spring: 2 };

const BUCKET_HELP: Record<Bucket, string> = {
  ready: "On the schedule, and your Academic History shows the prerequisites passed (or UCSD lists none).",
  conditional: "Holds only once a course you're taking now, or have planned earlier, is passed.",
  review: "Prerequisites, a restriction or a missing grade couldn't be confirmed. Check before you plan on it.",
};

/**
 * Suggestions for the quarter on screen, from the saved Academic History, the
 * plan and UCSDPlans' simplified targets. Shown on their own; nothing is
 * added to the plan until the student presses Add.
 */
export default function NextSuggestions() {
  const {
    darkMode, platRows, activeRequirements, coveredUnits, historyCodes, plannedCourses, selectedCourses,
    majorSubjectSet, selectedCollege, selectedMajor, term, termName, termStatus, history, historyStatus,
    today, historyLayer, plannerYear, plannerQuarter, addToPlanSlot,
  } = usePlanner();

  const planStart = history?.planStart ?? null;
  const quarter = termQuarter(term);
  // Where Add puts a course: the quarter's own slot when the plan is placed, else the pickers above.
  const anchoredYear = planStart != null && term ? planYearOf(term, planStart) : null;
  const target: { year: Year; quarter: Quarter; exact: boolean } = anchoredYear && anchoredYear >= 1 && anchoredYear <= 4 && quarter
    ? { year: anchoredYear as Year, quarter, exact: true }
    : { year: plannerYear, quarter: plannerQuarter, exact: false };

  const exclude = useMemo(() => new Set([
    ...historyCodes,
    ...plannedCourses.map((p) => p.course.code),
    ...selectedCourses.map((s) => s.course.code),
  ]), [historyCodes, plannedCourses, selectedCourses]);

  const collegeSlug = selectedCollege ? selectedCollege.toLowerCase() : null;
  const groups = useMemo(() => (platRows.length ? candidates({
    rows: platRows,
    targets: activeRequirements,
    covered: coveredUnits,
    exclude,
    majorSubjects: majorSubjectSet,
    collegeSlug,
    majorModelled: Boolean(MAJOR_REQUIREMENTS[selectedMajor]),
  }) : []), [platRows, activeRequirements, coveredUnits, exclude, majorSubjectSet, collegeSlug, selectedMajor]);

  // Prerequisites live in the subject files; only the candidates' subjects are fetched.
  const subjects = useMemo(() => subjectsFor(groups).sort(), [groups]);
  const subjectKey = subjects.join(",");
  const wanted = `${term}|${subjectKey}`;
  const [details, setDetails] = useState<{ key: string; term: string; map: Record<string, CourseDetail>; failed: boolean }>(
    { key: "", term: "", map: {}, failed: false },
  );
  useEffect(() => {
    if (!term || !subjectKey) return;
    let live = true;
    Promise.allSettled(subjectKey.split(",").map((s) => loadSubjectFor(s, term)))
      .then((results) => {
        if (!live) return;
        const map: Record<string, CourseDetail> = {};
        for (const r of results) if (r.status === "fulfilled") Object.assign(map, r.value.courses);
        setDetails({ key: `${term}|${subjectKey}`, term, map, failed: results.some((r) => r.status === "rejected") });
      });
    return () => { live = false; };
  }, [term, subjectKey]);
  // Still fetching whenever the details on hand are for another quarter or another set of subjects.
  const loading = Boolean(subjectKey) && details.key !== wanted;
  const failed = details.key === wanted && details.failed;

  const record = useMemo(() => {
    const at = target.year * 3 + PLAN_ORDER[target.quarter];
    const before = plannedCourses
      .filter((p) => !historyLayer.matched.has(p.courseId) && p.year * 3 + PLAN_ORDER[p.quarter] < at)
      .map((p) => p.course.code);
    return studentRecord(history, before, today);
  }, [history, plannedCourses, historyLayer, target.year, target.quarter, today]);

  const built = useMemo(
    () => (details.term === term ? buildSuggestions(groups, (code) => details.map[code], record) : { items: [], notYet: 0 }),
    [groups, details, term, record],
  );
  const list = built.items;
  const [open, setOpen] = useState<Set<Bucket>>(() => new Set());
  const [added, setAdded] = useState<string | null>(null);

  if (termStatus !== "ready" || !term) return null;
  const started = termStarted(term, today);
  const quiet = darkMode ? "text-gray-300" : "text-gray-600";
  const slotLabel = `Year ${target.year} ${target.quarter}`;
  const basis = [programLabel(selectedMajor), selectedCollege ? collegeName(selectedCollege) : null].filter(Boolean).join(" and ");

  const add = (s: Suggestion) => {
    addToPlanSlot(platRowToCourse(s.row, majorSubjectSet), target.year, target.quarter);
    setAdded(`${s.row.k} added to ${slotLabel}.`);
  };

  return (
    <section aria-labelledby="next-title" className={`mt-6 rounded-xl border p-4 ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"}`}>
      <h2 id="next-title" className={`text-sm font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
        Suggested for {termName}
      </h2>
      <p className={`mt-1 text-xs leading-relaxed ${quiet}`}>
        From {historyStatus === "saved" ? "your Academic History, " : ""}your plan and simplified unit targets for {basis}.
        Not a degree audit: check your{" "}
        <a href={DEGREE_AUDIT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
          degree audit
          <ExternalLink aria-hidden className="h-3 w-3" />
          <span className="sr-only"> (opens UCSD&rsquo;s page in a new tab)</span>
        </a>{" "}
        before you rely on one.
        {!selectedCollege && " Choose your college (top right) to include its GE requirements."}
      </p>
      {historyStatus !== "saved" && (
        <p className={`mt-2 text-xs ${quiet}`}>
          <Link href="/import" className="font-semibold underline underline-offset-2">Import your Academic History</Link>{" "}
          so prerequisites can be checked. Until then only courses with no prerequisites are called ready.
        </p>
      )}
      {started && (
        <p className={`mt-2 text-xs ${quiet}`}>
          {termName} is already under way. Choose the next quarter in the quarter menu to plan it.
        </p>
      )}
      {!target.exact && (
        <p className={`mt-2 text-xs ${quiet}`}>
          Add puts a course in {slotLabel}, from the Year and Quarter menus above.
        </p>
      )}

      <p role="status" className="mt-2 text-xs font-semibold text-emerald-800 empty:hidden dark:text-emerald-300">{added ?? ""}</p>

      {loading && !list.length && (
        <p className={`mt-3 flex items-center gap-2 text-xs ${quiet}`}>
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> Checking prerequisites…
        </p>
      )}
      {failed && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          Some course details didn&rsquo;t load, so those courses are marked Needs a check.
        </p>
      )}
      {!loading && details.term === term && !list.length && (
        <p className={`mt-3 text-xs ${quiet}`}>
          Nothing to suggest for {termName}: every requirement UCSDPlans tracks for {basis} is already covered by
          courses you&rsquo;ve taken, are taking or have planned.
        </p>
      )}

      {built.notYet > 0 && (
        <p className={`mt-3 text-xs ${quiet}`}>
          {built.notYet} more {built.notYet === 1 ? "course needs" : "courses need"} prerequisites your Academic History
          doesn&rsquo;t show yet, so {built.notYet === 1 ? "it isn’t" : "they aren’t"} listed.
        </p>
      )}

      {(["ready", "conditional", "review"] as Bucket[]).map((bucket) => {
        const items = list.filter((s) => s.bucket === bucket);
        if (!items.length) return null;
        const shown = open.has(bucket) ? items : items.slice(0, PER_BUCKET);
        return (
          <div key={bucket} className="mt-4">
            <h3 className={`text-xs font-semibold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
              {BUCKET_LABEL[bucket]} <span className={`font-normal ${quiet}`}>· {items.length}</span>
            </h3>
            <p className={`text-[11px] leading-snug ${quiet}`}>{BUCKET_HELP[bucket]}</p>
            <ul className="mt-2 space-y-2">
              {shown.map((s) => (
                <li key={s.row.k} className={`flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg px-3 py-2 ${darkMode ? "bg-gray-700/50" : "bg-slate-50"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <Link href={`/course/${s.row.s}/${s.row.c}?term=${term}`} className="font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                        {s.row.k}
                      </Link>{" "}
                      <span className={darkMode ? "text-gray-200" : "text-gray-700"}>{s.row.t}</span>
                    </p>
                    <p className={`text-[11px] leading-snug ${quiet}`}>
                      {s.requirement
                        ? `Counts toward ${s.requirement} (an estimate; ${s.remaining} units left there).`
                        : "Exploration: a common course in your major's subjects. Not a confirmed requirement."}
                      {" "}On UCSD&rsquo;s {termName} schedule.
                    </p>
                    <p className={`text-[11px] leading-snug ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
                      {s.condition ?? s.prereqText}{s.notes.length ? ` ${s.notes.join(" ")}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => add(s)}
                    disabled={plannedCourses.some((p) => p.course.code === s.row.k && slotKey(p.year, p.quarter) === slotKey(target.year, target.quarter))}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold hover:bg-white disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
                  >
                    <Plus aria-hidden className="h-3.5 w-3.5" />
                    Add to {slotLabel}
                    <span className="sr-only">: {s.row.k}</span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length > PER_BUCKET && (
              <button
                type="button"
                onClick={() => setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(bucket)) next.delete(bucket); else next.add(bucket);
                  return next;
                })}
                aria-expanded={open.has(bucket)}
                className={`mt-1 text-xs font-semibold underline underline-offset-2 ${quiet}`}
              >
                {open.has(bucket) ? "Show fewer" : `Show ${items.length - PER_BUCKET} more`}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
