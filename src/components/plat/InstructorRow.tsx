"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Star } from "lucide-react";
import { professorHref, type ProfRecord, type ProfessorRecord } from "@/lib/plat";
import { DifficultyTag, GradeBadge, RmpRating } from "./Grade";
import GradeBars from "./GradeBars";
import RateProfessor from "./RateProfessor";
import { ratingKey, useTermRatings } from "./useTermRatings";

/**
 * One instructor of one course, collapsed to a line: their own history in
 * this course, their RateMyProfessors scores, and what they teach this term.
 *
 * Three separate controls, because they do three different things: the name
 * opens their professor page, the chevron opens their grade distribution
 * here, and "Rate" (signed in, this term) opens the rating form. The name
 * used to be a button that opened the rating panel, and a page's only way to
 * the professor was the search box.
 *
 * Every number says whose it is. The badge is this instructor's past average
 * in this course — with how many terms and how recent — while the star and
 * the difficulty are RateMyProfessors scores for the person across all of
 * their courses. A missing one says so in words rather than reading as zero.
 */
export default function InstructorRow({
  prof, code, profile, teaches, latest, first = false, defaultOpen = false, rating, canRate,
}: {
  prof: ProfRecord;
  /** "CSE 11" */
  code: string;
  /** Their professor page's record, when one answers to this name. */
  profile: ProfessorRecord | null;
  /** "Lecture A" — what they teach this term, when the schedule names them. */
  teaches: string[];
  /** "Fall 2021" — the newest term of their history in this course. */
  latest: string | null;
  first?: boolean;
  defaultOpen?: boolean;
  /** null for past instructors: rating is scoped to the current term. */
  rating: { term: string; termName: string; code: string } | null;
  /** Ratings are saved to an account, so a visitor who is not signed in cannot rate. */
  canRate: boolean;
}) {
  const panel = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [rateOpen, setRateOpen] = useState(false);
  const { ratings } = useTermRatings();
  const mine = rating ? ratings[ratingKey(rating.term, rating.code, prof.i)] : undefined;
  const hasHistory = prof.g > 0 && prof.n > 0;

  return (
    <div className={first ? "" : "border-t border-gray-100 dark:border-white/5"}>
      <div className="flex w-full items-start gap-3 px-3 py-3">
        <GradeBadge gpa={hasHistory ? prof.g : null} terms={prof.n} size="sm" />

        <div className="min-w-0 flex-1">
          {profile ? (
            <Link
              href={professorHref(profile.n)}
              className="text-sm font-semibold text-[#182B49] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#182B49] dark:text-[#FFCD00] dark:focus-visible:ring-[#FFCD00]"
            >
              {prof.i}
              <span className="sr-only">, professor page</span>
            </Link>
          ) : (
            <span className="text-sm font-semibold">{prof.i}</span>
          )}
          {teaches.length > 0 && (
            <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">teaches {teaches.join(", ")}</span>
          )}

          <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            {hasHistory ? (
              <>
                {code} history: {prof.g.toFixed(2)} average over {prof.n} graded {prof.n === 1 ? "term" : "terms"}
                {latest ? `, latest ${latest}` : ""}
                {prof.n === 1 && <span className="font-semibold text-amber-800 dark:text-amber-300"> · limited history</span>}
              </>
            ) : (
              <>No published grade history in {code}{prof.n > 0 ? " (pass/no pass or too small to publish)" : ""}</>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-600 dark:text-gray-400">
            {prof.rq != null && prof.rq > 0 ? (
              <>
                <span>RMP</span>
                <RmpRating q={prof.rq} n={prof.rn} name={prof.i} />
                <span>{prof.rn ? `${prof.rn} ${prof.rn === 1 ? "rating" : "ratings"}` : ""}</span>
                <DifficultyTag d={prof.rd} name={prof.i} />
              </>
            ) : (
              <span>No RateMyProfessors rating</span>
            )}
            {mine && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-[#1B2C4F] dark:text-[#FFC72C]">
                <Star aria-hidden className="h-3 w-3 fill-current" />
                your rating {mine.quality}/5 (private)
              </span>
            )}
            {rating && canRate && (
              <button
                type="button"
                onClick={() => setRateOpen((v) => !v)}
                aria-expanded={rateOpen}
                className="font-semibold text-[#182B49] underline-offset-2 hover:underline dark:text-[#FFCD00]"
              >
                {mine ? "Edit your rating" : `Rate for ${rating.termName}`}
              </button>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panel}
          aria-label={`${open ? "Hide" : "Show"} ${prof.i}'s grade distribution in ${code}`}
          className="shrink-0 rounded p-1.5 text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2C4F] dark:text-gray-400 dark:hover:bg-white/10 dark:focus-visible:ring-[#FFC72C]"
        >
          <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {rating && canRate && rateOpen && (
        <RateProfessor
          key={`${rating.term}:${rating.code}:${prof.i}`}
          term={rating.term}
          termName={rating.termName}
          code={rating.code}
          instructor={prof.i}
          onClose={() => setRateOpen(false)}
        />
      )}

      <div id={panel} hidden={!open} className="px-3 pb-5 pl-14">
        {open && (
          <>
            <GradeBars prof={prof} />
            {prof.rid ? (
              <a
                href={`https://www.ratemyprofessors.com/professor/${prof.rid}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1 text-xs text-gray-600 hover:underline dark:text-gray-400"
              >
                {prof.rn ?? 0} RateMyProfessors ratings
                {prof.rw != null && prof.rw > 0 ? ` · ${prof.rw}% would take again` : ""}
                {" "}(all of {prof.i.split(" ")[0]}&rsquo;s courses)
                <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
