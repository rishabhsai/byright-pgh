"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Segmented from "./ui/Segmented";
import type { Comps, Finding, Lot, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { verdictLabel } from "./ui/answer";
import {
  fmtUsd,
  proformaWithFallback,
  UNIT_PLAN,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type Proforma,
  type RevenueMode,
} from "@/lib/finance";
import { acceptedValue, FINANCE_RANGES } from "@/lib/proforma";
import { TIP, TYPOLOGIES, VERDICT_SHORT } from "./verdict";
import Tooltip from "./ui/Tooltip";

type RangedKey = keyof typeof FINANCE_RANGES;

interface Props {
  lot: Lot;
  comps: Comps | null;
  findings: Finding[];
  /** The selected proposal, owned by the app so zoning, finance and the worksheet agree. */
  typology: Typology;
  onTypology: (t: Typology) => void;
  /** The selected case's pro forma: the same numbers as the answer card and the exports. */
  proforma: Proforma | null;
  /** The selected case's assumptions, with this lot's land figure as `landOverride`. */
  assumptions: FinanceAssumptions;
  /** Shared assumptions changed (never carries the land figure). Applied to this lot at once. */
  onAssumptions: (a: FinanceAssumptions) => void;
  /** This lot's acquisition cost; null uses the assessed value. */
  onLandOverride: (v: number | null) => void;
  /** Send pending edits to the city-wide pass now (on blur). */
  onCommit?: () => void;
  /** Set when the finance data file failed to load; distinct from a neighborhood with no series. */
  compsError?: string | null;
  onRetryComps?: () => void;
  /** Why finance was not screened ("House: permission unresolved: …"); null when it was. */
  blocked?: string | null;
  /** The lib's labeled hypothetical for an unscreened proposal; null means no numbers are shown at all. */
  hypothetical?: Proforma | null;
}

/** The Pays headline for a blocked proposal: the gate's reason without the home type. */
function blockedHeadline(blocked: string): string {
  return blocked.replace(/^[^:]+:\s*/, "");
}

export const NO_COMPS = "No Zillow comps for this neighborhood; finance not assessed";

function CompsFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <p role="alert" className="flex items-center justify-between gap-3 rounded-card bg-warning-soft p-card text-callout text-warning-ink">
      <span>Finance data didn&apos;t load, so this lot is not assessed.</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-medium text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent">
          Retry
        </button>
      )}
    </p>
  );
}

