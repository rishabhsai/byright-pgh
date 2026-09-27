"use client";
import type { ReactNode } from "react";
import type { RuleSet } from "@/lib/types";
import Tooltip from "./Tooltip";
import EvidenceRow from "./EvidenceRow";
import type { Evidence } from "@/lib/evidence";
import type { AnswerTone, Blocker } from "./answer";
import { TIP } from "../verdict";

const TONE: Record<AnswerTone, { bar: string; ink: string }> = {
  ready: { bar: "var(--color-v-byright)", ink: "var(--color-success-ink)" },
  money: { bar: "var(--color-v-variance)", ink: "var(--color-warning-ink)" },
  hearing: { bar: "var(--color-v-variance)", ink: "var(--color-warning-ink)" },
  blocked: { bar: "var(--color-v-prohibited)", ink: "var(--color-danger-ink)" },
  none: { bar: "var(--color-control-edge)", ink: "var(--color-muted)" },
};

/** The panel's first answer: can I, should I, how. */
export default function AnswerCard({
  topLine,
  headline,
  tone,
  typeLine,
  financeLine,
  basisNote,
  status,
  evidence,
  changes,
  ruleSet,
  onPlan,
  blocker,
  onWhyNot,
  indexNote,
  useRoute,
  prototype,
  notScreened = null,
}: {
  /** A line above the headline (the Reform scenario's result for this lot). */
  topLine?: ReactNode;
  headline: string;
  tone: AnswerTone;
  typeLine: ReactNode;
  financeLine: string | null;
  /** Names the proposal shown when it is not the map's best type. */
  basisNote?: string | null;
  status: { text: string; available: boolean };
  evidence: Evidence | null;
  changes: string[];
  ruleSet: RuleSet;
  onPlan: () => void;
  /** The selected proposal fails Fit or Use, or the lot is not for sale: no money line, no planning CTA. */
  blocker?: Blocker | null;
  /** Scroll to the section that explains the blocker. */
  onWhyNot?: (section: "fits" | "allowed") => void;
  /** A margin high enough to be an artifact of the index value. */
  indexNote?: boolean;
  /** The approval route an exception use needs; the Use pill shows it instead of "Unknown". */
  useRoute?: { short: string; full: string } | null;
  /** Why this proposal's finance was not screened; shown instead of any dollar figure. */
  notScreened?: string | null;
  /** Why this prototype suits (or strains) the lot's frontage. */
  prototype?: string | null;
}) {
  const t = TONE[tone];
  return (
    <section aria-label="Answer" className="fade-in surface-card relative overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.bar }} />
      <div className="p-card">
        {topLine && <div className="mb-3 border-b border-hairline pb-3 text-callout">{topLine}</div>}
        <p className="text-title" style={{ color: t.ink }}>
          {headline}
        </p>
        <p className="mt-2 text-body text-ink">
          {blocker ? <span className="font-medium">{blocker.text}</span> : typeLine}
          {!blocker && financeLine && (
            <>
              <span className="px-1.5 text-faint">·</span>
              <span className="tabular-nums">{financeLine}</span>
            </>
          )}
        </p>
        {!financeLine && notScreened && (
          <p className="mt-1 text-callout text-muted">
            Finance not screened: {notScreened}.
          </p>
        )}
        {!blocker && financeLine && indexNote && (
          <p className="mt-1 text-caption text-muted">Index-based value; confirm comps before relying on this margin.</p>
        )}
        {!blocker && prototype && <p className="mt-1 text-caption text-muted">{prototype}</p>}
        {basisNote && <p className="mt-1 text-caption text-warning-ink">{basisNote}</p>}
        {ruleSet === "bill-2025-1545" && (
          <p className="mt-1 text-caption text-warning-ink">
            <Tooltip content={TIP.bill}>Scenario: if the housing bill passes</Tooltip>
          </p>
        )}
        {!status.available && !(blocker && !blocker.why) && (
          <p className="mt-2 flex items-start gap-1.5 text-callout text-warning-ink">
            <WarnIcon />
            <span>
              <Tooltip content={TIP.cityStatus}>City status</Tooltip>: {status.text}
            </span>
          </p>
        )}

        {evidence && (
          <div className="mt-4">
            <EvidenceRow evidence={evidence} useRoute={useRoute} />
          </div>
        )}

        {changes.length > 0 && (
          <div className="mt-5 text-callout">
            <p className="text-muted">What would change this</p>
            <ul className="mt-0.5 space-y-0.5">
              {changes.map((c) => (
                <li key={c} className="text-ink">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {!blocker ? (
            <button
              onClick={onPlan}
              className="button-primary shrink-0"
            >
              Plan the application
            </button>
          ) : blocker.why && onWhyNot ? (
            <button
              onClick={() => onWhyNot(blocker.why!)}
              className="shrink-0 text-callout font-medium text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
            >
              Why not
            </button>
          ) : (
            <span />
          )}
          {status.available && (
            <span className="text-caption text-muted">
              <Tooltip content={TIP.cityStatus}>City status</Tooltip>: {status.text}
            </span>
          )}
        </div>
      </div>
      <p className="border-t border-hairline bg-surface/60 px-card py-3 text-caption text-muted">
        A screen, not a zoning decision. The Zoning Administrator decides.
      </p>
    </section>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden className="mt-[2px] shrink-0">
      <path d="M7 1.5l5.8 10.2H1.2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 5.6v3M7 10.1v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
