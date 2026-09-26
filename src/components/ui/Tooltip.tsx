"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 200;

interface Props {
  content: ReactNode;
  children: ReactNode;
  /** Preferred side; flips when there is no room. */
  side?: "top" | "bottom";
  /** The child is already focusable (a button): wrap it without adding a tab stop or underline. */
  asChild?: boolean;
  className?: string;
}

/**
 * Hover and keyboard-focus tooltip. Opens after 200 ms, closes on leave, blur or Esc.
 * Rendered in a portal with fixed positioning so scrolling panels never clip it.
 */
export default function Tooltip({ content, children, side = "top", asChild = false, className = "" }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);

  const place = () => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = side === "bottom" ? window.innerHeight - r.bottom > 90 : r.top < 90;
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 148), window.innerWidth - 148), y: below ? r.bottom + 8 : r.top - 8, below });
  };
  const show = (e: { currentTarget: EventTarget }) => {
    const t = e.currentTarget as HTMLElement;
    // asChild wrappers are display: contents, so measure the child they wrap.
    anchor.current = asChild ? ((t.firstElementChild as HTMLElement | null) ?? t) : t;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      place();
      setOpen(true);
    }, DELAY_MS);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        hide();
      }
    };
    const onScroll = () => hide();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const handlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    "aria-describedby": open ? id : undefined,
  };

  const trigger = asChild ? (
    <span className="contents" {...handlers}>
      {children}
    </span>
  ) : (
      <span {...handlers} tabIndex={0} className={`cursor-help decoration-dotted underline-offset-[3px] ${className}`}>
        {children}
      </span>
    );

  return (
    <>
      {trigger}
      {open &&
        pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="tip-in pointer-events-none fixed z-[70] w-max max-w-[280px] rounded-lg bg-ink px-3 py-2 text-[12px] leading-snug font-normal text-white shadow-[0_8px_24px_-8px_rgba(23,33,30,.5)]"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, ${pos.below ? "0" : "-100%"})`,
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}

/** A term with a dotted underline that explains itself on hover or focus. */
export function Term({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  return (
    <Tooltip content={tip} className="underline decoration-faint">
      {children}
    </Tooltip>
  );
}
