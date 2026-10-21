import {
  DEFAULT_MAJOR, DEFAULT_MINOR,
  type PastTerm, type PlanDocs, type PlannerDoc, type TermRatings,
} from "./record";
import { inTerm, laterTerm, termOf } from "./term";
import { mergeChangeLogs } from "./change";

/**
 * Bringing two copies of one student's plan back together.
 *
 * A plan lives on every device the student signs in on and in their account.
 * Most of the time only one copy has changed and there is nothing to decide.
 * When two have — a phone saved while a laptop tab held edits of its own —
 * overwriting either one silently throws away work, so the two are merged
 * against the last version both agreed on (`base`):
 *
 *  - something only one side changed keeps that change, including a removal;
 *  - something both sides changed differently goes to `local`, the device the
 *    student is using right now;
 *  - two sides adding the same course keep one copy of it.
 *
 * Everything here is pure, so every rule is pinned by merge.test.ts.
 */

/**
 * Equality for JSON data. Key order and keys holding `undefined` do not count:
 * a document that went through JSON.stringify and one that did not are the
 * same document.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameJson(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameJson(ra[k], rb[k]));
}

/** A value this side changed since `base` wins; otherwise the other side's. */
const pick = <T,>(base: T, local: T, remote: T): T => (sameJson(local, base) ? remote : local);

