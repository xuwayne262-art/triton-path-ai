"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, ChevronDown, ChevronLeft, ExternalLink, Star } from "lucide-react";
import PlatShell from "@/components/plat/PlatShell";
import Disclosure from "@/components/plat/Disclosure";
import { GradeBadge, LoadTag, SeatWarning } from "@/components/plat/Grade";
import GradeBars from "@/components/plat/GradeBars";
import { useShortlist } from "@/components/plat/useShortlist";
import {
  geLabel, loadIndex, loadSubject, prettyRange, seatState, SECTION_TYPES, splitDays, typicalGrade,
  type CourseDetail, type PlatIndex, type ProfRecord, type SubjectFile,
} from "@/lib/plat";

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ sub: string; num: string }>;
}) {
  const raw = use(params);
  const sub = decodeURIComponent(raw.sub).toUpperCase();
  const num = decodeURIComponent(raw.num);
  const code = `${sub} ${num}`;

  const [index, setIndex] = useState<PlatIndex | null>(null);
  const [subject, setSubject] = useState<SubjectFile | null>(null);
  const [failed, setFailed] = useState(false);
  const { has, toggle } = useShortlist();

  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);
  useEffect(() => { loadSubject(sub).then(setSubject).catch(() => setFailed(true)); }, [sub]);

  // Navigating to another subject must not show the previous one's data while
  // the new file loads, so drop it during render rather than after a paint.
  const [loadedFor, setLoadedFor] = useState(sub);
  if (loadedFor !== sub) {
    setLoadedFor(sub);
    setSubject(null);
    setFailed(false);
  }

  const detail: CourseDetail | undefined = subject?.courses[code];
  const row = index?.courses.find((c) => c.k === code);

  /**
   * This term's instructors, best grade history first, so the option the summary
   * recommends is the one that leads the list and opens by default.
   */
  const teaching = useMemo(
    () => [...(detail?.profs ?? [])].filter((p) => p.cur === 1).sort((a, b) => b.g - a.g),
    [detail],
  );
  const past = useMemo(() => detail?.profs.filter((p) => p.cur !== 1) ?? [], [detail]);

  const verdict = typicalGrade(detail?.gpa, detail?.terms);
  const saved = has(code);

  if (failed || (subject && !detail)) {
    return (
      <PlatShell>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-xl font-bold">{code} isn&apos;t in the dataset</h1>
          <p className="mt-2 text-sm text-gray-500">
            It may be graduate-only or recently retired.
          </p>
          <Link href={`/courses/${sub}`} className="mt-6 inline-block text-sm font-semibold text-[#182B49] underline dark:text-[#FFCD00]">
            Browse {sub}
          </Link>
        </div>
      </PlatShell>
    );
  }

  return (
    <PlatShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={`/courses/${sub}`}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> {subject?.name ?? sub}
        </Link>

        {/* ── The answer, up front ─────────────────────────────────────────── */}
        <header className="mt-4 flex items-start gap-5">
          <GradeBadge gpa={detail?.gpa} terms={detail?.terms ?? 0} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">{code}</p>
            <h1 className="mt-0.5 text-2xl font-black leading-tight">{detail?.t ?? row?.t ?? "…"}</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {detail ? summary(detail, verdict?.letter, teaching) : "Loading grade history…"}
            </p>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(code)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              saved
                ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                : "border border-gray-300 hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10"
            }`}
          >
            <BookMarked className="h-4 w-4" />
            {saved ? "Saved" : "Save to planner"}
          </button>
          {detail?.u && (
            <span className="text-sm text-gray-500 dark:text-gray-400">{parseFloat(detail.u)} units</span>
          )}
          {detail?.seatUrl && (
            <a
              href={detail.seatUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:underline dark:text-gray-400"
            >
              Live seats <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {detail?.pre && (
          <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="font-semibold">Prerequisites: </span>{detail.pre}
          </p>
        )}

        {detail && detail.ge.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Satisfies</span>
            {detail.ge.slice(0, 4).map((g) => (
              <span
                key={g}
                className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
              >
                {geLabel(g)}
              </span>
            ))}
            {detail.ge.length > 4 && (
              <span className="text-[11px] text-gray-400">+{detail.ge.length - 4} more below</span>
            )}
          </div>
        )}

        {/* ── Who to take it with ──────────────────────────────────────────── */}
        {teaching.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-500">
              Teaching this term
            </h2>
            <p className="mb-3 text-xs text-gray-400">
              {teaching.length === 1 ? "One option." : `${teaching.length} options — the grade histories differ.`}
            </p>
            <div className="rounded-xl border border-gray-200 dark:border-white/10">
              {teaching.map((p, i) => <ProfLine key={p.i} prof={p} first={i === 0} defaultOpen={i === 0} />)}
            </div>
          </section>
        )}

        {/* ── Everything else, collapsed ───────────────────────────────────── */}
        <div className="mt-10">
          {detail && detail.sec.length > 0 && (
            <Disclosure
              title={`${index?.meta.termName ?? "This term"} sections`}
              hint={`${detail.sec.filter((s) => s[1] !== "FI").length} meetings`}
              defaultOpen
            >
              <Sections detail={detail} />
            </Disclosure>
          )}

          {detail && detail.ge.length > 0 && (
            <Disclosure title="Requirements this satisfies" hint={`${detail.ge.length} areas`}>
              <ul className="list-none space-y-1.5 p-0">
                {detail.ge.map((g) => (
                  <li key={g} className="text-sm text-gray-600 dark:text-gray-300">{geLabel(g)}</li>
                ))}
              </ul>
            </Disclosure>
          )}

          {past.length > 0 && (
            <Disclosure title="Past instructors" hint={`${past.length}`}>
              <div className="rounded-xl border border-gray-200 dark:border-white/10">
                {past.map((p) => <ProfLine key={p.i} prof={p} />)}
              </div>
            </Disclosure>
          )}
        </div>
      </div>
    </PlatShell>
  );
}

/** One plain-English sentence instead of a strip of four competing numbers. */
function summary(detail: CourseDetail, letter: string | undefined, teaching: ProfRecord[]): string {
  if (!letter) return "No grade distribution has been published for this course yet.";
  const base = `Students typically earn a ${letter} here, across ${detail.terms} graded ${detail.terms === 1 ? "term" : "terms"}.`;
  if (teaching.length < 2) return base;
  const ranked = [...teaching].sort((a, b) => b.g - a.g);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  if (best.g > 0 && worst.g > 0 && best.g - worst.g >= 0.3) {
    return `${base} Who you pick matters: ${best.i.split(" ").slice(-1)[0]} averages ${best.g.toFixed(2)} against ${worst.i.split(" ").slice(-1)[0]}'s ${worst.g.toFixed(2)}.`;
  }
  return `${base} The instructors teaching it grade similarly.`;
}

