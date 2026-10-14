import type { Metadata } from "next";
import Link from "next/link";
import PlatShell from "@/components/plat/PlatShell";
import PageHeader from "@/components/plat/PageHeader";
import { LABEL, PAGE_GAP, PAGE_PAD } from "@/components/plat/typeScale";
import { ANNOUNCEMENTS } from "@/data/announcements";
import { dayLabel } from "@/lib/plat";

export const metadata: Metadata = {
  title: "Announcements · UCSDPlans",
  description: "What’s new on UCSDPlans: each update, newest first, and where to see it.",
};

/**
 * Every update to the site, newest first, from src/data/announcements.ts.
 * Each one reads date → title → the update in a sentence, then what changed,
 * grouped by where a student will meet it, each with a link to see it.
 */
export default function AnnouncementsPage() {
  return (
    <PlatShell>
      <div className={`mx-auto max-w-3xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <PageHeader title="Announcements" description="What’s new on UCSDPlans, newest first." />

        <div className={PAGE_GAP}>
          {ANNOUNCEMENTS.map((a, i) => (
            <article
              key={a.id}
              id={a.id}
              aria-labelledby={`${a.id}-title`}
              className={i > 0 ? "mt-16 border-t border-gray-200 pt-12 dark:border-white/10" : ""}
            >
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                <time dateTime={a.date}>{dayLabel(a.date, { year: true })}</time>
              </p>
              <h2 id={`${a.id}-title`} className="mt-1.5 text-base font-semibold tracking-tight">{a.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{a.summary}</p>

              {a.groups.map((g) => (
                <section key={g.label} className="mt-10">
                  <h3 className={LABEL}>{g.label}</h3>
                  <ul className="mt-4 space-y-5">
                    {g.items.map((it) => (
                      <li key={it.title} className="text-sm leading-relaxed">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{it.title}</p>
                        <p className="mt-1 text-gray-700 dark:text-gray-300">
                          {it.text}
                          {it.link && (
                            <>
                              {" "}
                              <Link href={it.link.href} className="whitespace-nowrap font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">
                                {it.link.label} →
                              </Link>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          ))}
        </div>

        <p className="mt-16 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          Spotted a problem, or want something added?{" "}
          <Link href="/about" className="font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]">Get in touch</Link>.
        </p>
      </div>
    </PlatShell>
  );
}
