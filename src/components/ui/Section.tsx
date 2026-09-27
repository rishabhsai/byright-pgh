import type { ReactNode } from "react";

/** A story section of the lot panel (Allowed? · Fits? · Pays? · File). The id is the scroll-nav target. */
export default function Section({
  id,
  title,
  summary,
  action,
  children,
}: {
  id: string;
  title: string;
  /** One-line result on the right, e.g. "4 pass · 1 check on site". */
  summary?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} data-section={id} aria-labelledby={`${id}-h`} className="scroll-mt-[104px]">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-hairline pt-section">
        <h3 id={`${id}-h`} className="text-title text-ink">
          {title}
        </h3>
        {summary && <span className="min-w-0 flex-1 text-right text-caption text-muted">{summary}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}
