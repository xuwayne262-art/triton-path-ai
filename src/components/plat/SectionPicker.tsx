"use client";

import { useState } from "react";
import { prettyRange, type SectionTuple } from "@/lib/plat";
import {
  CODE, INSTRUCTOR, TYPE, DAYS, START, END,
  groupSections, isChoosable, sectionSeats, sectionTssUrl, sectionWaitlist,
  sectionWhen, sectionWhere, selectionRule, typeLabel,
  type LectureFamily, type SectionSelection,
} from "@/lib/sections";

/**
 * Sections, grouped the way enrolment actually works.
 *
 * A flat list of eleven rows hides the one rule that matters: a discussion
 * belongs to a particular lecture, so picking A01 commits you to lecture A00.
 * Lecture families are therefore the outer choice, and a family's discussions
 * only appear once that family is the one you are taking.
 *
 * Uncontrolled on the course page, where picking is a way of reading the
 * timetable; controlled by the planner, which owns the choice and draws it on
 * the calendar.
 */

function Seats({ s }: { s: SectionTuple }) {
  const seats = sectionSeats(s);
  const waitlist = sectionWaitlist(s);
  if (!seats.known) return null;
  const tone = seats.full
    ? "text-red-600 dark:text-red-400"
    : seats.tight
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>
        {seats.full ? "Full" : `${seats.open} open`}
      </span>
      {/*
        A full section with nobody queued and a full section with forty people
        queued are different decisions, and "Full" alone cannot tell them apart.
      */}
      {waitlist != null && waitlist > 0 && (
        <span className="text-[10px] tabular-nums text-gray-400">{waitlist} waitlisted</span>
      )}
    </span>
  );
}

/** Shared radio-row chrome for both a family header and a sub-section. */
function PickRow({
  selected, onPick, title, meta, trailing, ariaLabel, compact,
}: {
  selected: boolean;
  onPick: () => void;
  title: React.ReactNode;
  meta: string;
  trailing?: React.ReactNode;
  ariaLabel: string;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onPick}
      className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 text-left transition ${
        compact ? "py-1.5" : "py-2"
      } ${
        selected
          ? "border-[#182B49] bg-[#182B49]/[0.05] dark:border-[#FFCD00] dark:bg-[#FFCD00]/10"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/5"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${
          selected
            ? "border-[#182B49] bg-[#182B49] ring-2 ring-inset ring-white dark:border-[#FFCD00] dark:bg-[#FFCD00] dark:ring-[#0d1420]"
            : "border-gray-300 dark:border-white/25"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {meta}
        </span>
      </span>
      {trailing}
    </button>
  );
}

function familyMeta(f: LectureFamily): string {
  if (!f.lecture) return "Meeting time TBA";
  return [sectionWhen(f.lecture), sectionWhere(f.lecture), f.lecture[INSTRUCTOR]]
    .filter(Boolean)
    .join(" · ");
}

