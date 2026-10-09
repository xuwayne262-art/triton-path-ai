"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Instagram, Mail } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/components/plat/ContactMenu";
import { dayLabel, loadGE, loadIndex, refreshedLabel, type GEFile, type IndexMeta } from "@/lib/plat";

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
  useEffect(() => { loadGE().then(setGE).catch(() => {}); }, []);
  const campus = ge?.meta.campus;

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">About UCSDPlans</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-gray-700 dark:text-gray-200">
          UCSDPlans puts what UC San Diego publishes about its courses in one place: how every class has
          actually graded since 2015, who is teaching it this term and how students rate them, where and
          when each section meets, how full it is, and which requirements it counts toward. Anyone can
          browse it. Signing in with a UCSD Google account adds the Planner — this term&rsquo;s week and all
          four years — your Academic History, and student housing.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-bold">Who makes it</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-700 dark:text-gray-200">
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

        <section className="mt-10">
          <h2 className="text-lg font-bold">Where the numbers come from</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Grades, courses, sections, seats and the university requirements come from UC San Diego&rsquo;s own
            publications. Two things do not yet: the college GE lists and the RateMyProfessors scores.
          </p>
          <ul className="mt-4 space-y-4">
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
                ? `${meta.termName}'s sections, rooms, instructors, seats and waitlists${refreshedLabel(meta.refreshed) ? `, as of ${refreshedLabel(meta.refreshed)}` : ""}. Seats are counted again every day, which is what draws each course's "Seats over time".`
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
              what={`Each college's approved GE courses, as compiled by the ucsd-easy-a-radar project${ge?.meta.date ? ` (${ge.meta.date})` : ""} rather than taken from the colleges directly. Your college's own list is the authority.`}
            />
            <Source
              name="RateMyProfessors (via the same project)"
              url="https://www.ratemyprofessors.com"
              what="Each instructor's overall rating, difficulty and would-take-again share. Only the scores are shown here; the reviews themselves stay on RateMyProfessors."
            />
          </ul>
        </section>

        <section id="letter" className="mt-10 scroll-mt-24">
          <h2 className="text-lg font-bold">How the letter grade is worked out</h2>
          <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-gray-700 dark:text-gray-200">
            <p>
              The letter on a course is not a grade anyone received. For each course we take every
              published grade record (one per instructor per term), average their GPAs weighted by the
              number of terms each instructor taught it, and round that average to the nearest official
              UCSD grade point: 3.85+ shows A, 3.50+ A−, 3.15+ B+, 2.85+ B, 2.50+ B−, 2.15+ C+, 1.85+ C,
              1.50+ C−, and D or F below that.
            </p>
            <p>
              Terms the archive publishes without a GPA — fully pass/no-pass offerings, sections too small
              to report — are left out of that average rather than counted as zeros. Weighting counts terms
              taught rather than students enrolled, so an instructor with many small sections pulls the
              average further than one with a couple of large lectures. A professor&rsquo;s letter applies
              the same rule to their own records.
            </p>
            <p>
              Each letter always has the same colour: A dark green, A− green, B+ amber, B and B− orange, C+
              and below red. Sorting by best grades orders courses by that same average, highest first. An
              amber dot means a single term of history stands behind the letter, and a dash means no
              published history at all.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold">What is public, and what is yours</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-700 dark:text-gray-200">
            Browsing courses, departments, professors and GEs needs no account. Your Planner, starred
            courses, your own instructor ratings and your Academic History are saved to your UCSD account
            and shown only to you. Housing is for signed-in UCSD students only, so a lister&rsquo;s place and
            contact details are never public.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/" className="font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">Back to the courses →</Link>
          </p>
        </section>
      </div>
    </PlatShell>
  );
}

function Source({ name, url, what }: { name: string; url: string; what: string }) {
  return (
    <li className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
      <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
        {name} <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
      <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{what}</p>
    </li>
  );
}
