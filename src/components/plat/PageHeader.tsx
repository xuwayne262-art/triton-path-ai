import { PAGE_DESCRIPTION, PAGE_TITLE } from "./typeScale";

/**
 * The top of a page: its name, one line on what it holds, and the page's own
 * controls on the right — beside the title on a laptop, under it on a phone.
 *
 * It replaced hero bands and display-size titles that spent a third of a
 * laptop screen announcing the page before any of it could be used.
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
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`}>
      <div className="min-w-0">
        <h1 className={PAGE_TITLE}>{title}</h1>
        {description && <p className={`mt-1 ${PAGE_DESCRIPTION}`}>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
