"use client";
import type { ReactNode } from "react";
import type { RuleSet } from "@/lib/types";
import Tooltip from "./Tooltip";
import EvidenceRow from "./EvidenceRow";
import type { Evidence } from "@/lib/evidence";
import type { AnswerTone } from "./answer";
import { TIP } from "../verdict";

const TONE: Record<AnswerTone, { bar: string; ink: string }> = {
  ready: { bar: "var(--accent)", ink: "var(--accent)" },
  money: { bar: "#d9a441", ink: "#7a5400" },
  hearing: { bar: "#c2410c", ink: "#9a3412" },
  blocked: { bar: "#be123c", ink: "#9f1239" },
  none: { bar: "#b9c0bb", ink: "#5d6762" },
};

/** The panel's first answer: can I, should I, how. */
export default function AnswerCard({
  headline,
  tone,
  typeLine,
  financeLine,
  status,
  evidence,
  changes,
  ruleSet,
  onPlan,
}: {
  headline: string;
  tone: AnswerTone;
  typeLine: ReactNode;
  financeLine: string | null;
  status: { text: string; available: boolean };
  evidence: Evidence | null;
  changes: string[];
  ruleSet: RuleSet;
  onPlan: () => void;
}) {
  const t = TONE[tone];
  return (
    <section aria-label="Answer" className="fade-in relative overflow-hidden rounded-xl border border-hairline bg-white">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.bar }} />
      <div className="px-4 pt-4 pb-4">
        <p className="font-serif text-[24px] leading-[1.1] tracking-[-0.005em]" style={{ color: t.ink }}>
          {headline}
        </p>
        <p className="mt-2 text-[14px] leading-snug text-ink">
          {typeLine}
          {financeLine && (
            <>
              <span className="px-1.5 text-faint">·</span>
              <span className="tabular-nums">{financeLine}</span>
            </>
          )}
        </p>
        {ruleSet === "bill-2025-1545" && (
          <p className="mt-1 text-[12px] text-[#6b5200]">
            <Tooltip content={TIP.bill}>Scenario: if the housing bill passes</Tooltip>
          </p>
        )}
        {!status.available && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-[#8a4b00]">
            <WarnIcon />
            <span>
              <Tooltip content={TIP.cityStatus}>City status</Tooltip>: {status.text}
            </span>
          </p>
        )}

        {evidence && (
          <div className="mt-4">
            <EvidenceRow evidence={evidence} />
          </div>
        )}

        {changes.length > 0 && (
          <div className="mt-3 text-[12px] leading-snug">
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

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={onPlan}
            className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-accent active:scale-[0.98]"
          >
            Plan the application
          </button>
          {status.available && (
            <span className="text-[12px] text-muted">
              <Tooltip content={TIP.cityStatus}>City status</Tooltip>: {status.text}
            </span>
          )}
        </div>
      </div>
      <p className="border-t border-hairline bg-[#fafaf8] px-4 py-2 text-[12px] text-muted">
        A screen, not a zoning decision. The Zoning Administrator decides.
      </p>
    </section>
  );
}

function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="mt-[2px] shrink-0">
      <path d="M7 1.5l5.8 10.2H1.2z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 5.6v3M7 10.1v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
