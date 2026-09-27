"use client";
import { useRef, useState } from "react";
import type { Check, Finding, Lot, RuleSet, Typology, Verdict } from "@/lib/types";
import { TYPOLOGY_LABEL, VERDICT_LABEL, verdictLabel } from "@/lib/types";
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
import { answerHeadline, approvalRoute, blockerLine, cityStatus, financeLine, HIGH_MARGIN_PCT, typologyPhrase, whatWouldChange } from "./ui/answer";
import { MIN_PRACTICAL_LOT_SQFT } from "@/lib/evidence";
import { prototypeNote } from "@/lib/proforma";
import { FunnelBars, FunnelSentence, type FunnelStats } from "./ui/Funnel";

/** 5118 Ladora Way, Hazelwood: R1A-VH, URA Transfer, one of three adjacent ready-for-a-house lots. */
export const DEMO_LOT_ID = "0056N00203000000";

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
  /** Shared finance assumptions (without the per-lot land figure) for the Pays inputs. */
  assumptions: FinanceAssumptions;
  onAssumptions: (a: FinanceAssumptions) => void;
  /** True while the city-wide triage is catching up with the latest assumptions. */
  recomputing: boolean;
  /** Reading mode: the panel overlays the map as a wide, centered surface. */
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  /** Stats for the active rule set; drives the empty-state funnel. */
  stats?: FunnelStats | null;
  /** Select a lot by parcel ID (the empty state's demo link). No-op when absent. */
  onSelectId?: (id: string) => void;
}

export default function DetailPanel(props: Props) {
  const { selected, onExpanded } = props;
  const expanded = props.expanded && !!selected;
  // The aside keeps its width in both modes so the map never resizes; expanded mode lifts the
  // same LotDetail (same tree position, so no state is lost) into an overlay over the map area.
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-hairline bg-panel min-[1440px]:w-[412px]">
      {selected ? (
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
            <LotDetail {...props} c={selected} expanded={expanded} />
          </div>
        </div>
      ) : (
        <EmptyState stats={props.stats} ruleSet={props.ruleSet} onSelectId={props.onSelectId} />
      )}
    </aside>
  );
}

