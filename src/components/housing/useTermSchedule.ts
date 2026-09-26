"use client";

import { useEffect, useState } from "react";
import { loadBuildings, loadSubject, type Building } from "@/lib/plat";
import {
  buildEvents, forcedSelection, groupSections, selectedSections,
  type CalEvent, type SectionSelection,
} from "@/lib/sections";
import { quarterByKey } from "@/lib/housing/terms";

/**
 * The week a student has built in the planner, read for the housing pages.
 *
 * Read-only on purpose. The planner's provider also writes its state back to
 * storage, auto-picks sections and syncs saved courses; mounting it here would
 * let a housing page change someone's schedule. This reads the same stored plan
 * and derives the same committed meetings — chosen sections only, never the
 * ghost options — which is all a commute needs.
 */

const STORAGE_KEY = "tritonplat-planner";

interface StoredCourse {
  course?: { code?: unknown; title?: unknown; departments?: unknown };
}

export interface TermSchedule {
  status: "loading" | "empty" | "ready";
  /** Weekly meetings of the sections chosen, with their buildings. */
  events: CalEvent[];
  buildings: Record<string, Building>;
  /** Courses on the schedule that have a meeting to go to. */
  courses: string[];
  /** Courses on the schedule with no section chosen yet — no room to measure to. */
  undecided: string[];
  /** "Fall 2026" */
  termName: string;
}

const EMPTY: TermSchedule = { status: "loading", events: [], buildings: {}, courses: [], undecided: [], termName: "" };

function readPlan(): { courses: { code: string; title: string; subject: string }[]; sections: Record<string, SectionSelection> } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
      schedule?: StoredCourse[];
      sections?: Record<string, SectionSelection>;
    } | null;
    const courses = (Array.isArray(raw?.schedule) ? raw.schedule : []).flatMap((s) => {
      const code = typeof s?.course?.code === "string" ? s.course.code : "";
      if (!code) return [];
      const depts = Array.isArray(s.course?.departments) ? s.course.departments : [];
      const subject = typeof depts[0] === "string" ? depts[0] : code.split(" ")[0];
      return [{ code, title: typeof s.course?.title === "string" ? s.course.title : code, subject }];
    });
    const sections = raw?.sections && typeof raw.sections === "object" ? raw.sections : {};
    return { courses, sections };
  } catch {
    return { courses: [], sections: {} };
  }
}

export function useTermSchedule(): TermSchedule {
  const [state, setState] = useState<TermSchedule>(EMPTY);

  useEffect(() => {
    let live = true;
    const { courses, sections } = readPlan();

    (async () => {
      const buildingsFile = await loadBuildings().catch(() => null);
      const buildings = buildingsFile?.buildings ?? {};
      const termName = quarterByKey(buildingsFile?.term)?.name ?? "this term";

      const subjects = [...new Set(courses.map((c) => c.subject))];
      const files = new Map(
        await Promise.all(
          subjects.map(async (s) => [s, await loadSubject(s).catch(() => null)] as const),
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
        termName,
      });
    })();

    return () => { live = false; };
  }, []);

  return state;
}
