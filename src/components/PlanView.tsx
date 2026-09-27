"use client";
import { useMemo, useState } from "react";
import type { Comps, Lot, RuleSet, TriageResult, Typology } from "@/lib/types";
import type { FinanceAssumptions } from "@/lib/finance";
import type { Evidence } from "@/lib/evidence";
import { fmtUsdShort } from "@/lib/evidence";
import { fmtNum, fmtUsd } from "@/lib/proforma";
import { RULESET_LABEL, TYPOLOGY_ORDER } from "@/lib/rules";
import { buildPlan, CHANNELS, gapSentence, rowChecks, toBrief, toCsv, TYPE_NAME, type Gap, type GapScenario, type Plan } from "@/lib/plan";
import { PREMIUM_LABEL } from "@/lib/proforma";
import type { Evaluations } from "./ByRightApp";

interface Props {
  lots: Lot[];
  evals: Evaluations;
  triages: TriageResult[];
  evidence: Evidence[];
  comps: (Comps | null)[];
  assumptions: FinanceAssumptions;
  landOverrides: Record<string, number>;
  neighborhoods: string[];
  typology: Typology | null;
  ruleSet: RuleSet;
  sources: { name: string; url: string; vintage: string }[];
  onSelect: (i: number) => void;
  /** "rail": one column in the 344 px rail. "reading": two columns in the expanded overlay. */
  layout?: "rail" | "reading";
}

