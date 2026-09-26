"use client";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Lot } from "@/lib/types";

const LIMIT = 8;

/** Address substring or parcel ID prefix, case-insensitive; address-start matches rank first. */
export function searchLots(index: { addr: string; id: string }[], q: string, limit = LIMIT): number[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const id = s.replace(/[\s-]/g, "");
  const starts: number[] = [];
  const contains: number[] = [];
  for (let i = 0; i < index.length && starts.length < limit; i++) {
    const r = index[i];
    if (r.id.startsWith(id) || r.addr.startsWith(s)) starts.push(i);
    else if (contains.length < limit && r.addr.includes(s)) contains.push(i);
  }
  return [...starts, ...contains].slice(0, limit);
}

function SearchBox({ lots, onPick }: { lots: Lot[]; onPick: (i: number) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const index = useMemo(() => lots.map((l) => ({ addr: (l.address || "").toLowerCase(), id: l.id.toLowerCase() })), [lots]);
  const results = useMemo(() => searchLots(index, q), [index, q]);

  // ⌘K / Ctrl-K focuses the field from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (i: number) => {
    onPick(i);
    setOpen(false);
    setQ(lots[i].address || lots[i].id);
    input.current?.blur();
  };

  const show = open && q.trim().length > 0;
  const active = Math.min(cursor, Math.max(results.length - 1, 0));

  return (
    <div ref={root} className="relative">
      <div className="flex h-8 items-center gap-2 rounded-[6px] border border-hairline bg-white px-2.5 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-faint">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && results.length ? `${listId}-${active}` : undefined}
          aria-label="Search address or parcel ID"
          placeholder="Search address or parcel ID"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              if (results.length) {
                e.preventDefault();
                pick(results[active]);
              }
            } else if (e.key === "Escape") {
              // Keep the app's Esc (which clears the selection) from firing.
              e.stopPropagation();
              if (show) setOpen(false);
              else if (q) setQ("");
              else input.current?.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          style={{ outline: "none" }}
        />
        <kbd className="shrink-0 rounded border border-hairline px-1 font-sans text-[11px] leading-4 text-faint" aria-hidden>
          ⌘K
        </kbd>
      </div>
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching lots"
          className="pop absolute top-[calc(100%+4px)] right-0 left-0 z-30 overflow-hidden rounded-lg border border-hairline bg-white py-1 shadow-[0_12px_32px_-12px_rgba(23,33,30,.35)]"
        >
          {results.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">No lot matches “{q.trim()}”. Try a street name or the first digits of a parcel ID.</li>}
          {results.map((i, k) => {
            const l = lots[i];
            return (
              <li
                key={l.id}
                id={`${listId}-${k}`}
                role="option"
                aria-selected={k === active}
                onMouseEnter={() => setCursor(k)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={`cursor-pointer px-3 py-1.5 ${k === active ? "bg-accent-soft" : ""}`}
              >
                <span className="block truncate text-[13px] font-medium text-ink">{l.address || "No street address"}</span>
                <span className="block truncate text-[11px] text-muted tabular-nums">
                  {l.neighborhood || "Neighborhood n/a"}, {l.zone || "no zone"}, parcel {l.id}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default memo(SearchBox);
