"use client";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Lot, Triage } from "@/lib/types";
import { TRIAGE_SHORT, TriageDot } from "./verdict";
import { looksLikeQuestion } from "@/lib/ask/answer";
import { ASK_EXAMPLES } from "./ask/AskBox";

import { matchNeighborhoods, normalizeAddress, searchLots, type SearchEntry } from "@/lib/search";

export { matchNeighborhoods, normalizeAddress, parcelPrefix, searchLots, type SearchEntry } from "@/lib/search";

type Option = { kind: "ask" } | { kind: "hood"; name: string } | { kind: "lot"; i: number };

function SearchBox({
  lots,
  onPick,
  onScope,
  triage,
  matches,
  selectedIdx = null,
  onAsk,
  lastQuestion = null,
}: {
  lots: Lot[];
  onPick: (i: number) => void;
  /** Scope the plan (the neighborhood filter) to one neighborhood the query names. */
  onScope?: (neighborhood: string) => void;
  /** Triage per lot, to label lots the screen does not evaluate. */
  triage?: Triage[];
  /** Filter matches per lot, to label lots outside the current filters. */
  matches?: boolean[];
  /** The open lot. Picking a different one elsewhere (list, map, plan), or closing it, clears a picked query. */
  selectedIdx?: number | null;
  /** Ask ByRight: send a plain-language request. A question-like query offers it first; ⌘↵ always asks. */
  onAsk?: (q: string) => void;
  /** The last question asked; ↑ in an empty box recalls it. */
  lastQuestion?: string | null;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [seenSelected, setSeenSelected] = useState(selectedIdx);
  if (selectedIdx !== seenSelected) {
    setSeenSelected(selectedIdx);
    // Another lot opened elsewhere, or the picked lot's card closed: the box no longer names the open lot.
    if ((selectedIdx != null && selectedIdx !== picked) || (selectedIdx == null && picked != null)) {
      setQ("");
      setPicked(null);
    }
  }
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const index = useMemo<SearchEntry[]>(
    () =>
      lots.map((l, i) => ({
        addr: normalizeAddress(l.address || ""),
        id: l.id.toLowerCase(),
        hood: normalizeAddress(l.neighborhood || ""),
        evaluated: triage?.[i] !== "gray",
      })),
    [lots, triage],
  );
  const results = useMemo(() => searchLots(index, q), [index, q]);
  const hoodNames = useMemo(() => [...new Set(lots.map((l) => l.neighborhood).filter(Boolean))].sort(), [lots]);
  const asking = !!onAsk && looksLikeQuestion(q);
  const options = useMemo<Option[]>(
    () => [
      ...(asking ? [{ kind: "ask" as const }] : []),
      ...(onScope ? matchNeighborhoods(hoodNames, q).map((name) => ({ kind: "hood" as const, name })) : []),
      ...results.map((i) => ({ kind: "lot" as const, i })),
    ],
    [asking, onScope, hoodNames, q, results],
  );

  // ⌘K / Ctrl-K focuses the field from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus({ preventScroll: true });
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
    setPicked(i);
    onPick(i);
    setOpen(false);
    setQ(lots[i].address || lots[i].id);
    input.current?.blur();
  };

  const scope = (name: string) => {
    onScope?.(name);
    setOpen(false);
    setQ("");
    input.current?.blur();
  };
  const ask = (text: string) => {
    const t = text.trim().replace(/^\?\s*/, "");
    if (!t || !onAsk) return;
    onAsk(t);
    setOpen(false);
    setQ("");
    input.current?.blur();
  };
  const choose = (o: Option) => (o.kind === "ask" ? ask(q) : o.kind === "hood" ? scope(o.name) : pick(o.i));

  const show = open && q.trim().length > 0;
  const showExamples = open && !!onAsk && q.trim().length === 0;
  const active = Math.min(cursor, Math.max(options.length - 1, 0));

  return (
    <div ref={root} className="relative">
      <div className="input-shell flex h-9 items-center gap-2 px-3">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-faint">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && options.length ? `${listId}-${active}` : undefined}
          aria-label={onAsk ? "Search an address or parcel ID, or ask a question" : "Search address or parcel ID"}
          placeholder={onAsk ? "Address, parcel ID, or ask a question" : "Address, block-lot or parcel ID"}
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
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onAsk) {
              e.preventDefault();
              ask(q);
            } else if (e.key === "ArrowUp" && !q && lastQuestion) {
              e.preventDefault();
              setQ(lastQuestion);
              setOpen(true);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(c + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              if (options.length) {
                e.preventDefault();
                choose(options[active]);
              }
            } else if (e.key === "Escape") {
              // Keep the app's Esc (which clears the selection) from firing.
              e.stopPropagation();
              if (show || showExamples) setOpen(false);
              else if (q) setQ("");
              else input.current?.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-callout text-ink placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          style={{ outline: "none" }}
        />
        <kbd className="shrink-0 rounded border border-hairline px-1 font-sans text-caption text-faint" aria-hidden>
          ⌘K
        </kbd>
      </div>
      {showExamples && (
        <div className="pop surface-card absolute top-[calc(100%+8px)] right-0 left-0 z-30 px-4 pt-3 pb-4 shadow-overlay" onMouseDown={(e) => e.preventDefault()}>
          <p className="text-caption text-muted">
            Search an address, or ask in plain words. <kbd className="font-sans">⌘↵</kbd> always asks{lastQuestion ? "; ↑ recalls your last question" : ""}.
          </p>
          <ul aria-label="Example questions" className="mt-2.5 flex flex-col items-start gap-1.5">
            {ASK_EXAMPLES.map((ex) => (
              <li key={ex} className="max-w-full">
                <button
                  type="button"
                  onClick={() => ask(ex)}
                  className="max-w-full rounded-[10px] bg-control px-3 py-1.5 text-left text-callout text-ink transition-colors hover:bg-accent-soft hover:text-review-ink"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching lots"
          className="pop surface-card absolute top-[calc(100%+8px)] right-0 left-0 z-30 overflow-hidden py-2 shadow-overlay"
        >
          {options.length === 0 && <li className="px-3 py-2 text-caption text-muted">No lot matches “{q.trim()}”. Try a street name, a block-lot like 56-N-203, or a parcel ID{onAsk ? ", or press ⌘↵ to ask it as a question" : ""}.</li>}
          {options.map((o, k) => {
            if (o.kind === "ask")
              return (
                <li
                  key="ask"
                  id={`${listId}-${k}`}
                  role="option"
                  aria-selected={k === active}
                  onMouseEnter={() => setCursor(k)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => ask(q)}
                  className={`cursor-pointer border-b border-hairline px-4 py-3 ${k === active ? "bg-accent-soft" : ""}`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-callout font-medium text-ink">Ask ByRight: {q.trim().replace(/^\?\s*/, "")}</span>
                    <kbd className="shrink-0 font-sans text-caption text-faint">↵</kbd>
                  </span>
                  <span className="block text-caption text-muted">The model sets filters and levers; the engine computes the answer</span>
                </li>
              );
            if (o.kind === "hood")
              return (
                <li
                  key={`hood-${o.name}`}
                  id={`${listId}-${k}`}
                  role="option"
                  aria-selected={k === active}
                  onMouseEnter={() => setCursor(k)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => scope(o.name)}
                  className={`cursor-pointer border-b border-hairline px-4 py-3 ${k === active ? "bg-accent-soft" : ""}`}
                >
                  <span className="block truncate text-callout font-medium text-ink">Scope the plan to {o.name}</span>
                  <span className="block text-caption text-muted">Sets the neighborhood filter; the Plan tab follows it</span>
                </li>
              );
            const i = o.i;
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
                className={`cursor-pointer px-4 py-3 ${k === active ? "bg-accent-soft" : ""}`}
              >
                <span className="flex items-center gap-2">
                  {triage?.[i] && <TriageDot triage={triage[i]} size={8} title={TRIAGE_SHORT[triage[i]]} />}
                  <span className="min-w-0 flex-1 truncate text-callout font-medium text-ink">{l.address || "No street address"}</span>
                  {triage?.[i] === "gray" ? (
                    <span className="shrink-0 text-caption text-muted">not evaluated</span>
                  ) : matches && !matches[i] ? (
                    <span className="shrink-0 text-caption text-muted">outside filters</span>
                  ) : null}
                </span>
                <span className={`block truncate text-caption text-muted tabular-nums ${triage?.[i] ? "pl-4" : ""}`}>
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
