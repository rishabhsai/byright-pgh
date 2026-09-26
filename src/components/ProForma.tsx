"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Comps, Finding, Lot, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import {
  fmtUsd,
  proformaWithFallback,
  UNIT_PLAN,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type RevenueMode,
} from "@/lib/finance";
import { acceptedValue, FINANCE_RANGES } from "@/lib/proforma";
import { TYPOLOGIES, VERDICT_SHORT } from "./verdict";

type RangedKey = keyof typeof FINANCE_RANGES;

interface Props {
  lot: Lot;
  comps: Comps | null;
  findings: Finding[];
  /** The selected proposal, owned by the app so zoning, finance and the worksheet agree. */
  typology: Typology;
  onTypology: (t: Typology) => void;
  /** This lot's acquisition cost override; null uses the assessed value. */
  landOverride: number | null;
  onLandOverride: (v: number | null) => void;
  assumptions: FinanceAssumptions;
  onAssumptions: (a: FinanceAssumptions) => void;
  /** Reports whether an edit is waiting to be committed to the city-wide triage. */
  onPending?: (pending: boolean) => void;
}

/** Edits reach the city-wide triage this long after the last keystroke (or on blur). */
const COMMIT_DELAY_MS = 500;

export const NO_COMPS = "No Zillow comps for this neighborhood; finance not assessed";

