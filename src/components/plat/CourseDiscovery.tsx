"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import PlatShell from "./PlatShell";
import PageHeader from "./PageHeader";
import CourseResults from "./CourseResults";
import { PAGE_GAP, PAGE_PAD } from "./typeScale";
import { useSignedIn, useSignInHref } from "./useSignedIn";
import { courseSearchAvailable } from "./DiscoverLink";
import { collegeName, loadGE, loadIndex, type GEFile, type PlatIndex } from "@/lib/plat";
import { discoveryRows, EMPTY_DISCOVERY, type DiscoveryIntent } from "@/lib/discovery";

const EXAMPLES = [
  "Sixth College humanities GEs with no prerequisites listed",
  "DEI courses offered this term with grade history",
  "COGS courses up to 4 units",
];
const FIELD = "mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#182B49] dark:border-white/15 dark:bg-[#0d1420] dark:focus-visible:ring-[#FFCD00]";

export default function CourseDiscovery() {
  const [data, setData] = useState<{ index: PlatIndex; ge: GEFile } | null>(null);
  const [dataFailed, setDataFailed] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<DiscoveryIntent>(EMPTY_DISCOVERY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [interpreted, setInterpreted] = useState(false);
  const signedIn = useSignedIn();
  const signInHref = useSignInHref();
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([loadIndex(), loadGE()])
      .then(([index, ge]) => { if (live) setData({ index, ge }); })
      .catch(() => { if (live) setDataFailed(true); });
    courseSearchAvailable().then((on) => { if (live) setAvailable(on); });
    return () => { live = false; controller.current?.abort(); };
  }, []);

  const colleges = useMemo(() => data ? [...new Set(data.ge.areas.filter((a) => a.college !== "campus").map((a) => a.college))] : [], [data]);
  const rows = useMemo(() => data ? discoveryRows(intent, data.index, data.ge) : [], [data, intent]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !available || !signedIn || !data) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/course-search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }), signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Search couldn’t finish. Try again.");
      setIntent(body.intent);
      setInterpreted(true);
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Search couldn’t finish. Try again.");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  const reset = () => { setIntent(EMPTY_DISCOVERY); setInterpreted(false); setError(""); };
  const scopeChips = [
    ...(intent.college ? [{ label: `${collegeName(intent.college)} GE requirements`, clear: () => setIntent({ ...intent, college: null, area: null }) }] : []),
    ...(intent.area ? [{ label: intent.area.split(":").slice(1).join(":"), clear: () => setIntent({ ...intent, area: null }) }] : []),
    ...(intent.requirement ? [{ label: intent.requirement.slice(7), clear: () => setIntent({ ...intent, requirement: null }) }] : []),
    ...(intent.subject ? [{ label: intent.subject, clear: () => setIntent({ ...intent, subject: null }) }] : []),
  ];

  return (
    <PlatShell>
      <div className={`mx-auto max-w-4xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <PageHeader title="Find courses in your own words" description="Describe what you’re looking for. Review the filters, then compare real courses." />

        <section aria-labelledby="discovery-title" className={`${PAGE_GAP} rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 dark:border-white/10 dark:bg-white/[0.03]`}>
          <div className="flex items-center gap-2">
            <Search aria-hidden="true" className="h-4 w-4" />
            <h2 id="discovery-title" className="text-sm font-semibold">AI course search <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">Beta</span></h2>
          </div>
          <form onSubmit={search} className="mt-4">
            <label htmlFor="course-request" className="text-sm font-medium">What would you like to take?</label>
            <textarea ref={input} id="course-request" value={query} onChange={(e) => setQuery(e.target.value)}
              minLength={3} maxLength={600} required rows={3} disabled={busy}
              placeholder="Try: Sixth College humanities GEs with no prerequisites listed"
              aria-describedby="discovery-help" className={`${FIELD} h-auto resize-y py-3`} />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p id="discovery-help" className="max-w-md text-xs leading-relaxed text-gray-500 dark:text-gray-400">Your request goes to Google Gemini, which may use it to improve its products, so leave out personal details. 10 searches per student per day; filters are unlimited.</p>
              <button type="submit" disabled={busy || !available || !signedIn || !data || query.trim().length < 3}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#182B49] px-4 text-sm font-semibold text-white transition hover:bg-[#243f66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#FFCD00] dark:text-[#182B49]">
                {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                {busy ? "Reading your request…" : "Find courses"}
              </button>
            </div>
          </form>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Example searches">
            {EXAMPLES.map((example) => <button key={example} type="button" disabled={busy} onClick={() => { setQuery(example); input.current?.focus(); }}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-left text-xs text-gray-600 hover:border-gray-400 focus-visible:ring-2 focus-visible:ring-[#182B49] disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-gray-300">{example}</button>)}
          </div>
          <div className="mt-4 text-sm" role="status" aria-live="polite">
            {available === null ? <p className="text-gray-500 dark:text-gray-400">Checking AI search availability…</p> :
              available === false ? <p className="text-gray-600 dark:text-gray-300">AI search is not available yet. Explore using the filters below.</p> :
              signedIn === false ? <p><Link href={signInHref} className="font-semibold underline">Sign in with your @ucsd.edu account</Link> to use AI search. You can browse with filters now.</p> :
              signedIn === null ? <p>Checking sign-in…</p> : null}
            {busy && <p>Finding search criteria. Your current filters stay visible below.</p>}
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error} Your current filters are unchanged.</p>}
        </section>

        <section className="mt-8" aria-labelledby="review-filters" aria-busy={busy}>
          <div className="flex items-center justify-between gap-4">
            <h2 id="review-filters" className="text-sm font-semibold">{interpreted ? "Review your search filters" : "Or choose your filters"}</h2>
            <button type="button" disabled={busy} onClick={reset} className="min-h-10 text-xs font-semibold underline disabled:opacity-50">Clear all</button>
          </div>
          {interpreted && <p role="status" className="mt-1 text-xs text-gray-500 dark:text-gray-400">AI selected the filters below. Change any of them without another AI request.</p>}
          {(intent.clarification || intent.unsupported.length > 0) && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="status">
            {intent.clarification && <p>{intent.clarification}</p>}
            {intent.unsupported.length > 0 && <><p className="mt-1 font-medium">These parts of your request weren’t applied:</p><ul className="mt-2 list-disc space-y-1 pl-5">{intent.unsupported.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
            <p className="mt-2">Results reflect only the filters shown. Use the <Link href="/planner" className="underline">Planner</Link> to check section times.</p>
          </div>}
          <fieldset disabled={busy || !data} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 disabled:opacity-60">
            <legend className="sr-only">Course search scope</legend>
            <label className="text-xs font-medium">College
              <select value={intent.college ?? ""} onChange={(e) => setIntent({ ...intent, college: e.target.value || null, area: null })} className={FIELD}>
                <option value="">All courses · no college filter</option>
                {colleges.map((college) => <option key={college} value={college}>{collegeName(college)}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">GE area
              <select value={intent.area ?? ""} disabled={!intent.college} onChange={(e) => setIntent({ ...intent, area: e.target.value || null })} className={FIELD}>
                <option value="">{intent.college ? "All available areas" : "Choose a college first"}</option>
                {data?.ge.areas.filter((a) => a.college === intent.college).map((area) => <option key={area.key} value={area.key}>{area.area}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">University requirement
              <select value={intent.requirement ?? ""} onChange={(e) => setIntent({ ...intent, requirement: (e.target.value || null) as DiscoveryIntent["requirement"] })} className={FIELD}>
                <option value="">No requirement filter</option><option value="campus:DEI">Diversity, Equity & Inclusion (DEI)</option><option value="campus:AHI">American History & Institutions (AHI)</option>
              </select>
            </label>
            <label className="text-xs font-medium">Subject
              <select value={intent.subject ?? ""} onChange={(e) => setIntent({ ...intent, subject: e.target.value || null })} className={FIELD}>
                <option value="">All subjects</option>
                {data?.index.subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}
              </select>
            </label>
          </fieldset>
          <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">College GE lists are community compiled and may be incomplete. A listing doesn’t confirm your eligibility or graduation progress. Check your degree audit or college advising. Historical grades and seat snapshots are shown on each course.</p>
        </section>

        <div className="mt-6">
          {dataFailed ? <div role="alert" className="rounded-lg border border-red-200 p-4 text-sm"><p>Course data couldn’t load.</p><button type="button" onClick={() => window.location.reload()} className="mt-2 font-semibold underline">Reload course data</button></div> :
            <fieldset disabled={busy} className="min-w-0"><legend className="sr-only">Course results and additional filters</legend><CourseResults rows={rows} filters={intent.filters} loading={!data} termName={data?.index.meta.termName}
              onChange={(filters) => setIntent({ ...intent, filters })} onResetAll={reset} extraChips={scopeChips}
              emptyHint="No courses match the filters shown. Remove a filter or clear all to broaden your search." /></fieldset>}
        </div>
      </div>
    </PlatShell>
  );
}
