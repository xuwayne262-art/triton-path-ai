"use client";

import { useEffect, useState } from "react";
import { loadBuildings, type Building } from "@/lib/plat";
import {
  buildEvents, forcedSelection, groupSections, selectedSections,
  type CalEvent, type SectionSelection,
} from "@/lib/sections";
import { cleanPlanner } from "@/lib/plan/record";
import { PLANNER_EVENT, PLANNER_KEY, useAccountSync } from "@/lib/plan/sync";
import { commuteTerm, picksFor } from "@/lib/plan/term";
import { loadSubjectFor } from "@/lib/termData";
import { termEntry, termsServed } from "@/lib/terms";

/**
 * The week a student has built in the planner, read for the housing pages.
 *
 * Read-only on purpose. The planner's provider also writes its state back to
 * storage, auto-picks sections and syncs saved courses; mounting it here would
 * let a housing page change someone's schedule. This reads the same stored plan
 * and derives the same committed meetings — chosen sections only, never the
 * ghost options — which is all a commute needs.
 *
 * On a device that has never opened the planner, the stored plan arrives from
 * the student's account a moment after the page loads, so the week is worked
 * out again whenever the sync replaces it.
 *
 * A commute needs rooms, so it is measured to the newest quarter whose
 * schedule lists them (see commuteTerm). Winter 2027's public schedule has
 * none yet, so a student with Winter courses is told their Fall classes are used.
 */

export interface TermSchedule {
  status: "loading" | "empty" | "ready";
  /** Weekly meetings of the sections chosen, with their buildings. */
  events: CalEvent[];
  buildings: Record<string, Building>;
  /** Courses on the schedule that have a meeting to go to. */
  courses: string[];
  /** Courses on the schedule with no section chosen yet — no room to measure to. */
  undecided: string[];
  /** "FA26": the quarter measured to, so a link to the Planner opens that quarter. */
  term: string | null;
  /** "Fall 2026" */
  termName: string;
  /** "Winter 2027": a later quarter with courses whose schedule lists no rooms, so it was not used. */
  passedOver: string | null;
}

const EMPTY: TermSchedule = { status: "loading", events: [], buildings: {}, courses: [], undecided: [], term: null, termName: "", passedOver: null };

/** The courses and section picks of the quarter a commute is measured to. */
function readPlan(): { term: string | null; passedOver: string | null; courses: { code: string; title: string; subject: string }[]; sections: Record<string, SectionSelection> } {
  let doc = null;
  try { doc = cleanPlanner(JSON.parse(localStorage.getItem(PLANNER_KEY) ?? "null")); } catch { /* unreadable: no plan */ }
  const { term, passedOver } = commuteTerm(doc, termsServed().map((t) => ({ code: t.code, name: t.name, rooms: t.features.rooms })));
  if (!doc || !term) return { term, passedOver, courses: [], sections: {} };
  const picks = picksFor(doc, term);
  const courses = picks.schedule.flatMap((s) => {
    const code = s.course?.code ?? "";
    if (!code) return [];
    const subject = s.course.departments?.[0] ?? code.split(" ")[0];
    return [{ code, title: s.course.title || code, subject }];
  });
  return { term, passedOver, courses, sections: picks.sections ?? {} };
}

export function useTermSchedule(): TermSchedule {
  useAccountSync();
  const [state, setState] = useState<TermSchedule>(EMPTY);
  /** Bumped when the stored plan is replaced by the account's copy. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onSynced = () => setVersion((v) => v + 1);
    window.addEventListener(PLANNER_EVENT, onSynced);
    return () => window.removeEventListener(PLANNER_EVENT, onSynced);
  }, []);

  useEffect(() => {
    let live = true;
    const { term, passedOver, courses, sections } = readPlan();

    (async () => {
      const buildingsFile = await loadBuildings().catch(() => null);
      const buildings = buildingsFile?.buildings ?? {};
      const termName = termEntry(term)?.name ?? "this term";

      const subjects = [...new Set(courses.map((c) => c.subject))];
      const files = new Map(
        await Promise.all(
          subjects.map(async (s) => [s, term ? await loadSubjectFor(s, term).catch(() => null) : null] as const),
        ),
      );

      const sources = courses.map((c) => {
        const sec = files.get(c.subject)?.courses[c.code]?.sec ?? [];
        const families = groupSections(sec);
        // The planner makes the choices that are not choices (a lone lecture)
        // as soon as it sees them; a schedule saved before it did is read the same way.
        const pick = sections[c.code] ?? forcedSelection(families) ?? undefined;
        return { code: c.code, title: c.title, role: "elective" as const, sections: selectedSections(families, pick) };
      });
      const events = buildEvents(sources);
      const withMeetings = new Set(events.map((e) => e.code));

      if (!live) return;
      setState({
        status: courses.length ? "ready" : "empty",
        events,
        buildings,
        courses: courses.map((c) => c.code).filter((c) => withMeetings.has(c)),
        undecided: courses.map((c) => c.code).filter((c) => !withMeetings.has(c)),
        term,
        termName,
        passedOver,
      });
    })();

    return () => { live = false; };
  }, [version]);

  return state;
}
