"use client";
import { useState } from "react";
import Tooltip from "./Tooltip";
import { EVIDENCE_STATE_LABEL as EVIDENCE_WORD, type Evidence, type EvidenceState } from "@/lib/evidence";

const FILL: Record<EvidenceState, string> = {
  pass: "var(--accent)",
  fail: "#c2410c",
  unknown: "repeating-linear-gradient(135deg, #c9cfca 0 3px, transparent 3px 6px)",
  notChecked: "transparent",
};

export function evidenceSummary(e: Evidence): string {
  const n = (s: EvidenceState) => e.checks.filter((c) => c.state === s).length;
  // `passed` counts out-of-scope checks too, so name them: "6 of 6 checks pass · fit not checked".
  const parts = [`${e.passed} of ${e.total} checks pass`];
  const failed = e.checks.filter((c) => c.state === "fail");
  if (failed.length === 1) parts.push(`${failed[0].label.toLowerCase()} fails`);
  else if (failed.length > 1) parts.push(`${failed.length} fail`);
  if (n("unknown")) parts.push(`${n("unknown")} unknown`);
  for (const c of e.checks) if (c.state === "notChecked") parts.push(`${c.label.toLowerCase()} not checked`);
  return parts.join(" · ");
}

/**
 * Six screening checks as a segmented meter. Each segment explains itself on hover or focus;
 * clicking pins its detail (with the code citation) under the row.
 */
export default function EvidenceRow({ evidence }: { evidence: Evidence }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const open = evidence.checks.find((c) => c.id === pinned) ?? null;
  return (
    <div>
      <p className="mb-2 text-[12px] text-muted">
        <span className="font-medium text-ink">{evidenceSummary(evidence)}</span>
      </p>
      <ul className="grid grid-cols-6 gap-0.5 min-[1440px]:gap-1" aria-label="Screening checks">
        {evidence.checks.map((c) => {
          const on = pinned === c.id;
          return (
            <li key={c.id} className="min-w-0">
              <Tooltip
                asChild
                content={
                  <>
                    <span className="block font-medium">
                      {c.label}: {EVIDENCE_WORD[c.state]}
                    </span>
                    <span className="mt-0.5 block text-white/80">{c.detail}</span>
                  </>
                }
              >
                <button
                  onClick={() => setPinned(on ? null : c.id)}
                  aria-expanded={on}
                  aria-label={`${c.label}: ${EVIDENCE_WORD[c.state]}`}
                  className={`group block w-full rounded-md px-px pt-1 pb-1.5 min-[1440px]:px-0.5 text-left transition-colors hover:bg-surface ${on ? "bg-surface" : ""}`}
                >
                  <span
                    aria-hidden
                    className="block h-[6px] rounded-full"
                    style={{
                      background: FILL[c.state],
                      boxShadow: c.state === "notChecked" ? "inset 0 0 0 1px #b9c0bb" : undefined,
                    }}
                  />
                  <span className="mt-1.5 block truncate text-[12px] leading-tight tracking-[-0.015em] text-ink">{c.label}</span>
                  <span className={`block text-[11px] leading-tight ${c.state === "fail" ? "text-[#c2410c]" : "text-muted"}`}>
                    {EVIDENCE_WORD[c.state]}
                  </span>
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      {open && (
        <p className="fade-in mt-2 rounded-md bg-surface px-3 py-2 text-[12px] leading-snug text-ink">
          <span className="font-medium">{open.label}.</span> {open.detail}
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
