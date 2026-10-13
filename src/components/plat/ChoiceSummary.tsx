"use client";

import { AlertTriangle, CalendarPlus, CheckCircle2, ExternalLink, LogIn, X } from "lucide-react";
import { geLabel, universityRequirement, type CourseDetail, type SectionTuple } from "@/lib/plat";
import {
  CODE, INSTRUCTOR, TSS_HINT, TYPE,
  sectionSeats, sectionSeatsAt, sectionWhen, sectionWhere, typeLabel,
  type LectureFamily, type SectionSelection,
} from "@/lib/sections";
import { choicePackage, choiceText, finalOverview, packageUrl, summarizeChoice } from "@/lib/sectionChoice";
import { seatAge, seatAgeSentence, seatSpan, spanLabel, sumSeatsAt } from "@/lib/freshness";
import { tallySectionRows, talliedRows } from "@/lib/seats/tally";
import { LABEL, SECTION_TITLE } from "./typeScale";
import { examLine } from "./SectionPicker";
import { SeatAgeNote } from "./SeatAge";
import { useNow } from "./useNow";
import type { PlannerEntry } from "./usePlannerEntry";
import { useState } from "react";

/**
 * The course's term at a glance, and the student's section choice with
 * everything that follows from it: which final comes with it, which sections
 * it still needs, how full each was at its last count and when that was, and
 * the two next steps — add it to the Planner, or open exactly it in TSS.
 *
 * It follows the choice, so a final printed here always belongs to the chosen
 * lecture. Before one is chosen it says whether the course has one final or
 * several, rather than showing the first lecture's as everyone's.
 */

function SeatLine({ s, now }: { s: SectionTuple; now: number | null }) {
  const seats = sectionSeats(s);
  return (
    <span className="whitespace-nowrap">
      {seats.known ? (seats.full ? <span className="font-semibold text-red-700 dark:text-red-400">Full</span> : `${seats.open} of ${seats.limit} open`) : "seats not published"}
      {" · "}
      <SeatAgeNote at={sectionSeatsAt(s)} now={now} />
    </span>
  );
}

