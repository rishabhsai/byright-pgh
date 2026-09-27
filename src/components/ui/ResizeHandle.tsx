"use client";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { clampWidth, LIMITS, MAP_MIN, PANE_VAR, type Pane } from "../paneLayout";

interface Props {
  pane: Pane;
  /** Which side of the handle the pane sits on: the rail is before it, the detail panel after. */
  side: "before" | "after";
  label: string;
  /** Current width of the pane in px. */
  value: number;
  /** Element carrying the pane width variables; drags write to it directly, without re-rendering the app. */
  host: RefObject<HTMLElement | null>;
  /** The map, which keeps at least MAP_MIN px. */
  map: RefObject<HTMLElement | null>;
  /** A new width, or null to restore the default (double-click). */
  onCommit: (px: number | null) => void;
}

interface Drag {
  x: number;
  start: number;
  max: number;
  px: number;
}

/** A vertical splitter: 8px hit area over the pane's hairline, which turns accent on hover, focus and drag. */
export default function ResizeHandle({ pane, side, label, value, host, map, onCommit }: Props) {
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  // Moving the handle right widens the rail and narrows the panel.
  const dir = side === "before" ? 1 : -1;
  const { min } = LIMITS[pane];

  const maxFor = (width: number) => {
    const room = map.current ? map.current.getBoundingClientRect().width - MAP_MIN : Infinity;
    return Math.max(min, Math.min(LIMITS[pane].max, Math.floor(width + room)));
  };

  const end = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    document.documentElement.classList.remove("pane-resizing");
    if (commit && d.px !== d.start) onCommit(d.px);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: value, max: maxFor(value), px: value };
    setDragging(true);
    document.documentElement.classList.add("pane-resizing");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const px = Math.min(d.max, clampWidth(pane, d.start + dir * (e.clientX - d.x)));
    if (px === d.px) return;
    d.px = px;
    host.current?.style.setProperty(PANE_VAR[pane], `${px}px`);
    e.currentTarget.setAttribute("aria-valuenow", String(px));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const max = maxFor(value);
    let next: number;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const step = e.shiftKey ? 64 : 16;
      next = value + (e.key === "ArrowRight" ? 1 : -1) * dir * step;
    } else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else return;
    e.preventDefault();
    next = Math.min(max, clampWidth(pane, next));
    if (next !== value) onCommit(next);
  };

  return (
    <div className="relative z-20 w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={LIMITS[pane].max}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(true)}
        onLostPointerCapture={() => end(true)}
        onDoubleClick={() => onCommit(null)}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 -left-1 w-2 cursor-col-resize touch-none outline-none"
      >
        <div
          aria-hidden
          className={`absolute inset-y-0 w-px ${side === "before" ? "left-[3px]" : "left-1"} transition-colors duration-(--duration-ui) group-hover:bg-accent group-hover:delay-150 group-focus-visible:bg-accent group-data-dragging:bg-accent group-data-dragging:delay-0`}
        />
      </div>
    </div>
  );
}
