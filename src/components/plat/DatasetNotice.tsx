"use client";

import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { datasetChangedSnapshot, subscribeDatasetChanged } from "@/lib/plat";

/**
 * Shown when the course data was updated while this tab was open. Nothing on
 * the page is cleared or replaced behind the student's back: the plan stays as
 * it is, and a reload brings every list and section to the same new snapshot.
 */
export default function DatasetNotice() {
  const changed = useSyncExternalStore(subscribeDatasetChanged, datasetChangedSnapshot, () => false);
  if (!changed) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <span>The course data was updated while this page was open. Reload to see this term&rsquo;s latest sections and seats.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#182B49] px-3 text-xs font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reload
        </button>
      </div>
    </div>
  );
}
