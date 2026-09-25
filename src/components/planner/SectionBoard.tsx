"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarSearch, Check, ChevronDown, CornerDownLeft, ExternalLink, Footprints,
  Loader2, MapPin, Plus, Search, Star, Trash2, Wand2,
} from "lucide-react";
import { GradeBadge } from "@/components/plat/Grade";
import { courseHref, searchCourses, type Building, type CourseRow, type SectionTuple } from "@/lib/plat";
import { ROLE_STYLES, type CourseRole } from "@/lib/plannerBridge";
import { formatDistance, previewWalks, type LegStatus } from "@/lib/campus";
import {
  CODE, INSTRUCTOR, TYPE,
  clashingCourses, eventsForRow, findFamily, groupSections, isWaitlistOnly, rowsFor,
  sectionSeats, sectionTssUrl, sectionWaitlist, sectionWhere, shortWhen, typeLabel,
  type CalEvent, type LectureFamily, type SectionPart, type SectionSelection,
} from "@/lib/sections";
import type { Course } from "@/components/triton/types";
import type { ScheduleCourse, SectionStatus } from "@/app/planner/PlannerProvider";

/**
 * The term's sections, chosen where you can see them.
 *
 * Sections used to sit two clicks deep — a "Schedule" tab, then a "Choose
 * sections" expander per course — so a course went onto the calendar as a
 * bare "Meeting" block and the discussion it needed was never in view. Here
 * every course lists its options as it arrives, each option says what it
 * costs you — the class it collides with, the walk it leaves you, the seats
 * left — and hovering one draws it on the calendar and the map before you
 * commit to it.
 */

/** An option being hovered: drawn as a ghost on the calendar and the map. */
export interface Preview {
  code: string;
  rows: SectionTuple[];
  /** "Discussion A02" */
  label: string;
}

// ── Option facts ─────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "bad" | "none";

function seatTag(s: SectionTuple): { text: string; tone: Tone } {
  const seats = sectionSeats(s);
  const queued = sectionWaitlist(s) ?? 0;
  // Class Planner's own status outranks the seat count: a section it lists as
  // waitlist-only is taking a queue whatever the open number says.
  if (isWaitlistOnly(s) || (seats.known && seats.full)) {
    return { text: queued > 0 ? `Waitlist ${queued}` : isWaitlistOnly(s) ? "Waitlist" : "Full", tone: "bad" };
  }
  if (!seats.known) return { text: "", tone: "none" };
  if (seats.tight) return { text: `${seats.open} left`, tone: "warn" };
  return { text: `${seats.open} open`, tone: "ok" };
}

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
  none: "text-gray-400",
};

interface WalkWarning {
  status: LegStatus;
  minutes: number;
  meters: number;
  gap: number;
  other: string;
  /** "from" the class before, or "to" the class after. */
  dir: "from" | "to";
}

interface OptionFacts {
  clash: string[];
  walk: WalkWarning | null;
}

/**
 * What choosing these rows would cost, against everything already committed:
 * the courses it collides with, and the worst walk it creates on any day.
 */
