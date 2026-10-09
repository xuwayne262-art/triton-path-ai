"use client";

import Link from "next/link";
import { courseHref } from "@/lib/plat";
import { prereqSegments } from "@/lib/prereqs";

/**
 * A prerequisite sentence as the registrar wrote it, with every course it
 * names turned into a link — so "CSE 8B or CSE 11" is two clicks away from
 * either, instead of two searches. Codes the dataset does not know stay text.
 */
export default function PrereqText({ text, known }: { text: string; known: (code: string) => boolean }) {
  return (
    <>
      {prereqSegments(text).map((s, i) =>
        s.code && known(s.code) ? (
          <Link key={i} href={courseHref(s.code)} className="font-semibold underline decoration-current/30 underline-offset-2 hover:decoration-current">
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
