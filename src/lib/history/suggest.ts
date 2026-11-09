/**
 * What to take next, from the saved Academic History and the plan.
 *
 * Every suggestion says why, and how sure that is:
 *
 *  - **Ready**: on the quarter's published schedule, and UCSD's prerequisites
 *    are met by a passed course in the history (or UCSD lists none).
 *  - **Conditional**: a prerequisite is under way now or planned for an
 *    earlier quarter. It holds only once that course is passed.
 *  - **Needs a check**: the prerequisite cannot be read with confidence, a
 *    grade is missing, consent or a restriction applies, or there is no
 *    history to check against. Never presented as eligible.
 *
 * A course already passed, under way, on this term's schedule or anywhere in
 * the 4-year plan is not suggested again. A course whose prerequisites the
 * history shows missing is left out. Grade averages and ratings only order
 * courses within the same requirement; they never outrank one.
 *
 * Requirements here are UCSDPlans' simplified unit targets, not a degree
 * audit. A course is said to count toward one only as an estimate, and when
 * the major has no modelled requirements its suggestions are labelled as
 * exploration, never as required.
 */

import { checkPrerequisites, prereqCheck, type StudentRecord } from "@/lib/planAi/eligibility";
import { checkText } from "@/lib/planAi/explain";
import { prereqCodes } from "@/lib/prereqs";
import { recommend, type RecommendationGroup } from "@/lib/plannerBridge";
import type { CourseDetail, CourseRow } from "@/lib/plat";
import type { Check } from "@/lib/planAi/types";

export type Bucket = "ready" | "conditional" | "review";

export interface Suggestion {
  row: CourseRow;
  bucket: Bucket;
  /** The requirement it is filed under, or null for exploration. */
  requirement: string | null;
  /** Units still to earn in that requirement, after what is passed, under way and planned. */
  remaining: number;
  /** Other requirements it would also count toward. */
  also: string[];
  /** The prerequisite check behind the bucket. */
  prereq: Check;
  /** The prerequisite check in words. */
  prereqText: string;
  /** For a conditional suggestion: what has to be passed first, and where it stands. */
  condition: string | null;
  /** Short notes beside the reason: "Open to undergraduates.", a restriction to check. */
  notes: string[];
}

export interface SuggestionInput {
  rows: CourseRow[];
  /** Units each requirement asks for. */
  targets: Record<string, number>;
  /** Units per requirement already covered: passed, under way and planned. */
  covered: Record<string, number>;
  /** Codes not to suggest: passed, under way, on the schedule, planned anywhere. */
  exclude: Set<string>;
  majorSubjects: Set<string>;
  collegeSlug: string | null;
  majorModelled: boolean;
}

/** Courses worth checking, in order, before their prerequisites are read. */
export function candidates(input: SuggestionInput, limit = 24): RecommendationGroup[] {
  const groups = recommend(
    input.rows, input.targets, input.covered, input.exclude,
    input.majorSubjects, input.collegeSlug, input.majorModelled,
  );
  // An even share per requirement, so one large requirement cannot crowd out the rest.
  const per = Math.max(3, Math.ceil(limit / Math.max(1, groups.length)));
  return groups.map((g) => ({ ...g, items: g.items.slice(0, per) }));
}

/** Subjects whose files hold the candidates' prerequisites. */
export const subjectsFor = (groups: RecommendationGroup[]) =>
  [...new Set(groups.flatMap((g) => g.items.map((i) => i.row.s)))];

function bucketOf(check: Check | undefined): Bucket | null {
  if (!check) return "review";
  if (check.code === "PREREQ_MISSING") return null;
  if (check.status === "pass") return "ready";
  if (check.code === "PREREQ_PLANNED") return "conditional";
  return "review";
}

/**
 * UCSD's restriction for "any undergraduate": every class level listed. An
 * Academic History read from TSS's Undergraduate tab meets it, so it is shown
 * as a note rather than a reason to doubt the course.
 */
const ANY_UNDERGRADUATE = /^Limited to class level:\s*(?=.*Freshman)(?=.*Sophomore)(?=.*Junior)(?=.*Senior)[A-Za-z ,]+$/;
/** Courses for graduate, medical or pharmacy students: never an undergraduate's next course. */
const NOT_UNDERGRADUATE = /Limited to academic level:\s*(?:Graduate|Medical|Pharmacy)/i;

export interface SuggestionList {
  items: Suggestion[];
  /**
   * Courses left out because their prerequisites name only courses the
   * Academic History does not show (taken, under way or planned). Counted so
   * the page can say so, never shown as eligible.
   */
  notYet: number;
}

/**
 * The suggestions, bucketed. `detail` gives a course's prerequisites; a
 * course whose details did not load is "needs a check", never "ready".
 */
export function buildSuggestions(
  groups: RecommendationGroup[],
  detail: (code: string) => Pick<CourseDetail, "pre" | "res"> | undefined,
  record: StudentRecord,
): SuggestionList {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  let notYet = 0;
  const known = (code: string) =>
    record.completed.has(code) || record.inProgress.has(code) || record.plannedBefore.has(code) || Boolean(record.unclear?.has(code));
  for (const g of groups) {
    for (const item of g.items) {
      if (seen.has(item.row.k)) continue;
      seen.add(item.row.k);
      const d = detail(item.row.k);
      if (d?.res && NOT_UNDERGRADUATE.test(d.res)) continue;
      const notes: string[] = [];
      let res = d?.res ?? null;
      if (res && ANY_UNDERGRADUATE.test(res.trim())) {
        notes.push("Open to undergraduates.");
        res = null;
      }
      const checks = d
        ? checkPrerequisites(item.row, d.pre, res, record)
        : [{ status: "unknown", code: "PREREQ_UNREADABLE", basis: "official", course: item.row.k, detail: { text: "Course details didn't load." } } satisfies Check];
      const restricted = checks.find((c) => c.code === "RESTRICTED");
      const check = prereqCheck(checks) ?? restricted;
      let bucket = bucketOf(check);
      if (bucket === null) continue;
      // Prerequisites too tangled to read, naming only courses the record
      // does not have: not eligible as far as anything here can tell.
      if (bucket === "review" && d && record.hasHistory && (check?.code === "PREREQ_UNREADABLE" || check?.code === "RESTRICTED")) {
        const named = prereqCodes(d.pre);
        if (named.length && !named.some(known)) { notYet++; continue; }
      }
      // A restriction (standing, major, consent) is a condition this cannot check.
      if (bucket === "ready" && restricted) bucket = "review";
      const shown = bucket === "review" && restricted && check?.status === "pass" ? restricted : check!;
      if (bucket === "conditional" && restricted) notes.push(checkText(restricted));
      const condition = bucket === "conditional" && shown.detail?.courses
        ? `Once you pass ${String(shown.detail.courses).split(", ").map((c) =>
          `${c} (${record.inProgress.has(c) ? "in progress now" : "planned earlier"})`).join(" and ")}.`
        : null;
      out.push({
        row: item.row,
        bucket,
        requirement: g.category,
        remaining: g.remaining,
        also: item.also,
        prereq: shown,
        prereqText: checkText(shown),
        condition,
        notes,
      });
    }
  }
  const order: Record<Bucket, number> = { ready: 0, conditional: 1, review: 2 };
  return { items: out.sort((a, b) => order[a.bucket] - order[b.bucket]), notYet };
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  ready: "Ready",
  conditional: "Conditional",
  review: "Needs a check",
};
