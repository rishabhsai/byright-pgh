"use client";
import { useState } from "react";
import type { Check, Comps, Finding, Lot, RuleSet, TriageResult } from "@/lib/types";
import { TYPOLOGY_LABEL, VERDICT_LABEL } from "@/lib/types";
import type { FinanceAssumptions } from "@/lib/finance";
import {
  TRIAGE_COLOR,
  TRIAGE_INK,
  TRIAGE_SHORT,
  TRIAGE_WORD,
  VERDICT_COLOR,
  VerdictChip,
  VERDICT_SHORT,
  ZoneChip,
} from "./verdict";
import { districtName } from "./district";
import { buildMemo, REVIEW_CHECKLIST } from "./memo";
import ProForma from "./ProForma";
import ApplicationPlanner from "./ApplicationPlanner";

interface Props {
  lot: Lot | null;
  ruleSet: RuleSet;
  findings: Finding[] | null;
  findingsCurrent: Finding[] | null;
  findingsBill: Finding[] | null;
  onClose: () => void;
  triage: TriageResult | null;
  comps: Comps | null;
  assumptions: FinanceAssumptions;
  onAssumptions: (a: FinanceAssumptions) => void;
  /** True while the city-wide triage is catching up with the latest assumptions. */
  recomputing: boolean;
  /** Reading mode: the panel overlays the map as a wide, centered surface. */
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  /** Hook for an AI-drafted memo. Not implemented here; the lead wires the API route. */
  onGenerateMemo?: (lot: Lot, findings: Finding[], ruleSet: RuleSet) => Promise<string>;
}

export default function DetailPanel(props: Props) {
  const { lot, findings, onExpanded } = props;
  const expanded = props.expanded && !!lot && !!findings;
  // The aside keeps its width in both modes so the map never resizes; expanded mode lifts the
  // same LotDetail (same tree position, so no state is lost) into an overlay over the map area.
  return (
    <aside className="flex w-[412px] shrink-0 flex-col border-l border-hairline bg-panel">
      {lot && findings ? (
        <div className={expanded ? "absolute inset-0 z-30 flex justify-center" : "contents"}>
          <div
            aria-hidden
            onClick={() => onExpanded(false)}
            className={expanded ? "backdrop-in absolute inset-0 bg-[#17211e]/25" : "hidden"}
          />
          <div
            role={expanded ? "dialog" : undefined}
            aria-label={expanded ? "Lot details, expanded" : undefined}
            className={
              expanded
                ? "expand-in relative flex h-full w-[920px] max-w-[min(90vw,100%)] flex-col border-x border-hairline bg-panel shadow-[0_20px_60px_-20px_rgba(23,33,30,.45)]"
                : "flex min-h-0 flex-1 flex-col"
            }
          >
            <LotDetail {...props} lot={lot} findings={findings} expanded={expanded} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="mb-4 text-hairline">
            <rect x="8" y="14" width="18" height="28" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="30" y="14" width="18" height="28" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="39" cy="28" r="3.5" fill="var(--v-byright)" />
          </svg>
          <p className="font-serif text-[22px] leading-tight text-ink">Select a lot on the map or in the list</p>
          <p className="mt-2 max-w-[280px] text-[12px] leading-relaxed text-muted">
            Then flip the toggle above to see what Bill 2025-1545 would change on that parcel.
          </p>
        </div>
      )}
    </aside>
  );
}