function optionFacts(
  course: { code: string; title: string; role: CourseRole },
  rows: SectionTuple[],
  committed: CalEvent[],
  buildings: Record<string, Building>,
): OptionFacts {
  const ghost = rows.flatMap((r) => eventsForRow(course, r, { ghost: "preview" }));
  const clash = clashingCourses(ghost, committed, course.code);
  let walk: WalkWarning | null = null;
  const worse = (s: LegStatus) => (s === "late" ? 2 : s === "tight" ? 1 : 0);
  for (const w of previewWalks(ghost, committed, buildings)) {
    for (const [side, dir] of [[w.before, "from"], [w.after, "to"]] as const) {
      if (!side?.walk || worse(side.status) === 0) continue;
      if (!walk || worse(side.status) > worse(walk.status)) {
        walk = {
          status: side.status,
          minutes: side.walk.minutes,
          meters: side.walk.meters,
          gap: side.gap,
          other: side.event.code,
          dir,
        };
      }
    }
  }
  return { clash, walk };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function OptionChip({
  code, rows, selected, facts, showInstructor, onPick, onPreview,
}: {
  code: string;
  rows: SectionTuple[];
  selected: boolean;
  facts: OptionFacts;
  showInstructor?: boolean;
  onPick: () => void;
  onPreview: (on: boolean) => void;
}) {
  const first = rows[0];
  const seats = seatTag(first);
  const where = [...new Set(rows.map(sectionWhere).filter(Boolean))].join(" · ");
  const clashes = facts.clash.length > 0;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${typeLabel(first[TYPE])} ${code}, ${rows.map(shortWhen).join(" and ")}${where ? `, ${where}` : ""}${clashes ? `, clashes with ${facts.clash.join(", ")}` : ""}`}
      onClick={onPick}
      onMouseEnter={() => onPreview(true)}
      onMouseLeave={() => onPreview(false)}
      onFocus={() => onPreview(true)}
      onBlur={() => onPreview(false)}
      className={`group relative flex min-w-0 flex-col rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] ${
        selected
          ? "border-[#182B49] bg-[#182B49]/[0.06] shadow-sm dark:border-[#FFCD00] dark:bg-[#FFCD00]/10"
          : clashes
            ? "border-red-200 bg-red-50/40 hover:border-red-300 dark:border-red-500/30 dark:bg-red-500/[0.06]"
            : "border-gray-200 bg-white hover:border-[#182B49]/40 hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:hover:border-white/25 dark:hover:bg-white/5"
      }`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1">
          {selected && (
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          )}
          <span className="font-mono text-[11px] font-bold">{code}</span>
        </span>
        {seats.text && (
          <span className={`text-[10px] font-semibold tabular-nums ${TONE_TEXT[seats.tone]}`}>{seats.text}</span>
        )}
      </span>
      {rows.map((r, i) => (
        <span key={i} className="text-[11px] tabular-nums leading-snug text-gray-700 dark:text-gray-200">
          {shortWhen(r)}
        </span>
      ))}
      <span className="flex items-center gap-1 truncate text-[10px] text-gray-500 dark:text-gray-400">
        {where ? <>{where}</> : "Room TBA"}
        {showInstructor && first[INSTRUCTOR] && (
          <span className="truncate">· {first[INSTRUCTOR].split(",")[0]}</span>
        )}
      </span>
      {clashes && (
        <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Clashes with {facts.clash.join(", ")}</span>
        </span>
      )}
      {!clashes && facts.walk && (
        <span
          className={`mt-0.5 flex items-center gap-1 text-[10px] font-semibold ${
            facts.walk.status === "late" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
          }`}
          title={`${facts.walk.minutes}-minute walk (${formatDistance(facts.walk.meters)}) ${facts.walk.dir} ${facts.walk.other}, with a ${facts.walk.gap}-minute break`}
        >
          <Footprints className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">
            {facts.walk.minutes} min {facts.walk.dir} {facts.walk.other} · {facts.walk.gap} min gap
          </span>
        </span>
      )}
    </button>
  );
}

function StatusPill({ status, families, selection, summary }: {
  status: SectionStatus;
  families: LectureFamily[];
  selection: SectionSelection | undefined;
  summary: string;
}) {
  if (status.loading) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading sections…
      </span>
    );
  }
  if (!status.available) {
    return <span className="text-[11px] text-gray-400">No sections published this term</span>;
  }
  if (status.complete) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <Check className="h-3 w-3 shrink-0" /> <span className="truncate">{summary}</span>
      </span>
    );
  }
  const needLecture = !findFamily(families, selection?.family);
  const need = needLecture
    ? `a ${families[0]?.lecture ? typeLabel(families[0].lecture[TYPE]).toLowerCase() : "section"}`
    : status.missing.map((m) => `a ${m}`).join(" and ");
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      Pick {need}
    </span>
  );
}

function PartGroup({
  title, count, children, filter,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  filter?: React.ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={title}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {title} · {count} option{count === 1 ? "" : "s"}
        </p>
        {filter}
      </div>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

// ── One course ───────────────────────────────────────────────────────────────

function CourseSections({
  entry, row, role, sec, tss, status, selection, conflicted, focused, committed, buildings,
  onRemove, onSelect, onAutoPick, onPreview, onHover, onToggleFocus,
}: {
  entry: ScheduleCourse;
  row: CourseRow | undefined;
  role: CourseRole;
  sec: SectionTuple[];
  tss: string | null;
  status: SectionStatus;
  selection: SectionSelection | undefined;
  conflicted: boolean;
  focused: boolean;
  committed: CalEvent[];
  buildings: Record<string, Building>;
  onRemove: () => void;
  onSelect: (next: SectionSelection) => void;
  onAutoPick: () => boolean;
  onPreview: (p: Preview | null) => void;
  onHover: (on: boolean) => void;
  onToggleFocus: () => void;
}) {
  const course = entry.course;
  const style = ROLE_STYLES[role];
  const families = useMemo(() => groupSections(sec), [sec]);
  const family = findFamily(families, selection?.family);
  /** true once "Change sections" is pressed; null lets completeness decide. */
  const [expanded, setExpanded] = useState<true | null>(null);
  /** Just picked here: stay open until the pointer leaves, so the pick can be seen and changed. */
  const [justPicked, setJustPicked] = useState(false);
  const [fitOnly, setFitOnly] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  // A settled course folds to one line; an open decision stays in view.
  const open = expanded ?? (!status.complete || focused || justPicked);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  const src = { code: course.code, title: course.title, role };
  // The course's own blocks are not obstacles to its own options.
  const others = useMemo(() => committed.filter((e) => e.code !== course.code), [committed, course.code]);

  const summary = useMemo(() => {
    if (!family) return "";
    const bits = family.lecture ? [`${typeLabel(family.lecture[TYPE])} ${family.lecture[CODE]}`] : [];
    for (const p of family.parts) {
      const c = selection?.parts[p.type];
      if (c) bits.push(`${p.label} ${c}`);
    }
    return bits.join(" · ");
  }, [family, selection]);

  const preview = (rows: SectionTuple[], label: string) => (on: boolean) =>
    onPreview(on ? { code: course.code, rows, label } : null);

  // A pick can fold this card away under the pointer, and a chip that unmounts
  // never fires mouseleave — so the preview is cleared here, not left behind.
  const picked = () => {
    onPreview(null);
    setAutoFailed(false);
    setJustPicked(true);
  };

  const chooseFamily = (f: LectureFamily) => {
    picked();
    if (selection?.family === f.key) return;
    // Parts belong to their family, so switching lecture clears the old
    // discussion — and fills any sub-section that has only one option.
    const parts: Record<string, string> = {};
    for (const p of f.parts) if (p.sections.length === 1) parts[p.type] = p.sections[0][CODE];
    onSelect({ family: f.key, parts });
  };

  const choosePart = (p: SectionPart, code: string) => {
    if (!family) return;
    picked();
    onSelect({ family: family.key, parts: { ...(selection?.parts ?? {}), [p.type]: code } });
  };

  const bookUrl = useMemo(() => {
    if (!tss || !family || !status.complete) return null;
    const picked = family.parts.map((p) => selection?.parts[p.type]).filter(Boolean) as string[];
    const rowOf = (c: string) => sec.find((s) => s[CODE] === c);
    const target = picked.length ? rowOf(picked[picked.length - 1]) : family.lecture;
    return target ? sectionTssUrl(target, tss) || tss : tss;
  }, [tss, family, status.complete, selection, sec]);

  const multiLecture = families.length > 1;

  return (
    <li
      ref={ref}
      className={`rounded-xl border bg-white transition-shadow dark:bg-gray-800/60 ${
        conflicted
          ? "border-red-300 dark:border-red-500/50"
          : focused
            ? "border-[#182B49]/60 shadow-md ring-2 ring-[#182B49]/10 dark:border-[#FFCD00]/50 dark:ring-[#FFCD00]/10"
            : "border-gray-200 dark:border-white/10"
      }`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => {
        onHover(false);
        setJustPicked(false);
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-2 p-2.5 pb-2">
        <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: style.hex }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <Link href={courseHref(course.code)} className="truncate text-[13px] font-bold hover:underline">
              {course.code}
            </Link>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{course.units}u</span>
            {status.available && (
              <button
                type="button"
                onClick={onToggleFocus}
                aria-pressed={focused}
                title={focused ? "Stop showing every option on the calendar" : "Show every option on the calendar, to choose there"}
                className={`ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition ${
                  focused
                    ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                }`}
              >
                <CalendarSearch className="h-3 w-3" />
                {focused ? "On calendar" : "Compare"}
              </button>
            )}
          </div>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{course.title}</p>
          {row?.p && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
              <span className="truncate">{row.p}</span>
              {row.pq != null && (
                <span className="flex shrink-0 items-center gap-0.5 text-amber-500">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  {row.pq.toFixed(1)}
                </span>
              )}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <StatusPill status={status} families={families} selection={selection} summary={summary} />
          </div>
          {conflicted && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Overlaps another course — pick a different section below
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <GradeBadge gpa={row?.g} terms={row?.r ?? 0} size="sm" />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${course.code} from this term`}
            className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {status.available && (
        <div className="border-t border-gray-100 px-2.5 pb-2.5 pt-2 dark:border-white/5">
          {!open ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-1 text-[11px] font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
            >
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
              Change sections
            </button>
          ) : (
            <div className="space-y-2.5">
              {/* ── Lecture ── */}
              {multiLecture ? (
                <PartGroup
                  title={families[0].lecture ? typeLabel(families[0].lecture[TYPE]) : "Section group"}
                  count={families.length}
                >
                  {families.map((f) => {
                    const rows = f.lectureRows.length ? f.lectureRows : f.parts.flatMap((p) => p.sections);
                    return (
                      <OptionChip
                        key={f.key}
                        code={f.lecture ? f.lecture[CODE] : `${f.key} group`}
                        rows={rows}
                        selected={selection?.family === f.key}
                        facts={optionFacts(src, f.lectureRows, others, buildings)}
                        showInstructor
                        onPick={() => chooseFamily(f)}
                        onPreview={preview(f.lectureRows, f.lecture ? `${typeLabel(f.lecture[TYPE])} ${f.lecture[CODE]}` : `Group ${f.key}`)}
                      />
                    );
                  })}
                </PartGroup>
              ) : family?.lecture ? (
                <FixedLecture rows={family.lectureRows} />
              ) : null}

              {multiLecture && !family && (
                <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  Each lecture has its own discussions — choose one above, or click a
                  dashed block on the calendar.
                </p>
              )}

              {/* ── Discussions, labs, … for the chosen lecture ── */}
              {family?.parts.map((p) => {
                const chosen = selection?.parts[p.type];
                const options = p.sections.map((s) => {
                  const rows = rowsFor(p, s[CODE]);
                  return { s, rows, facts: optionFacts(src, rows, others, buildings) };
                });
                const shown = fitOnly
                  ? options.filter((o) => o.s[CODE] === chosen || (!o.facts.clash.length && o.facts.walk?.status !== "late"))
                  : options;
                const hidden = options.length - shown.length;
                return (
                  <PartGroup
                    key={p.type}
                    title={p.label}
                    count={p.sections.length}
                    filter={
                      p.sections.length > 4 && (
                        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={fitOnly}
                            onChange={(e) => setFitOnly(e.target.checked)}
                            className="h-3 w-3 accent-[#182B49] dark:accent-[#FFCD00]"
                          />
                          Only ones that fit
                        </label>
                      )
                    }
                  >
                    {shown.map(({ s, rows, facts }) => (
                      <OptionChip
                        key={s[CODE]}
                        code={s[CODE]}
                        rows={rows}
                        selected={chosen === s[CODE]}
                        facts={facts}
                        onPick={() => choosePart(p, s[CODE])}
                        onPreview={preview(rows, `${p.label} ${s[CODE]}`)}
                      />
                    ))}
                    {hidden > 0 && (
                      <p className="col-span-2 text-[10px] text-gray-400">
                        {hidden} hidden — they clash or leave a walk you cannot make.
                      </p>
                    )}
                  </PartGroup>
                );
              })}

              {/* ── Actions ── */}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const ok = onAutoPick();
                    setAutoFailed(!ok);
                    if (ok) setJustPicked(true);
                  }}
                  title="Pick the sections that fit around the rest of your week"
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Wand2 className="h-3 w-3" />
                  Fit it for me
                </button>
                {autoFailed && (
                  <span className="text-[10px] text-red-600 dark:text-red-400">Nothing fits around your week</span>
                )}
                <span className="flex-1" />
                {status.complete && expanded && (
                  <button
                    type="button"
                    onClick={() => setExpanded(null)}
                    className="text-[11px] font-semibold text-gray-500 hover:underline dark:text-gray-400"
                  >
                    Done
                  </button>
                )}
                {bookUrl && (
                  <a
                    href={bookUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Opens this course on TSS, UC San Diego's enrolment site. It does not enrol you."
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#182B49] underline-offset-2 hover:underline dark:text-[#FFCD00]"
                  >
                    Open in TSS <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A lecture there is no choosing between, stated once. */
function FixedLecture({ rows }: { rows: SectionTuple[] }) {
  const first = rows[0];
  const seats = seatTag(first);
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {typeLabel(first[TYPE])} {first[CODE]} · the only one
        </p>
        {seats.text && <span className={`text-[10px] font-semibold ${TONE_TEXT[seats.tone]}`}>{seats.text}</span>}
      </div>
      {rows.map((r, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[11px] tabular-nums text-gray-700 dark:text-gray-200">
          {shortWhen(r)}
          <span className="flex items-center gap-0.5 text-gray-500 dark:text-gray-400">
            <MapPin className="h-2.5 w-2.5" />
            {sectionWhere(r) || "Room TBA"}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Quick add ────────────────────────────────────────────────────────────────

function QuickAdd({
  platRows, scheduled, onAdd,
}: {
  platRows: CourseRow[];
  scheduled: Set<string>;
  onAdd: (code: string) => boolean;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => searchCourses(platRows, q, 7).map((h) => h.row), [platRows, q]);

  const add = (row: CourseRow | undefined) => {
    if (!row || scheduled.has(row.k)) return;
    if (onAdd(row.k)) {
      setQ("");
      setActive(0);
    }
  };

  return (
    <div className="relative px-2 pb-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="quick-add-list"
          aria-label="Add a course"
          placeholder="Add a course — try “CSE 12”"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); add(hits[active]); }
            else if (e.key === "Escape") { setQ(""); setOpen(false); }
          }}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-7 text-[13px] outline-none transition placeholder:text-gray-400 focus:border-[#182B49] focus:bg-white focus:ring-1 focus:ring-[#182B49] dark:border-white/10 dark:bg-white/5 dark:focus:border-[#FFCD00] dark:focus:ring-[#FFCD00]"
        />
        {q && <CornerDownLeft className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />}
      </div>

      {open && hits.length > 0 && (
        <ul
          id="quick-add-list"
          role="listbox"
          className="absolute left-2 right-2 top-full z-40 mt-1 max-h-72 list-none overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-gray-800"
        >
          {hits.map((row, i) => {
            const have = scheduled.has(row.k);
            return (
              <li
                key={row.k}
                role="option"
                aria-selected={i === active}
                aria-disabled={have}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); add(row); }}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                  i === active ? "bg-slate-100 dark:bg-white/10" : ""
                } ${have ? "cursor-default opacity-60" : ""}`}
              >
                <span className="w-16 shrink-0 text-[12px] font-bold">{row.k}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{row.t}</span>
                {have ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : row.o ? (
                  <Plus className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                ) : (
                  <span className="shrink-0 text-[9px] text-gray-400">not this term</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── The board ────────────────────────────────────────────────────────────────

export default function SectionBoard({
  selectedCourses, platRows, platByCode, sectionsByCode, tssByCode, selections, committed,
  buildings, conflictCodes, focusCode, roleOf, sectionStatus,
  onRemove, onSelect, onAutoPick, onClear, onAdd, onPreview, onHover, onFocus,
}: {
  selectedCourses: ScheduleCourse[];
  platRows: CourseRow[];
  platByCode: Map<string, CourseRow>;
  sectionsByCode: Record<string, SectionTuple[]>;
  tssByCode: Record<string, string | null>;
  selections: Record<string, SectionSelection>;
  /** Blocks already on the calendar — what each option is weighed against. */
  committed: CalEvent[];
  buildings: Record<string, Building>;
  conflictCodes: Set<string>;
  focusCode: string | null;
  roleOf: (course: Course) => CourseRole;
  sectionStatus: (code: string) => SectionStatus;
  onRemove: (id: string) => void;
  onSelect: (code: string, next: SectionSelection) => void;
  onAutoPick: (code: string) => boolean;
  onClear: () => void;
  onAdd: (code: string) => boolean;
  onPreview: (p: Preview | null) => void;
  /** The card under the pointer: its blocks and buildings light up. */
  onHover: (code: string | null) => void;
  /** Pin one course's every option onto the calendar, to choose there. */
  onFocus: (code: string | null) => void;
}) {
  const scheduled = useMemo(() => new Set(selectedCourses.map((s) => s.course.code)), [selectedCourses]);
  const pending = selectedCourses.filter(({ course }) => {
    const st = sectionStatus(course.code);
    return st.available && !st.complete;
  }).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <QuickAdd platRows={platRows} scheduled={scheduled} onAdd={onAdd} />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!selectedCourses.length ? (
          <div className="px-3 py-10 text-center">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">No courses this term yet</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Type a course above, or find one under <span className="font-semibold">Browse</span>.
              Its lectures and discussions appear here to choose from — and on the map, where they meet.
            </p>
          </div>
        ) : (
          <>
            {pending > 0 && (
              <p className="mb-2 px-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {pending} {pending === 1 ? "course needs" : "courses need"} a pick.
                </span>{" "}
                Hover an option to preview it on the calendar and map.
              </p>
            )}
            <ul className="m-0 list-none space-y-2 p-0">
              {selectedCourses.map((entry) => {
                const code = entry.course.code;
                return (
                  <CourseSections
                    key={entry.id}
                    entry={entry}
                    row={platByCode.get(code)}
                    role={roleOf(entry.course)}
                    sec={sectionsByCode[code] ?? EMPTY}
                    tss={tssByCode[code] ?? null}
                    status={sectionStatus(code)}
                    selection={selections[code]}
                    conflicted={conflictCodes.has(code)}
                    focused={focusCode === code}
                    committed={committed}
                    buildings={buildings}
                    onRemove={() => onRemove(entry.id)}
                    onSelect={(next) => onSelect(code, next)}
                    onAutoPick={() => onAutoPick(code)}
                    onPreview={onPreview}
                    onHover={(on) => onHover(on ? code : null)}
                    onToggleFocus={() => onFocus(focusCode === code ? null : code)}
                  />
                );
              })}
            </ul>
            <button
              type="button"
              onClick={onClear}
              className="mt-2 w-full rounded-lg py-1.5 text-[11px] text-gray-500 transition hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Clear the whole term
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Stable empty list, so a course with no sections does not re-memo every render. */
const EMPTY: SectionTuple[] = [];
