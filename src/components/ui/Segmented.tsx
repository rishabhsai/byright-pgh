"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** "tabs" gives tab semantics (Lots/Plan); "radio" is a single-choice filter. */
  kind?: "radio" | "tabs";
  /** Options share the width equally instead of sizing to their labels. */
  equal?: boolean;
  className?: string;
}

/**
 * The one segmented control: 28 px tall, 6 px radius, 13 px text. One Tab stop; arrow keys, Home
 * and End move and select (roving tabindex), skipping disabled options.
 */
export default function Segmented<T extends string>({ options, value, onChange, label, kind = "radio", equal = false, className = "" }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const move = (from: number, step: number) => {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const j = (((from + step * k) % n) + n) % n;
      if (!options[j].disabled) return j;
    }
    return from;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let j: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = move(current, 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = move(current, -1);
    else if (e.key === "Home") j = move(-1, 1);
    else if (e.key === "End") j = move(options.length, -1);
    if (j == null) return;
    e.preventDefault();
    onChange(options[j].value);
    refs.current[j]?.focus();
  };

  const tabs = kind === "tabs";
  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex h-7 rounded-[6px] border border-hairline bg-surface p-[2px] text-[13px] leading-none ${className}`}
    >
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.value || "any"}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            aria-disabled={o.disabled || undefined}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => !o.disabled && onChange(o.value)}
            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[4px] px-1.5 whitespace-nowrap transition-colors focus-visible:outline-offset-0 ${
              equal ? "flex-1 basis-0" : "flex-auto"
            } ${
              on
                ? "bg-white font-medium text-ink shadow-[0_0_0_1px_rgba(23,33,30,.08)]"
                : o.disabled
                  ? "cursor-not-allowed text-faint/70"
                  : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