/** Save text as a file through a Blob URL. */
export function downloadText(filename: string, text: string, type: string): string {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return url;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function fileBase(plan: Plan): string {
  return `byright-plan-${slug(plan.scopeLabel)}-${plan.generatedAt.slice(0, 10)}`;
}

const card = "rounded-lg border border-hairline bg-white px-3 py-3";
const kicker = "text-[13px] font-semibold text-ink";

function FunnelRow({ plan, wide }: { plan: Plan; wide: boolean }) {
  const f = plan.funnel;
  const steps = [
    { n: f.records, label: ["lots"], title: "Vacant-land records in the City inventory" },
    { n: f.encoded, label: ["encoded"], title: "In zoning districts the rules engine encodes" },
    { n: f.byRight, label: ["by right"], title: "At least one small home type allowed by right under the checks we ran" },
    { n: f.availableNoFlag, label: ["for sale,", "no flag"], title: "Recorded Available for Sale, and no slope, mine or flood flag at the inventory point" },
    { n: f.atLeast1000, label: ["1,000+", "sf"], title: "At least 1,000 sf: candidates for staff review" },
    { n: f.pencil, label: ["clear", "screen"], title: "Clear the cost-and-return screen under the displayed assumptions" },
  ];
  return (
    <ol aria-label="Disposition funnel" className={wide ? "flex items-start" : "grid grid-cols-3 gap-y-2.5"}>
      {steps.map((s, i) => (
        <li key={s.title} title={s.title} className="flex min-w-0 flex-1 items-start">
          {(wide ? i > 0 : i % 3 !== 0) && (
            <span aria-hidden className="mt-[3px] shrink-0 text-[11px] text-faint">
              →
            </span>
          )}
          <span className="min-w-0 flex-1 text-center">
            <span className={`block text-[15px] leading-5 font-medium tabular-nums ${i === 4 ? "text-accent" : "text-ink"}`}>
              {fmtNum(s.n)}
            </span>
            {s.label.map((t) => (
              <span key={t} className="block text-[11px] leading-[13px] whitespace-nowrap text-muted first-of-type:mt-0.5">
                {t}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SplitRow({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <li className="relative flex items-center justify-between rounded px-1.5 py-0.5 text-[13px]">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0 rounded-sm bg-accent/10"
        style={{ width: `${total ? (n / total) * 100 : 0}%` }}
      />
      <span className="relative">{label}</span>
      <span className="relative font-medium tabular-nums">{fmtNum(n)}</span>
    </li>
  );
}

export default function PlanView({
  lots,
  evals,
  triages,
  evidence,
  comps,
  assumptions,
  landOverrides,
  neighborhoods,
  typology,
  ruleSet,
  sources,
  onSelect,
  layout = "rail",
}: Props) {
  const [homes, setHomes] = useState(10);
  const [homesText, setHomesText] = useState("10");

  const plan = useMemo(
    () =>
      buildPlan(lots, evals, triages, evidence, comps, assumptions, { neighborhoods, typology }, ruleSet, homes, {
        sources,
        landOverrides,
      }),
    [lots, evals, triages, evidence, comps, assumptions, neighborhoods, typology, ruleSet, homes, sources, landOverrides],
  );

  const onHomes = (v: string) => {
    const digits = v.replace(/[^\d]/g, "").slice(0, 4);
    setHomesText(digits);
    const n = Number(digits);
    if (n >= 1) setHomes(n);
  };

  const g = plan.gap;
  const types = TYPOLOGY_ORDER.filter((t) => plan.candidates.byType[t]);
  const premium = premiumOf(g);
  const reading = layout === "reading";

  const funnel = (
    <section aria-label="Funnel">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`font-serif leading-tight ${reading ? "text-[26px]" : "text-[21px]"}`}>{plan.scopeLabel}</h3>
        <span className="truncate text-[12px] text-faint" title={RULESET_LABEL[ruleSet]}>
          {ruleSet === "current" ? "Current code" : "If Bill 2025-1545 passes"}
        </span>
      </div>
      <div className={`${card} mt-2`}>
        <FunnelRow plan={plan} wide={reading} />
        <p className="mt-2.5 border-t border-hairline pt-2 text-[12px] leading-[17px] text-muted">
          <span className="tabular-nums text-ink">{fmtNum(plan.needsRelief)}</span> need relief (lot size) ·{" "}
          <span className="tabular-nums text-ink">{fmtNum(plan.hillsideReview)}</span> Hillside exception ·{" "}
          <span className="tabular-nums text-ink">{fmtNum(plan.notEvaluated)}</span> not evaluated
        </p>
      </div>
    </section>
  );

  const candidates = (
    <section aria-label="Candidates for staff review" className={card}>
      <h4 className={kicker}>Candidates for staff review</h4>
      <p className="mt-1 text-[13px] leading-5">
        <span className="font-medium tabular-nums">{fmtNum(plan.candidates.total)}</span> lots are by right under the checks we ran, recorded
        for sale, unflagged and 1,000+ sf. A review queue, not a release list: each has open items.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-3">
        <div>
          <span className="text-[12px] text-faint">By recorded channel</span>
          <ul className="mt-0.5 space-y-0.5">
            {CHANNELS.map((c) => (
              <SplitRow key={c} label={c} n={plan.candidates.byChannel[c]} total={plan.candidates.total} />
            ))}
          </ul>
        </div>
        <div>
          <span className="text-[12px] text-faint">By screened type</span>
          <ul className="mt-0.5 space-y-0.5">
            {types.length === 0 && <li className="px-1.5 text-[13px] text-muted">None</li>}
            {types.map((t) => (
              <SplitRow key={t} label={TYPE_NAME[t]} n={plan.candidates.byType[t]!} total={plan.candidates.total} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );

  const gap = (
    <section aria-label="Modeled shortfall for N projects" className={card}>
      <div className="flex items-center justify-between gap-2">
        <h4 className={kicker}>Modeled shortfall for</h4>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <input
            aria-label="Projects to plan for"
            inputMode="numeric"
            value={homesText}
            onChange={(e) => onHomes(e.target.value)}
            onBlur={() => setHomesText(String(homes))}
            className="w-12 rounded border border-hairline bg-white px-1.5 py-0.5 text-right text-[13px] text-ink tabular-nums focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
            style={{ outline: "none" }}
          />
          projects
        </label>
      </div>
      <p className="mt-1.5 text-[13px] leading-5">{gapSentence(plan)}</p>
      {g && (
        <table className="mt-2 w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-[12px] text-faint">
              <th className="text-left font-normal">Scenario</th>
              <th className="pl-3 text-right font-normal whitespace-nowrap">Total</th>
              <th className="pl-3 text-right font-normal whitespace-nowrap">Per project</th>
              {reading && <th className="pl-3 text-right font-normal whitespace-nowrap">Per dwelling</th>}
            </tr>
          </thead>
          <tbody>
            {[
              { label: `$${g.hardCostPerSf}/sf (yours)`, s: g as GapScenario, strong: true },
              { label: "$150/sf", s: g.at150, strong: false },
              { label: "$215/sf", s: g.at215, strong: false },
              ...(premium ? [{ label: PREMIUM_LABEL, s: premium, strong: false, premium: true }] : []),
            ].map((r) => (
              <tr
                key={r.label}
                className={`${r.strong ? "font-medium text-ink" : "text-muted"} ${"premium" in r ? "border-t border-dashed border-hairline" : ""}`}
              >
                <td className="py-0.5 pr-2 leading-tight">{r.label}</td>
                <td className="py-0.5 pl-3 text-right align-top">{fmtUsd(r.s.total)}</td>
                <td className="py-0.5 pl-3 text-right align-top">{fmtUsd(r.s.perProject)}</td>
                {reading && <td className="py-0.5 pl-3 text-right align-top">{fmtUsd(r.s.perDwelling)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-1.5 text-[12px] leading-4 text-faint">
        Shortfall to the target return against an aggregate reference value; a screen, not a subsidy award or appraisal.
        {premium && " The premium row values new homes at 1.3× the index; the URA would calibrate it against actual gap awards."}
      </p>
    </section>
  );

  const relief = (
    <section aria-label="Needs relief, Hillside and the bill" className={`${card} space-y-2 text-[13px] leading-5`}>
      <p>
        <span className="font-medium tabular-nums">{fmtNum(plan.needsRelief)}</span> lots fail only lot size;{" "}
        <span className="font-medium tabular-nums">{fmtNum(plan.needsReliefWithApproval)}</span> of them also keep a Hillside use approval.
        Relief addresses the size standard only; adjacent City lots are not computed.
      </p>
      <p>
        <span className="font-medium tabular-nums">{fmtNum(plan.hillsideReview)}</span> Hillside lots need an Administrator or Special
        Exception (§ 911.04.A.69); site conditions not checked.
      </p>
      <p className="border-t border-hairline pt-2 text-ink">
        <span className="text-[12px] text-[#6b5200]">If Bill 2025-1545 passes: </span>
        {capitalize(plan.billLine.replace(/^If Bill 2025-1545 passes:\s*/, ""))}
      </p>
    </section>
  );

  const shortlist = (
    <section aria-label="Shortlist">
      <div className="flex items-baseline justify-between">
        <h4 className={kicker}>Top {plan.shortlist.length} candidates</h4>
        <span className="text-[12px] text-faint">lowest shortfall first</span>
      </div>
      {plan.shortlist.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-muted">No candidates in this scope.</p>
      ) : (
        <table className="mt-1.5 w-full table-fixed text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[12px] text-faint">
              <th className="w-[38%] pb-1 text-left font-normal">Address</th>
              <th className="pb-1 text-left font-normal">Channel, type</th>
              <th className={`${reading ? "w-[120px]" : "w-[62px]"} pb-1 text-right font-normal`}>Checks</th>
              <th className="w-[64px] pb-1 text-right font-normal">Shortfall</th>
            </tr>
          </thead>
          <tbody>
            {plan.shortlist.map((r) => (
              <tr
                key={r.parcel_id}
                onClick={() => onSelect(r.lotIndex)}
                title={String(r.next_action)}
                className="cursor-pointer border-b border-hairline/60 align-top hover:bg-surface"
              >
                <td className="py-1.5 pr-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.lotIndex);
                    }}
                    className="block w-full truncate text-left font-medium text-ink hover:underline focus-visible:underline"
                  >
                    {r.address || r.parcel_id}
                  </button>
                  <span className="block truncate text-[12px] text-muted">{r.neighborhood}</span>
                </td>
                <td className="py-1.5 pr-1">
                  <span className="block truncate">{r.channel}</span>
                  <span className="block truncate text-[12px] text-muted">{r.best_type ? TYPE_NAME[r.best_type as Typology] : ""}</span>
                </td>
                <td className="py-1.5 text-right text-[11px] leading-[14px] tabular-nums" title={rowChecks(r)}>
                  {rowChecks(r)
                    .split(" · ")
                    .map((p) => (
                      <span key={p} className="block whitespace-nowrap">
                        {p}
                      </span>
                    ))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {r.shortfall_to_target === "" ? "n/a" : fmtUsdShort(Number(r.shortfall_to_target))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  const exportsRow = (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <button
        data-action="export-csv"
        onClick={() => downloadText(`${fileBase(plan)}.csv`, toCsv(plan.rows), "text/csv;charset=utf-8")}
        className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white hover:bg-accent/90"
      >
        Export CSV
        <span className="block text-[12px] font-normal text-white/75">{fmtNum(plan.rows.length)} lots in scope</span>
      </button>
      <button
        data-action="download-brief"
        onClick={() => downloadText(`${fileBase(plan)}.md`, toBrief(plan), "text/markdown;charset=utf-8")}
        className="rounded-md border border-hairline bg-white px-3 py-2 text-[13px] font-medium text-ink hover:border-[#bfc4bd]"
      >
        Download brief
        <span className="block text-[12px] font-normal text-muted">Markdown summary</span>
      </button>
    </div>
  );

  if (reading)
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 px-10 pt-5 pb-8">
        <div className="space-y-4">
          {funnel}
          {candidates}
          {relief}
        </div>
        <div className="space-y-4">
          {gap}
          {shortlist}
          {exportsRow}
        </div>
      </div>
    );

  return (
    <div className="space-y-3 px-4 pt-3 pb-4">
      {funnel}
      {candidates}
      {gap}
      {relief}
      {shortlist}
      {exportsRow}
    </div>
  );
}

/** The new-construction premium scenario (value at 1.3x the index), when the plan carries one. */
function premiumOf(g: Plan["gap"]): GapScenario | null {
  const p = (g as (Gap & { atPremium?: GapScenario }) | null)?.atPremium;
  return p && Number.isFinite(p.total) ? p : null;
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
