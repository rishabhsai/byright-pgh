"use client";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { clampSplit, SPLIT_MIN_PX } from "../paneLayout";

interface Props {
  label: string;
  /** The split area: its height is 100%, and drags write `--split` on it directly, without re-rendering. */
  host: RefObject<HTMLElement | null>;
  /** The controls pane above the handle: its rendered height is where a drag starts. */
  pane: RefObject<HTMLElement | null>;
  /** The stored share, for aria-valuenow. */
  value: number;
  /** A new share, or null to restore the tab's default (double-click). */
  onCommit: (f: number | null) => void;
}

interface Drag {
  y: number;
  startPx: number;
  height: number;
  f: number;
}

/** Room the controls pane may take in a split area `height` px tall, as [min, max] px. */
function bounds(height: number, content: number): [number, number] {
  const max = Math.max(SPLIT_MIN_PX.controls, Math.min(height - SPLIT_MIN_PX.results, content));
  return [SPLIT_MIN_PX.controls, max];
}

/**
 * The rail's horizontal splitter: the same pattern as the pane handles, turned on its side. An 8px `row-resize`
 * hit area over the hairline between the controls and the results; live while dragged, persisted on release.
 */
export default function SplitHandle({ label, host, pane, value, onCommit }: Props) {
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const measure = () => {
    const h = host.current?.getBoundingClientRect().height ?? 0;
    const p = pane.current;
    return { height: h, px: p?.getBoundingClientRect().height ?? 0, content: p?.scrollHeight ?? h };
  };

  const end = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    document.documentElement.classList.remove("pane-resizing", "pane-resizing-row");
    if (commit && d.f !== value) onCommit(d.f);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic or already-released pointer: the drag still follows moves over the handle.
    }
    const m = measure();
    if (!m.height) return;
    drag.current = { y: e.clientY, startPx: m.px, height: m.height, f: value };
    setDragging(true);
    document.documentElement.classList.add("pane-resizing", "pane-resizing-row");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const [min] = bounds(d.height, Infinity);
    const px = Math.min(d.height - SPLIT_MIN_PX.results, Math.max(min, d.startPx + e.clientY - d.y));
    const f = clampSplit(px / d.height);
    if (f === d.f) return;
    d.f = f;
    host.current?.style.setProperty("--split", String(f));
    e.currentTarget.setAttribute("aria-valuenow", String(Math.round(f * 100)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const m = measure();
    if (!m.height) return;
    const [min, max] = bounds(m.height, m.content);
    let px: number;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") px = m.px + (e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 64 : 16);
    else if (e.key === "Home") px = min;
    else if (e.key === "End") px = max;
    else return;
    e.preventDefault();
    const f = clampSplit(Math.min(max, Math.max(min, px)) / m.height);
    if (f !== value) onCommit(f);
  };

  return (
    <div className="relative z-20 h-0 shrink-0">
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
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
        className="group absolute inset-x-0 -top-1 h-2 cursor-row-resize touch-none outline-none"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-[3px] h-px bg-hairline transition-colors duration-(--duration-ui) group-hover:bg-accent group-hover:delay-150 group-focus-visible:bg-accent group-data-dragging:bg-accent group-data-dragging:delay-0"
        />
        <div
          aria-hidden
          className="absolute top-[2px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-control-edge transition-colors duration-(--duration-ui) group-hover:bg-accent group-focus-visible:bg-accent group-data-dragging:bg-accent"
        />
      </div>
    </div>
  );
}
