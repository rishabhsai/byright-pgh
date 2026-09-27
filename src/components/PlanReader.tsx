"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The plan in reading view: the same overlay surface the lot panel expands into, over the map area,
 * wide enough for two columns.
 */
export default function PlanReader({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex justify-center">
      <div aria-hidden onClick={onClose} className="backdrop-in absolute inset-0 bg-[#17211e]/25" />
      <div
        role="dialog"
        aria-label="Disposition plan, reading view"
        className="expand-in relative flex h-full w-[1040px] max-w-[min(94%,100%)] flex-col border-x border-hairline bg-panel shadow-[0_20px_60px_-20px_rgba(23,33,30,.45)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-10 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="font-serif text-[28px] leading-none text-ink">Disposition plan</h2>
            <p className="mt-1.5 truncate text-[13px] text-muted">{title}</p>
          </div>
          <button
            ref={closeBtn}
            onClick={onClose}
            aria-label="Close reading view (Esc)"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            Back to the rail
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
