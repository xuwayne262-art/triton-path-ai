"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, House } from "lucide-react";
import { KINDS, dollars, headline, type PublicListing } from "@/lib/housing/listing";
import { formatStay } from "@/lib/housing/terms";
import type { Mode } from "@/lib/housing/commute";
import { CommuteLine, CoverageChips, type Measure } from "./parts";

export const photoUrl = (ref: string) => `/api/housing/photos/${encodeURIComponent(ref)}`;

/** The street, without the city and ZIP the area line already says. */
export const street = (address: string) => address.split(",")[0];

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
  return (
    <article
      onMouseEnter={() => onFocus(l.id)}
      onMouseLeave={() => onFocus(null)}
      className={`relative overflow-hidden rounded-2xl border bg-white transition dark:bg-white/[0.03] ${
        focused
          ? "border-[#182B49] shadow-md dark:border-[#FFCD00]"
          : "border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20"
      }`}
    >
      <Link
        href={`/housing/${l.id}`}
        onFocus={() => onFocus(l.id)}
        onBlur={() => onFocus(null)}
        className="flex gap-3 p-3 outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00]"
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5 sm:h-28 sm:w-32">
          {cover ? (
            <>
              <Image src={photoUrl(cover)} alt="" fill unoptimized sizes="128px" className="object-cover" />
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
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-black leading-none tabular-nums tracking-tight">
              {dollars(l.rent)}
              <span className="ml-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">/mo</span>
            </p>
            <span className="shrink-0 rounded-full bg-[#182B49]/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#182B49] dark:bg-[#FFCD00]/10 dark:text-[#FFCD00]">
              {KINDS[l.kind]}
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold">{headline(l)}</h3>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {l.area} · {street(l.address)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
            <span className="tabular-nums">{formatStay(l.from, l.to)}</span>
            <CoverageChips from={l.from} to={l.to} />
          </p>
          <div className="mt-2">
            <CommuteLine measure={measure} mode={mode} />
          </div>
        </div>
      </Link>

      {(l.mine || l.state === "stale") && (
        <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-1.5 text-[10px] font-semibold dark:border-white/5">
          {l.mine && <span className="text-[#182B49] dark:text-[#FFCD00]">Your listing</span>}
          {l.state === "stale" && (
            <span className="text-amber-600 dark:text-amber-400">Not reconfirmed in over two weeks — ask before you visit</span>
          )}
        </div>
      )}
    </article>
  );
}
