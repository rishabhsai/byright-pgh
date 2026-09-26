"use client";
import { useMemo, useState } from "react";
import type { Comps, Lot, RuleSet, TriageResult, Typology } from "@/lib/types";
import type { FinanceAssumptions } from "@/lib/finance";
import type { Evidence } from "@/lib/evidence";
import { fmtUsdShort } from "@/lib/evidence";
import { fmtNum, fmtUsd } from "@/lib/proforma";
import { RULESET_LABEL, TYPOLOGY_ORDER } from "@/lib/rules";
import { buildPlan, CHANNELS, gapSentence, toBrief, toCsv, TYPE_NAME, type Plan } from "@/lib/plan";
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
const kicker = "text-[11px] font-medium tracking-[0.04em] text-muted uppercase";

function FunnelRow({ plan }: { plan: Plan }) {
  const f = plan.funnel;
  const steps = [
    { n: f.records, label: ["lots"], title: "Vacant-land records in the City inventory" },
    { n: f.encoded, label: ["encoded"], title: "In zoning districts the rules engine encodes" },
    { n: f.byRight, label: ["by right"], title: "At least one small home type allowed without a hearing" },
    { n: f.availableNoFlag, label: ["for sale,", "no flag"], title: "Available for Sale, and no slope, mine or flood flag at the inventory point" },
    { n: f.atLeast1000, label: ["1,000+", "sf"], title: "At least 1,000 sf: ready now" },
    { n: f.pencil, label: ["pencil"], title: "Pencils at market under the displayed assumptions" },
  ];
  return (
    <ol aria-label="Disposition funnel" className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.title} title={s.title} className="flex min-w-0 flex-1 items-start">
          {i > 0 && (
            <span aria-hidden className="mt-[3px] shrink-0 text-[10px] text-faint">
              →
            </span>
          )}
          <span className="min-w-0 flex-1 text-center">
            <span className={`block text-[15px] leading-5 font-medium tabular-nums ${i === 4 ? "text-accent" : "text-ink"}`}>
              {fmtNum(s.n)}
            </span>
            {s.label.map((t) => (
              <span key={t} className="block text-[10px] leading-[12px] whitespace-nowrap text-muted first-of-type:mt-0.5">
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
    <li className="relative flex items-center justify-between rounded px-1.5 py-0.5 text-[12px]">
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
  const types = TYPOLOGY_ORDER.filter((t) => plan.ready.byType[t]);

  return (
    <div className="space-y-3 px-4 pt-3 pb-4">
      <section aria-label="Funnel">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-[20px] leading-6">{plan.scopeLabel}</h3>
          <span className="truncate text-[11px] text-faint" title={RULESET_LABEL[ruleSet]}>
            {ruleSet === "current" ? "Current code" : "If Bill 2025-1545 passes"}
          </span>
        </div>
        <div className={`${card} mt-2`}>
          <FunnelRow plan={plan} />
          <p className="mt-2.5 border-t border-hairline pt-2 text-[11.5px] leading-4 text-muted">
            <span className="tabular-nums text-ink">{fmtNum(plan.needsRelief)}</span> need relief (lot size) ·{" "}
            <span className="tabular-nums text-ink">{fmtNum(plan.hillsideReview)}</span> Hillside exception ·{" "}
            <span className="tabular-nums text-ink">{fmtNum(plan.notEvaluated)}</span> not evaluated
          </p>
        </div>
      </section>

      <section aria-label="Ready now" className={card}>
        <h4 className={kicker}>Ready now</h4>
        <p className="mt-1 text-[13px] leading-5">
          <span className="font-medium tabular-nums">{fmtNum(plan.ready.total)}</span> lots can be offered for a small home without a
          hearing, under the checks we ran.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-3">
          <div>
            <span className="text-[10.5px] text-faint">By channel</span>
            <ul className="mt-0.5 space-y-0.5">
              {CHANNELS.map((c) => (
                <SplitRow key={c} label={c} n={plan.ready.byChannel[c]} total={plan.ready.total} />
              ))}
            </ul>
          </div>
          <div>
            <span className="text-[10.5px] text-faint">By best type</span>
            <ul className="mt-0.5 space-y-0.5">
              {types.length === 0 && <li className="px-1.5 text-[12px] text-muted">None</li>}
              {types.map((t) => (
                <SplitRow key={t} label={TYPE_NAME[t]} n={plan.ready.byType[t]!} total={plan.ready.total} />
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-label="Gap to make N homes" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h4 className={kicker}>Gap to make</h4>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input
              aria-label="Homes to plan for"
              inputMode="numeric"
              value={homesText}
              onChange={(e) => onHomes(e.target.value)}
              onBlur={() => setHomesText(String(homes))}
              className="w-12 rounded border border-hairline bg-white px-1.5 py-0.5 text-right text-[12px] text-ink tabular-nums focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
              style={{ outline: "none" }}
            />
            homes
          </label>
        </div>
        <p className="mt-1.5 text-[13px] leading-5">{gapSentence(plan)}</p>
        {g && (
          <table className="mt-2 w-full text-[12px] tabular-nums">
            <thead>
              <tr className="text-[10.5px] text-faint">
                <th className="text-left font-normal">Hard cost</th>
                <th className="text-right font-normal">Total</th>
                <th className="text-right font-normal">Per home</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: `$${g.hardCostPerSf}/sf (yours)`, s: g, strong: true },
                { label: "$150/sf", s: g.at150, strong: false },
                { label: "$215/sf", s: g.at215, strong: false },
              ].map((r) => (
                <tr key={r.label} className={r.strong ? "font-medium text-ink" : "text-muted"}>
                  <td className="py-0.5">{r.label}</td>
                  <td className="py-0.5 text-right">{fmtUsd(r.s.total)}</td>
                  <td className="py-0.5 text-right">{fmtUsd(r.s.perHome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1.5 text-[11px] leading-4 text-faint">Modeled shortfall to the target return; a screen, not a subsidy award.</p>
      </section>

      <section aria-label="Needs relief and Hillside" className={`${card} space-y-1.5 text-[12.5px] leading-5`}>
        <p>
          <span className="font-medium tabular-nums">{fmtNum(plan.needsRelief)}</span> lots fail only lot size. Consolidating pairs or
          § 921.04 exceptions could make more ready; City lots within 150 ft not computed yet.
        </p>
        <p>
          <span className="font-medium tabular-nums">{fmtNum(plan.hillsideReview)}</span> Hillside lots need an Administrator or
          Special Exception (§ 911.04.A.69); site conditions not checked.
        </p>
        <details className="group text-muted">
          <summary className="cursor-pointer text-[12px] select-none hover:text-ink">Scenario: Bill 2025-1545</summary>
          <p className="mt-1 text-[12.5px] text-ink">{plan.billLine}</p>
        </details>
      </section>

      <section aria-label="Shortlist">
        <div className="flex items-baseline justify-between">
          <h4 className={kicker}>Top {plan.shortlist.length} ready lots</h4>
          <span className="text-[10.5px] text-faint">lowest shortfall first</span>
        </div>
        {plan.shortlist.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-muted">No ready lots in this scope.</p>
        ) : (
          <table className="mt-1.5 w-full table-fixed text-[12px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] text-faint">
                <th className="w-[42%] pb-1 text-left font-normal">Address</th>
                <th className="pb-1 text-left font-normal">Channel · type</th>
                <th className="w-9 pb-1 text-right font-normal">Checks</th>
                <th className="w-[58px] pb-1 text-right font-normal">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {plan.shortlist.map((r) => (
                <tr
                  key={r.parcel_id}
                  onClick={() => onSelect(r.lotIndex)}
                  className="cursor-pointer border-b border-hairline/60 align-top hover:bg-surface"
                >
                  <td className="py-1.5 pr-1">
                    <span className="block truncate font-medium text-ink">{r.address || r.parcel_id}</span>
                    <span className="block truncate text-[10.5px] text-muted">{r.neighborhood}</span>
                  </td>
                  <td className="py-1.5 pr-1">
                    <span className="block truncate">{r.channel}</span>
                    <span className="block truncate text-[10.5px] text-muted">{r.best_type ? TYPE_NAME[r.best_type as Typology] : ""}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.checks_passed_of_6}/6</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.shortfall_to_target === "" ? "n/a" : fmtUsdShort(Number(r.shortfall_to_target))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          data-action="export-csv"
          onClick={() => downloadText(`${fileBase(plan)}.csv`, toCsv(plan.rows), "text/csv;charset=utf-8")}
          className="rounded-md bg-accent px-3 py-2 text-[12.5px] font-medium text-white hover:bg-accent/90"
        >
          Export CSV
          <span className="block text-[10.5px] font-normal text-white/75">{fmtNum(plan.rows.length)} lots in scope</span>
        </button>
        <button
          data-action="download-brief"
          onClick={() => downloadText(`${fileBase(plan)}.md`, toBrief(plan), "text/markdown;charset=utf-8")}
          className="rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] font-medium text-ink hover:border-[#bfc4bd]"
        >
          Download brief
          <span className="block text-[10.5px] font-normal text-muted">One page, Markdown</span>
        </button>
      </div>
    </div>
  );
}
