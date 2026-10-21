"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MessagesSquare } from "lucide-react";
import PlatShell from "./PlatShell";
import PageHeader from "./PageHeader";
import CourseResults from "./CourseResults";
import { PAGE_GAP, PAGE_PAD } from "./typeScale";
import { collegeName, loadGE, loadIndex, type GEFile, type PlatIndex } from "@/lib/plat";
import { discoveryRows, EMPTY_DISCOVERY, type DiscoveryIntent } from "@/lib/discovery";
import { storeHandoff } from "@/lib/planAi/handoff";

const FIELD = "mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#182B49] dark:border-white/15 dark:bg-[#0d1420] dark:focus-visible:ring-[#FFCD00]";

/**
 * /discover: a course finder by college GE list, university requirement and
 * subject, over the filters every list shares. A request in words goes to
 * Plan with AI, in the Planner, which builds from real sections and the
 * student's own plan. This page used to send the words to a model that
 * picked filters, and "warren social science pofc" came back as a search for
 * the word "pofc" with nothing in it.
 */
export default function CourseDiscovery() {
  const router = useRouter();
  const [data, setData] = useState<{ index: PlatIndex; ge: GEFile } | null>(null);
  const [dataFailed, setDataFailed] = useState(false);
  const [request, setRequest] = useState("");
  const [intent, setIntent] = useState<DiscoveryIntent>(EMPTY_DISCOVERY);

  useEffect(() => {
    let live = true;
    Promise.all([loadIndex(), loadGE()])
      .then(([index, ge]) => { if (live) setData({ index, ge }); })
      .catch(() => { if (live) setDataFailed(true); });
    return () => { live = false; };
  }, []);

  const colleges = useMemo(() => data ? [...new Set(data.ge.areas.filter((a) => a.college !== "campus").map((a) => a.college))] : [], [data]);
  const rows = useMemo(() => data ? discoveryRows(intent, data.index, data.ge) : [], [data, intent]);

  function openPlanWithAI(event: React.FormEvent) {
    event.preventDefault();
    if (request.trim()) storeHandoff(request.trim());
    router.push("/planner/ai");
  }

  const reset = () => setIntent(EMPTY_DISCOVERY);
  const scopeChips = [
    ...(intent.college ? [{ label: `${collegeName(intent.college)} GE requirements`, clear: () => setIntent({ ...intent, college: null, area: null }) }] : []),
    ...(intent.area ? [{ label: intent.area.split(":").slice(1).join(":"), clear: () => setIntent({ ...intent, area: null }) }] : []),
    ...(intent.requirement ? [{ label: intent.requirement.slice(7), clear: () => setIntent({ ...intent, requirement: null }) }] : []),
    ...(intent.subject ? [{ label: intent.subject, clear: () => setIntent({ ...intent, subject: null }) }] : []),
  ];

  return (
    <PlatShell>
      <div className={`mx-auto max-w-4xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <PageHeader title="Find courses" description="Choose a college's GE list, a university requirement or a subject, then filter real courses." />

        <section aria-labelledby="plan-ai-title" className={`${PAGE_GAP} rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 dark:border-white/10 dark:bg-white/[0.03]`}>
          <div className="flex items-center gap-2">
            <MessagesSquare aria-hidden="true" className="h-4 w-4 text-[#0f6e7a] dark:text-[#5fd0dc]" />
            <h2 id="plan-ai-title" className="text-sm font-semibold">Plan with AI</h2>
          </div>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            Describe the quarter you want. You get a draft built from real sections and your own plan, and nothing is saved until you choose it.
          </p>
          <form onSubmit={openPlanWithAI} className="mt-4">
            <label htmlFor="plan-request" className="sr-only">What would you like to plan?</label>
            <textarea id="plan-request" value={request} onChange={(e) => setRequest(e.target.value)}
              maxLength={400} rows={2}
              placeholder="Keep my current courses and find a GE after 10 a.m."
              className={`${FIELD} h-auto resize-y py-3`} />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-xs leading-relaxed text-gray-600 dark:text-gray-400">Opens in your Planner. Leave out personal details.</p>
              <button type="submit"
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#182B49] px-4 text-sm font-semibold text-white transition hover:bg-[#243f66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#182B49] dark:bg-[#FFCD00] dark:text-[#182B49]">
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                {request.trim() ? "Plan with AI" : "Open Plan with AI"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-10" aria-labelledby="review-filters">
          <div className="flex items-center justify-between gap-4">
            <h2 id="review-filters" className="text-sm font-semibold">Choose your filters</h2>
            <button type="button" onClick={reset} className="min-h-10 text-xs font-semibold underline">Clear all</button>
          </div>
          <fieldset disabled={!data} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 disabled:opacity-60">
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
          <p className="mt-4 text-xs leading-relaxed text-gray-600 dark:text-gray-400">College GE lists are compiled by students and may be incomplete. Warren College has no list for its Programs of Concentration; Plan with AI asks which program you mean. A listing doesn’t confirm your eligibility or graduation progress, so check your degree audit or college advising.</p>
        </section>

        <div className="mt-6">
          {dataFailed ? <div role="alert" className="rounded-lg border border-red-200 p-4 text-sm"><p>Course data couldn’t load.</p><button type="button" onClick={() => window.location.reload()} className="mt-2 font-semibold underline">Reload course data</button></div> :
            <CourseResults rows={rows} filters={intent.filters} loading={!data} termName={data?.index.meta.termName}
              onChange={(filters) => setIntent({ ...intent, filters })} onResetAll={reset} extraChips={scopeChips}
              emptyHint="No courses match the filters shown. Remove a filter or clear all to broaden your search." />}
        </div>
      </div>
    </PlatShell>
  );
}