export default function ProForma({
  lot,
  comps,
  findings,
  typology,
  onTypology,
  landOverride,
  onLandOverride,
  assumptions,
  onAssumptions,
  onPending,
}: Props) {
  // The inputs and this lot's numbers run off a local draft so typing never waits on the
  // city-wide recompute; the draft is committed to the app after a pause or on blur.
  // The land override rides in the draft but is committed to this lot only, never to the shared assumptions.
  const [draft, setDraft] = useState<FinanceAssumptions>({ ...assumptions, landOverride });
  const [seen, setSeen] = useState(assumptions);
  if (assumptions !== seen) {
    setSeen(assumptions);
    setDraft((d) => ({ ...assumptions, landOverride: d.landOverride }));
  }
  const latest = useRef(draft);
  const timer = useRef<number | null>(null);

  const commit = useCallback(() => {
    if (timer.current == null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    onPending?.(false);
    const { landOverride: land, ...shared } = latest.current;
    onAssumptions(shared);
    onLandOverride(land ?? null);
  }, [onAssumptions, onLandOverride, onPending]);

  useEffect(() => commit, [commit]);

  const update = (next: FinanceAssumptions, immediate = false) => {
    latest.current = next;
    setDraft(next);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, COMMIT_DELAY_MS);
    onPending?.(true);
    if (immediate) commit();
  };

  const a = draft;
  const r = useMemo(() => proformaWithFallback(lot, typology, comps, a), [lot, typology, comps, a]);
  const altHard = a.hardCostPerSf + 10;
  const rAlt = useMemo(
    () => proformaWithFallback(lot, typology, comps, { ...a, hardCostPerSf: altHard }),
    [lot, typology, comps, a, altHard],
  );
  const set = <K extends keyof FinanceAssumptions>(k: K, v: FinanceAssumptions[K]) => update({ ...a, [k]: v });
  const mode: RevenueMode = a.mode;
  const verdictOf = (t: Typology) => findings.find((f) => f.typology === t)?.verdict ?? "unknown";
  const selectedVerdict = verdictOf(typology);

  if (!comps) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-muted">{NO_COMPS}.</p>
        <Calibration />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {r ? (
        <div
          className={`rounded-lg px-3 py-2.5 ${r.pencils ? "bg-[#16a34a0f] ring-1 ring-[#16a34a33]" : "bg-[#e11d480b] ring-1 ring-[#e11d4833]"}`}
        >
          <p className={`font-serif text-[24px] leading-tight ${r.pencils ? "text-[#15803d]" : "text-[#be123c]"}`}>
            {r.pencils ? `Pencils at ${Math.round(r.marginPct)}% margin` : `${fmtUsd(r.gap)} modeled shortfall to target return`}
          </p>
          {r.mode !== mode && (
            <p className="mt-0.5 text-[12px] text-ink">
              No {mode === "sale" ? "home value" : "rent"} comp here, so {r.mode === "sale" ? "the neighborhood home value" : "ZIP rent"} was used.
            </p>
          )}
          <p className="mt-0.5 text-[12px] text-muted">
            {r.pencils
              ? `A ${TYPOLOGY_LABEL[typology].toLowerCase()} here is worth more than it costs to build, with room for a ${a.targetMarginPct}% return.`
              : `Building a ${TYPOLOGY_LABEL[typology].toLowerCase()} costs more than it would be worth, after a ${a.targetMarginPct}% return.`}
          </p>
          <p className="mt-1 text-[11px] text-muted tabular-nums">
            At ${altHard}/sf:{" "}
            {rAlt ? (rAlt.pencils ? `${Math.round(rAlt.marginPct)}% margin` : `${fmtUsd(rAlt.gap)} shortfall`) : "n/a"}
            {" · "}Break-even value: {fmtUsd(r.breakEvenValue)}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-hairline px-3 py-3 text-[12px] text-muted">{NO_COMPS}.</p>
      )}

      <div>
        <h4 className="mb-1.5 text-[11px] text-muted">Comps used</h4>
        <ul className="space-y-1.5">
          <CompRow
            label={`${comps.neighborhood} typical home value`}
            code="ZHVI"
            value={comps.zhvi != null ? fmtUsd(comps.zhvi) : null}
            date={comps.zhviDate}
          />
          <CompRow
            label={comps.zip ? `ZIP ${comps.zip} typical rent` : "ZIP typical rent"}
            code="ZORI"
            value={comps.zori != null ? `${fmtUsd(comps.zori)}/mo` : null}
            date={comps.zoriDate}
          />
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2" onBlur={commit}>
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] text-muted">Home type</span>
          <select
            value={typology}
            onChange={(e) => onTypology(e.target.value as Typology)}
            className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px]"
          >
            {TYPOLOGIES.map((t) => (
              <option key={t} value={t}>
                {TYPOLOGY_LABEL[t]} ({UNIT_PLAN[t].note}){verdictOf(t) === "by-right" ? "" : `, ${VERDICT_SHORT[verdictOf(t)].toLowerCase()}`}
              </option>
            ))}
          </select>
          {selectedVerdict !== "by-right" && (
            <span className="mt-1 block text-[11px] text-[#a16207]">
              Zoning: {TYPOLOGY_LABEL[typology].toLowerCase()} is {VERDICT_SHORT[selectedVerdict].toLowerCase()} on this lot; these numbers assume it gets approved.
            </span>
          )}
        </label>
        <div className="col-span-2 flex rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
          {(["sale", "rent"] as RevenueMode[]).map((m) => (
            <button
              key={m}
              onClick={() => update({ ...a, mode: m }, true)}
              className={`flex-1 rounded px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === m ? "bg-white font-medium shadow-sm" : "text-muted"
              }`}
            >
              {m === "sale" ? "Sell at neighborhood value" : "Rent at ZIP rent"}
            </button>
          ))}
        </div>
        <Num k="hardCostPerSf" label="Hard cost ($/sf)" value={a.hardCostPerSf} onChange={(v) => set("hardCostPerSf", v)} />
        <Num k="softCostPct" label="Soft cost (% of hard)" value={a.softCostPct} onChange={(v) => set("softCostPct", v)} />
        <Num k="devFeePct" label="Developer fee (%)" value={a.devFeePct} onChange={(v) => set("devFeePct", v)} />
        <Num k="targetMarginPct" label="Target margin (%)" value={a.targetMarginPct} onChange={(v) => set("targetMarginPct", v)} />
        {mode === "sale" && (
          <Num k="typicalHomeSf" label="Typical home size (sf)" value={a.typicalHomeSf} onChange={(v) => set("typicalHomeSf", v)} step={50} />
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Land cost, this lot only ($)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={a.landOverride ?? ""}
            placeholder={lot.landValue != null ? `${lot.landValue} assessed` : `${a.defaultLand} default`}
            onChange={(e) => {
              const n = Number(e.target.value);
              set("landOverride", e.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n));
            }}
            className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] tabular-nums"
          />
        </label>
        {mode === "rent" && (
          <>
            <Num k="opexPct" label="Operating costs (% of rent)" value={a.opexPct} onChange={(v) => set("opexPct", v)} />
            <Num k="capRate" label="Cap rate (%)" value={a.capRate} onChange={(v) => set("capRate", v)} step={0.25} />
          </>
        )}
      </div>

      {r && (
        <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-white text-[12px]">
          <Row
            label={`Land${
              r.landSource === "override" ? " (your override)" : r.landSource === "assessed" ? " (county assessed)" : " (assumed, no assessment)"
            }`}
            value={fmtUsd(r.land)}
          />
          <Row label={`Hard cost, ${r.buildingSf.toLocaleString()} sf`} value={fmtUsd(r.hard)} />
          <Row label="Soft cost" value={fmtUsd(r.soft)} />
          <Row label="Developer fee" value={fmtUsd(r.devFee)} />
          <Row label="Total development cost" value={fmtUsd(r.totalCost)} strong />
          <Row
            label={r.mode === "rent" ? "Capitalized value (NOI ÷ cap rate)" : "Modeled sale value"}
            sub={r.revenueNote}
            value={fmtUsd(r.revenue)}
            strong
          />
          <div
            className={`flex items-baseline justify-between px-3 py-2.5 ${r.margin >= 0 ? "bg-[#16a34a0f]" : "bg-[#e11d480d]"}`}
          >
            <dt className="font-medium">
              Margin <span className="font-normal text-muted">({Math.round(r.marginPct)}% of cost)</span>
            </dt>
            <dd className={`font-serif text-[22px] leading-none ${r.margin >= 0 ? "text-[#15803d]" : "text-[#be123c]"}`}>
              {fmtUsd(r.margin)}
            </dd>
          </div>
        </dl>
      )}
      {r && (
        <details className="group text-[12px]">
          <summary className="cursor-pointer text-[11px] font-medium text-accent select-none">
            Where each number comes from
          </summary>
          <ul className="mt-2 space-y-1.5">
            {r.inputsUsed.map((x) => (
              <li key={x.key} className="leading-snug">
                <span className="text-ink">{x.label}: </span>
                <span className="tabular-nums text-ink">{x.display}</span>
                <span className="block text-[11px] text-muted">
                  {x.url ? (
                    <a
                      href={x.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-hairline underline-offset-2 hover:decoration-muted"
                    >
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
      <Calibration />
    </div>
  );
}

function Calibration() {
  return (
    <p className="text-[11px] leading-snug text-muted">
      Typical Pittsburgh affordable deal: ~70% tax-credit equity and public subsidy (Action Housing, Sixth Ward Flats).
    </p>
  );
}

function CompRow({ label, code, value, date }: { label: string; code: string; value: string | null; date: string | null }) {
  return (
    <li className="flex items-baseline justify-between gap-3 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[12px]">
      <span className="min-w-0">
        <span className="text-ink">{label}</span> <span className="text-faint">{code}</span>
        <span className="block text-[11px] text-muted">
          {date ? `As of ${date}, ` : ""}
          <a
            href={ZILLOW_DATA_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            Zillow Research
          </a>
        </span>
      </span>
      <span className={`shrink-0 tabular-nums ${value ? "font-medium text-ink" : "text-faint italic"}`}>
        {value ?? "not available"}
      </span>
    </li>
  );
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
}: {
  k: RangedKey;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const parsed = text.trim() === "" ? NaN : Number(text);
  const used = acceptedValue(k, parsed);
  if (used !== value) setText(String(value));
  const { min, max } = FINANCE_RANGES[k];
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        aria-invalid={used !== parsed}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          onChange(acceptedValue(k, n));
        }}
        className={`w-full rounded-md border bg-white px-2 py-1.5 text-[12px] tabular-nums ${used !== parsed ? "border-[#d97706]" : "border-hairline"}`}
      />
      {used !== parsed && (
        <span className="mt-0.5 block text-[10.5px] leading-tight text-[#a16207]">
          Outside the accepted range ({min}–{max}), using {used}
        </span>
      )}
    </label>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="min-w-0">
        <span className={strong ? "font-medium text-ink" : "text-muted"}>{label}</span>
        {sub && <span className="block text-[11px] text-faint">{sub}</span>}
      </dt>
      <dd className={`shrink-0 tabular-nums ${strong ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}
