"use client";
import { useRef, useState } from "react";
import type { Check, Finding, Lot, RuleSet, Typology, Verdict } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import type { FinanceAssumptions } from "@/lib/finance";
import type { SelectedCase } from "@/lib/selectedCase";
import { TIP, VERDICT_COLOR, VERDICT_TIP, VerdictChip, ZoneChip, zoneLabel } from "./verdict";
import { districtName } from "./district";
import { buildMemo, buildSummary } from "./memo";
import ProForma from "./ProForma";
import ApplicationPlanner from "./ApplicationPlanner";
import Tooltip from "./ui/Tooltip";
import Section from "./ui/Section";
import AnswerCard from "./ui/AnswerCard";
import { evidenceSummary } from "./ui/EvidenceRow";
import {
  answerHeadline,
  approvalRoute,
  blockerLine,
  cityStatus,
  financeLine,
  HIGH_MARGIN_PCT,
  nb,
  typologyPhrase,
  useTableSummary,
  verdictLabel,
  verdictWord,
  whatWouldChange,
} from "./ui/answer";
import { districtUnconfirmed, MIN_PRACTICAL_LOT_SQFT } from "@/lib/evidence";
import { prototypeNote } from "@/lib/proforma";
import { financeGate } from "./ui/financeGate";
import { FunnelBars, FunnelSentence, type FunnelStats } from "./ui/Funnel";
import type { Funnel } from "@/lib/plan";

/** 4623 Chatsworth St, Hazelwood: the demo script's lot (a detached house; Finance fails, Fit not checked). */
export const DEMO_LOT_ID = "0055P00008000000";

interface Props {
  /** The selected lot as one case; null shows the empty state. */
  selected: SelectedCase | null;
  /** Rule set for the empty state's funnel. */
  ruleSet: RuleSet;
  /** "Showing: Duplex (selected). Best type here: House." when the panel and the map differ. */
  bestNote: string | null;
  onClose: () => void;
  onTypology: (t: Typology) => void;
  onLandOverride: (v: number | null) => void;
  /** Shared finance assumptions changed; the case is rebuilt from them at once. */
  onAssumptions: (a: FinanceAssumptions) => void;
  /** Send pending assumption edits to the city-wide pass now. */
  onCommit?: () => void;
  /** Set when the finance data file failed to load. */
  compsError?: string | null;
  onRetryComps?: () => void;
  /** True while the city-wide triage is catching up with the latest assumptions. */
  recomputing: boolean;
  /** Reading mode: the panel overlays the map as a wide, centered surface. */
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  /** Stats for the active rule set; drives the empty-state funnel. */
  stats?: FunnelStats | null;
  /** Select a lot by parcel ID (the empty state's demo link). No-op when absent. */
  onSelectId?: (id: string) => void;
  /** The neighborhood scope's plan funnel when the neighborhood filter is set; the empty state follows it. */
  scope?: EmptyScope | null;
}

/** The plan's funnel for the neighborhood filter, for the empty state. */
export interface EmptyScope {
  label: string;
  funnel: Funnel;
}

export default function DetailPanel(props: Props) {
  const { selected, onExpanded } = props;
  const expanded = props.expanded && !!selected;
  // The aside keeps its width in both modes so the map never resizes; expanded mode lifts the
  // same LotDetail (same tree position, so no state is lost) into an overlay over the map area.
  return (
    <aside className="flex w-detail shrink-0 flex-col border-l border-hairline bg-surface min-[1440px]:w-detail-wide">
      {selected ? (
        <div className={expanded ? "absolute inset-0 z-30 flex justify-center" : "contents"}>
          <div
            aria-hidden
            onClick={() => onExpanded(false)}
            className={expanded ? "backdrop-in absolute inset-0 bg-ink/25" : "hidden"}
          />
          <div
            role={expanded ? "dialog" : undefined}
            aria-label={expanded ? "Lot details, expanded" : undefined}
            className={
              expanded
                ? "expand-in relative flex h-full w-[920px] max-w-[min(90vw,100%)] flex-col bg-surface shadow-overlay"
                : "flex min-h-0 flex-1 flex-col"
            }
          >
            <LotDetail {...props} c={selected} expanded={expanded} />
          </div>
        </div>
      ) : (
        <EmptyState
          stats={props.stats}
          ruleSet={props.ruleSet}
          onSelectId={props.onSelectId}
          scope={props.scope ?? null}
        />
      )}
    </aside>
  );
}