export default function SectionPicker({
  sec,
  value,
  onChange,
  compact = false,
  tss = null,
}: {
  sec: SectionTuple[];
  /** Controlled selection. Omit to let the component hold its own. */
  value?: SectionSelection;
  onChange?: (next: SectionSelection) => void;
  /** Denser padding, for the planner rail. */
  compact?: boolean;
  /** The course's TSS booking URL, so a picked section can deep-link to it. */
  tss?: string | null;
}) {
  const families = groupSections(sec);
  const rule = selectionRule(families);
  // Exams are not a choice, but dropping them entirely would hide the one date
  // a student cannot move, so they are listed apart from the pickable sections.
  const exams = sec.filter((s) => !isChoosable(s));

  // A parent that passes onChange owns the selection outright. Falling back to
  // internal state when its `value` was merely empty drew a lecture as chosen
  // while the parent — and so the calendar — still had nothing.
  const controlled = onChange !== undefined;
  const [own, setOwn] = useState<SectionSelection | undefined>(() =>
    !controlled && families.length === 1 ? { family: families[0].key, parts: {} } : undefined,
  );
  const selection = controlled ? value : own;
  const commit = (next: SectionSelection) => (onChange ? onChange(next) : setOwn(next));

  if (!families.length) {
    return exams.length ? <ExamList exams={exams} /> : null;
  }

  const chooseFamily = (key: string) => {
    // Parts belong to their family, so switching lecture clears the discussion
    // that was tied to the old one rather than leaving an impossible pairing.
    if (selection?.family === key) return;
    commit({ family: key, parts: {} });
  };

  const choosePart = (type: string, code: string) => {
    if (!selection) return;
    const already = selection.parts[type] === code;
    const parts = { ...selection.parts };
    if (already) delete parts[type];
    else parts[type] = code;
    commit({ ...selection, parts });
  };

  return (
    <div>
      {rule && (
        <p className={`text-xs text-gray-500 dark:text-gray-400 ${compact ? "mb-1.5" : "mb-2"}`}>
          {rule}
        </p>
      )}

      <div className="space-y-1.5" role="radiogroup" aria-label="Lecture">
        {families.map((f) => {
          const chosen = selection?.family === f.key;
          const subCount = f.parts.reduce((n, p) => n + p.sections.length, 0);

          return (
            <div key={f.key}>
              <PickRow
                compact={compact}
                selected={chosen}
                onPick={() => chooseFamily(f.key)}
                ariaLabel={`${f.lecture ? typeLabel(f.lecture[TYPE]) : "Sections"} ${f.key}`}
                title={
                  <>
                    <span className="text-[13px] font-semibold">
                      {f.lecture ? typeLabel(f.lecture[TYPE]) : "Sections"} {f.key}
                    </span>
                    {!chosen && subCount > 0 && (
                      <span className="text-[11px] text-gray-400">
                        {subCount} to choose from
                      </span>
                    )}
                  </>
                }
                meta={familyMeta(f)}
                trailing={f.lecture ? <Seats s={f.lecture} /> : undefined}
              />

              {chosen && f.parts.length > 0 && (
                <div className="mt-1.5 space-y-2 border-l-2 border-gray-200 pl-2.5 dark:border-white/10">
                  {f.parts.map((p) => (
                    <div key={p.type} role="radiogroup" aria-label={p.label}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {p.label} · {p.sections.length} option{p.sections.length === 1 ? "" : "s"}
                      </p>
                      <div className="space-y-1">
                        {p.sections.map((s) => (
                          <PickRow
                            key={s[CODE]}
                            compact={compact}
                            selected={selection?.parts[p.type] === s[CODE]}
                            onPick={() => choosePart(p.type, s[CODE])}
                            ariaLabel={`${p.label} ${s[CODE]}`}
                            title={<span className="font-mono text-xs font-bold">{s[CODE]}</span>}
                            meta={[sectionWhen(s), sectionWhere(s)].filter(Boolean).join(" · ")}
                            trailing={<Seats s={s} />}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/*
                    TSS enrols a package — the lecture and the discussion you
                    picked, together — so the link only appears once that pair
                    exists. Offering it earlier would send a student to a page
                    that cannot book what they are looking at.
                  */}
                  <BookSelected sec={sec} selection={selection} tss={tss} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {exams.length > 0 && <ExamList exams={exams} />}
    </div>
  );
}

/**
 * "Book on TSS" for the exact pairing the student has selected.
 *
 * Rendered only when a sub-section is chosen and that section carries a single
 * enrolment package: a lecture's package list spans every discussion under it,
 * so linking from the lecture alone would book an arbitrary one.
 */
function BookSelected({
  sec, selection, tss,
}: {
  sec: SectionTuple[];
  selection: SectionSelection | undefined;
  tss: string | null;
}) {
  if (!tss || !selection) return null;
  const codes = Object.values(selection.parts);
  if (codes.length !== 1) return null;
  const picked = sec.find((s) => s[CODE] === codes[0]);
  if (!picked) return null;
  const url = sectionTssUrl(picked, tss);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title="Opens this section on TSS, UC San Diego's official enrolment site. It does not enrol you."
      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#182B49] underline-offset-2 hover:underline dark:text-[#FFCD00]"
    >
      Book {selection.family}
      {codes[0] === selection.family ? "" : ` + ${codes[0]}`} on TSS ↗
    </a>
  );
}

function ExamList({ exams }: { exams: SectionTuple[] }) {
  return (
    <ul className="mt-2.5 list-none space-y-1 p-0">
      {exams.map((s, i) => (
        <li
          key={`${s[CODE]}-${i}`}
          className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-gray-500 dark:text-gray-400"
        >
          <span className="font-semibold">{typeLabel(s[TYPE])}</span>
          <span>{s[DAYS]}</span>
          <span>{prettyRange(s[START], s[END])}</span>
        </li>
      ))}
    </ul>
  );
}