export default function ProForma({
  lot,
  comps,
  findings,
  typology,
  onTypology,
  proforma,
  assumptions,
  onAssumptions,
  onLandOverride,
  onCommit,
  compsError,
  onRetryComps,
  blocked = null,
  hypothetical = null,
}: Props) {
  // Controlled by the selected case: every edit rebuilds the case synchronously, so the headline,
  // the evidence row and these numbers always come from the same inputs. The app batches edits
  // for the city-wide pass on its own.
  const a = assumptions;
  const r = proforma;
  const update = (next: FinanceAssumptions) => {
    const { landOverride: land, ...shared } = next;
    if ((land ?? null) !== (a.landOverride ?? null)) onLandOverride(land ?? null);
    else onAssumptions(shared);
  };
  const altHard = a.hardCostPerSf + 10;
  const rAlt = useMemo(
    () => proformaWithFallback(lot, typology, comps, { ...a, hardCostPerSf: altHard }),
    [lot, typology, comps, a, altHard],
  );
  const set = <K extends keyof FinanceAssumptions>(k: K, v: FinanceAssumptions[K]) => update({ ...a, [k]: v });
  const mode: RevenueMode = a.mode;
  const verdictOf = (t: Typology) => findings.find((f) => f.typology === t)?.verdict ?? "unknown";
  const selectedVerdict = verdictOf(typology);
  const selectedFinding = findings.find((f) => f.typology === typology) ?? null;

  if (!comps) {
    if (compsError) return <CompsFailed onRetry={onRetryComps} />;
    return <p className="rounded-card bg-control p-card text-callout text-muted">{NO_COMPS}.</p>;
  }

  const hasSale = comps.zhvi != null;
  const hasRent = comps.zori != null;
  const plan = UNIT_PLAN[typology];
  const target = a.targetMarginPct;
  const scale = r ? Math.max(r.totalCost, r.revenue) : 1;
  const mainLine = r
    ? r.pencils
      ? `Clears the cost-and-return screen: ${fmtUsd(r.margin - (r.totalCost * target) / 100)} above a ${target}% return`
      : `Modeled shortfall: ${fmtUsd(r.gap)} below a ${target}% return`
    : "";

  const ladderView = r && (
    <div>
      <div aria-hidden className="mb-3 space-y-1.5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface">
          <span
            className="h-full bg-faint"
            style={{ width: `${(r.land / scale) * 100}%` }}
          />
          <span
            className="h-full bg-muted"
            style={{ width: `${(r.hard / scale) * 100}%` }}
          />
          <span
            className="h-full bg-control-edge"
            style={{ width: `${((r.soft + r.devFee) / scale) * 100}%` }}
          />
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface">
          <span
            className="h-full rounded-full"
            style={{
              width: `${(r.revenue / scale) * 100}%`,
              background: r.pencils ? "var(--color-v-byright)" : "var(--color-v-variance)",
            }}
          />
        </div>
      </div>
      <dl className="surface-card divide-y divide-hairline px-card text-callout">
        <Row
          label={
            r.landSource === "assessed" ? (
              <Tooltip content={TIP.landValue}>Land, County land value</Tooltip>
            ) : r.landSource === "override" ? (
              "Land, your figure"
            ) : (
              "Land, assumed (no assessment)"
            )
          }
          swatch="var(--color-faint)"
          value={fmtUsd(r.land)}
        />
        <Row
          label={`Construction, ${r.buildingSf.toLocaleString()} sq ft × $${a.hardCostPerSf}`}
          swatch="var(--color-muted)"
          value={fmtUsd(r.hard)}
        />
        <Row
          label="Fees, design and developer's fee"
          swatch="var(--color-control-edge)"
          value={fmtUsd(r.soft + r.devFee)}
        />
        <Row
          label={
            <Tooltip content={<CompsTip comps={comps} mode={r.mode} />}>
              {r.mode === "rent"
                ? "Value as a rental (rent ÷ cap rate)"
                : "Value from neighborhood index"}
            </Tooltip>
          }
          swatch={r.pencils ? "var(--color-v-byright)" : "var(--color-v-variance)"}
          value={fmtUsd(r.revenue)}
        />
        <div className="finance-total">
          <dt className="min-w-0">
            <span className="font-medium text-ink">
              {r.pencils ? "Margin" : `Short of a ${target}% return`}
            </span>
            <span className="block text-caption text-muted tabular-nums">
              {r.pencils
                ? `${Math.round(r.marginPct)}% on ${fmtUsd(r.totalCost)} total cost`
                : `Value minus ${fmtUsd(r.totalCost)} total cost, minus the ${target}% return`}
            </span>
          </dt>
          <dd
            className={`text-display tabular-nums ${r.pencils ? "text-success-ink" : "text-warning-ink"}`}
          >
            {r.pencils ? fmtUsd(r.margin) : `−${fmtUsd(r.gap)}`}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-caption text-muted">
        Sources: Zillow{" "}
        {comps.zhvi != null
          ? `home price ${comps.neighborhood} (${comps.zhviDate?.slice(0, 7) ?? "latest"})`
          : ""}
        {comps.zhvi != null && comps.zori != null ? ", " : ""}
        {comps.zori != null
          ? `rent ZIP ${comps.zip} (${comps.zoriDate?.slice(0, 7) ?? "latest"})`
          : ""}
        ; Allegheny County assessment (2012 base).{" "}
        <a
          href={ZILLOW_DATA_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-accent/30 underline-offset-2"
        >
          Zillow Research
        </a>
      </p>
    </div>
  );

  return (
    <div className="space-y-section">
      {blocked ? (
        <div>
          <p className="text-title text-ink">
            Not screened: {blockedHeadline(blocked)}
          </p>
          <p className="mt-1 text-callout text-muted">
            The cost-and-return screen runs only on a proposal whose use is permitted and fit does not fail, in a confirmed
            district, on a lot recorded Available for Sale. No margin or shortfall is reported for this{" "}
            {TYPOLOGY_LABEL[typology].toLowerCase()}.
          </p>
        </div>
      ) : r ? (
        <div>
          <p
            className={`text-title ${r.pencils ? "text-success-ink" : "text-warning-ink"}`}
          >
            {mainLine}
          </p>
          <p className="mt-1 text-callout text-muted">
            {r.pencils
              ? `Against the ${r.mode === "rent" ? "ZIP rent index" : "neighborhood home-value index"}, a modeled ${TYPOLOGY_LABEL[typology].toLowerCase()} covers its costs and a ${target}% return. A reference index, not an appraisal or an achievable price.`
              : `Against the ${r.mode === "rent" ? "ZIP rent index" : "neighborhood home-value index"}, a modeled ${TYPOLOGY_LABEL[typology].toLowerCase()} falls short of a ${target}% return. A reference index, not an appraisal or a subsidy need.`}{" "}
            <span className="tabular-nums">
              Value needed for the target return {fmtUsd(r.breakEvenValue)}; at ${altHard}/sq ft{" "}
              {rAlt ? (rAlt.pencils ? `${Math.round(rAlt.marginPct)}% margin` : `short by ${fmtUsd(rAlt.gap)}`) : "n/a"}.
            </span>
          </p>
          {r.mode !== mode && (
            <p className="mt-1 text-caption text-warning-ink">
              No {mode === "sale" ? "home price" : "rent"} data here, so {r.mode === "sale" ? "the neighborhood home price" : "the ZIP rent"} was used.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-card bg-control p-card text-callout text-muted">{NO_COMPS}.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-callout">
        <span className="text-muted">Modeled for</span>
        <select
          value={typology}
          onChange={(e) => onTypology(e.target.value as Typology)}
          aria-label="Home type"
          className="input-field max-w-full"
        >
          {TYPOLOGIES.map((t) => (
            <option key={t} value={t}>
              {TYPOLOGY_LABEL[t]}
              {verdictOf(t) === "by-right" ? "" : ` (${VERDICT_SHORT[verdictOf(t)].toLowerCase()})`}
            </option>
          ))}
        </select>
        <span className="text-muted tabular-nums">
          {TYPOLOGY_LABEL[typology]}{" "}
          {plan.note.replace(/ × /g, "\u00a0×\u00a0")}
        </span>
        {selectedVerdict !== "by-right" && !blocked && (
          <span className="block w-full text-caption text-warning-ink">
            Zoning: {selectedFinding ? verdictLabel(selectedFinding).toLowerCase() : "not checked"} for this type; these numbers assume it gets approved.
          </span>
        )}
      </div>

      {blocked ? (
        hypothetical && (
        <details className="group/hyp text-callout">
          <summary className="cursor-pointer text-accent select-none">
            Show hypothetical numbers
          </summary>
          <p className="mt-2 mb-3 text-caption text-muted">
            If the {TYPOLOGY_LABEL[typology].toLowerCase()} were approved as
            proposed. Not a screen result.
          </p>
          {ladderView}
        </details>
        )
      ) : (
        r && ladderView
      )}

      <details className="surface-card group" onBlur={onCommit}>
        <summary className="flex cursor-pointer items-center justify-between gap-3 p-card text-body font-semibold text-ink select-none">
          Adjust assumptions
          <svg width="16" height="16" viewBox="0 0 12 12" aria-hidden className="text-muted transition-transform group-open:rotate-180">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="space-y-4 border-t border-hairline p-card">
          <div>
            <Segmented<RevenueMode>
              label="Revenue"
              equal
              value={r?.mode ?? mode}
              onChange={(m) => update({ ...a, mode: m })}
              options={[
                { value: "sale", label: "Sale scenario", disabled: !hasSale },
                { value: "rent", label: "Rent scenario", disabled: !hasRent },
              ]}
            />
            {(!hasSale || !hasRent) && (
              <p className="mt-1 text-caption text-muted">
                {!hasSale
                  ? `Selling is unavailable: Zillow has no home price series for ${comps.neighborhood}.`
                  : `Renting is unavailable: Zillow has no rent series for ${comps.zip ? `ZIP ${comps.zip}` : "this ZIP"}.`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Num
              k="hardCostPerSf"
              label="Construction $/sq ft"
              value={a.hardCostPerSf}
              onChange={(v) => set("hardCostPerSf", v)}
            />
            <Num
              k="softCostPct"
              label="Fees & design (% of construction)"
              value={a.softCostPct}
              onChange={(v) => set("softCostPct", v)}
            />
            <Num
              k="devFeePct"
              label="Developer's fee (%)"
              value={a.devFeePct}
              onChange={(v) => set("devFeePct", v)}
            />
            <Num
              k="targetMarginPct"
              label="Required return (%)"
              value={a.targetMarginPct}
              onChange={(v) => set("targetMarginPct", v)}
            />
            {(r?.mode ?? mode) === "sale" && (
              <Num
                k="typicalHomeSf"
                label="Typical home size (sq ft)"
                value={a.typicalHomeSf}
                onChange={(v) => set("typicalHomeSf", v)}
                step={50}
                hint={`Scales the sale-value index only; the ${TYPOLOGY_LABEL[typology].toLowerCase()} is still modeled as ${plan.note}.`}
              />
            )}
            <LandInput
              value={a.landOverride ?? null}
              placeholder={
                lot.landValue != null
                  ? `${lot.landValue} county`
                  : `${a.defaultLand} default`
              }
              onChange={(v) => set("landOverride", v)}
            />
            {(r?.mode ?? mode) === "rent" && (
              <>
                <Num k="opexPct" label="Operating costs (% of rent)" value={a.opexPct} onChange={(v) => set("opexPct", v)} />
                <Num k="capRate" label={<Tooltip content={TIP.capRate}>Cap rate (%)</Tooltip>} value={a.capRate} onChange={(v) => set("capRate", v)} step={0.25} />
              </>
            )}
          </div>
          {r && (
            <details className="text-caption">
              <summary className="cursor-pointer text-accent select-none">Where each number comes from</summary>
              <ul className="mt-2 space-y-1.5">
                {r.inputsUsed.map((x) => (
                  <li key={x.key} className="leading-snug">
                    <span className="text-ink">{x.label}: </span>
                    <span className="text-ink tabular-nums">{x.display}</span>
                    <span className="block text-muted">
                      {x.url ? (
                        <a href={x.url} target="_blank" rel="noreferrer" className="underline decoration-hairline underline-offset-2 hover:decoration-muted">
                          {x.source}
                        </a>
                      ) : (
                        x.source
                      )}
                      {x.assumed ? ", editable assumption" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </details>
    </div>
  );
}

function CompsTip({ comps, mode }: { comps: Comps; mode: RevenueMode }) {
  return (
    <span className="block space-y-1">
      <span className={`block ${mode === "sale" ? "" : "text-white/70"}`}>
        Typical home price in {comps.neighborhood}: {comps.zhvi != null ? fmtUsd(comps.zhvi) : "not available"}
        {comps.zhviDate ? ` (${comps.zhviDate.slice(0, 7)})` : ""}
      </span>
      <span className={`block ${mode === "rent" ? "" : "text-white/70"}`}>
        Typical rent in {comps.zip ?? "this ZIP"}: {comps.zori != null ? `${fmtUsd(comps.zori)}/mo` : "not available"}
        {comps.zoriDate ? ` (${comps.zoriDate.slice(0, 7)})` : ""}
      </span>
      <span className="block text-white/70">Zillow Research. {mode === "sale" ? "Scaled by home size." : "Less operating costs, divided by the cap rate."}</span>
    </span>
  );
}

/** How long a typing pause lasts before a draft is committed to the app (and the map). */
const COMMIT_PAUSE_MS = 500;

/**
 * A draft that commits to the app on blur, on Enter, or after a typing pause; never mid-keystroke.
 * The draft follows `value` when it changes from outside, unless the draft already maps to it.
 */
function useDraft<T>(
  value: T,
  toText: (v: T) => string,
  parse: (text: string) => T,
  onCommit: (v: T) => void,
) {
  const [text, setText] = useState(() => toText(value));
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    if (!Object.is(parse(text), value)) setText(toText(value));
  }
  const timer = useRef<number | null>(null);
  const latest = useRef({ text, value, parse, onCommit });
  useEffect(() => {
    latest.current = { text, value, parse, onCommit };
  });
  const flush = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    const l = latest.current;
    const v = l.parse(l.text);
    if (!Object.is(v, l.value)) l.onCommit(v);
  };
  useEffect(() => () => flush(), []);
  const edit = (t: string) => {
    setText(t);
    latest.current = { ...latest.current, text: t };
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, COMMIT_PAUSE_MS);
  };
  const inputProps = {
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit(e.target.value),
    onBlur: flush,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") flush();
    },
  };
  return { text, inputProps };
}

/**
 * A numeric assumption. The typed text stays as typed; the committed number is the value the model
 * accepts (clamped to range, or the default for blanks), and a note says when the two differ.
 */
function Num({
  k,
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  k: RangedKey;
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  const toNum = (t: string) => (t.trim() === "" ? NaN : Number(t));
  const { text, inputProps } = useDraft(
    value,
    String,
    (t) => acceptedValue(k, toNum(t)),
    onChange,
  );
  const parsed = toNum(text);
  const used = acceptedValue(k, parsed);
  const { min, max } = FINANCE_RANGES[k];
  return (
    <label className="block">
      <span className="mb-1 block text-caption text-muted">{label}</span>
      <input
        type="number"
        {...inputProps}
        step={step}
        min={min}
        max={max}
        aria-invalid={used !== parsed}
        className="input-field w-full tabular-nums"
      />
      {used !== parsed ? (
        <span className="mt-0.5 block text-caption text-warning-ink">
          Outside the accepted range ({min}–{max}), using {used}
        </span>
      ) : (
        hint && (
          <span className="mt-0.5 block text-caption text-muted">
            {hint}
          </span>
        )
      )}
    </label>
  );
}

/** This lot's acquisition cost; blank uses the assessed value. Commits like Num. */
function LandInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  const parse = (t: string): number | null => {
    const n = Number(t);
    return t.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, n);
  };
  const { inputProps } = useDraft(
    value,
    (v) => (v == null ? "" : String(v)),
    parse,
    onChange,
  );
  return (
    <label className="block">
      <span className="mb-1 block text-caption text-muted">
        Land cost, this lot only ($)
      </span>
      <input
        type="number"
        min={0}
        step={1000}
        {...inputProps}
        placeholder={placeholder}
        className="input-field w-full tabular-nums"
      />
    </label>
  );
}

function Row({
  label,
  value,
  swatch,
}: {
  label: React.ReactNode;
  value: string;
  swatch: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="flex min-w-0 items-baseline gap-2 text-muted">
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: swatch }} />
        <span className="min-w-0">{label}</span>
      </dt>
      <dd className="shrink-0 text-ink tabular-nums">{value}</dd>
    </div>
  );
}