/** `a`, then whatever `b` has that `a` lacks. */
function union(a: string[], b: string[]): string[] {
  const out = [...a];
  const seen = new Set(a);
  for (const x of b) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/** Per key: a change on one side wins, a removal counts as a change. */
function mergeRecord<T>(base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(base)])) {
    const v = pick(base[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** The starred list: remote's order, minus what was unstarred here, plus what was starred here. */
function mergeSet(base: string[], local: string[], remote: string[]): string[] {
  const had = new Set(base);
  const have = new Set(local);
  const kept = remote.filter((x) => !had.has(x) || have.has(x));
  return union(kept, local.filter((x) => !had.has(x)));
}

/**
 * A list of entries with stable ids (the schedule, the four-year plan).
 *
 * Remote's entries come first in remote's order, less the ones removed here and
 * with this side's edits applied; entries added here follow. An addition is
 * skipped when an entry for the same course is already there, since the
 * planner keeps one of each.
 */
function mergeList<T>(
  base: T[], local: T[], remote: T[],
  id: (x: T) => string,
  courseOf: (x: T) => string,
): T[] {
  const inBase = new Map(base.map((x) => [id(x), x]));
  const inLocal = new Map(local.map((x) => [id(x), x]));
  const out: T[] = [];
  const ids = new Set<string>();
  const courses = new Set<string>();
  const put = (x: T) => {
    out.push(x);
    ids.add(id(x));
    courses.add(courseOf(x));
  };

  for (const r of remote) {
    const b = inBase.get(id(r));
    const l = inLocal.get(id(r));
    if (b !== undefined && l === undefined) continue;
    put(b !== undefined && l !== undefined && !sameJson(l, b) ? l : r);
  }
  for (const l of local) {
    if (inBase.has(id(l)) || ids.has(id(l)) || courses.has(courseOf(l))) continue;
    put(l);
  }
  return out;
}

/**
 * Whichever value was actually chosen: the account's, unless the account's is
 * still the default and this device's is not. A default says nothing about the
 * student, so it should not overrule a choice they made on another device.
 */
function chosen<T>(remote: T, local: T, fallback: T): T {
  return sameJson(remote, fallback) && !sameJson(local, fallback) ? local : remote;
}

/** Both sides rated the same instructor: the later rating stands. */
function newestRatings(local: TermRatings, remote: TermRatings): TermRatings {
  const out = { ...local, ...remote };
  for (const [k, l] of Object.entries(local)) {
    if (remote[k] && l.at > remote[k].at) out[k] = l;
  }
  return out;
}

/**
 * The plan with its term, earlier terms and Plan with AI's change log set,
 * each left off when there is nothing to say. Both sides' logs are kept: a
 * change either device saw happened, and an undo recorded on either stands.
 */
function withTerms(
  p: PlannerDoc,
  term: string | undefined,
  past: Record<string, PastTerm>,
  logs: [PlannerDoc, PlannerDoc],
): PlannerDoc {
  const out: PlannerDoc = { ...p };
  if (term) out.term = term;
  if (Object.keys(past).length) out.past = past;
  const log = mergeChangeLogs(logs[0].log, logs[1].log);
  if (log.length) out.log = log;
  return out;
}

/**
 * The term two copies should meet in when they were made against different
 * terms' schedules — the later one — so one term's section picks are never
 * merged into another's. Null when they agree.
 */
function meetingTerm(local: PlannerDoc, remote: PlannerDoc): string | null {
  return termOf(local) === termOf(remote) ? null : laterTerm(termOf(local), termOf(remote));
}

function adoptPlanner(local: PlannerDoc, remote: PlannerDoc): PlannerDoc {
  const term = meetingTerm(local, remote);
  if (term) {
    local = inTerm(local, term);
    remote = inTerm(remote, term);
  }
  const ids = new Set(remote.schedule.map((e) => e.id));
  const scheduled = new Set(remote.schedule.map((e) => e.course.code));
  const plannedIds = new Set(remote.planned.map((e) => e.courseId));
  const planned = new Set(remote.planned.map((e) => e.course.code));
  return withTerms({
    major: chosen(remote.major, local.major, DEFAULT_MAJOR),
    minor: chosen(remote.minor, local.minor, DEFAULT_MINOR),
    college: chosen(remote.college, local.college, null),
    schedule: [
      ...remote.schedule,
      ...local.schedule.filter((e) => !ids.has(e.id) && !scheduled.has(e.course.code)),
    ],
    planned: [
      ...remote.planned,
      ...local.planned.filter((e) => !plannedIds.has(e.courseId) && !planned.has(e.course.code)),
    ],
    synced: union(remote.synced, local.synced),
    // The account's pick for a course it already has; this device's for the rest.
    sections: { ...local.sections, ...remote.sections },
  }, remote.term ?? local.term, { ...local.past, ...remote.past }, [remote, local]);
}

function mergePlanner(base: PlannerDoc | null, local: PlannerDoc | null, remote: PlannerDoc | null): PlannerDoc | null {
  if (!local) return remote;
  if (!remote) return local;
  // Both sides started a planner without ever agreeing on one.
  if (!base) return adoptPlanner(local, remote);
  const term = meetingTerm(local, remote);
  if (term) {
    local = inTerm(local, term);
    remote = inTerm(remote, term);
    base = inTerm(base, term);
  }
  return withTerms({
    major: pick(base.major, local.major, remote.major),
    minor: pick(base.minor, local.minor, remote.minor),
    college: pick(base.college, local.college, remote.college),
    schedule: mergeList(base.schedule, local.schedule, remote.schedule, (e) => e.id, (e) => e.course.code),
    planned: mergeList(base.planned, local.planned, remote.planned, (e) => e.courseId, (e) => e.course.code),
    // Only ever grows: it records which starred courses have been placed once.
    synced: union(remote.synced, local.synced),
    sections: mergeRecord(base.sections, local.sections, remote.sections),
  }, pick(base.term, local.term, remote.term), mergeRecord(base.past ?? {}, local.past ?? {}, remote.past ?? {}), [remote, local]);
}

/**
 * Folds this device's edits (`local`, made since `base`) into the account's
 * newer copy (`remote`).
 */
export function mergeDocs(base: PlanDocs, local: PlanDocs, remote: PlanDocs): PlanDocs {
  return {
    planner: mergePlanner(base.planner, local.planner, remote.planner),
    shortlist: mergeSet(base.shortlist, local.shortlist, remote.shortlist),
    ratings: mergeRecord(base.ratings, local.ratings, remote.ratings),
  };
}

/**
 * A device's plan from before plans were kept with accounts, meeting an account
 * that already holds one — the student used two devices, and each built part
 * of a plan. There is no shared base to tell edits from old data, so nothing is
 * removed: the account's plan stands, and this device adds what it lacks.
 */
export function adoptLegacy(local: PlanDocs, remote: PlanDocs): PlanDocs {
  return {
    planner: local.planner && remote.planner
      ? adoptPlanner(local.planner, remote.planner)
      : remote.planner ?? local.planner,
    shortlist: union(remote.shortlist, local.shortlist),
    ratings: newestRatings(local.ratings, remote.ratings),
  };
}
