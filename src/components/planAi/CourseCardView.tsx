"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { checkText } from "@/lib/planAi/explain";
import { clockLabel } from "@/lib/planAi/vocabulary";
import type { CourseCard } from "@/lib/planAi/types";
import { courseHref, dayLabel, typicalGrade } from "@/lib/plat";
import CheckList, { StatusIcon, statusWord } from "./CheckList";

/**
 * One suggested course: what it is, when it meets, the one reason it fits
 * and the one caveat that matters. Evidence, sources and the signals that
 * are not reasons — historical grades, ratings — stay behind "Why this fits".
 */

function finalText(f: string | null): string | null {
  if (!f) return null;
  const [date, start, end] = f.split("|");
  return `Final ${dayLabel(date)} · ${clockLabel(Number(start))}–${clockLabel(Number(end))}`;
}

export default function CourseCardView({
  card, action, onFocus, disabled = false,
}: {
  card: CourseCard;
  action?: { label: string; run: () => void } | null;
  onFocus?: (code: string | null) => void;
  disabled?: boolean;
}) {
  const grade = card.grades ? typicalGrade(card.grades.gpa, card.grades.terms) : null;
  return (
    <article
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-800"
      onMouseEnter={() => onFocus?.(card.code)}
      onFocus={() => onFocus?.(card.code)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#182B49] dark:text-white">
            <Link href={courseHref(card.code)} className="hover:underline focus-visible:underline">{card.code}</Link>
            <span className="font-normal text-gray-700 dark:text-gray-300"> · {card.title}</span>
          </h3>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{card.units} units{card.instructor ? ` · ${card.instructor}` : ""}</p>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.run}
            disabled={disabled}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 text-xs font-semibold text-white transition hover:bg-[#243f66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740] dark:focus-visible:outline-[#FFCD00]"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
            {action.label}
          </button>
        )}
      </div>

      {card.meetings.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs tabular-nums text-gray-700 dark:text-gray-300">
          {card.meetings.map((m, i) => (
            <li key={i}><span className="font-medium">{m.label}</span> · {m.when}{m.where ? ` · ${m.where}` : ""}</li>
          ))}
          {finalText(card.final) && <li className="text-gray-600 dark:text-gray-400">{finalText(card.final)}</li>}
        </ul>
      ) : null}

      {card.reason && (
        <p className="mt-3 flex gap-1.5 text-xs leading-relaxed text-gray-800 dark:text-gray-200">
          <StatusIcon check={card.reason} className="mt-0.5 h-3.5 w-3.5" />
          <span><span className="sr-only">{statusWord(card.reason)}: </span>{checkText(card.reason)}</span>
        </p>
      )}
      {card.caveat && (
        <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
          <StatusIcon check={card.caveat} className="mt-0.5 h-3.5 w-3.5" />
          <span><span className="sr-only">{statusWord(card.caveat)}: </span>{checkText(card.caveat)}</span>
        </p>
      )}

      <details className="group mt-3">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-[#0f6e7a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6e7a] dark:text-[#5fd0dc] [&::-webkit-details-marker]:hidden">
          Why this fits
          <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="mt-2 space-y-2 border-t border-gray-100 pt-2 dark:border-white/10">
          <CheckList checks={card.checks} />
          {(grade || card.rating) && (
            <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
              {grade && <>Historical average {grade.letter} ({card.grades!.gpa.toFixed(2)} GPA over {card.grades!.terms} {card.grades!.terms === 1 ? "term" : "terms"}), not a prediction of your grade. </>}
              {card.rating && <>RateMyProfessors {card.rating.quality.toFixed(1)}/5 from {card.rating.count} {card.rating.count === 1 ? "rating" : "ratings"}, about the instructor, not this course. </>}
              Neither one measures workload.
            </p>
          )}
        </div>
      </details>
    </article>
  );
}
