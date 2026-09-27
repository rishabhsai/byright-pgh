"use client";
// Ask ByRight's transcript: the question, one undoable chip per applied action, and the app's own answer.
import { useEffect, useState } from "react";
import { chipLabel, type Applied } from "@/lib/ask/apply";
import { composeAnswer, type AnswerInput } from "@/lib/ask/answer";
import type { ExplainTopic } from "@/lib/ask/tools";

export const ASK_EXAMPLES = [
  "Hazelwood lots where a duplex passes if the L minimum drops to 1,800",
  "Show Central Northside townhouses for sale",
  "What changes under the housing bill for Larimer?",
  "Why isn't anything Green?",
];

export const ASK_LABEL = "The model only chooses filters and levers. Every number is computed by the engine.";
export const ASK_FAILED = "Couldn't parse that; try the filters.";
/** The client gives up after this long; the route's provider timeout is shorter. */
export const ASK_TIMEOUT_MS = 12_000;

export interface AskEntry {
  id: number;
  q: string;
  /** "restored": reopened from a link, so the actions are not known, only the state they left. */
  phase: "asking" | "done" | "failed" | "restored";
  applied: (Applied & { undone?: boolean })[];
  ms?: number;
  /** Explain topics from a link, for a restored entry. */
  topics?: ExplainTopic[];
}

/** The explanations an entry shows: its explain calls, or the topics a link carried. */
export function askTopicsOf(e: AskEntry): ExplainTopic[] {
  const fromCalls = e.applied.flatMap((a) => (a.action.tool === "explain" ? [a.action.topic] : []));
  return fromCalls.length ? fromCalls : (e.topics ?? []);
}

/**
 * The answer sentence for the current state, composed off the input path (after a short pause) because a
 * citywide scope evaluates every lot under the scenario and today's code. Null while it is being composed.
 */
export function useAskAnswer(input: AnswerInput | null): string | null {
  const [out, setOut] = useState<{ input: AnswerInput; text: string } | null>(null);
  useEffect(() => {
    if (!input) return;
    const t = window.setTimeout(() => setOut({ input, text: composeAnswer(input) }), 60);
    return () => window.clearTimeout(t);
  }, [input]);
  return input && out?.input === input ? out.text : null;
}

function Chip({ a, onUndo }: { a: AskEntry["applied"][number]; onUndo: () => void }) {
  const label = chipLabel(a);
  const cut = label.indexOf(": ");
  const key = label.slice(0, cut);
  const value = label.slice(cut + 2);
  const inert = a.changed.length === 0;
  if (a.undone || inert)
    return (
      <li className="inline-flex max-w-full items-baseline gap-1 rounded-full border border-hairline px-2.5 py-[3px] text-caption text-faint">
        <span className={a.undone ? "line-through" : ""}>
          {key} <span className="font-normal">{value}</span>
        </span>
        {a.undone && <span className="no-underline">undone</span>}
      </li>
    );
  return (
    <li className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft py-[3px] pr-1 pl-2.5 text-caption text-review-ink">
      <span className="min-w-0">
        <span className="text-review-ink/80">{key}</span> <span className="font-semibold tabular-nums">{value}</span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        aria-label={`Undo ${label}`}
        title="Undo this change"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-review-ink/70 transition-colors hover:bg-white hover:text-review-ink"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </button>
    </li>
  );
}

export default function AskTranscript({
  entry,
  answer,
  explanations,
  onUndo,
  onClose,
}: {
  entry: AskEntry;
  /** The engine's sentence for the current state; null while it is composed. */
  answer: string | null;
  /** Fixed paragraphs for the explain calls in this entry. */
  explanations: string[];
  onUndo: (k: number) => void;
  onClose: () => void;
}) {
  const live = entry.applied.some((a) => a.changed.length && !a.undone);
  return (
    <section aria-label="Ask ByRight" aria-live="polite" className="fade-in scroll-thin max-h-[42vh] overflow-y-auto rounded-card bg-surface px-4 pt-3 pb-4">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-caption text-muted">{ASK_LABEL}</p>
        <button type="button" onClick={onClose} aria-label="Close Ask ByRight" title="Close (the filters stay)" className="-mt-0.5 -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-faint hover:bg-control hover:text-ink">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </button>
      </div>

      <p className="mt-2 text-callout font-semibold text-ink">{entry.q}</p>

      {entry.phase === "asking" && (
        <p className="mt-2 flex items-center gap-2 text-callout text-muted">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Asking…
        </p>
      )}

      {entry.phase === "failed" && <p className="mt-2 text-callout text-warning-ink">{ASK_FAILED} Nothing was changed.</p>}

      {entry.applied.length > 0 && (
        <ul aria-label="Changes applied" className="mt-2.5 flex flex-wrap gap-1.5">
          {entry.applied.map((a, k) => (
            <Chip key={k} a={a} onUndo={() => onUndo(k)} />
          ))}
        </ul>
      )}

      {entry.phase === "restored" && <p className="mt-2 text-caption text-muted">Opened from a link. The answer below is recomputed from the filters and scenario the link carries.</p>}

      {(entry.phase === "done" || entry.phase === "restored") && (
        <>
          <p className="mt-3 border-t border-hairline pt-3 text-callout text-ink tabular-nums">{answer ?? <span className="text-muted">Counting…</span>}</p>
          {explanations.map((t, k) => (
            <p key={k} className="mt-2 text-callout text-muted">
              {t}
            </p>
          ))}
          {entry.phase === "done" && (
            <p className="mt-2 text-caption text-faint tabular-nums">
              {live ? "Undo any change with its ✕; the answer follows. " : ""}Model call {((entry.ms ?? 0) / 1000).toFixed(1)} s.
            </p>
          )}
        </>
      )}
    </section>
  );
}
