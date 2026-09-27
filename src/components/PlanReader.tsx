"use client";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/**
 * The plan in reading view: the same overlay surface the lot panel expands into, over the map area,
 * wide enough for two columns.
 */
export default function PlanReader({ title, onClose, actions, children }: { title: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  // Focus moves in on open and back to whatever opened the view on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  // Tab and Shift-Tab cycle inside the dialog.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="absolute inset-0 z-30 flex justify-center">
      <div aria-hidden onClick={onClose} className="backdrop-in absolute inset-0 bg-ink/25" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Disposition plan, reading view"
        onKeyDown={onKeyDown}
        className="expand-in relative flex h-full w-[1040px] max-w-[min(94%,100%)] flex-col bg-surface shadow-overlay"
      >
        <div className="toolbar flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-10 py-panel">
          <div className="min-w-0">
            <h2 className="text-title text-ink">Disposition plan</h2>
            <p className="mt-1.5 truncate text-callout text-muted">{title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              ref={closeBtn}
              onClick={onClose}
              aria-label="Close reading view (Esc)"
              className="button-secondary shrink-0 gap-2 text-callout"
            >
              Back to the rail
              <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden>
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div data-scroll className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
