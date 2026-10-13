"use client";

import { useId } from "react";
import { dayLabel, prettyRange, type SectionTuple } from "@/lib/plat";
import {
  CODE, INSTRUCTOR, TYPE, DAYS, START, END,
  groupSections, sectionSeats, sectionSeatsAt, sectionWaitlist, sectionWhen, sectionWhere, selectionRule, typeLabel,
  type LectureFamily, type SectionSelection,
} from "@/lib/sections";
import { finalOverview, type FinalOverview } from "@/lib/sectionChoice";
import { seatAge } from "@/lib/freshness";
import { SeatAgeNote } from "./SeatAge";
import { useNow } from "./useNow";

/**
 * Sections, grouped the way enrolment actually works.
 *
 * A flat list of eleven rows hides the one rule that matters: a discussion
 * belongs to a particular lecture, so picking A01 commits you to lecture A00.
 * Lecture families are therefore the outer choice, and a family's discussions
 * only appear once that family is the one you are taking — choosing another
 * lecture clears them, since they cannot go with it.
 *
 * Each choice is a native radio, so arrow keys move through a group and a
 * screen reader hears it as one. The page owns the choice: its summary, its
 * final and its TSS link all follow it.
 *
 * Every final is shown with the lecture it belongs to. When the lectures sit
 * different finals, a course has no one final until a lecture is chosen, and
 * the page used to print the first lecture's date as if it were everyone's.
 */

/** "Lecture", "Independent study", or "Section" when a course mixes kinds. */
function familyNoun(families: LectureFamily[]): string {
  const kinds = new Set(families.map((f) => (f.lecture ? typeLabel(f.lecture[TYPE]) : "Section")));
  return kinds.size === 1 ? [...kinds][0] : "Section";
}

function Seats({ s, now }: { s: SectionTuple; now: number | null }) {
  const seats = sectionSeats(s);
  const waitlist = sectionWaitlist(s);
  if (!seats.known) {
    // Unknown is not full: Class Planner published no seat count for it.
    return <span className="shrink-0 text-right text-[11px] leading-tight text-gray-500 dark:text-gray-400">Seats not published</span>;
  }
  const tone = seats.full
    ? "text-red-700 dark:text-red-400"
    : seats.tight
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400";
  return (
    <span className="flex shrink-0 flex-col items-end text-right leading-tight">
      <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>
        {seats.full ? "Full" : `${seats.open} of ${seats.limit} open`}
      </span>
      {/*
        A full section with nobody queued and a full section with forty people
        queued are different decisions, and "Full" alone cannot tell them apart.
      */}
      {waitlist != null && waitlist > 0 && (
        <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{waitlist} waitlisted</span>
      )}
      <SeatAgeNote at={sectionSeatsAt(s)} now={now} />
    </span>
  );
}

