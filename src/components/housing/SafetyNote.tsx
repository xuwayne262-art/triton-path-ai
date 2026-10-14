import { ShieldCheck } from "lucide-react";

/** The one paragraph every page with contact details on it should carry. */
export default function SafetyNote() {
  return (
    <aside className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-100">Everyone here signed in with @ucsd.edu</p>
        <p className="mt-0.5">
          That shows the poster has a @ucsd.edu address. UCSDPlans does not check the place, the price or the
          person. It keeps out most scams, not all. See the place (or a live video tour) before paying anything,
          never pay by wire, gift card or crypto, and sign a sublease that the landlord has approved. Report
          a listing that looks wrong. Three reports take it down.
        </p>
      </div>
    </aside>
  );
}