function EmptyState({
  stats,
  ruleSet,
  onSelectId,
  scope,
}: {
  /** null while loading; undefined when the caller does not provide stats (no funnel then). */
  stats: FunnelStats | null | undefined;
  ruleSet: RuleSet;
  onSelectId?: (id: string) => void;
  scope: EmptyScope | null;
}) {
  if (scope) return <ScopeEmptyState scope={scope} onSelectId={onSelectId} />;
  if (stats === undefined)
    return (
      <div className="flex flex-1 flex-col justify-center px-panel">
        <p className="text-title text-ink">Pick a lot on the map or in the list.</p>
        <p className="mt-2 text-callout text-muted">See what the use table allows, whether it clears the cost-and-return screen, and what to file.</p>
      </div>
    );
  return (
    <div data-scroll className="scroll-thin relative flex flex-1 flex-col overflow-y-auto px-panel pt-10 pb-section">
      <FunnelSentence
        s={stats}
        className="empty-sentence"
      />
      {stats &&
        ruleSet === "bill-2025-1545" &&
        (stats.lotsGaining ?? 0) > 0 && (
          <p className="mt-3 text-callout text-warning-ink">
            <Tooltip content={TIP.bill}>If the housing bill passes</Tooltip>, +
            {stats.lotsGaining!.toLocaleString("en-US")} lots could also add a
            backyard unit.
          </p>
        )}
      <div className="mt-section">
        {stats ? (
          <FunnelBars s={stats} />
        ) : (
          <div className="space-y-4">
            {[100, 80, 34, 6].map((w) => (
              <div key={w} className="h-2 animate-pulse rounded-full bg-surface" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-section border-t border-hairline pt-section">
        <p className="text-body text-ink">Pick a lot on the map or in the list.</p>
        {onSelectId && (
          <button
            onClick={() => onSelectId(DEMO_LOT_ID)}
            className="mt-1.5 text-left text-callout text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
          >
            Try a demo lot: 4623 Chatsworth St, Hazelwood
          </button>
        )}
      </div>
    </div>
  );
}

/** The empty state for a neighborhood scope: the same funnel the Plan tab shows, as a sentence and bars. */
function ScopeEmptyState({
  scope,
  onSelectId,
}: {
  scope: EmptyScope;
  onSelectId?: (id: string) => void;
}) {
  const f = scope.funnel;
  const n = (v: number) => (
    <span className="funnel-number font-semibold text-ink tabular-nums">
      {v.toLocaleString("en-US")}
    </span>
  );
  const steps = [
    { key: "records", n: f.records, label: "vacant City lots" },
    { key: "encoded", n: f.encoded, label: "evaluated" },
    {
      key: "byRight",
      n: f.byRight,
      label: "pass the use-table and lot-size screen",
    },
    { key: "sale", n: f.availableNoFlag, label: "for sale, no hazard flag" },
    {
      key: "floor",
      n: f.atLeast1000,
      label: "1,000+ sf: candidates for staff review",
    },
    {
      key: "pencil",
      n: f.pencil,
      label: "also clear the cost-and-return screen",
    },
  ];
  return (
    <div data-scroll className="scroll-thin relative flex flex-1 flex-col overflow-y-auto px-panel pt-10 pb-section">
      <p className="text-caption text-muted">{scope.label}</p>
      <p className="empty-sentence mt-1 text-muted">
        {n(f.byRight)} of {n(f.records)} vacant City lots pass the use-table and
        lot-size screen. {n(f.atLeast1000)}{" "}
        {f.atLeast1000 === 1 ? "is a candidate" : "are candidates"} for staff
        review; {n(f.pencil)} also clear the cost-and-return screen.
      </p>
      <div className="mt-section">
        <FunnelBars steps={steps} />
      </div>
      <div className="mt-section border-t border-hairline pt-section">
        <p className="text-body text-ink">
          Pick a lot on the map or in the list. The Plan tab has this
          scope&apos;s shortlist.
        </p>
        {onSelectId && scope.label.includes("Hazelwood") && (
          <button
            onClick={() => onSelectId(DEMO_LOT_ID)}
            className="mt-1.5 text-left text-callout text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
          >
            Try a demo lot: 4623 Chatsworth St, Hazelwood
          </button>
        )}
      </div>
    </div>
  );
}

const NAV = [
  { id: "allowed", label: "Allowed" },
  { id: "fits", label: "Fits" },
  { id: "pays", label: "Pays" },
  { id: "file", label: "File" },
] as const;

function LotDetail({
  c,
  bestNote,
  onClose,
  onTypology,
  onLandOverride,
  onAssumptions,
  onCommit,
  compsError,
  onRetryComps,
  recomputing,
  expanded,
  onExpanded,
}: Props & { c: SelectedCase }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("allowed");
  const [exportOpen, setExportOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const { lot, ruleSet, typology } = c;
  const findings = c.findings[ruleSet];
  const dName = districtName(lot.zone);

  const otherRs: RuleSet = ruleSet === "current" ? "bill-2025-1545" : "current";
  const otherFindings = c.findings[otherRs];

  const flash = (msg: string) => {
    setCopied(msg);
    window.setTimeout(() => setCopied(null), 1600);
  };

  // --- The answer: the selected proposal's triage, finance and evidence, all from the case.
  const chosen = c.finding;
  const pf = c.proforma;

  const status = cityStatus(lot);
  const evidence = c.evidence;
  // No money line for a proposal that fails Fit or Use, on a lot that is not for sale, or one zoning did not evaluate.
  const blocker = chosen && chosen.verdict !== "unknown" ? blockerLine(lot, typology, chosen, evidence) : null;
  // One publication rule for money (the card, Pays, the brief): unscreened proposals show why, not dollars.
  const gate = financeGate({ lot, finding: chosen, evidence, proforma: pf });
  const fin = gate.screened ? financeLine(pf) : null;
  // The headline reads money only when it was screened.
  const head = answerHeadline(c.triage, chosen, gate.screened ? pf : null, lot);
  const indexNote = !!fin && !!pf?.pencils && pf.marginPct > HIGH_MARGIN_PCT;
  const changes = whatWouldChange(lot, findings, chosen, fin ? pf : null);
  const typeLine = typologyPhrase(typology, chosen);

  // --- Scroll: compact header and scroll-spy for the section nav.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setScrolled(el.scrollTop > 24);
    const top = el.getBoundingClientRect().top + (header.current?.offsetHeight ?? 90) + 16;
    let cur: string = NAV[0].id;
    for (const n of NAV) {
      const s = el.querySelector<HTMLElement>(`[data-section="${n.id}"]`);
      if (s && s.getBoundingClientRect().top <= top) cur = n.id;
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = NAV[NAV.length - 1].id;
    setActive(cur);
  };
  const goTo = (id: string) => {
    const el = scroller.current;
    const s = el?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!el || !s) return;
    // The sticky header shrinks once scrolled, which moves everything below it up; aim for where the
    // section will be after that happens.
    const h = header.current;
    const nav = h?.querySelector("nav");
    const compact = 48 + (nav?.offsetHeight ?? 36) + 1;
    const shrink = scrolled || !h ? 0 : h.offsetHeight - compact;
    const offset = s.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - shrink - compact + 4;
    el.scrollTo({ top: offset, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const memo = () => buildMemo(c, { headline: head.text, districtName: dName, changes, finance: gate });
  const downloadBrief = () => {
    const blob = new Blob([memo()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `byright-lot-brief-${lot.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };
  const copySummary = async () => {
    await copyText(
      buildSummary(lot, ruleSet, {
        headline: head.text,
        typeLine: blocker?.text ?? typeLine,
        financeLine: fin,
        status: status.text,
        evidence: evidenceSummary(evidence, approvalRoute(chosen, lot)?.full),
      }),
    );
    setExportOpen(false);
    flash("Summary copied");
  };

  const fitRows = chosen ? fitChecks(lot, chosen) : [];
  const fitPass = fitRows.filter((r) => r.state === "pass").length;
  const fitFail = fitRows.filter((r) => r.state === "fail").length;
  const fitSite = fitRows.filter((r) => r.state === "site").length;
  const unconfirmed = districtUnconfirmed(lot);
  const pad = expanded ? "px-10" : "px-panel";

  return (
    <div ref={scroller} onScroll={onScroll} data-scroll className="fade-in scroll-thin relative flex-1 overflow-y-auto">
      <div ref={header} className={`toolbar sticky top-0 z-10 border-b border-hairline ${pad}`}>
        <div className={`flex items-center justify-between gap-3 transition-[height] duration-200 ${scrolled ? "h-[48px]" : "pt-panel pb-4"}`}>
          <div className="min-w-0">
            {scrolled ? (
              <p className="flex min-w-0 items-center gap-2 text-body whitespace-nowrap">
                <span className="truncate font-semibold text-ink">{lot.address || "Unaddressed lot"}</span>
                <span className="truncate text-muted">{lot.neighborhood}</span>
                <ZoneChip zone={lot.zone} tip />
              </p>
            ) : (
              <>
                <h2 className="text-display break-words text-ink">{lot.address || "Unaddressed lot"}</h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-callout text-muted">
                  <span>{lot.neighborhood}</span>
                  <ZoneChip zone={lot.zone} tip />
                  {unconfirmed && (
                    <Tooltip
                      content={`Inventory says ${lot.zone || "no district"}; ${lot.zoneMap === null ? "no City zoning map district contains this point" : `the City zoning map says ${lot.zoneMap ?? "a different district"} at this point`}. Confirm the district before relying on the use result.`}
                    >
                      <span className="inline-flex shrink-0 items-center rounded-full bg-warning-soft px-2 py-1 text-caption font-medium whitespace-nowrap text-warning-ink">
                        {lot.zoneMap === null
                          ? "Not on the zoning map"
                          : `Map says ${lot.zoneMap ? zoneLabel(lot.zoneMap) : "other"}`}
                      </span>
                    </Tooltip>
                  )}
                  <button
                    onClick={async () => {
                      await copyText(lot.id);
                      flash("Parcel ID copied");
                    }}
                    className="-mx-1 inline-flex items-center gap-1 rounded px-1 text-caption text-muted tabular-nums hover:bg-surface hover:text-ink"
                    aria-label={`Copy parcel ID ${lot.id}`}
                  >
                    Parcel {lot.id}
                    <CopyIcon />
                  </button>
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start pt-1">
            <Tooltip content={expanded ? "Back to the side panel" : "Expand for reading"} side="bottom" asChild>
              <button
                onClick={() => onExpanded(!expanded)}
                aria-pressed={expanded}
                aria-label={expanded ? "Collapse" : "Expand"}
                className="icon-button"
              >
                <ExpandIcon expanded={expanded} />
              </button>
            </Tooltip>
            <Tooltip content="Close (Esc)" side="bottom" asChild>
              <button
                onClick={onClose}
                aria-label="Close lot (Esc)"
                className="icon-button"
              >
                <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>
        <nav aria-label="Sections" className="-mb-px flex gap-5">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => goTo(n.id)}
              aria-current={active === n.id ? "true" : undefined}
              className={`border-b-2 pt-1 pb-2 text-callout transition-colors ${
                active === n.id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </div>

      <div className={`space-y-section py-section ${pad}`}>
        <AnswerCard
          headline={nb(head.text)}
          tone={head.tone}
          typeLine={
            <>
              <span className="font-medium">{TYPOLOGY_LABEL[typology]}</span>
              {chosen && <span className="text-muted">, {nb(lowerFirst(verdictLabel(chosen)))}</span>}
            </>
          }
          financeLine={fin}
          notScreened={gate.screened ? null : gate.reason}
          blocker={blocker}
          onWhyNot={goTo}
          indexNote={indexNote}
          useRoute={approvalRoute(chosen, lot)}
          prototype={prototypeNote(lot, typology)}
          basisNote={bestNote}
          status={status}
          evidence={chosen && chosen.verdict !== "unknown" ? evidence : null}
          changes={changes}
          ruleSet={ruleSet}
          onPlan={() => goTo("file")}
        />

        <Section
          id="allowed"
          title="Allowed?"
          summary={useTableSummary(lot, findings)}
        >
          {unconfirmed && (
            <p className="mb-2 text-caption text-warning-ink">
              Checked against the inventory district {lot.zone || "(none)"}; the
              City zoning map says {lot.zoneMap ?? "no district"} here. No home
              type counts as allowed until the district is confirmed.
            </p>
          )}
          <VerdictList
            unconfirmed={unconfirmed}
            findings={findings}
            other={otherFindings}
            ruleSet={ruleSet}
            open={open}
            onOpen={setOpen}
            columns={expanded ? 2 : 1}
          />
        </Section>

        <Section
          id="fits"
          title="Fits?"
          summary={
            chosen && chosen.verdict !== "unknown"
              ? [`${fitPass} pass`, fitFail && `${fitFail} fail`, fitSite && `${fitSite} to check on site`]
                  .filter(Boolean)
                  .join(" · ") + " (of the fit checks)"
              : undefined
          }
        >
          {chosen && chosen.verdict !== "unknown" ? (
            <>
              <p className="mb-2 text-caption text-muted">For a {TYPOLOGY_LABEL[typology].toLowerCase()}, from the City inventory.</p>
              <ul className="surface-card divide-y divide-hairline px-card">
                {fitRows.map((r) => (
                  <FitRow key={r.key} r={r} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-callout text-muted">Zoning was not checked for this district, so the size rules were not applied.</p>
          )}
        </Section>

        <Section
          id="pays"
          title="Pays?"
          action={
            <span
              aria-live="polite"
              className={`flex items-center gap-1.5 text-caption text-muted transition-opacity duration-200 ${
                recomputing ? "opacity-100" : "opacity-0"
              }`}
            >
              {recomputing && (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Updating the map…
                </>
              )}
            </span>
          }
        >
          <ProForma
            lot={lot}
            comps={c.comps}
            findings={findings}
            typology={typology}
            onTypology={onTypology}
            proforma={c.proforma}
            assumptions={c.assumptions}
            onAssumptions={onAssumptions}
            onLandOverride={onLandOverride}
            onCommit={onCommit}
            compsError={compsError}
            onRetryComps={onRetryComps}
            blocked={gate.screened ? null : `${TYPOLOGY_LABEL[typology]}: ${gate.reason}`}
            hypothetical={gate.hypothetical}
          />
        </Section>

        <Section id="file" title="File">
          <ApplicationPlanner
            key={`${ruleSet}|${typology}`}
            selected={c}
            onChangeType={() => goTo("pays")}
            onFlash={flash}
            wide={expanded}
          />
        </Section>

        <div className="relative flex items-center justify-between border-t border-hairline pt-4 pb-2">
          <span className="text-caption text-muted">Share this screen</span>
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="button-secondary gap-1.5"
            >
              Export
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className={exportOpen ? "" : "rotate-180"}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </button>
            {exportOpen && (
              <div
                role="menu"
                className="pop absolute right-0 bottom-[calc(100%+6px)] surface-card w-[220px] p-2 shadow-overlay"
              >
                <button role="menuitem" onClick={downloadBrief} className="block w-full rounded-card px-3 py-2 text-left text-callout hover:bg-surface">
                  Lot brief (.md)
                  <span className="block text-caption text-muted">Every check with its citation</span>
                </button>
                <button role="menuitem" onClick={copySummary} className="block w-full rounded-card px-3 py-2 text-left text-callout hover:bg-surface">
                  Copy summary
                  <span className="block text-caption text-muted">Six lines for an email</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {copied && (
        <div className="pop fixed right-6 bottom-6 z-50 rounded-full bg-ink px-3.5 py-1.5 text-caption font-medium text-white shadow-lg">
          {copied}
        </div>
      )}
    </div>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/* ---------- Fits? ---------- */

type FitState = "pass" | "fail" | "site";
interface FitItem {
  key: string;
  label: React.ReactNode;
  value: string;
  required: string | null;
  state: FitState;
  citation?: Check["citation"];
  note?: string;
  /** Overrides the state word (e.g. "Below floor" for the screening floor, which is not a code failure). */
  word?: string;
}

function fitChecks(lot: Lot, f: Finding): FitItem[] {
  const get = (id: string) => f.checks.find((c) => c.id === id);
  const st = (c?: Check): FitState => (c?.passed === true ? "pass" : c?.passed === false ? "fail" : "site");
  const out: FitItem[] = [];
  const area = get("lot-area");
  const perUnit = get("lot-area-per-unit");
  const areaState: FitState = [area, perUnit].some((c) => c?.passed === false)
    ? "fail"
    : [area, perUnit].some((c) => c && c.passed === null)
      ? "site"
      : "pass";
  out.push({
    key: "area",
    label: "Lot area",
    value:
      lot.lotAreaSqFt != null
        ? `${lot.lotAreaSqFt.toLocaleString()} sq ft`
        : "Unknown",
    required:
      lot.lotAreaSqFt == null
        ? NOT_IN_RECORD
        : [
            area?.required && area.required !== "none"
              ? area.required.startsWith("0 ")
                ? "min 0 here"
                : `min ${area.required}`
              : null,
            perUnit?.required && perUnit.required !== "none"
              ? `${perUnit.required} for the units`
              : null,
          ]
            .filter(Boolean)
            .join("; ") || "No minimum here",
    state: areaState,
    word: lot.lotAreaSqFt == null ? "Unknown" : undefined,
    citation: (area ?? perUnit)?.citation,
  });
  // Our screening floor, not code: its own row, so the code row can pass while the evidence row's Lot size fails.
  if (areaState === "pass" && lot.lotAreaSqFt != null && lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT)
    out.push({
      key: "floor",
      label: `Below ${MIN_PRACTICAL_LOT_SQFT.toLocaleString()}\u00a0sf screening floor (not a code minimum)`,
      value: "Below screening floor; investigate options",
      required: null,
      state: "fail",
      word: "Below floor",
    });
  const width = get("lot-width");
  out.push({
    key: "width",
    label: <Tooltip content={TIP.frontage}>Street frontage (approx.)</Tooltip>,
    value:
      lot.frontageFt != null ? `≈ ${Math.round(lot.frontageFt)} ft` : "Unknown",
    required:
      lot.frontageFt == null
        ? NOT_IN_RECORD
        : width?.required && width.required !== "none"
          ? `min ${width.required}`
          : "No minimum here",
    state: lot.frontageFt == null ? "site" : st(width),
    word: lot.frontageFt == null ? "Unknown" : undefined,
    citation: width?.citation,
  });
  const parking = get("parking");
  if (parking)
    out.push({
      key: "parking",
      label: "Parking",
      value: parking.passed === true ? "None required" : parking.passed === null ? "Unresolved: confirm on the site plan" : "Does not fit",
      required: parking.passed === null ? `${parking.required}; the spaces must fit on the lot` : parking.required,
      state: st(parking),
      citation: parking.citation,
    });
  const far = get("far") ?? get("building-fit");
  if (far)
    out.push({
      key: "fit",
      label: far.id === "far" ? "Floor area" : "Building fit",
      value: far.measured ?? "",
      required: far.id === "far" ? far.required : "Setbacks, height, coverage not modeled",
      state: st(far),
      citation: far.citation,
    });
  const hz = [
    lot.hazards.steepSlope && "steep slope (25%+)",
    lot.hazards.undermined && "old mine below (undermined)",
    lot.hazards.floodZone && "FEMA flood zone",
  ].filter(Boolean) as string[];
  out.push({
    key: "hazards",
    label: "Hazards",
    value: hz.length ? `Flagged: ${hz.join(", ")}` : lot.hazards.floodZone == null ? "Flood zone not checked" : "None found",
    required: "At the inventory point, not the whole parcel",
    state: hz.length || lot.hazards.floodZone == null ? "site" : "pass",
  });
  return out;
}

const FIT_WORD: Record<FitState, string> = {
  pass: "Pass",
  fail: "Fail",
  site: "Check on site",
};

/** A value missing from the County record: the same words as the evidence pill's "Unknown". */
const NOT_IN_RECORD = "not in the County record · survey needed";

function FitRow({ r }: { r: FitItem }) {
  return (
    <li className="flex items-start gap-3 py-4">
      <StatusIcon state={r.state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-callout text-ink">{r.label}</span>
          <span className={`shrink-0 text-caption ${r.state === "fail" ? "text-danger-ink" : "text-muted"}`}>{r.word ?? FIT_WORD[r.state]}</span>
        </div>
        <p className="mt-0.5 text-caption text-muted">
          <span className="text-ink tabular-nums">{r.value}</span>
          {r.required && <> · {r.required}</>}
          {r.citation && (
            <>
              {" · "}
              <a
                href={r.citation.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                {nb(r.citation.section)}
              </a>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/* ---------- Allowed? ---------- */

/**
 * One row per home type, or pairs of rows in expanded mode. The other rule set's verdict shows
 * inline in gold when it differs. An opened row's checks render beneath its row (full width).
 */
function VerdictList({
  findings,
  other,
  ruleSet,
  open,
  onOpen,
  columns,
  unconfirmed = false,
}: {
  /** The zoning district is unconfirmed: no chip may read "Allowed"; each reads "Unconfirmed". */
  unconfirmed?: boolean;
  findings: Finding[];
  other: Finding[] | null;
  ruleSet: RuleSet;
  open: string | null;
  onOpen: (t: string | null) => void;
  columns: 1 | 2;
}) {
  const rows: Finding[][] = [];
  for (let i = 0; i < findings.length; i += columns) rows.push(findings.slice(i, i + columns));
  const otherVerdict = (t: Typology): Verdict | null => other?.find((o) => o.typology === t)?.verdict ?? null;
  return (
    <ul className="surface-card overflow-hidden">
      {rows.map((row) => {
        const opened = row.find((f) => f.typology === open);
        return (
          <li key={row[0].typology} className="border-b border-hairline last:border-b-0">
            <div className={columns === 2 ? "grid grid-cols-2 divide-x divide-hairline" : ""}>
              {row.map((f) => {
                const isOpen = f === opened;
                const ov = otherVerdict(f.typology);
                const diff = !unconfirmed && ov && ov !== f.verdict ? ov : null;
                const tip = VERDICT_TIP[f.verdict];
                return (
                  <div key={f.typology} className={`flex items-stretch ${row.length < columns ? "col-span-2" : ""}`}>
                    <button
                      onClick={() => onOpen(isOpen ? null : f.typology)}
                      aria-expanded={isOpen}
                      className={`flex min-w-0 flex-1 items-center gap-3 px-card py-4 text-left hover:bg-surface ${isOpen ? "bg-surface" : ""}`}
                    >
                      <span className="w-1 self-stretch rounded-full" style={{ background: VERDICT_COLOR[f.verdict] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-callout text-ink">{TYPOLOGY_LABEL[f.typology]}</span>
                        {diff && (
                          <span className="mt-0.5 block text-caption text-warning-ink">
                            {ruleSet === "current"
                              ? nb(`→ ${verdictWord(diff)} if the housing bill passes`)
                              : nb(`Today: ${lowerFirst(verdictWord(diff))}`)}
                          </span>
                        )}
                      </span>
                      <Chevron open={isOpen} />
                    </button>
                    <span className="flex max-w-[55%] shrink-0 items-center py-3 pr-4">
                      {unconfirmed && f.verdict !== "unknown" ? (
                        <Tooltip
                          content="The inventory and the City zoning map disagree on this lot's district. Confirm the district first."
                          asChild
                        >
                          <span
                            tabIndex={0}
                            className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-control px-2 py-0.5 text-caption font-medium whitespace-nowrap text-muted"
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full border border-v-unknown" />
                            Unconfirmed
                          </span>
                        </Tooltip>
                      ) : tip ? (
                        <Tooltip content={tip} asChild>
                          <span tabIndex={0} className="cursor-help rounded-full">
                            <VerdictChip verdict={f.verdict} finding={f} full={columns === 2} />
                          </span>
                        </Tooltip>
                      ) : (
                        <VerdictChip verdict={f.verdict} finding={f} full={columns === 2} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {opened && (
              <div className="fade-in border-t border-hairline bg-surface/60 p-card">
                {opened.typology === "single_adu" && <p className="mb-2 text-caption text-muted">{TIP.adu}</p>}
                {opened.summary && <p className="mb-2 max-w-[70ch] text-caption text-muted">{opened.summary}</p>}
                {opened.checks.length === 0 && (
                  <p className="text-caption text-muted">No checks run. {verdictWord(opened.verdict)}.</p>
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

function CheckRow({ c }: { c: Check }) {
  const state: FitState = c.passed === true ? "pass" : c.passed === false ? "fail" : "site";
  return (
    <li className="flex gap-2.5">
      <StatusIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-caption font-medium text-ink">{c.label.replace(" (needs survey)", "")}</span>
          <span className="shrink-0 text-caption text-muted">{FIT_WORD[state]}</span>
        </div>
        {(c.measured || c.required) && (
          <div className="mt-0.5 grid grid-cols-2 gap-2 text-caption">
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
        {c.note && <p className="mt-0.5 text-caption text-muted">{c.note}</p>}
        <a
          href={c.citation.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-caption text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
        >
          {nb(c.citation.section)} {c.citation.title}
        </a>
      </div>
    </li>
  );
}

function StatusIcon({ state }: { state: FitState }) {
  if (state === "pass")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Pass">
        <circle cx="8" cy="8" r="7.5" fill="var(--color-v-byright)" />
        <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="var(--color-panel)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === "fail")
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="mt-px shrink-0"
        aria-label="Fail"
      >
        <circle cx="8" cy="8" r="7.5" fill="var(--color-v-prohibited)" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--color-panel)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Check on site">
      <circle cx="8" cy="8" r="7" fill="none" stroke="var(--color-v-unknown)" strokeWidth="1.5" strokeDasharray="2.2 1.6" />
      <circle cx="8" cy="8" r="1.4" fill="var(--color-muted)" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 12 12"
      aria-hidden
      className="shrink-0 text-muted transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {expanded ? (
        <path d="M5 1v4H1M7 11V7h4M5 5L1 1M7 7l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M7.5 1H11v3.5M4.5 11H1V7.5M11 1L7 5M1 11l4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden className="text-muted">
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