function EmptyState({
  stats,
  ruleSet,
  onSelectId,
}: {
  /** null while loading; undefined when the caller does not provide stats (no funnel then). */
  stats: FunnelStats | null | undefined;
  ruleSet: RuleSet;
  onSelectId?: (id: string) => void;
}) {
  if (stats === undefined)
    return (
      <div className="flex flex-1 flex-col justify-center px-8">
        <p className="font-serif text-[25px] leading-tight text-ink">Pick a lot on the map or in the list.</p>
        <p className="mt-2 text-[13px] text-muted">See what&apos;s allowed, whether it pays for itself, and what to file.</p>
      </div>
    );
  return (
    <div className="scroll-thin flex flex-1 flex-col justify-center overflow-y-auto px-8 py-8">
      <FunnelSentence s={stats} className="font-serif text-[25px] leading-[1.22] tracking-[-0.005em]" />
      {stats && ruleSet === "bill-2025-1545" && (stats.lotsGaining ?? 0) > 0 && (
        <p className="mt-3 text-[13px] text-[#6b5200]">
          <Tooltip content={TIP.bill}>If the housing bill passes</Tooltip>, +{stats.lotsGaining!.toLocaleString("en-US")} lots could also add a
          backyard home.
        </p>
      )}
      <div className="mt-7">
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
      <div className="mt-9 border-t border-hairline pt-5">
        <p className="text-[14px] text-ink">Pick a lot on the map or in the list.</p>
        {onSelectId && (
          <button
            onClick={() => onSelectId(DEMO_LOT_ID)}
            className="mt-1.5 text-left text-[13px] text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
          >
            Try a demo lot: 5118 Ladora Way, Hazelwood
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
  assumptions,
  onAssumptions,
  recomputing,
  expanded,
  onExpanded,
}: Props & { c: SelectedCase }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pfPending, setPfPending] = useState(false);
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
  const head = answerHeadline(c.triage, chosen, pf, lot);
  const status = cityStatus(lot);
  const evidence = c.evidence;
  // No money line for a proposal that fails Fit or Use, on a lot that is not for sale, or one zoning did not evaluate.
  const blocker = chosen && chosen.verdict !== "unknown" ? blockerLine(lot, typology, chosen, evidence) : null;
  const fin = blocker || (chosen && (chosen.verdict === "prohibited" || chosen.verdict === "unknown")) ? null : financeLine(pf);
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

  const memo = () => buildMemo(c, { headline: head.text, districtName: dName, changes });
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
  const allowedCount = findings.filter((f) => f.verdict === "by-right").length;
  const pad = expanded ? "px-10" : "px-5";

  return (
    <div ref={scroller} onScroll={onScroll} className="fade-in scroll-thin flex-1 overflow-y-auto">
      <div ref={header} className={`sticky top-0 z-10 border-b border-hairline bg-panel ${pad}`}>
        <div className={`flex items-center justify-between gap-3 transition-[height] duration-200 ${scrolled ? "h-[48px]" : "pt-4 pb-2"}`}>
          <div className="min-w-0">
            {scrolled ? (
              <p className="flex min-w-0 items-center gap-2 text-[14px] whitespace-nowrap">
                <span className="truncate font-semibold text-ink">{lot.address || "Unaddressed lot"}</span>
                <span className="truncate text-muted">{lot.neighborhood}</span>
                <ZoneChip zone={lot.zone} tip />
              </p>
            ) : (
              <>
                <h2 className="truncate font-serif text-[26px] leading-[1.1] text-ink">{lot.address || "Unaddressed lot"}</h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                  <span>{lot.neighborhood}</span>
                  <ZoneChip zone={lot.zone} tip />
                  {lot.zoneAgrees === false && (
                    <Tooltip content={`Inventory says ${lot.zone || "no district"}; the City zoning map says ${lot.zoneMap ?? "a different district"} at this point. Confirm the district before relying on the use result.`}>
                      <span className="inline-flex shrink-0 items-center rounded border border-gold/60 bg-gold-soft px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-[#6b5200]">
                        Map says {lot.zoneMap ? zoneLabel(lot.zoneMap) : "other"}
                      </span>
                    </Tooltip>
                  )}
                  <button
                    onClick={async () => {
                      await copyText(lot.id);
                      flash("Parcel ID copied");
                    }}
                    className="-mx-1 inline-flex items-center gap-1 rounded px-1 text-[12px] text-muted tabular-nums hover:bg-surface hover:text-ink"
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
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <ExpandIcon expanded={expanded} />
              </button>
            </Tooltip>
            <Tooltip content="Close (Esc)" side="bottom" asChild>
              <button
                onClick={onClose}
                aria-label="Close lot (Esc)"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
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
              className={`border-b-2 pt-1 pb-2 text-[13px] transition-colors ${
                active === n.id ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </div>

      <div className={`space-y-7 py-5 ${pad}`}>
        <AnswerCard
          headline={head.text}
          tone={head.tone}
          typeLine={
            <>
              <span className="font-medium">{TYPOLOGY_LABEL[typology]}</span>
              {chosen && <span className="text-muted">, {lowerFirst(verdictLabel(chosen))}</span>}
            </>
          }
          financeLine={fin}
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

        <Section id="allowed" title="Allowed?" summary={`${allowedCount} of ${findings.length} home types with no hearing`}>
          <VerdictList
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
              ? [`${fitPass} pass`, fitFail && `${fitFail} fail`, fitSite && `${fitSite} check on site`]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        >
          {chosen && chosen.verdict !== "unknown" ? (
            <>
              <p className="mb-2 text-[12px] text-muted">For a {TYPOLOGY_LABEL[typology].toLowerCase()}, from the City inventory.</p>
              <ul className="divide-y divide-hairline border-y border-hairline">
                {fitRows.map((r) => (
                  <FitRow key={r.key} r={r} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[13px] text-muted">Zoning was not checked for this district, so the size rules were not applied.</p>
          )}
        </Section>

        <Section
          id="pays"
          title="Pays?"
          action={
            <span
              aria-live="polite"
              className={`flex items-center gap-1.5 text-[12px] text-muted transition-opacity duration-150 ${
                pfPending || recomputing ? "opacity-100" : "opacity-0"
              }`}
            >
              {(pfPending || recomputing) && (
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
            landOverride={c.landOverride}
            onLandOverride={onLandOverride}
            assumptions={assumptions}
            onAssumptions={onAssumptions}
            onPending={setPfPending}
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
          <span className="text-[12px] text-muted">Share this screen</span>
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface active:scale-[0.98]"
            >
              Export
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className={exportOpen ? "" : "rotate-180"}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </svg>
            </button>
            {exportOpen && (
              <div
                role="menu"
                className="pop absolute right-0 bottom-[calc(100%+6px)] w-[220px] rounded-xl border border-hairline bg-white p-1 shadow-[0_12px_32px_-12px_rgba(23,33,30,.35)]"
              >
                <button role="menuitem" onClick={downloadBrief} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface">
                  Lot brief (.md)
                  <span className="block text-[12px] text-muted">Every check with its citation</span>
                </button>
                <button role="menuitem" onClick={copySummary} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface">
                  Copy summary
                  <span className="block text-[12px] text-muted">Six lines for an email</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {copied && (
        <div className="pop fixed right-6 bottom-6 z-50 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white shadow-lg">
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
    value: lot.lotAreaSqFt != null ? `${lot.lotAreaSqFt.toLocaleString()} sq ft` : "Not in the record",
    required: [
      area?.required && area.required !== "none" ? (area.required.startsWith("0 ") ? "min 0 here" : `min ${area.required}`) : null,
      perUnit?.required && perUnit.required !== "none" ? `${perUnit.required} for the units` : null,
    ]
      .filter(Boolean)
      .join("; ") || "No minimum here",
    state: areaState,
    citation: (area ?? perUnit)?.citation,
  });
  // Our screening floor, not code: its own row, so the code row can pass while the evidence row's Lot size fails.
  if (areaState === "pass" && lot.lotAreaSqFt != null && lot.lotAreaSqFt < MIN_PRACTICAL_LOT_SQFT)
    out.push({
      key: "floor",
      label: `Below ${MIN_PRACTICAL_LOT_SQFT.toLocaleString()} sf`,
      value: "Consolidation candidate",
      required: "our screening floor, not a code minimum",
      state: "fail",
      word: "Below floor",
    });
  const width = get("lot-width");
  out.push({
    key: "width",
    label: <Tooltip content={TIP.frontage}>Street frontage (approx.)</Tooltip>,
    value: lot.frontageFt != null ? `≈ ${Math.round(lot.frontageFt)} ft` : "Not in the record",
    required: width?.required && width.required !== "none" ? `min ${width.required}` : "No minimum here",
    state: st(width),
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

const FIT_WORD: Record<FitState, string> = { pass: "Pass", fail: "Fails", site: "Check on site" };

function FitRow({ r }: { r: FitItem }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <StatusIcon state={r.state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-ink">{r.label}</span>
          <span className={`shrink-0 text-[12px] ${r.state === "fail" ? "text-[#c2410c]" : "text-muted"}`}>{r.word ?? FIT_WORD[r.state]}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">
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
                {r.citation.section}
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
}: {
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
    <ul className="overflow-hidden rounded-lg border border-hairline bg-white">
      {rows.map((row) => {
        const opened = row.find((f) => f.typology === open);
        return (
          <li key={row[0].typology} className="border-b border-hairline last:border-b-0">
            <div className={columns === 2 ? "grid grid-cols-2 divide-x divide-hairline" : ""}>
              {row.map((f) => {
                const isOpen = f === opened;
                const ov = otherVerdict(f.typology);
                const diff = ov && ov !== f.verdict ? ov : null;
                const tip = VERDICT_TIP[f.verdict];
                return (
                  <div key={f.typology} className={`flex items-stretch ${row.length < columns ? "col-span-2" : ""}`}>
                    <button
                      onClick={() => onOpen(isOpen ? null : f.typology)}
                      aria-expanded={isOpen}
                      className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-[#fafaf8] ${isOpen ? "bg-[#fafaf8]" : ""}`}
                    >
                      <span className="w-1 self-stretch rounded-full" style={{ background: VERDICT_COLOR[f.verdict] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-ink">{TYPOLOGY_LABEL[f.typology]}</span>
                        {diff && (
                          <span className="mt-0.5 block text-[12px] leading-snug text-[#7a5a00]">
                            {ruleSet === "current"
                              ? `→ ${VERDICT_LABEL[diff]} if the housing bill passes`
                              : `Today: ${lowerFirst(VERDICT_LABEL[diff])}`}
                          </span>
                        )}
                      </span>
                      <Chevron open={isOpen} />
                    </button>
                    <span className="flex shrink-0 items-center pr-3">
                      {tip ? (
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
              <div className="fade-in border-t border-hairline bg-[#fafaf8] px-3 py-3">
                {opened.typology === "single_adu" && <p className="mb-2 text-[12px] text-muted">{TIP.adu}</p>}
                {opened.summary && <p className="mb-2 max-w-[70ch] text-[12px] leading-snug text-muted">{opened.summary}</p>}
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

function CheckRow({ c }: { c: Check }) {
  const state: FitState = c.passed === true ? "pass" : c.passed === false ? "fail" : "site";
  return (
    <li className="flex gap-2.5">
      <StatusIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium text-ink">{c.label.replace(" (needs survey)", "")}</span>
          <span className="shrink-0 text-[12px] text-muted">{FIT_WORD[state]}</span>
        </div>
        {(c.measured || c.required) && (
          <div className="mt-0.5 grid grid-cols-2 gap-2 text-[12px]">
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
        {c.note && <p className="mt-0.5 text-[12px] text-muted">{c.note}</p>}
        <a
          href={c.citation.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[12px] text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
        >
          {c.citation.section} {c.citation.title}
        </a>
      </div>
    </li>
  );
}

function StatusIcon({ state }: { state: FitState }) {
  if (state === "pass")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Pass">
        <circle cx="8" cy="8" r="7.5" fill="var(--accent)" />
        <path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === "fail")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Fails">
        <circle cx="8" cy="8" r="7.5" fill="#c2410c" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0" aria-label="Check on site">
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

