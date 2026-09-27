"use client";
import { useId, useSyncExternalStore, type ReactNode } from "react";
import { getPrefs, getServerPrefs, setCollapsed, subscribePrefs } from "../paneLayout";

/**
 * A rail section with a caret. Collapsed, it is one 32px row carrying its summary ("Filters · Hazelwood · Duplex").
 * The open or closed state is remembered per `id` (byright.layout.v1).
 */
export default function Collapsible({
  id,
  title,
  summary,
  action,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Shown after the title while collapsed. */
  summary?: ReactNode;
  /** A control at the right of the header row (Reset, Open in reading view). */
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const open = !(prefs.collapsed[id] ?? !defaultOpen);
  const bodyId = useId();
  return (
    <section className="border-b border-hairline last:border-b-0">
      <div className="flex h-8 items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setCollapsed(id, open)}
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`shrink-0 text-faint transition-transform duration-(--duration-press) ${open ? "" : "-rotate-90"}`}>
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
          <span className="shrink-0 text-caption font-semibold text-ink">{title}</span>
          {!open && summary && <span className="min-w-0 flex-1 truncate text-caption text-muted">· {summary}</span>}
        </button>
        {action}
      </div>
      <div className="collapse-body" data-open={open}>
        <div id={bodyId} inert={!open} className="min-h-0 overflow-hidden">
          <div className="px-4 pt-0.5 pb-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
