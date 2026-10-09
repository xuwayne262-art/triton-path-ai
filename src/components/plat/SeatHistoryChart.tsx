"use client";

import { useMemo, useState } from "react";
import { dayLabel, type Pass } from "@/lib/plat";
import { useWidth } from "./useWidth";

/**
 * How full a course got, day by day, against the enrollment passes — the
 * question a student with a Pass 2 appointment is really asking: "will there
 * be a seat left by then?"
 *
 * Two series on one axis, both counted in students: seats (grey, the ceiling)
 * and enrolled (blue, with a light wash under it). A dot marks each day that
 * was actually measured, so a sparse history never passes for a smooth one.
 */

export interface SeatDay {
  /** YYYY-MM-DD, San Diego. */
  day: string;
  enrolled: number;
  capacity: number;
  waitlist: number;
}

const HEIGHT = 200;
const PAD = { top: 22, right: 16, bottom: 26, left: 40 };
const DAY_MS = 86_400_000;

const dayValue = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Round up to a tidy axis top: 348 -> 400, 61 -> 80. */
function niceTop(v: number): number {
  if (v <= 0) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 2, 2.5, 4, 5, 10];
  for (const s of steps) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

export default function SeatHistoryChart({
  points,
  passes,
  classesStart,
  title,
}: {
  points: SeatDay[];
  passes: Pass[];
  /** First day of instruction, YYYY-MM-DD, marked on the axis. */
  classesStart: string | null;
  title: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const sorted = useMemo(() => [...points].sort((a, b) => a.day.localeCompare(b.day)), [points]);
  const passDays = passes.map((p) => ({
    label: p.label,
    day: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(p.date),
  }));

  const marks = [
    ...passDays,
    ...(classesStart ? [{ label: "Classes start", day: classesStart }] : []),
  ];
  const allDays = [...sorted.map((p) => p.day), ...marks.map((m) => m.day)];
  const start = Math.min(...allDays.map(dayValue)) - 2 * DAY_MS;
  const end = Math.max(...allDays.map(dayValue)) + 2 * DAY_MS;

  const top = niceTop(Math.max(...sorted.map((p) => Math.max(p.capacity, p.enrolled)), 1) * 1.05);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (iso: string) => PAD.left + ((dayValue(iso) - start) / (end - start)) * plotW;
  const y = (v: number) => PAD.top + (1 - v / top) * plotH;
  const ticks = [0, top / 2, top];

  const line = (pick: (p: SeatDay) => number) =>
    sorted.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(pick(p)).toFixed(1)}`).join("");
  const area = sorted.length
    ? `${line((p) => p.enrolled)}L${x(sorted[sorted.length - 1].day).toFixed(1)},${y(0)}L${x(sorted[0].day).toFixed(1)},${y(0)}Z`
    : "";

  const monthTicks: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (iso.endsWith("-01")) monthTicks.push(iso);
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + PAD.left;
    let best = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(x(sorted[i].day) - px) < Math.abs(x(sorted[best].day) - px)) best = i;
    }
    setHover(sorted.length ? best : null);
  };

  const last = sorted[sorted.length - 1];
  const h = hover != null ? sorted[hover] : null;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: "var(--viz-1)" }} />
          Enrolled
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: "var(--viz-muted)" }} />
          Seats
        </li>
      </ul>

      <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
        {width > 0 && sorted.length > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={title} className="block">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-ink-3)" className="tabular-nums">
                  {Math.round(v).toLocaleString()}
                </text>
              </g>
            ))}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--viz-axis)" strokeWidth={1} />
            {monthTicks.map((iso) => (
              <text key={iso} x={x(iso)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--viz-ink-3)">
                {new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
              </text>
            ))}

            {/* The passes and the first day of classes: the dates every seat count is read against. */}
            {marks.map((m) => (
              <g key={m.label}>
                <line x1={x(m.day)} x2={x(m.day)} y1={PAD.top - 4} y2={y(0)} stroke="var(--viz-axis)" strokeWidth={1} />
                <text x={x(m.day)} y={PAD.top - 8} textAnchor="middle" fontSize={10} fill="var(--viz-ink-3)">
                  {m.label}
                </text>
              </g>
            ))}

            <path d={area} fill="var(--viz-1)" opacity={0.1} />
            <path d={line((p) => p.capacity)} fill="none" stroke="var(--viz-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={line((p) => p.enrolled)} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {sorted.map((p, i) => (
              <circle
                key={p.day}
                cx={x(p.day)}
                cy={y(p.enrolled)}
                r={hover === i ? 5.5 : 4}
                fill="var(--viz-1)"
                stroke="var(--viz-surface)"
                strokeWidth={2}
              />
            ))}

            {h && (
              <line x1={x(h.day)} x2={x(h.day)} y1={PAD.top} y2={y(0)} stroke="var(--viz-ink-3)" strokeWidth={1} />
            )}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
            />
          </svg>
        )}

        {h && width > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-max -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-white/10 dark:bg-[#101a2b]"
            style={{ left: Math.min(Math.max(x(h.day), 70), width - 70), top: 0 }}
          >
            <p className="font-semibold text-gray-900 dark:text-gray-100">{dayLabel(h.day)}</p>
            <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: "var(--viz-1)" }} />
              <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{h.enrolled.toLocaleString()}</span> enrolled
            </p>
            <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: "var(--viz-muted)" }} />
              <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{h.capacity.toLocaleString()}</span> seats
              {h.waitlist > 0 && <span> · {h.waitlist} waitlisted</span>}
            </p>
          </div>
        )}
      </div>

      {last && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {dayLabel(last.day)}: {last.enrolled.toLocaleString()} of {last.capacity.toLocaleString()} seats taken
          {last.waitlist > 0 ? `, ${last.waitlist} waitlisted` : ""}.
        </p>
      )}
    </div>
  );
}