/** Collapsed to a single line; the distribution opens on click. */
function ProfLine({
  prof, first = false, defaultOpen = false,
}: { prof: ProfRecord; first?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={first ? "" : "border-t border-gray-100 dark:border-white/5"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/5"
      >
        <GradeBadge gpa={prof.g} terms={prof.n} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{prof.i}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{prof.n > 0 ? `${prof.n} term${prof.n === 1 ? "" : "s"}` : "no grade history"}</span>
            <LoadTag difficulty={prof.rd} />
          </span>
        </span>
        {prof.rq != null && prof.rq > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <Star className="h-3 w-3 fill-current" />
            {prof.rq.toFixed(1)}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-5 pl-14">
          <GradeBars prof={prof} />
          {prof.rid && (
            <a
              href={`https://www.ratemyprofessors.com/professor/${prof.rid}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:underline dark:text-gray-400"
            >
              {prof.rn ?? 0} RateMyProfessors ratings
              {prof.rw != null && prof.rw > 0 ? ` · ${prof.rw}% would retake` : ""}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Sections({ detail }: { detail: CourseDetail }) {
  const rows = [...detail.sec].sort((a, b) => {
    const rank = (t: string) => (t === "FI" || t === "MI" ? 2 : t === "LE" ? 0 : 1);
    return rank(a[1]) - rank(b[1]) || a[0].localeCompare(b[0]);
  });

  return (
    <ul className="list-none space-y-2 p-0">
      {rows.map((s, i) => {
        const seats = seatState(s[8], s[9]);
        const exam = s[1] === "FI" || s[1] === "MI";
        return (
          <li key={`${s[0]}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="w-28 shrink-0 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono font-semibold">{s[0]}</span>{" "}
              {SECTION_TYPES[s[1]] ?? s[1]}
            </span>
            <span className="text-gray-700 dark:text-gray-200">
              {exam ? s[2] : splitDays(s[2]).join("")} {prettyRange(s[3], s[4])}
            </span>
            {s[5] && <span className="text-xs text-gray-500 dark:text-gray-400">{s[5]} {s[6]}</span>}
            {seats.known && <SeatWarning avail={s[8]} limit={s[9]} />}
          </li>
        );
      })}
    </ul>
  );
}
