import Link from "next/link";
import PlatShell from "@/components/plat/PlatShell";
import { PAGE_PAD, PAGE_TITLE } from "@/components/plat/typeScale";
import { dayLabel } from "@/lib/plat";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LINK, LEGAL_LINKS } from "@/lib/legal";

export interface LegalHeading {
  id: string;
  title: string;
}

/**
 * A legal page: a readable measure (about 75 characters a line), 15px text,
 * the effective date under the title, and a list of sections to jump to when
 * the page is long. Public, so it opens before anyone signs in.
 */
export default function LegalDocument({
  title,
  intro,
  headings,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  headings: readonly LegalHeading[];
  children: React.ReactNode;
}) {
  const others = LEGAL_LINKS.filter((l) => l.label !== title);
  return (
    <PlatShell>
      <article className={`mx-auto max-w-2xl px-4 sm:px-6 ${PAGE_PAD}`}>
        <h1 className={PAGE_TITLE}>{title}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Effective {dayLabel(LEGAL_EFFECTIVE_DATE, { weekday: false, year: true })}
        </p>
        <div className="mt-6 space-y-4 text-[15px] leading-7 text-gray-700 dark:text-gray-200">{intro}</div>

        {headings.length > 3 && (
          <nav aria-label="On this page" className="mt-8 rounded-xl border border-gray-200 p-5 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">On this page</p>
            <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              {headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className={LEGAL_LINK}>{h.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mt-12 space-y-12">{children}</div>

        <p className="mt-16 border-t border-gray-200 pt-6 text-sm text-gray-600 dark:border-white/10 dark:text-gray-300">
          Also read:{" "}
          {others.map((l, i) => (
            <span key={l.href}>
              {i > 0 && " and "}
              <Link href={l.href} className={LEGAL_LINK}>{l.label}</Link>
            </span>
          ))}
          .
        </p>
      </article>
    </PlatShell>
  );
}

/** One numbered or named part of a legal page, with an anchor to link to. */
export function LegalSection({ heading, children }: { heading: LegalHeading; children: React.ReactNode }) {
  return (
    <section id={heading.id} aria-labelledby={`${heading.id}-title`} className="scroll-mt-32 xl:scroll-mt-24">
      <h2 id={`${heading.id}-title`} className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {heading.title}
      </h2>
      <div className="mt-3 space-y-4 text-[15px] leading-7 text-gray-700 dark:text-gray-200 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** A sub-heading inside a section, for a long list of what is collected; `id` makes it a link target. */
export function LegalSubheading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-32 pt-2 text-[15px] font-semibold text-gray-900 dark:text-gray-100 xl:scroll-mt-24">
      {children}
    </h3>
  );
}
