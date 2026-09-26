"use client";
import { useId, useMemo, useRef, useState } from "react";

export interface NeighborhoodOption {
  name: string;
  lots: number;
  green: number;
}

interface Props {
  options: NeighborhoodOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Rank a name against a query: 0 = name prefix, 1 = word prefix, 2 = substring,
 * 3 = in-order subsequence ("hmwd" finds Homewood). -1 = no match.
 */
export function matchRank(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (n.startsWith(q)) return 0;
  if (n.split(/[\s\-–/.]+/).some((w) => w.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  let j = 0;
  for (let i = 0; i < n.length && j < q.length; i++) if (n[i] === q[j]) j++;
  return j === q.length ? 3 : -1;
}

export default function NeighborhoodPicker({ options, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const results = useMemo(() => {
    if (!query.trim()) return options;
    return options
      .map((o) => ({ o, r: matchRank(o.name, query) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.o.name.localeCompare(b.o.name))
      .map((x) => x.o);
  }, [options, query]);

  const activeIdx = Math.min(active, Math.max(0, results.length - 1));
  const optionId = (i: number) => `${id}-opt-${i}`;

  const toggle = (name: string) =>
    onChange(selectedSet.has(name) ? selected.filter((s) => s !== name) : [...selected, name]);

  const moveTo = (i: number) => {
    setActive(i);
    listRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else moveTo(Math.min(results.length - 1, activeIdx + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else moveTo(Math.max(0, activeIdx - 1));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          moveTo(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          moveTo(results.length - 1);
        }
        break;
      case "Enter":
        if (open && results[activeIdx]) {
          e.preventDefault();
          toggle(results[activeIdx].name);
        }
        break;
      case "Backspace":
        if (!query && selected.length) onChange(selected.slice(0, -1));
        break;
      case "Escape":
        // Consume Esc here so the app-level handler does not also clear the selected lot.
        if (open || query) {
          e.preventDefault();
          e.stopPropagation();
          if (open) setOpen(false);
          else setQuery("");
        }
        break;
    }
  };

  return (
    <div className="relative">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={`${id}-input`} className="text-[11px] text-muted">
          Neighborhoods
        </label>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="text-[11px] text-accent hover:underline">
            Clear all
          </button>
        )}
      </div>
      <div
        onMouseDown={(e) => {
          // Clicking the padding around the chips focuses the text box instead of blurring it.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
        className="flex min-h-[32px] cursor-text flex-wrap items-center gap-1 rounded-md border border-hairline bg-white px-1.5 py-1 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15"
      >
        {selected.map((name) => (
          <span
            key={name}
            className="inline-flex max-w-full items-center gap-0.5 rounded bg-accent-soft py-px pr-0.5 pl-1.5 text-[11.5px] font-medium text-accent"
          >
            <span className="truncate">{name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(name)}
              className="inline-flex h-4 w-4 items-center justify-center rounded text-accent/70 hover:bg-accent/10 hover:text-accent"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length ? optionId(activeIdx) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={selected.length ? "Add another" : `All ${options.length} neighborhoods`}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          onKeyDown={onKeyDown}
          className="min-w-[90px] flex-1 bg-transparent px-0.5 py-0.5 text-[12px] text-ink placeholder:text-faint"
          style={{ outline: "none" }}
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Neighborhoods"
          onMouseDown={(e) => e.preventDefault()}
          className="scroll-thin absolute inset-x-0 top-full z-30 mt-1 max-h-[272px] overflow-y-auto rounded-md border border-hairline bg-white py-1 shadow-[0_8px_24px_-8px_rgba(23,33,30,.22)]"
        >
          {results.length === 0 && (
            <li className="px-2.5 py-2 text-[12px] text-muted">No neighborhood matches &ldquo;{query.trim()}&rdquo;.</li>
          )}
          {results.map((o, i) => {
            const sel = selectedSet.has(o.name);
            return (
              <li
                key={o.name}
                id={optionId(i)}
                data-i={i}
                role="option"
                aria-selected={sel}
                onMouseMove={() => i !== activeIdx && setActive(i)}
                onClick={() => toggle(o.name)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-[5px] text-[12px] ${
                  i === activeIdx ? "bg-surface" : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                    sel ? "border-accent bg-accent text-white" : "border-hairline bg-white"
                  }`}
                >
                  {sel && (
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <path d="M1 4.2l2 2L7 1.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`min-w-0 flex-1 truncate ${sel ? "font-medium text-ink" : "text-ink"}`}>{o.name}</span>
                <span className="shrink-0 text-[11px] text-muted tabular-nums">{o.lots.toLocaleString()} lots</span>
                <span
                  className={`inline-flex w-[58px] shrink-0 items-center justify-end gap-1 text-[11px] tabular-nums ${
                    o.green ? "text-[#15803d]" : "text-faint"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${o.green ? "bg-[#16a34a]" : "bg-[#c9cdc6]"}`} aria-hidden />
                  {o.green.toLocaleString()} green
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
