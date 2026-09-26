"use client";
import { useMemo, useState } from "react";
import type { Comps, Lot, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import {
  fmtUsd,
  proformaWithFallback,
  UNIT_PLAN,
  ZILLOW_DATA_URL,
  type FinanceAssumptions,
  type RevenueMode,
} from "@/lib/finance";
import { TYPOLOGIES } from "./verdict";

interface Props {
  lot: Lot;
  comps: Comps | null;
  initialTypology: Typology | null;
  assumptions: FinanceAssumptions;
  onAssumptions: (a: FinanceAssumptions) => void;
}

export const NO_COMPS = "No Zillow comps for this neighborhood; finance not assessed";

export default function ProForma({ lot, comps, initialTypology, assumptions: a, onAssumptions }: Props) {
  const [typology, setTypology] = useState<Typology>(initialTypology ?? "single");
  const r = useMemo(() => proformaWithFallback(lot, typology, comps, a), [lot, typology, comps, a]);
  const set = <K extends keyof FinanceAssumptions>(k: K) => (v: FinanceAssumptions[K]) => onAssumptions({ ...a, [k]: v });
  const mode: RevenueMode = a.mode;

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
            {r.pencils ? `Pencils at ${Math.round(r.marginPct)}% margin` : `Gap: ${fmtUsd(r.gap)} subsidy needed`}
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

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] text-muted">Home type</span>
          <select
            value={typology}
            onChange={(e) => setTypology(e.target.value as Typology)}
            className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px]"
          >
            {TYPOLOGIES.map((t) => (
              <option key={t} value={t}>
                {TYPOLOGY_LABEL[t]} ({UNIT_PLAN[t].note})
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
          {(["sale", "rent"] as RevenueMode[]).map((m) => (
            <button
              key={m}
              onClick={() => set("mode")(m)}
              className={`flex-1 rounded px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === m ? "bg-white font-medium shadow-sm" : "text-muted"
              }`}
            >
              {m === "sale" ? "Sell at neighborhood value" : "Rent at ZIP rent"}
            </button>
          ))}
        </div>
        <Num label="Hard cost ($/sf)" value={a.hardCostPerSf} onChange={set("hardCostPerSf")} />
        <Num label="Soft cost (% of hard)" value={a.softCostPct} onChange={set("softCostPct")} />
        <Num label="Developer fee (%)" value={a.devFeePct} onChange={set("devFeePct")} />
        <Num label="Target margin (%)" value={a.targetMarginPct} onChange={set("targetMarginPct")} />
        {mode === "sale" && (
          <Num label="Typical home size (sf)" value={a.typicalHomeSf} onChange={set("typicalHomeSf")} step={50} />
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Land cost override ($)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={a.landOverride ?? ""}
            placeholder={lot.landValue != null ? `${lot.landValue} assessed` : `${a.defaultLand} default`}
            onChange={(e) => set("landOverride")(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] tabular-nums"
          />
        </label>
        {mode === "rent" && (
          <>
            <Num label="Operating costs (% of rent)" value={a.opexPct} onChange={set("opexPct")} />
            <Num label="Cap rate (%)" value={a.capRate} onChange={set("capRate")} step={0.25} />
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
          <Row label="Value" sub={r.revenueNote} value={fmtUsd(r.revenue)} strong />
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

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] tabular-nums"
      />
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