/** One choice: a native radio, its circle drawn to match, the whole row its label. */
function PickRow({
  name, checked, onPick, title, meta, extra, trailing, compact,
}: {
  name: string;
  checked: boolean;
  onPick: () => void;
  title: React.ReactNode;
  meta: string;
  extra?: React.ReactNode;
  trailing?: React.ReactNode;
  compact: boolean;
}) {
  return (
    <label
      className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 text-left transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#182B49] has-[:focus-visible]:ring-offset-1 dark:has-[:focus-visible]:ring-[#FFCD00] dark:has-[:focus-visible]:ring-offset-[#0d1420] ${
        compact ? "py-1.5" : "py-2"
      } ${
        checked
          ? "border-[#182B49] bg-[#182B49]/[0.05] dark:border-[#FFCD00] dark:bg-[#FFCD00]/10"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/5"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onPick} className="peer sr-only" />
      <span
        aria-hidden
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${
          checked
            ? "border-[#182B49] bg-[#182B49] ring-2 ring-inset ring-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:ring-[#0d1420]"
            : "border-gray-400 dark:border-white/30"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-gray-600 dark:text-gray-400">{meta}</span>
        {extra}
      </span>
      {trailing}
    </label>
  );
}

/** "Thu, Dec 10 · 7:00 PM – 9:59 PM · PCYNH 109" */
export function examLine(s: SectionTuple): string {
  return [dayLabel(s[DAYS]), prettyRange(s[START], s[END]), sectionWhere(s)].filter(Boolean).join(" · ");
}

function familyMeta(f: LectureFamily): string {
  if (!f.lecture) return "Meeting time TBA";
  return [sectionWhen(f.lecture), sectionWhere(f.lecture)].filter(Boolean).join(" · ");
}

/** The final for one lecture, under it — only when finals differ by lecture. */
function FamilyFinal({ overview, family }: { overview: FinalOverview; family: string }) {
  if (overview.kind !== "varies") return null;
  const finals = overview.byFamily.find((f) => f.key === family)?.finals ?? [];
  return (
    <span className="mt-1 block text-[11px] leading-snug text-gray-700 dark:text-gray-300">
      <span className="font-semibold">Final:</span>{" "}
      {finals.length ? finals.map(examLine).join("; ") : "not listed on the schedule"}
    </span>
  );
}

export default function SectionPicker({
  sec,
  value,
  onChange,
  compact = false,
}: {
  sec: SectionTuple[];
  value: SectionSelection | undefined;
  onChange: (next: SectionSelection) => void;
  /** Denser padding, for a narrow column. */
  compact?: boolean;
}) {
  const id = useId();
  const now = useNow();
  const families = groupSections(sec);
  const overview = finalOverview(sec, families);
  const noun = familyNoun(families);
  const single = families.length === 1 && families[0].parts.length === 0;
  const rule = single ? `One ${noun.toLowerCase()} is offered.` : selectionRule(families);

  if (!families.length) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">No section can be chosen on this term&rsquo;s schedule.</p>;
  }

  // Seat counts that are over a day old or undated, which earn the TSS reminder.
  const doubtful = now != null && sec.some((s) => seatAge(sectionSeatsAt(s), now).kind !== "recent" && sectionSeats(s).known);

  const chooseFamily = (key: string) => {
    // Parts belong to their family, so switching lecture clears the discussion
    // that was tied to the old one rather than leaving an impossible pairing.
    // A sub-section with a single option is not a second decision.
    if (value?.family === key) return;
    const family = families.find((f) => f.key === key);
    const parts: Record<string, string> = {};
    for (const p of family?.parts ?? []) if (p.sections.length === 1) parts[p.type] = p.sections[0][CODE];
    onChange({ family: key, parts });
  };

  const choosePart = (type: string, code: string) => {
    if (!value) return;
    onChange({ ...value, parts: { ...value.parts, [type]: code } });
  };

  return (
    <div>
      {rule && <p className={`text-sm text-gray-700 dark:text-gray-200 ${compact ? "mb-1.5" : "mb-1"}`}>{rule}</p>}
      <p className="mb-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        Times are Pacific (San Diego) time. Seats are UCSD Class Planner&rsquo;s last count for each section, not a live
        number{doubtful ? "; counts marked “old” are more than a day old, so check TSS before you enroll" : ""}.
      </p>
      {overview.kind === "same" && (
        <p className="mb-3 text-xs text-gray-700 dark:text-gray-300">
          <span className="font-semibold">Final{families.length > 1 ? ` for every ${noun.toLowerCase()}` : ""}:</span>{" "}
          {overview.finals.map(examLine).join("; ")}
        </p>
      )}
      {overview.kind === "none" && (
        <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">No final exam is listed on the schedule for this course.</p>
      )}

      <div className="space-y-1.5" role="radiogroup" aria-label={noun}>
        {families.map((f) => {
          const chosen = value?.family === f.key;
          const subCount = f.parts.reduce((n, p) => n + p.sections.length, 0);
          const label = `${f.lecture ? typeLabel(f.lecture[TYPE]) : "Section"} ${f.key}`;

          return (
            <div key={f.key}>
              <PickRow
                name={`${id}-family`}
                compact={compact}
                checked={chosen}
                onPick={() => chooseFamily(f.key)}
                title={
                  <>
                    <span className="text-[13px] font-semibold">{label}</span>
                    {f.lecture?.[INSTRUCTOR] && (
                      <span className="text-[12px] text-gray-700 dark:text-gray-300">{f.lecture[INSTRUCTOR]}</span>
                    )}
                    {!chosen && subCount > 0 && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {subCount} {f.parts.map((p) => p.label.toLowerCase()).join(" / ")} option{subCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </>
                }
                meta={familyMeta(f)}
                extra={<FamilyFinal overview={overview} family={f.key} />}
                trailing={f.lecture ? <Seats s={f.lecture} now={now} /> : undefined}
              />

              {chosen && f.parts.length > 0 && (
                <div className="mt-1.5 space-y-2 border-l-2 border-gray-200 pl-2.5 dark:border-white/10">
                  {f.parts.map((p) => (
                    <div key={p.type} role="radiogroup" aria-label={`${p.label} for ${label}`}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        {p.label} · {p.sections.length} option{p.sections.length === 1 ? "" : "s"}
                      </p>
                      <div className="space-y-1">
                        {p.sections.map((s) => (
                          <PickRow
                            key={s[CODE]}
                            name={`${id}-${f.key}-${p.type}`}
                            compact={compact}
                            checked={value?.parts[p.type] === s[CODE]}
                            onPick={() => choosePart(p.type, s[CODE])}
                            title={<span className="font-mono text-xs font-bold">{p.label} {s[CODE]}</span>}
                            meta={[sectionWhen(s), sectionWhere(s)].filter(Boolean).join(" · ")}
                            trailing={<Seats s={s} now={now} />}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