export default function ChoiceSummary({
  code, detail, families, selection, termLabel, signedIn, planner, onAdd, onClear,
}: {
  code: string;
  detail: CourseDetail | undefined;
  families: LectureFamily[];
  selection: SectionSelection | undefined;
  termLabel: string;
  /** null while unknown. */
  signedIn: boolean | null;
  planner: PlannerEntry | null;
  onAdd: () => void;
  onClear: () => void;
}) {
  const now = useNow();
  const [allGe, setAllGe] = useState(false);
  const sec = detail?.sec ?? [];
  const offered = detail?.offered === 1;
  const summary = summarizeChoice(sec, families, selection);
  const overview = finalOverview(sec, families);
  const choice = summary && selection ? choiceText(families, selection) : "";

  // Seats taken across the course, dated by exactly the counts it adds up.
  const seats = sec.length ? tallySectionRows(sec) : null;
  const counted = talliedRows(sec);
  const span = seatSpan(counted.map(sectionSeatsAt));
  const allDated = counted.length > 0 && counted.every((s) => sectionSeatsAt(s));
  const sumAt = sumSeatsAt(counted.map(sectionSeatsAt), counted.some((s) => sectionSeatsAt(s)) ? detail?.seatsAt ?? null : null);
  const sumAge = now != null ? seatAge(sumAt, now) : null;

  const pkg = summary ? choicePackage(summary) : null;
  const choiceUrl = pkg ? packageUrl(detail?.tss ?? null, pkg) : "";
  const tssUrl = choiceUrl || detail?.tss || "";

  const ges = (detail?.ge ?? []).filter((g) => !universityRequirement(g));
  const reqs = (detail?.ge ?? []).filter((g) => universityRequirement(g));

  const finalText = (() => {
    if (summary) {
      const finals = summary.exams.filter((e) => e[TYPE] === "FI");
      return finals.length ? finals.map(examLine).join("; ") : `Not listed on the schedule for ${choice.split(" + ")[0]}`;
    }
    if (overview.kind === "same") return overview.finals.map(examLine).join("; ");
    if (overview.kind === "varies") return "Varies by section — choose a lecture to see yours";
    return detail ? "Not listed on the schedule" : "…";
  })();
  const midterms = summary?.exams.filter((e) => e[TYPE] !== "FI") ?? [];

  const addLabel = signedIn === false
    ? (summary?.complete ? `Sign in to add ${choice} to Planner` : `Sign in to add ${code} to Planner`)
    : summary
      ? (summary.complete ? `Add ${choice} to Planner` : `Choose a ${summary.missing[0]} to add these sections`)
      : planner?.scheduled ? `${code} is in your Planner` : `Add ${code} to Planner`;
  const addDisabled = !offered || (summary != null && !summary.complete) || (!summary && planner?.scheduled === true);

  return (
    <section aria-labelledby="glance-title" className="rounded-2xl border border-gray-200 p-5 dark:border-white/10">
      <h2 id="glance-title" className={SECTION_TITLE}>{termLabel} at a glance</h2>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fact label="Units" value={detail?.u ? String(parseFloat(detail.u)) : "—"} />
        <Fact
          label="Seats taken"
          value={seats ? `${seats.enrolled.toLocaleString()} / ${seats.capacity.toLocaleString()}` : offered ? "Not published" : "Not offered"}
          note={seats ? (
            <>
              {seats.waitlist ? `${seats.waitlist} waitlisted · ` : ""}
              {counted.some((s) => s[TYPE] === "LE") ? "all lectures · " : ""}
              <span title={sumAge && now != null ? seatAgeSentence(sumAge, now) : undefined}>
                {span && allDated ? `counted ${spanLabel(span)}` : span ? `counted ${spanLabel(span)} (some undated)` : "count time unknown"}
                {sumAge?.kind === "old" && <span className="font-semibold text-amber-700 dark:text-amber-400"> · old</span>}
              </span>
            </>
          ) : undefined}
        />
        <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
          <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Final exam</dt>
          <dd className="mt-0.5 text-sm font-semibold">{finalText}</dd>
          {midterms.length > 0 && (
            <dd className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              {midterms.map((m) => `${typeLabel(m[TYPE])}: ${examLine(m)}`).join("; ")}
            </dd>
          )}
        </div>
      </dl>

      {/* ── The choice, and what is still missing from it ───────────────── */}
      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/5" aria-live="polite">
        {summary && selection ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className={LABEL}>Your choice</p>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-white"
              >
                <X className="h-3 w-3" aria-hidden /> Clear
              </button>
            </div>
            <ul className="mt-2 space-y-2 text-sm">
              {summary.family.lecture && (
                <li>
                  <span className="font-semibold">{typeLabel(summary.family.lecture[TYPE])} {summary.family.key}</span>
                  {summary.family.lecture[INSTRUCTOR] && <span className="text-gray-700 dark:text-gray-300"> · {summary.family.lecture[INSTRUCTOR]}</span>}
                  <span className="block text-xs text-gray-600 dark:text-gray-400">
                    {[sectionWhen(summary.family.lecture), sectionWhere(summary.family.lecture)].filter(Boolean).join(" · ")}
                    {" · "}<SeatLine s={summary.family.lecture} now={now} />
                  </span>
                </li>
              )}
              {summary.chosen.map((c) => (
                <li key={c.part.type}>
                  <span className="font-semibold">{c.part.label} {c.code}</span>
                  <span className="block text-xs text-gray-600 dark:text-gray-400">
                    {[sectionWhen(c.rows[0]), sectionWhere(c.rows[0])].filter(Boolean).join(" · ")}
                    {" · "}<SeatLine s={c.rows[0]} now={now} />
                  </span>
                </li>
              ))}
            </ul>
            {summary.missing.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                Still needed: choose a {summary.missing.join(" and a ")} under {choice.split(" + ")[0]}.
              </p>
            )}
            {summary.full.length > 0 && (
              <p className="mt-3 flex gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900 dark:bg-red-500/10 dark:text-red-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {summary.full.map((s) => `${typeLabel(s[TYPE])} ${s[CODE]}`).join(" and ")}{" "}
                  {summary.full.length === 1 ? "was" : "were"} full at the last count. You can still plan it, but
                  enrolling may mean a waitlist — TSS has the live count.
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            {offered
              ? families.length > 1
                ? "Choose a lecture under the sections to see its final, what else it needs, and a TSS link for exactly that choice."
                : "Choose the section to see what it needs and a TSS link for exactly it."
              : `${code} is not on the ${termLabel} schedule.`}
          </p>
        )}

        {planner?.scheduled && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              On your {termLabel} schedule in Planner
              {planner.sections ? ` with ${choiceText(families, planner.sections) || "sections chosen"}` : ", no sections chosen yet"}.
            </span>
          </p>
        )}
      </div>

      {/* ── What to do next ─────────────────────────────────────────────── */}
      {offered && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#182B49] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1e3a63] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-600 dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740] dark:disabled:bg-white/10 dark:disabled:text-gray-400"
          >
            {signedIn === false ? <LogIn className="h-4 w-4" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
            {addLabel}
          </button>
          {tssUrl && (
            <a
              href={tssUrl}
              target="_blank"
              rel="noreferrer noopener"
              title={TSS_HINT}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
            >
              {choiceUrl ? `Open ${choice} in TSS` : `Open ${code} in TSS`}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens UCSD&rsquo;s Triton Student System in a new tab)</span>
            </a>
          )}
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            Adding to UCSDPlans does not enroll you. You enroll in TSS (Triton Student System), UC San Diego&rsquo;s
            enrollment site{tssUrl && !choiceUrl && summary?.complete ? "; it could not be linked to exactly this choice, so pick it there" : ""}.
          </p>
        </div>
      )}

      {(ges.length > 0 || reqs.length > 0) && (
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/5">
          <p className={LABEL}>Listed for</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {reqs.map((g) => (
              <li key={g} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">
                {geLabel(g)}
              </li>
            ))}
            {(allGe ? ges : ges.slice(0, 4)).map((g) => (
              <li key={g} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-200">
                {geLabel(g)}
              </li>
            ))}
          </ul>
          {ges.length > 4 && (
            <button type="button" onClick={() => setAllGe((v) => !v)} className="mt-2 text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
              {allGe ? "Show fewer" : `Show all ${ges.length} college GE areas`}
            </button>
          )}
          {ges.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              College GE lists are community-compiled; confirm with your college. University requirements are from UCSD&rsquo;s own lists.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
      <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-gray-600 dark:text-gray-400">{note}</dd>}
    </div>
  );
}