function LotDetail({
  lot,
  ruleSet,
  findings,
  findingsCurrent,
  findingsBill,
  onClose,
  triage,
  comps,
  assumptions,
  onAssumptions,
  recomputing,
  expanded,
  onExpanded,
  onGenerateMemo,
}: Props & { lot: Lot; findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pfPending, setPfPending] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(REVIEW_CHECKLIST.map(() => false));
  const [copied, setCopied] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const dName = districtName(lot.zone);

  const otherRs: RuleSet = ruleSet === "current" ? "bill-2025-1545" : "current";
  const otherFindings = ruleSet === "current" ? findingsBill : findingsCurrent;
  const changes =
    findingsCurrent && findingsBill
      ? findingsCurrent
          .map((c, i) => ({ t: c.typology, from: c.verdict, to: findingsBill[i]?.verdict }))
          .filter((x) => x.to && x.to !== x.from)
      : [];

  const flash = (msg: string) => {
    setCopied(msg);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const memo = () =>
    buildMemo(lot, ruleSet, findings, otherFindings ? { ruleSet: otherRs, findings: otherFindings } : null, dName);

  const copyMemo = async () => {
    await copyText(memo());
    flash("Memo copied");
  };

  const downloadMemo = () => {
    const blob = new Blob([memo()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `byright-${lot.id}-${ruleSet}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const aiMemo = async () => {
    if (!onGenerateMemo) return;
    setAiBusy(true);
    try {
      const text = await onGenerateMemo(lot, findings, ruleSet);
      await copyText(text);
      flash("AI memo copied");
    } finally {
      setAiBusy(false);
    }
  };

  const hazards = [
    lot.hazards.steepSlope && "Steep slope 25%+",
    lot.hazards.undermined && "Undermined area",
    lot.hazards.floodZone && "FEMA flood zone",
  ].filter(Boolean) as string[];

  return (
    <div className="fade-in scroll-thin flex-1 overflow-y-auto">
      <div className={`sticky top-0 z-10 border-b border-hairline bg-panel pt-4 pb-3 ${expanded ? "px-10" : "px-5"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-[28px] leading-[1.05] text-ink">{lot.address || "Unaddressed lot"}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {lot.neighborhood}
              {lot.councilDistrict && <>, Council District {lot.councilDistrict}</>}
            </p>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => onExpanded(!expanded)}
              aria-pressed={expanded}
              title={expanded ? "Collapse to the side panel (Esc)" : "Expand for reading"}
              className="inline-flex items-center gap-1 rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <ExpandIcon expanded={expanded} />
              {expanded ? "Collapse" : <span className="sr-only">Expand</span>}
            </button>
            <button
              onClick={onClose}
              aria-label="Clear selection (Esc)"
              title={expanded ? "Clear selection" : "Clear selection (Esc)"}
              className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface"
            >
              Esc
            </button>
          </div>
        </div>
        <button
          onClick={async () => {
            await copyText(lot.id);
            flash("Parcel ID copied");
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[11px] text-ink hover:bg-[#e3e5e0]"
          title="Copy parcel ID"
        >
          <span className="text-muted">Parcel</span>
          <span className="font-medium tracking-wide tabular-nums">{lot.id}</span>
          <CopyIcon />
        </button>
      </div>

      <div className={expanded ? "space-y-8 px-10 py-7" : "space-y-6 px-5 py-5"}>
        {triage && <TriageBlock t={triage} ruleSet={ruleSet} />}

        <Section n={1} title="The lot">
          <dl className={`grid grid-cols-2 text-[12px] ${expanded ? "gap-x-8 gap-y-0" : "gap-x-4 gap-y-3"}`}>
            <Fact label="Zone" wide inline={expanded}>
              <span className="flex items-center gap-2">
                <ZoneChip zone={lot.zone} />
                <span className="text-ink">{dName ?? "District not in registry"}</span>
              </span>
            </Fact>
            <Fact label="Lot area" inline={expanded}>
              {lot.lotAreaSqFt != null ? `${lot.lotAreaSqFt.toLocaleString()} sf` : <Missing />}
            </Fact>
            <Fact label="Frontage" inline={expanded}>{lot.frontageFt != null ? `${lot.frontageFt} ft` : <Missing />}</Fact>
            <Fact label="Assessed land value" hint="County assessed, not market" inline={expanded}>
              {lot.landValue != null ? `$${lot.landValue.toLocaleString()}` : <Missing />}
            </Fact>
            <Fact label="Inventory status" inline={expanded}>{lot.status || <Missing />}</Fact>
          </dl>
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {hazards.map((h) => (
                <span key={h} className="rounded-full bg-[#fdf0e1] px-2 py-0.5 text-[11px] font-medium text-[#8a4b00]">
                  {h}
                </span>
              ))}
              {hazards.length === 0 && (
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">No hazard flags</span>
              )}
              {lot.hazards.floodZone == null && (
                <span className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-[11px] text-faint">
                  Flood zone not checked
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">Hazard layers are screening only and never change a verdict.</p>
          </div>
        </Section>

        <Section n={2} title={ruleSet === "current" ? "Verdicts under today's code" : "Verdicts if Bill 2025-1545 passes"}>
          <VerdictList findings={findings} open={open} onOpen={setOpen} columns={expanded ? 2 : 1} />
        </Section>

        <Section n={3} title={ruleSet === "current" ? "What changes under Bill 2025-1545" : "What the bill changed here"}>
          {changes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-muted">
              No verdict on this lot changes between today&apos;s code and the bill.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {changes.map((c) => (
                <li
                  key={c.t}
                  className="flex items-center gap-2 rounded-lg border border-gold/50 bg-gold-soft/60 px-3 py-2 text-[12px]"
                >
                  <span className="flex-1 font-medium text-ink">{TYPOLOGY_LABEL[c.t]}</span>
                  <span style={{ color: VERDICT_COLOR[c.from] }} className="whitespace-nowrap">
                    {VERDICT_SHORT[c.from]}
                  </span>
                  <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden className="text-muted">
                    <path d="M0 4h12M9 1l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.3" />
                  </svg>
                  <span style={{ color: VERDICT_COLOR[c.to!] }} className="font-semibold whitespace-nowrap">
                    {VERDICT_SHORT[c.to!]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          n={4}
          title="Does it pencil?"
          action={
            <span
              aria-live="polite"
              className={`flex items-center gap-1.5 text-[11px] text-muted transition-opacity duration-150 ${
                pfPending || recomputing ? "opacity-100" : "opacity-0"
              }`}
            >
              {(pfPending || recomputing) && (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Recomputing all lots…
                </>
              )}
            </span>
          }
        >
          <ProForma
            lot={lot}
            comps={comps}
            initialTypology={triage?.bestTypology ?? findings.find((f) => f.verdict === "by-right")?.typology ?? null}
            assumptions={assumptions}
            onAssumptions={onAssumptions}
            onPending={setPfPending}
          />
        </Section>

        <Section n={5} title="Human review checklist">
          <ul className="space-y-1.5">
            {REVIEW_CHECKLIST.map((item, i) => (
              <li key={item}>
                <label className="flex cursor-pointer items-start gap-2.5 text-[12px] leading-snug">
                  <input
                    type="checkbox"
                    checked={checked[i]}
                    onChange={() => setChecked((c) => c.map((x, j) => (j === i ? !x : x)))}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  <span className={checked[i] ? "text-faint line-through" : "text-ink"}>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section n={6} title="Memo">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyMemo}
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent"
            >
              Copy memo
            </button>
            <button
              onClick={downloadMemo}
              className="rounded-md border border-hairline bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-surface"
            >
              Download .md
            </button>
            {onGenerateMemo && (
              <button
                onClick={aiMemo}
                disabled={aiBusy}
                className="rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent disabled:opacity-60"
              >
                {aiBusy ? "Drafting…" : "Draft plain-language memo"}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Built from the rule findings above with every citation. Rules decide; text only explains.
          </p>
        </Section>

        <Section n={7} title="Plan your application">
          <ApplicationPlanner
            key={ruleSet}
            lot={lot}
            findings={findings}
            ruleSet={ruleSet}
            triage={triage}
            comps={comps}
            assumptions={assumptions}
            onFlash={flash}
            wide={expanded}
          />
        </Section>
      </div>

      {copied && (
        <div className="pop fixed right-6 bottom-6 z-50 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white shadow-lg">
          {copied}
        </div>
      )}
    </div>
  );
}

function TriageBlock({ t, ruleSet }: { t: TriageResult; ruleSet: RuleSet }) {
  const c = TRIAGE_COLOR[t.triage];
  return (
    <section
      aria-label={`Triage: ${TRIAGE_WORD[t.triage]}`}
      className="fade-in overflow-hidden rounded-lg border border-hairline bg-white"
    >
      <div className="flex items-stretch">
        <div className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 py-3" style={{ background: c }}>
          <span className="font-serif text-[26px] leading-none text-white">{TRIAGE_WORD[t.triage]}</span>
        </div>
        <div className="min-w-0 flex-1 px-3.5 py-2.5">
          <p className="text-[13px] font-semibold" style={{ color: TRIAGE_INK[t.triage] }}>
            {TRIAGE_SHORT[t.triage]}
            <span className="font-normal text-muted">
              {ruleSet === "current" ? ", today's code" : ", if Bill 2025-1545 passes"}
            </span>
          </p>
          <ul className="mt-1 space-y-1">
            {t.reasons.map((r) => (
              <li key={r} className="text-[12px] leading-snug text-ink">
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Section({
  n,
  title,
  action,
  children,
}: {
  n: number;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <span className="font-serif text-[20px] leading-none text-accent italic">{n}</span>
        <h3 className="flex-1 text-[13px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * One row per home type, or pairs of rows in expanded mode. An opened row's checks render beneath
 * its row (full width), so neighbors never stretch or reflow.
 */
function VerdictList({
  findings,
  open,
  onOpen,
  columns,
}: {
  findings: Finding[];
  open: string | null;
  onOpen: (t: string | null) => void;
  columns: 1 | 2;
}) {
  const rows: Finding[][] = [];
  for (let i = 0; i < findings.length; i += columns) rows.push(findings.slice(i, i + columns));
  return (
    <ul className="overflow-hidden rounded-lg border border-hairline bg-white">
      {rows.map((row) => {
        const opened = row.find((f) => f.typology === open);
        return (
          <li key={row[0].typology} className="border-b border-hairline last:border-b-0">
            <div className={columns === 2 ? "grid grid-cols-2 divide-x divide-hairline" : ""}>
              {row.map((f) => {
                const isOpen = f === opened;
                return (
                  <button
                    key={f.typology}
                    onClick={() => onOpen(isOpen ? null : f.typology)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#fafaf8] ${
                      isOpen && columns === 2 ? "bg-[#fafaf8]" : ""
                    } ${row.length < columns ? "col-span-2" : ""}`}
                  >
                    <span className="w-1 self-stretch rounded-full" style={{ background: VERDICT_COLOR[f.verdict] }} />
                    <span className="flex-1 text-[13px] text-ink">{TYPOLOGY_LABEL[f.typology]}</span>
                    <VerdictChip verdict={f.verdict} />
                    <Chevron open={isOpen} />
                  </button>
                );
              })}
            </div>
            {opened && (
              <div className="fade-in border-t border-hairline bg-[#fafaf8] px-3 py-3">
                {opened.summary && (
                  <p className="mb-2 max-w-[70ch] text-[12px] leading-snug text-muted">{opened.summary}</p>
                )}
                {opened.checks.length === 0 && (
                  <p className="text-[12px] text-muted">No checks run. {VERDICT_LABEL[opened.verdict]}.</p>
                )}
                <ul className={columns === 2 ? "grid grid-cols-2 gap-x-6 gap-y-3" : "space-y-2.5"}>
                  {opened.checks.map((c) => (
                    <CheckRow key={c.id} c={c} />
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Fact({
  label,
  hint,
  wide,
  inline,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  /** Label and value on one row (expanded reading mode). */
  inline?: boolean;
  children: React.ReactNode;
}) {
  if (inline)
    return (
      <div
        className={`grid grid-cols-[150px_minmax(0,1fr)] items-baseline gap-3 border-b border-hairline py-2 ${wide ? "col-span-2" : ""}`}
      >
        <dt className="text-[11.5px] text-muted">{label}</dt>
        <dd className="text-[13px] text-ink tabular-nums">
          {children}
          {hint && <span className="block text-[10.5px] text-faint">{hint}</span>}
        </dd>
      </div>
    );
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-ink tabular-nums">{children}</dd>
      {hint && <dd className="text-[10.5px] text-faint">{hint}</dd>}
    </div>
  );
}

function Missing() {
  return <span className="text-faint italic">not in record</span>;
}

function CheckRow({ c }: { c: Check }) {
  const state = c.passed === true ? "pass" : c.passed === false ? "fail" : "survey";
  return (
    <li className="flex gap-2.5">
      <StatusIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium text-ink">{c.label}</span>
          <span className="shrink-0 text-[11px] text-muted">
            {state === "pass" ? "Pass" : state === "fail" ? "Fails" : "Needs survey"}
          </span>
        </div>
        {(c.measured || c.required) && (
          <div className="mt-0.5 grid grid-cols-2 gap-2 text-[11px]">
            <span>
              <span className="text-faint">Measured </span>
              <span className="text-ink tabular-nums">{c.measured ?? "not in record"}</span>
            </span>
            <span>
              <span className="text-faint">Required </span>
              <span className="text-ink tabular-nums">{c.required ?? "n/a"}</span>
            </span>
          </div>
        )}
        {c.note && <p className="mt-0.5 text-[11px] text-muted">{c.note}</p>}
        <a
          href={c.citation.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[11px] text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
        >
          {c.citation.section} {c.citation.title}
        </a>
      </div>
    </li>
  );
}

function StatusIcon({ state }: { state: "pass" | "fail" | "survey" }) {
  if (state === "pass")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Pass">
        <circle cx="8" cy="8" r="7.5" fill="#16a34a" />
        <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === "fail")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Fails">
        <circle cx="8" cy="8" r="7.5" fill="#d97706" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Needs survey">
      <circle cx="8" cy="8" r="7" fill="none" stroke="#9ca3af" strokeWidth="1.2" strokeDasharray="2.2 1.6" />
      <circle cx="8" cy="8" r="1.4" fill="#5d6762" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
      className="shrink-0 text-muted transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {expanded ? (
        <path d="M5 1v4H1M7 11V7h4M5 5L1 1M7 7l4 4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M7.5 1H11v3.5M4.5 11H1V7.5M11 1L7 5M1 11l4-4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-muted">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" />
      <path d="M8.5 2.5V2a1 1 0 00-1-1H2a1 1 0 00-1 1v5.5a1 1 0 001 1h.5" fill="none" stroke="currentColor" />
    </svg>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
