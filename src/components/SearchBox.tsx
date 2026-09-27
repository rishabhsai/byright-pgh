"use client";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Lot, Triage } from "@/lib/types";
import { TRIAGE_SHORT, TriageDot } from "./verdict";

const LIMIT = 8;

const SUFFIX: Record<string, string> = {
  wy: "way",
  av: "avenue",
  ave: "avenue",
  st: "street",
  str: "street",
  pl: "place",
  rd: "road",
  blvd: "boulevard",
  bl: "boulevard",
  dr: "drive",
  ln: "lane",
  ct: "court",
  ter: "terrace",
  terr: "terrace",
  cir: "circle",
  hwy: "highway",
  pk: "park",
  sq: "square",
};

/** Lowercase, drop punctuation, and spell out street suffixes so "5118 Ladora Way" finds "5118 Ladora Wy". */
export function normalizeAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIX[w] ?? w)
    .join(" ");
}

/**
 * A block-lot number ("56-N-203", "23 E 93", "0056N00203000000") as a parcel ID prefix:
 * four-digit block, letter, five-digit lot, then optional sub-lot digits.
 */
export function parcelPrefix(q: string): string | null {
  const s = q.trim().toLowerCase();
  const compact = s.replace(/[\s-]/g, "");
  if (/^\d+$/.test(compact) || /^\d{4}[a-z]\d*$/.test(compact)) return compact;
  const m = s.match(/^(\d{1,4})[\s-]*([a-z])[\s-]*(\d{1,5})(?:[\s-]+(\d{1,4}))?$/);
  if (!m) return null;
  return `${m[1].padStart(4, "0")}${m[2]}${m[3].padStart(5, "0")}${m[4] ? m[4].padStart(4, "0") : ""}`;
}

export interface SearchEntry {
  /** normalizeAddress(address) */
  addr: string;
  /** Parcel ID, lowercase. */
  id: string;
  /** normalizeAddress(neighborhood); lets "forbes squirrel" narrow to one section of a long street. */
  hood?: string;
  /** False for lots the screen does not evaluate; they rank after evaluated lots with the same score. */
  evaluated?: boolean;
}

/**
 * How well one lot matches the query tokens; 0 when any token matches nothing. Exact street-name and
 * house-number tokens beat prefixes, which beat neighborhood tokens, which beat loose substrings.
 */
function tokenScore(r: SearchEntry, tokens: string[], whole: string): number {
  const words = r.addr.split(" ");
  const hood = r.hood ? r.hood.split(" ") : [];
  let score = 0;
  for (const t of tokens) {
    const numeric = /^\d+$/.test(t);
    if (words.includes(t)) score += numeric && words[0] === t ? 16 : 10;
    else if (!numeric && words.some((w) => w.startsWith(t))) score += 6;
    else if (hood.some((w) => w === t || (!numeric && w.startsWith(t))))
      score += 4;
    else if (!numeric && t.length >= 3 && r.addr.includes(t)) score += 2;
    else return 0;
  }
  if (r.addr === whole) score += 20;
  else if (r.addr.startsWith(whole)) score += 3;
  return score;
}

/**
 * Address tokens (suffix-normalized), neighborhood tokens, parcel/block-lot prefix, or a parcel ID
 * substring, case-insensitive. Ranked by match quality, then evaluated lots first; within a tie, one
 * lot per neighborhood before a second from any, so a street that crosses neighborhoods shows each.
 */
export function searchLots(
  index: SearchEntry[],
  q: string,
  limit = LIMIT,
): number[] {
  const whole = normalizeAddress(q);
  if (!whole) return [];
  const tokens = whole.split(" ");
  const id = parcelPrefix(q);
  const compact = q.trim().toLowerCase().replace(/[\s-]/g, "");
  const idSub =
    /^[0-9a-z]{4,}$/.test(compact) && /\d/.test(compact) ? compact : null;
  const hits: { i: number; score: number; evaluated: boolean; hood: string }[] =
    [];
  for (let i = 0; i < index.length; i++) {
    const r = index[i];
    let score = 0;
    if (id && r.id.startsWith(id)) score = 1000;
    else if (idSub && r.id.includes(idSub)) score = 500;
    else score = tokenScore(r, tokens, whole);
    if (score > 0)
      hits.push({
        i,
        score,
        evaluated: r.evaluated !== false,
        hood: r.hood ?? "",
      });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.evaluated) - Number(a.evaluated) ||
      a.i - b.i,
  );
  // Within each score-and-evaluated tier, interleave neighborhoods: each lot's rank within its neighborhood.
  const seen = new Map<string, number>();
  const tierOf = (h: (typeof hits)[number]) => `${h.score}|${h.evaluated}`;
  const ranked = hits.map((h, k) => {
    const key = `${tierOf(h)}|${h.hood}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return { ...h, k, n };
  });
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.evaluated) - Number(a.evaluated) ||
      a.n - b.n ||
      a.k - b.k,
  );
  return ranked.slice(0, limit).map((h) => h.i);
}

function SearchBox({
  lots,
  onPick,
  triage,
  matches,
}: {
  lots: Lot[];
  onPick: (i: number) => void;
  /** Triage per lot, to label lots the screen does not evaluate. */
  triage?: Triage[];
  /** Filter matches per lot, to label lots outside the current filters. */
  matches?: boolean[];
}) {
  const [q, setQ] = useState("");
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
          placeholder="Address, block-lot or parcel ID"
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
          {results.length === 0 && <li className="px-3 py-2 text-[12px] text-muted">No lot matches “{q.trim()}”. Try a street name, a block-lot like 56-N-203, or a parcel ID.</li>}
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
                <span className="flex items-center gap-2">
                  {triage?.[i] && <TriageDot triage={triage[i]} size={8} title={TRIAGE_SHORT[triage[i]]} />}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{l.address || "No street address"}</span>
                  {triage?.[i] === "gray" ? (
                    <span className="shrink-0 text-[11px] text-muted">not evaluated</span>
                  ) : matches && !matches[i] ? (
                    <span className="shrink-0 text-[11px] text-muted">outside filters</span>
                  ) : null}
                </span>
                <span className={`block truncate text-[11px] text-muted tabular-nums ${triage?.[i] ? "pl-4" : ""}`}>
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
