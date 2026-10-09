import { PAGE_DESCRIPTION, PAGE_TITLE } from "./typeScale";

/**
 * The top of a page: its name, a line on what it holds, and the page's own
 * controls on the right — beside the title on a laptop, under it on a phone.
 *
 * It replaced hero bands and display-size titles. The title stays small; the
 * room around it is what keeps a page calm, so pages leave a generous gap
 * (PAGE_GAP) between this and whatever comes next.
 */
export default function PageHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8 ${className}`}>
      <div className="min-w-0">
        <h1 className={PAGE_TITLE}>{title}</h1>
        {description && <p className={`mt-2 ${PAGE_DESCRIPTION}`}>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
