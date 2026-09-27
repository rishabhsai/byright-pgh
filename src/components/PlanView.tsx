"use client";
import { useState } from "react";
import type { RuleSet, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { nb } from "./ui/answer";
import { fmtUsdShort } from "@/lib/evidence";
import { fmtNum, fmtUsd, NEW_CONSTRUCTION_PREMIUM } from "@/lib/proforma";
import { RULESET_LABEL, TYPOLOGY_ORDER } from "@/lib/rules";
import {
  CHANNELS,
  gapSentence,
  hardCostRows,
  PENCILS_FIRST,
  reliefSentence,
  rowChecks,
  toBrief,
  toCsv,
  type Gap,
  type GapScenario,
  type Plan,
} from "@/lib/plan";
import { PREMIUM_LABEL } from "@/lib/proforma";

interface Props {
  /** The one plan, derived above the rail and the reading view so both show the same numbers. */
  plan: Plan;
  /** Projects to plan for, owned by the app. */
  projects: number;
  onProjects: (n: number) => void;
  ruleSet: RuleSet;
  /** Inputs changed and the city-wide pass has not caught up: exports wait. */
  stale?: boolean;
  onSelect: (i: number) => void;
  /** "rail": one column in the 360 px rail. "reading": two columns in the expanded overlay. */
  layout?: "rail" | "reading";
  /** Inventory records whose district the City zoning map confirms, of those compared. */
  mapAgreement?: { agree: number; compared: number } | null;
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

const kicker = "text-headline text-ink";

/**
 * Export CSV and Download brief as two compact pills, pinned in the Plan header (rail) and the reading view's
 * header so neither needs a scroll. Same files as the full buttons at the end of the plan.
 */
export function PlanExports({ plan, stale = false, size = "sm" }: { plan: Plan | null; stale?: boolean; size?: "sm" | "md" }) {
  const off = !plan || stale;
  const pill =
    size === "sm"
      ? "flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap"
      : "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-callout font-medium whitespace-nowrap";
  const why = stale ? "Updating for your latest inputs" : !plan ? "The plan is being computed" : undefined;
  return (
    <>
      <button
        type="button"
        data-action="export-csv-pinned"
        disabled={off}
        title={why ?? (plan ? `${fmtNum(plan.rows.length)} lots in scope` : undefined)}
        onClick={() => plan && downloadText(`${fileBase(plan)}.csv`, toCsv(plan.rows), "text/csv;charset=utf-8")}
        className={`${pill} bg-accent text-white hover:bg-accent/90 disabled:cursor-wait disabled:opacity-50`}
      >
        <DownloadIcon />
        Export CSV
      </button>
      <button
        type="button"
        data-action="download-brief-pinned"
        disabled={off}
        title={why ?? "Markdown summary"}
        onClick={() => plan && downloadText(`${fileBase(plan)}.md`, toBrief(plan), "text/markdown;charset=utf-8")}
        className={`${pill} bg-control text-ink hover:bg-track disabled:cursor-wait disabled:opacity-50`}
      >
        <DownloadIcon />
        Download brief
      </button>
    </>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 1.5v6M3.5 5L6 7.5 8.5 5M2 10.5h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FunnelRow({ plan, compact = false }: { plan: Plan; compact?: boolean }) {
  const f = plan.funnel;
  // The reading view carries the candidates' channel split under the candidate stage, so one frame holds it.
  const channels = compact
    ? []
    : CHANNELS.filter((c) => c !== "Other" && plan.candidates.byChannel[c] > 0).sort((a, b) => plan.candidates.byChannel[b] - plan.candidates.byChannel[a]);
  const steps = [
    { n: f.records, label: ["lots"], title: "Vacant-land records in the City inventory" },
    { n: f.encoded, label: ["encoded"], title: "In zoning districts the rules engine encodes" },
    { n: f.byRight, label: ["use table"], title: "At least one small home type passes the use-table and lot-size screen under the inventory district" },
    { n: f.availableNoFlag, label: ["for sale,", "no flag"], title: "Recorded Available for Sale, and no slope, mine or flood flag at the inventory point" },
    { n: f.atLeast1000, label: ["1,000+", "sf"], title: "At least 1,000 sf: candidates for staff review" },
    { n: f.pencil, label: ["clear", "screen"], title: "Clear the cost-and-return screen under the displayed assumptions" },
  ];
  return (
    <ol aria-label="Disposition funnel" className="plan-funnel">
      {steps.map((s, i) => (
        <li key={s.title} title={s.title} className="flex min-w-0 flex-1 items-start">
          {i > 0 && (
            <span aria-hidden className="funnel-arrow mt-[3px] shrink-0 text-caption text-faint">
              →
            </span>
          )}
          <span className="min-w-0 flex-1 text-center">
            <span className={`block tabular-nums ${compact ? "text-title" : "text-display"} ${i === 4 ? "text-accent" : "text-ink"}`}>
              {fmtNum(s.n)}
            </span>
            {s.label.map((t) => (
              <span key={t} className="block text-caption whitespace-nowrap text-muted first-of-type:mt-0.5">
                {t}
              </span>
            ))}
            {i === 4 && channels.length > 0 && (
              <span aria-label="Candidates by recorded channel" className="mt-1.5 block border-t border-hairline pt-1.5 text-caption text-muted">
                {channels.map((c) => (
                  <span key={c} className="block whitespace-nowrap">
                    <span className="font-medium text-ink tabular-nums">{fmtNum(plan.candidates.byChannel[c])}</span> {c}
                  </span>
                ))}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SplitRow({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <li className="relative flex items-center justify-between rounded-tooltip px-2 py-1.5">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0 rounded-tooltip bg-control"
        style={{ width: `${total ? (n / total) * 100 : 0}%` }}
      />
      <span className="relative min-w-0">{label}</span>
      <span className="relative shrink-0 font-medium tabular-nums">{fmtNum(n)}</span>
    </li>
  );
}

/** A row's money is published only when its Finance check ran (pass or fail) and it carries a result. */
const rowScreened = (r: Plan["rows"][number]) => {
  const flag = (r as Record<string, unknown>).finance_screened;
  if (flag === "true" || flag === "false") return flag === "true" && r.finance !== null;
  return (r.check_finance === "pass" || r.check_finance === "fail") && r.finance !== null;
};

/** "98.3%": one decimal, never rounded up to 100% while any record disagrees. */
function agreementPct(m: { agree: number; compared: number }): string {
  const p = (m.agree / m.compared) * 100;
  return `${(m.agree < m.compared ? Math.min(p, 99.9) : p).toFixed(1)}%`;
}

const MODE_WORD: Record<"sale" | "rent" | "mixed", string> = { sale: "sale", rent: "rent, capitalized", mixed: "sale or capitalized rent" };

/** The hurdle the selected prototypes must clear: mean target value against the mean index-based value, screened rows only. */
function hurdleOf(plan: Plan): { target: number; value: number; mode: "sale" | "rent" | "mixed"; n: number } | null {
  const num = (v: string | number) => (v === "" ? NaN : Number(v));
  const rows = plan.shortlist.filter((r) => rowScreened(r) && Number.isFinite(num(r.est_value)) && Number.isFinite(num(r.break_even_value)));
  if (!rows.length) return null;
  const mean = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const modes = new Set(rows.map((r) => r.finance!.mode));
  return {
    target: mean((r) => num(r.break_even_value)),
    value: mean((r) => num(r.est_value)),
    mode: modes.size === 1 ? [...modes][0] : "mixed",
    n: rows.length,
  };
}

/** "Mean of the 10 lowest-shortfall candidates, finance screened on each", or how many of them were screened. */
function hurdleLead(screened: number, shortlisted: number): string {
  if (shortlisted <= 1) return "The lowest-shortfall candidate, finance screened";
  if (screened === shortlisted) return `Mean of the ${fmtNum(shortlisted)} lowest-shortfall candidates, finance screened on each`;
  return `Mean of the ${screened === 1 ? "one" : fmtNum(screened)} with screened finance among the ${fmtNum(shortlisted)} lowest-shortfall candidates`;
}

/** The project count the modeled shortfall is sized for. The typed text stays as typed (it may be blank mid-edit). */
export function ProjectsInput({ projects, onProjects, className = "input-field w-16 text-right tabular-nums" }: { projects: number; onProjects: (n: number) => void; className?: string }) {
  const [homesText, setHomesText] = useState(String(projects));
  const [seen, setSeen] = useState(projects);
  if (projects !== seen) {
    setSeen(projects);
    setHomesText(String(projects));
  }
  const onHomes = (v: string) => {
    const digits = v.replace(/[^\d]/g, "").slice(0, 4);
    setHomesText(digits);
    const n = Number(digits);
    if (n >= 1) onProjects(n);
  };
  return (
    <input
      aria-label="Projects to plan for"
      inputMode="numeric"
      value={homesText}
      onChange={(e) => onHomes(e.target.value)}
      onBlur={() => setHomesText(String(projects))}
      className={className}
    />
  );
}

export default function PlanView({ plan, projects, onProjects, ruleSet, stale = false, onSelect, layout = "rail", mapAgreement = null }: Props) {
  const g = plan.gap;
  const types = TYPOLOGY_ORDER.filter((t) => plan.candidates.byType[t]);
  const premium = premiumOf(g);
  const reading = layout === "reading";
  // The rail sets its cards in 12px caption text; the reading view keeps 13px.
  const text = reading ? "text-callout" : "text-caption";
  const card = reading ? "surface-card p-card" : "surface-card p-4";

  const heading = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className={reading ? "text-title" : "text-headline"}>{plan.scopeLabel}</h3>
      <span className="text-caption text-muted" title={RULESET_LABEL[ruleSet]}>
        {ruleSet === "current" ? "Current code" : "If Bill 2025-1545 passes"}
      </span>
    </div>
  );

  const h = hurdleOf(plan);
  const hurdle = (
    <section aria-label="Financial hurdle" className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className={kicker}>Financial hurdle</h4>
        <span className="text-caption text-faint">
          {h ? MODE_WORD[h.mode] : plan.assumptions.mode}, ${plan.assumptions.hardCostPerSf}/sf
        </span>
      </div>
      {h ? (
        <>
          <p className={`mt-3 text-ink ${reading ? "text-title" : "text-headline"}`}>
            Target value {fmtUsdShort(h.target)} vs modeled value {fmtUsdShort(h.value)}
          </p>
          {g?.valueBasis.length === 1 && g.valueBasis[0].mode === "sale" && (
            <p className="mt-0.5 text-caption text-muted">
              Index: {g.valueBasis[0].label} {fmtUsdShort(g.valueBasis[0].value)}, scaled to the home&apos;s size
            </p>
          )}
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-caption text-muted" aria-hidden>
            <span>Target</span>
            <div className="h-1.5 rounded-full bg-ink/80" />
            <span>Modeled</span>
            <div className="h-1.5 rounded-full bg-surface">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (h.value / h.target) * 100)}%` }} />
            </div>
          </div>
          <p className="mt-1.5 text-caption text-muted">
            {hurdleLead(h.n, plan.shortlist.length)}: cost plus the {plan.assumptions.targetMarginPct}% target return, against the value modeled from{" "}
            {plan.gap?.valueBasis.length === 1 ? plan.gap.valueBasis[0].label : "aggregate Zillow indices"}. An index is not an appraisal
            of new construction; staff decide what evidence would support the target. {PENCILS_FIRST}
          </p>
        </>
      ) : (
        <p className={`mt-1 text-muted ${text}`}>
          {plan.shortlist.length
            ? `Not screened: finance was not screened on any of the ${plan.shortlist.length === 1 ? "one lowest-shortfall candidate" : `${fmtNum(plan.shortlist.length)} lowest-shortfall candidates`} (district or permission unresolved, or no comps), so no hurdle is shown.`
            : "Not screened: no candidate in this scope has a screened financial result."}
        </p>
      )}
    </section>
  );

  const funnel = (
    <section aria-label="Funnel">
      <div className={card}>
        <FunnelRow plan={plan} compact={!reading} />
        <p className="mt-2.5 border-t border-hairline pt-2 text-caption text-muted">
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
      <p className={`mt-1 ${text}`}>
        <span className="font-medium tabular-nums">{fmtNum(plan.candidates.total)}</span> lots pass the use-table and lot-size screen
        under the inventory district{mapAgreement ? ` (${agreementPct(mapAgreement)} agree with the City map)` : ""}, are recorded for sale,
        unflagged and 1,000+ sf. A review queue: each has open items.
      </p>
      <p className={`mt-1 ${text}`}>
        <span className={`font-medium tabular-nums ${plan.candidates.districtUnconfirmed ? "text-warning-ink" : ""}`}>
          {fmtNum(plan.candidates.districtUnconfirmed)}
        </span>{" "}
        {plan.candidates.districtUnconfirmed === 1 ? "has" : "have"} an unconfirmed district (inventory and City map disagree)
        {plan.candidates.districtUnconfirmed ? "; permission stays unresolved until staff confirm it." : "."}
      </p>
      {plan.candidates.clearAtPremium != null && (
        <p className={`mt-1 ${text}`}>
          <span className="font-medium tabular-nums">{fmtNum(plan.funnel.pencil)}</span> {plan.funnel.pencil === 1 ? "clears" : "clear"} the screen at $
          {fmtNum(plan.assumptions.hardCostPerSf)}/sf; <span className="font-medium tabular-nums">{fmtNum(plan.candidates.clearAtPremium)}</span> at the{" "}
          {NEW_CONSTRUCTION_PREMIUM}× premium.
        </p>
      )}
      <div className={`plan-splits mt-4 ${text}`}>
        <div>
          <span className="text-caption text-faint">By recorded channel</span>
          <ul className="mt-0.5 space-y-0.5">
            {CHANNELS.map((c) => (
              <SplitRow key={c} label={c} n={plan.candidates.byChannel[c]} total={plan.candidates.total} />
            ))}
          </ul>
        </div>
        <div>
          <span className="text-caption text-faint">By screened type</span>
          <ul className="mt-0.5 space-y-0.5">
            {types.length === 0 && <li className="px-1.5 text-muted">None</li>}
            {types.map((t) => (
              <SplitRow
                key={t}
                label={TYPOLOGY_LABEL[t]}
                n={plan.candidates.byType[t]!}
                total={plan.candidates.total}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );

  const gap = (
    <section aria-label="Modeled shortfall for N projects" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {reading ? (
          <>
            <h4 className={kicker}>Modeled shortfall for</h4>
            <label className="flex items-center gap-1.5 text-callout text-muted">
              <ProjectsInput projects={projects} onProjects={onProjects} />
              projects
            </label>
          </>
        ) : (
          <h4 className={kicker}>
            Modeled shortfall for <span className="tabular-nums">{fmtNum(projects)}</span> projects
          </h4>
        )}
      </div>
      <p className={`mt-1.5 ${text}`}>{nb(gapSentence(plan))}</p>
      {g && (
        <div className="plan-table mt-4">
          <table className={`w-full table-fixed tabular-nums ${text}`}>
            <colgroup>
              <col />
              <col className="w-[86px]" />
              <col className="w-[76px]" />
              {reading && <col className="w-[84px]" />}
            </colgroup>
            <thead>
              <tr className="text-caption text-faint">
                <th className="text-left font-normal">Scenario</th>
                <th className="pl-3 text-right font-normal whitespace-nowrap">Total</th>
                <th className="pl-3 text-right font-normal whitespace-nowrap">Per project</th>
                {reading && <th className="pl-3 text-right font-normal whitespace-nowrap">Per dwelling</th>}
              </tr>
            </thead>
            <tbody>
              {[
                ...hardCostRows(g),
                ...(premium
                  ? [
                      {
                        label: PREMIUM_LABEL,
                        s: premium,
                        strong: false,
                        premium: true,
                      },
                    ]
                  : []),
              ].map((r) => (
                <tr
                  key={r.label}
                  className={`${r.strong ? "font-medium text-ink" : "text-muted"} ${"premium" in r ? "border-t border-dashed border-hairline" : ""}`}
                >
                  <td className="py-2 pr-2 align-top">
                    <span title={r.label} className="line-clamp-2 text-caption">
                      {r.label}
                    </span>
                  </td>
                  <td className="py-2 pl-3 text-right align-top">{fmtUsd(r.s.total)}</td>
                  <td className="py-2 pl-3 text-right align-top">{fmtUsd(r.s.perProject)}</td>
                  {reading && <td className="py-2 pl-3 text-right align-top">{fmtUsd(r.s.perDwelling)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1.5 text-caption text-faint">
        Shortfall to the target return against an aggregate reference value; a screen, not a subsidy award or appraisal.
        {premium && " The premium row values new homes at 1.3× the index; the URA would calibrate it against actual gap awards."}
      </p>
    </section>
  );

  const relief = (
    <section aria-label="Needs relief, Hillside and the bill" className={`${card} space-y-2 ${text}`}>
      <p>
        {reliefSentence(plan)} Relief addresses the size standard only; adjacent
        City lots are not computed.
      </p>
      <p>
        <span className="font-medium tabular-nums">
          {fmtNum(plan.hillsideReview)}
        </span>{" "}
        Hillside lots need an Administrator or Special Exception
        (§&nbsp;911.04.A.69); site conditions not checked.
      </p>
      <p className="border-t border-hairline pt-2 text-ink">
        <span className="text-caption text-warning-ink">
          If Bill 2025-1545 passes:{" "}
        </span>
        {nb(plan.billLine.replace(/^If Bill 2025-1545 passes:\s*/, ""))}
      </p>
    </section>
  );

  const shortlist = (
    <section aria-label="Shortlist">
      <div className="flex items-baseline justify-between">
        <h4 className={kicker}>Top {plan.shortlist.length} candidates</h4>
        <span className="text-caption text-faint">lowest shortfall first</span>
      </div>
      {plan.shortlist.length === 0 ? (
        <p className={`mt-1.5 text-muted ${text}`}>No candidates in this scope.</p>
      ) : (
        <ol className={`mt-1.5 border-t border-hairline ${text}`}>
          {plan.shortlist.map((r) => (
            <li key={r.parcel_id} className="border-b border-hairline/60">
              <button
                type="button"
                onClick={() => onSelect(r.lotIndex)}
                title={String(r.next_action)}
                className={`group block w-full rounded-tooltip text-left hover:bg-surface focus-visible:bg-surface ${reading ? "py-4" : "px-1 py-2"}`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink group-hover:underline">
                    {r.address || r.parcel_id}
                  </span>
                  <span className={`shrink-0 tabular-nums ${rowScreened(r) ? "" : "text-caption text-muted"}`}>
                    {!rowScreened(r)
                      ? "not screened"
                      : r.shortfall_to_target === ""
                        ? "n/a"
                        : fmtUsdShort(Number(r.shortfall_to_target))}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-baseline gap-2 text-caption text-muted">
                  <span className="min-w-0 flex-1">
                    {[
                      r.neighborhood,
                      r.channel,
                      r.best_type
                        ? TYPOLOGY_LABEL[r.best_type as Typology]
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span
                    className="shrink-0 text-caption whitespace-nowrap tabular-nums"
                    title={rowChecks(r)}
                  >
                    {rowChecks(r)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  const exportsRow = (
    <div className="pt-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          data-action="export-csv"
          disabled={stale}
          onClick={() => downloadText(`${fileBase(plan)}.csv`, toCsv(plan.rows), "text/csv;charset=utf-8")}
          className="button-primary flex-col text-center disabled:cursor-wait disabled:opacity-50"
        >
          Export CSV
          <span className="block text-caption font-normal text-white/75">{fmtNum(plan.rows.length)} lots in scope</span>
        </button>
        <button
          data-action="download-brief"
          disabled={stale}
          onClick={() => downloadText(`${fileBase(plan)}.md`, toBrief(plan), "text/markdown;charset=utf-8")}
          className="button-secondary flex-col text-center disabled:cursor-wait disabled:opacity-50"
        >
          Download brief
          <span className="block text-caption font-normal text-muted">Markdown summary</span>
        </button>
      </div>
      {stale && (
        <p aria-live="polite" className="mt-1.5 text-caption text-muted">
          Updating for your latest inputs; exports are available once the plan catches up.
        </p>
      )}
    </div>
  );

  if (reading)
    return (
      <div className="plan-view grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-section px-10 py-section">
        <div className="min-w-0 space-y-section">
          {heading}
          {hurdle}
          {funnel}
          {candidates}
          {relief}
        </div>
        <div className="min-w-0 space-y-section">
          {gap}
          {shortlist}
          {exportsRow}
        </div>
      </div>
    );

  return (
    <div className="plan-view space-y-4 px-4 pt-3 pb-4">
      {heading}
      {hurdle}
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
