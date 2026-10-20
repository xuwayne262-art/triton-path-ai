"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

let probe: Promise<boolean> | null = null;

/**
 * Whether AI course search is switched on for this deployment, asked once per
 * page load: GET /api/course-search says so without spending anything.
 */
export function courseSearchAvailable(): Promise<boolean> {
  probe ??= fetch("/api/course-search", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => body?.available === true)
    .catch(() => false);
  return probe;
}

/**
 * The way into /discover from Home and Courses. It appears only once AI search
 * is on: a link to a beta that answers "not available yet" would only
 * disappoint, and the page's manual filters are the same ones Courses and
 * Easy GEs already have.
 */
export default function DiscoverLink({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    courseSearchAvailable().then((available) => { if (live) setOn(available); });
    return () => { live = false; };
  }, []);
  if (!on) return null;
  return (
    <Link href="/discover" className={className}>
      Describe the courses you want · AI search beta
    </Link>
  );
}
