"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Instagram, Mail } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { PAGE_PAD, PAGE_TITLE, SECTION_TITLE } from "@/components/plat/typeScale";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/components/plat/ContactMenu";
import { collegeName, dayLabel, loadGE, loadIndex, refreshedLabel, type GEFile, type IndexMeta } from "@/lib/plat";
import { SEAT_STALE_HOURS, seatSpan, spanLabel } from "@/lib/freshness";
import { COLLEGE_SOURCES, COLLEGE_SOURCES_CHECKED } from "@/data/collegeSources";

/**
 * What UCSDPlans is, who makes it, where every number comes from and how the
 * letter badge is worked out. The last used to be a paragraph in the footer
 * of every page; it lives here now, one link away, and the footer names the
 * sources in a sentence.
 */
export default function AboutPage() {
  const [meta, setMeta] = useState<IndexMeta | null>(null);
  const [ge, setGE] = useState<GEFile | null>(null);
  useEffect(() => { loadIndex().then((d) => setMeta(d.meta)).catch(() => {}); }, []);
  const takenOn = refreshedLabel(meta?.refreshed);
  const readOn = refreshedLabel(meta?.retrieved);
  // Class Planner recounts each section's seats from TSS on its own clock, so
  // one dataset holds counts taken weeks apart: say the span, not one date.
  const span = meta?.seatsNewest ? seatSpan([meta.seatsAsOf, meta.seatsNewest]) : null;
  useEffect(() => { loadGE().then(setGE).catch(() => {}); }, []);
  const campus = ge?.meta.campus;

  return (
    <PlatShell>
      <div className={`mx-auto max-w-3xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <h1 className={PAGE_TITLE}>About UCSDPlans</h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
          UCSDPlans puts what UC San Diego publishes about its courses in one place: how every class has
          actually graded since 2015, who is teaching it this term and how students rate them, where and
          when each section meets, how full it is, and which requirements it counts toward. Anyone can
          browse it. Signing in with a UCSD Google account adds the Planner — this term&rsquo;s week and all
          four years — your Academic History, and student housing.
        </p>

        <section className="mt-12">
          <h2 className={SECTION_TITLE}>Who makes it</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            UCSDPlans is built and run by <span className="font-semibold">@{INSTAGRAM_HANDLE}</span>. Found a
            mistake in a number, or want something added? Get in touch.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">
              <Instagram className="h-4 w-4" /> @{INSTAGRAM_HANDLE} <ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />
            </a>
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("UCSDPlans")}`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">
              <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
            </a>
          </div>
        </section>

        <section className="mt-12">
          <h2 className={SECTION_TITLE}>Where the numbers come from</h2>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Grades, courses, sections, seats and the university requirements come from UC San Diego&rsquo;s own
            publications. Two things do not yet: the college GE lists and the RateMyProfessors scores.
          </p>
          <ul className="mt-5 space-y-4">
            <Source
              name="UCSD Associated Students Instructor Grade Archive"
              url="https://asmain.ucsd.edu/Home/InstructorGradeArchive"
              what={meta
                ? `${meta.gradeRecords.toLocaleString()} course–instructor grade distributions, ${meta.years}, one per instructor per term — the average GPA and the share of each letter. Retrieved ${dayLabel(meta.generated, { weekday: false, year: true })}.`
                : "Grade distributions, one per instructor per term."}
            />
            <Source
              name="UCSD General Catalog"
              url="https://catalog.ucsd.edu/front/courses.html"
              what="Every course that exists, its units, description and prerequisites, and the courses that satisfy American History & Institutions (AHI)."
            />
            <Source
              name="UC San Diego Class Planner"
              url="https://classplanner.apps.ucsd.edu"
              what={meta
                ? `${meta.termName}'s sections, rooms, instructors, seats and waitlists. UCSD last refreshed these listings${takenOn ? ` on ${takenOn}` : ""}${readOn ? `, and this site last read them on ${readOn}` : ""}. Seat counts are Class Planner's own counts from TSS, taken section by section${span ? ` between ${spanLabel(span)}` : ""} — see "How fresh the seat counts are" below.`
                : "This term's sections, rooms, seats and waitlists."}
            />
            <Source
              name="UCSD Academic Senate — Diversity, Equity & Inclusion approved courses"
              url={campus?.dei.url ?? "https://senate.ucsd.edu/media/513521/dei-list-of-courses.pdf"}
              what={`Which courses count for the campus DEI requirement${campus?.dei.termName ? `, with ${campus.dei.termName}'s offerings from the Undergraduate Education list as of ${campus.dei.asOf}` : ""}.`}
            />
            <Source
              name="College GE lists (community-compiled)"
              url="https://github.com/Edwardwang66/ucsd-easy-a-radar"
              what={`Each college's approved GE courses for some of its areas, as compiled by the ucsd-easy-a-radar project${ge?.meta.date ? ` (${dayLabel(ge.meta.date, { weekday: false, year: true })})` : ""} rather than taken from the colleges directly. Your college's own list is the authority — see "What the GE lists cover" below.`}
            />
            <Source
              name="RateMyProfessors (via the same project)"
              url="https://www.ratemyprofessors.com"
              what="Each instructor's overall rating, difficulty and would-take-again share. Only the scores are shown here; the reviews themselves stay on RateMyProfessors."
            />
          </ul>
        </section>

        <section id="seats" className="mt-12 scroll-mt-32 lg:scroll-mt-24">
          <h2 className={SECTION_TITLE}>How fresh the seat counts are</h2>
          <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <p>
              Seats are never live here. UCSD&rsquo;s Class Planner counts each section&rsquo;s seats from TSS on
              its own schedule, so one course can hold counts taken weeks apart — on Oct 12, 2026, BILD 4&rsquo;s
              lecture B had been counted that afternoon and lecture A on Sep 21. Every section therefore shows
              the day its own count was taken, and a list or a course total shows its oldest.
            </p>
            <p>
              A count more than {SEAT_STALE_HOURS} hours old is marked <span className="font-semibold">old</span>:
              Class Planner recounts about once a day when its refresh is working, so an older count has missed
              at least one recount. A count Class Planner gave no time for says &ldquo;count time unknown&rdquo;,
              which is not the same as no seats. When this site reads Class Planner again and nothing was
              recounted, the counts keep their old times — reading them again does not make them newer.
            </p>
            <p>Before you enroll, check the section in TSS, which has the live numbers.</p>
          </div>
        </section>

        <section id="letter" className="mt-12 scroll-mt-32 lg:scroll-mt-24">
          <h2 className={SECTION_TITLE}>How the letter grade is worked out</h2>
          <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <p>
              The letter on a course is its <span className="font-semibold">historical average</span>, not a
              grade anyone received and not a prediction of yours. The grade archive publishes one record per
              instructor per term: the class&rsquo;s average GPA and the share of each letter. For each instructor
              of a course, their average is taken over the terms that published a GPA; the course&rsquo;s average
              then weights each instructor by how many terms they taught it. That average is rounded to the
              nearest official UCSD grade point: 3.85+ shows A, 3.50+ A−, 3.15+ B+, 2.85+ B, 2.50+ B−, 2.15+ C+,
              1.85+ C, 1.50+ C−, and D or F below that.
            </p>
            <p>
              Terms the archive publishes without a GPA — fully pass/no-pass offerings, sections too small to
              report — are left out of an instructor&rsquo;s average rather than counted as zeros, though they still
              count toward how many terms that instructor taught. The archive does not say how many students
              were in each class, so nothing is weighted by enrollment: an instructor with many small sections
              pulls the average further than one with a couple of large lectures. A professor&rsquo;s own letter
              applies the same rule across their courses.
            </p>
            <p>
              Each letter always has the same colour: A dark green, A− green, B+ amber, B and B− orange, C+ and
              below red. Sorting by best grades orders courses by that same average, highest first. A single
              term of history is marked &ldquo;limited history&rdquo; (and an amber dot on the badge), and a dash
              means no published history at all — not low grades.
            </p>
          </div>
        </section>

        <section id="ratings" className="mt-12 scroll-mt-32 lg:scroll-mt-24">
          <h2 className={SECTION_TITLE}>What the ratings and difficulty mean</h2>
          <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <p>
              The star is an instructor&rsquo;s RateMyProfessors overall rating, out of 5, and &ldquo;RMP difficulty&rdquo;
              is the difficulty students gave them there, also out of 5. Both describe the person across all of
              their courses, self-reported by whoever chose to rate them — they are not a measure of one
              course&rsquo;s workload, and the site does not turn them into hours or a &ldquo;load&rdquo;. An instructor
              with no rating shows none, which is not a zero.
            </p>
            <p>
              On a list of courses, the rating beside a course is that of the instructor of its first lecture on
              this term&rsquo;s schedule; the course page lists every instructor with their own. Your own ratings,
              when you rate an instructor while signed in, stay private to your account and never change the
              RateMyProfessors numbers shown to anyone.
            </p>
          </div>
        </section>

        <section id="ge" className="mt-12 scroll-mt-32 lg:scroll-mt-24">
          <h2 className={SECTION_TITLE}>What the GE lists cover</h2>
          <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <p>
              The college GE lists are community-compiled, not published by the colleges, and they cover only
              the areas that have a fixed list of approved courses. Areas defined by a rule — a writing program,
              a department&rsquo;s courses, a sequence — are left out, so a college&rsquo;s page here is not every
              requirement it has. Being on a list is not a degree audit: double-counting, transfer credit, AP and
              when you entered all depend on your college&rsquo;s rules. The Diversity, Equity &amp; Inclusion and
              American History &amp; Institutions lists come from UCSD&rsquo;s own publications.
            </p>
            <p>Each college&rsquo;s own requirements (links checked {dayLabel(COLLEGE_SOURCES_CHECKED, { weekday: false, year: true })}):</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {Object.entries(COLLEGE_SOURCES).map(([key, src]) => (
                <li key={key}>
                  <a href={src.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
                    {collegeName(key)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  {src.publisher !== src.name && <span className="text-xs text-gray-600 dark:text-gray-400"> · {src.publisher}</span>}
                </li>
              ))}
            </ul>
            {ge?.meta.note && (
              <details className="text-xs text-gray-600 dark:text-gray-400">
                <summary className="cursor-pointer font-semibold">How the lists were prepared</summary>
                <p className="mt-2 leading-relaxed">{ge.meta.note}</p>
              </details>
            )}
          </div>
        </section>

        <section className="mt-12">
          <h2 className={SECTION_TITLE}>What is public, and what is yours</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            Browsing courses, departments, professors and GEs needs no account. Your Planner, starred
            courses, your own instructor ratings and your Academic History are saved to your UCSD account
            and shown only to you. Housing is for signed-in UCSD students only, so a lister&rsquo;s place and
            contact details are never public.
          </p>
          <p className="mt-5 text-sm">
            <Link href="/" className="font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">Back to the courses →</Link>
          </p>
        </section>
      </div>
    </PlatShell>
  );
}

function Source({ name, url, what }: { name: string; url: string; what: string }) {
  return (
    <li className="rounded-xl border border-gray-200 p-5 dark:border-white/10">
      <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
        {name} <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
      <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{what}</p>
    </li>
  );
}
