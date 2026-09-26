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
      <div className="mb-3 flex items-baseline gap-3 border-t border-hairline pt-5">
        <h3 id={`${id}-h`} className="font-serif text-[22px] leading-none text-ink">
          {title}
        </h3>
        {summary && <span className="min-w-0 flex-1 truncate text-right text-[12px] text-muted">{summary}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}
