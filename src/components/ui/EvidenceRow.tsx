"use client";
import { useState } from "react";
import Tooltip from "./Tooltip";
import {
  EVIDENCE_LABEL,
  EVIDENCE_STATE_LABEL as EVIDENCE_WORD,
  summary,
  type Evidence,
  type EvidenceState,
} from "@/lib/evidence";
import { evidenceSummary } from "./evidenceText";

export { evidenceSummary } from "./evidenceText";

const FILL: Record<EvidenceState, string> = {
  pass: "var(--color-v-byright)",
  fail: "var(--color-v-prohibited)",
  unknown: "repeating-linear-gradient(135deg, var(--color-v-unknown) 0 3px, transparent 3px 6px)",
  notChecked: "transparent",
};

/** Six tiny squares in check order, colored by state; the list row's evidence at a glance. */
export function EvidenceGlyphs({ evidence, extra }: { evidence: Evidence; extra?: string[] }) {
  const title = [
    summary(evidence),
    ...evidence.checks.map(
      (c) =>
        `${EVIDENCE_LABEL[c.id]}: ${c.belowFloor && c.state === "fail" ? "Below floor" : EVIDENCE_WORD[c.state]}`,
    ),
    ...(evidence.unresolved ?? []).map(
      (u) => `${u.label}: unresolved, confirm on the site plan`,
    ),
    ...(extra ?? []),
  ].join("\n");
  return (
    <span title={title} role="img" aria-label={`Checks: ${summary(evidence)}`} className="inline-flex shrink-0 items-center gap-[1.5px] py-[3px]">
      {evidence.checks.map((c) => (
        <span
          key={c.id}
          aria-hidden
          className="block h-[6px] w-[5px] rounded-[1px]"
          style={{ background: FILL[c.state], boxShadow: c.state === "notChecked" || c.state === "unknown" ? "inset 0 0 0 1px var(--color-v-unknown)" : undefined }}
        />
      ))}
    </span>
  );
}

/**
 * Six screening checks as a segmented meter. Each segment explains itself on hover or focus;
 * clicking pins its detail (with the code citation) under the row.
 */
export default function EvidenceRow({ evidence, useRoute }: { evidence: Evidence; useRoute?: { short: string; full: string } | null }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const open = evidence.checks.find((c) => c.id === pinned) ?? null;
  // An exception use is a route (staff or Board approval), never shown as "Unknown".
  const word = (c: Evidence["checks"][number], full = false) =>
    useRoute && c.id === "use" && c.state === "unknown"
      ? full
        ? useRoute.full
        : useRoute.short
      : c.belowFloor && c.state === "fail"
        ? full
          ? "Below the 1,000 sf screening floor (not a code minimum)"
          : "Below floor"
        : EVIDENCE_WORD[c.state];
  return (
    <div>
      <p className="mb-2 text-caption text-ink">{evidenceSummary(evidence, useRoute?.full)}</p>
      <div className="evidence-meter-wrap">
        <ul className="evidence-meter" aria-label="Screening checks">
          {evidence.checks.map((c) => {
            const on = pinned === c.id;
            return (
              <li key={c.id} className="min-w-0">
                <Tooltip
                  asChild
                  content={
                    <>
                      <span className="block font-medium">
                        {EVIDENCE_LABEL[c.id]}: {word(c, true)}
                      </span>
                      <span className="mt-0.5 block text-white/80">{c.detail}</span>
                    </>
                  }
                >
                  <button
                    onClick={() => setPinned(on ? null : c.id)}
                    aria-expanded={on}
                    aria-label={`${EVIDENCE_LABEL[c.id]}: ${word(c, true)}`}
                    className={`evidence-cell group block w-full text-left transition-colors hover:bg-track ${on ? "bg-track" : ""}`}
                  >
                    <span
                      aria-hidden
                      className="block h-[3px] rounded-full"
                      style={{
                        background:
                          word(c) !== EVIDENCE_WORD[c.state] && c.id === "use"
                            ? "var(--color-v-review)"
                            : FILL[c.state],
                        boxShadow:
                          c.state === "notChecked"
                            ? "inset 0 0 0 1px var(--color-control-edge)"
                            : undefined,
                      }}
                    />
                    <span className="block text-caption text-ink">
                      {EVIDENCE_LABEL[c.id]}
                    </span>
                    <span
                      className={`evidence-state mt-1 block text-callout ${c.state === "fail" ? "text-danger-ink" : word(c) !== EVIDENCE_WORD[c.state] ? "text-review-ink" : "text-muted"}`}
                    >
                      {word(c)}
                    </span>
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </div>
      {open && (
        <p className="fade-in mt-2 rounded-control bg-surface px-3 py-2 text-caption text-ink">
          <span className="font-medium">
            {EVIDENCE_LABEL[open.id]}: {word(open, true)}.
          </span>{" "}
          {open.detail}
          {open.citation && (
            <>
              {" "}
              <a
                href={open.citation.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                {open.citation.section}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
