"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, House } from "lucide-react";
import { KINDS, KIND_HINT, dollars, headline, type PublicListing } from "@/lib/housing/listing";
import { describeCoverage, formatDay, formatStay, quartersFor } from "@/lib/housing/terms";
import type { Mode } from "@/lib/housing/commute";
import { CommuteLine, type Measure } from "./parts";

export const photoUrl = (ref: string) => `/api/housing/photos/${encodeURIComponent(ref)}`;

/** The street, without the city and ZIP the area line already says. */
export const street = (address: string) => address.split(",")[0];

/**
 * One place, read in order: what it is and where, what it costs and when it
 * is free, then what it would do to your week. Everything else — the facts,
 * each day's trip, how to reach the poster — is one click away on the listing.
 */
export default function ListingCard({
  listing: l, measure, mode, focused, onFocus,
}: {
  listing: PublicListing;
  measure: Measure;
  mode: Mode;
  focused: boolean;
  onFocus: (id: string | null) => void;
}) {
  const cover = l.photos[0];
  const covers = describeCoverage(l.from, l.to);
  // The quarters already carry the year, so the dates need not repeat it.
  const dates = covers && l.from.slice(0, 4) === l.to.slice(0, 4)
    ? `${formatDay(l.from)} – ${formatDay(l.to)}`
    : formatStay(l.from, l.to);
  const coverageTitle = quartersFor(l.from, l.to)
    .map(({ quarter, coverage }) =>
      coverage === "full" ? `Covers all of ${quarter.name}, finals included` : `Covers part of ${quarter.name}`)
    .join("\n");

  return (
    <article
      onMouseEnter={() => onFocus(l.id)}
      onMouseLeave={() => onFocus(null)}
      className={`overflow-hidden rounded-2xl border bg-white transition dark:bg-white/[0.03] ${
        focused
          ? "border-[#182B49] shadow-md dark:border-[#FFCD00]"
          : "border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20"
      }`}
    >
      <Link
        href={`/housing/${l.id}`}
        onFocus={() => onFocus(l.id)}
        onBlur={() => onFocus(null)}
        className="group block p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFCD00] sm:p-5"
      >
        <div className="flex gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5 sm:h-28 sm:w-28">
            {cover ? (
              <>
                <Image src={photoUrl(cover)} alt="" fill unoptimized sizes="112px" className="object-cover" />
                {l.photos.length > 1 && (
                  <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    <Camera className="h-2.5 w-2.5" />{l.photos.length}
                  </span>
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <House className="h-7 w-7 text-gray-300 dark:text-white/15" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-bold leading-snug tracking-tight">{headline(l)}</h3>
            <p className="mt-1 truncate text-[13px] text-gray-500 dark:text-gray-400">
              {l.area} · {street(l.address)}
            </p>

            <p className="mt-3 text-[13px] text-gray-600 dark:text-gray-300">
              <span className="text-[15px] font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">
                {/* No real listing is free; a zero is the form's preview before the rent is typed. */}
                {l.rent > 0 ? dollars(l.rent) : "$—"}
              </span>
              <span className="text-gray-500 dark:text-gray-400">/mo</span>
              <span aria-hidden className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
              <span title={KIND_HINT[l.kind]}>{KINDS[l.kind]}</span>
            </p>
            <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300" title={coverageTitle || undefined}>
              {covers ? (
                <>
                  {covers}{" "}
                  <span className="whitespace-nowrap tabular-nums text-gray-400 dark:text-gray-500">({dates})</span>
                </>
              ) : dates ? (
                <span className="tabular-nums">{dates}</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">Dates to come</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-gray-100 pt-3.5 dark:border-white/5">
          <CommuteLine measure={measure} mode={mode} />
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#182B49] dark:text-[#FFCD00]">
            View details
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>

      {(l.mine || l.state === "stale") && (
        <div className="flex flex-wrap items-center gap-x-2 border-t border-gray-100 px-4 py-2 text-[11px] font-semibold dark:border-white/5 sm:px-5">
          {l.mine && <span className="text-[#182B49] dark:text-[#FFCD00]">Your listing</span>}
          {l.state === "stale" && (
            <span className="text-amber-600 dark:text-amber-400">Not reconfirmed in over two weeks — ask before you visit</span>
          )}
        </div>
      )}
    </article>
  );
}
