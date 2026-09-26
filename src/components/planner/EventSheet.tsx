"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, ExternalLink, ListChecks, Trash2, X } from "lucide-react";
import type { Building } from "@/lib/plat";
import { ROLE_STYLES } from "@/lib/plannerBridge";
import { directionsUrl } from "@/lib/campus";
import { minutesToLabel, type CalEvent } from "@/lib/sections";

const DAY_NAMES: Record<CalEvent["day"], string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday",
};

/**
 * A class tapped on the phone's calendar, with what you can do about it.
 *
 * On a desktop that is spread across hover: the block's tooltip gives the room
 * and instructor, its corner × removes it, and the rail beside it changes the
 * section. A phone has no hover and no rail beside the week, so all of it
 * comes up here, over the calendar, within reach of a thumb.
 */
export default function EventSheet({
  event, building, onClose, onChangeSections, onRemove,
}: {
  event: CalEvent;
  building: Building | null;
  onClose: () => void;
  onChangeSections: () => void;
  onRemove: () => void;
}) {
  const style = ROLE_STYLES[event.role];
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves in, so a screen reader lands on the sheet it just opened;
  // Escape closes it, as it would a dialog.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const section = event.sectionCode ? `${event.kindLabel} ${event.sectionCode}` : event.kindLabel;
  const where = [event.where, event.building && event.building !== event.where ? event.building : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end md:hidden">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-sheet-title"
        className="relative rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-4 pt-2 shadow-2xl dark:border-white/10 dark:bg-gray-800"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-white/20" />
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: style.hex }} />
          <div className="min-w-0 flex-1">
            <h2 id="event-sheet-title" className="text-base font-bold">{event.code}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">{event.title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-gray-500 dark:text-gray-400">Section</dt>
            <dd className="min-w-0 font-medium">{section}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-gray-500 dark:text-gray-400">When</dt>
            <dd className="min-w-0 font-medium">
              {DAY_NAMES[event.day]} · {minutesToLabel(event.startMin)} – {minutesToLabel(event.endMin)}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-gray-500 dark:text-gray-400">Where</dt>
            <dd className="min-w-0 font-medium">{where || "Room not assigned yet"}</dd>
          </div>
          {event.instructor && (
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-gray-500 dark:text-gray-400">Teaching</dt>
              <dd className="min-w-0 font-medium">{event.instructor}</dd>
            </div>
          )}
        </dl>

        {event.conflict && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Overlaps another course — change a section to fix it.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {event.sectionCode && (
            <button
              type="button"
              onClick={onChangeSections}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#182B49] px-3 py-3 text-sm font-semibold text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
            >
              <ListChecks className="h-4 w-4" />
              Change sections
            </button>
          )}
          {building ? (
            <a
              href={directionsUrl(building.ll)}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold dark:border-white/15"
            >
              Directions <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onRemove}
            className="col-span-2 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Remove {event.code} from this term
          </button>
        </div>
      </div>
    </div>
  );
}
