"use client";
import { useMemo, useState } from "react";
import type { Finding, Lot, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import {
  computeProforma,
  fmtUsd,
  UNIT_PLAN,
  type ProformaAssumptions,
  type RevenueMode,
} from "@/lib/proforma";
import { TYPOLOGIES } from "./verdict";

interface Props {
  lot: Lot;
  findings: Finding[];
  assumptions: ProformaAssumptions;
  onAssumptions: (a: ProformaAssumptions) => void;
  mode: RevenueMode;
  onMode: (m: RevenueMode) => void;
}

export default function ProForma({ lot, findings, assumptions: a, onAssumptions, mode, onMode }: Props) {
  const firstByRight = findings.find((f) => f.verdict === "by-right")?.typology ?? "single";
  const [typology, setTypology] = useState<Typology>(firstByRight);
  const r = useMemo(() => computeProforma(typology, lot.landValue, a, mode), [typology, lot.landValue, a, mode]);
  const set = (k: keyof ProformaAssumptions) => (v: number) => onAssumptions({ ...a, [k]: v });
  const gapPositive = r.gap >= 0;

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-gold-soft px-2.5 py-1.5 text-[11px] text-[#7a5a00]">
        Screening estimate. Every number is editable. This is not underwriting.
      </p>
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
        <Num label="Hard cost ($/sf)" value={a.hardCostPerSf} onChange={set("hardCostPerSf")} />
        <Num label="Soft cost (% of hard)" value={a.softCostPct} onChange={set("softCostPct")} />
        <div className="col-span-2 flex rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
          {(["sale", "rent"] as RevenueMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`flex-1 rounded px-2 py-1 transition-colors ${mode === m ? "bg-white font-medium shadow-sm" : "text-muted"}`}
            >
              {m === "sale" ? "Sell at 80% AMI" : "Rent at HUD FMR"}
            </button>
          ))}
        </div>
        {mode === "sale" ? (
          <>
            <Num label="80% AMI, 3-person ($)" value={a.amiIncome} onChange={set("amiIncome")} step={1000} />
            <Num label="Price-to-income multiple" value={a.incomeMultiple} onChange={set("incomeMultiple")} step={0.1} />
          </>
        ) : (
          <>
            <Num label="FMR 2BR ($/mo)" value={a.fmrMonthly} onChange={set("fmrMonthly")} step={25} />
            <Num label="Cap rate (%)" value={a.capRate} onChange={set("capRate")} step={0.25} />
          </>
        )}
      </div>

      <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-white text-[12px]">
        <Row label={`Land${r.landIsAssumed ? " (assumed, no assessment)" : " (county assessed)"}`} value={fmtUsd(r.land)} />
        <Row label={`Hard cost, ${r.buildingSf.toLocaleString()} sf`} value={fmtUsd(r.hard)} />
        <Row label="Soft cost" value={fmtUsd(r.soft)} />
        <Row label="Total development cost" value={fmtUsd(r.totalCost)} strong />
        <Row label="Revenue" sub={r.revenueNote} value={fmtUsd(r.revenue)} strong />
        <div className={`flex items-baseline justify-between px-3 py-2.5 ${gapPositive ? "bg-[#16a34a0f]" : "bg-[#e11d480d]"}`}>
          <dt className="font-medium">{gapPositive ? "Margin" : "Subsidy gap"}</dt>
          <dd className={`font-serif text-[24px] leading-none ${gapPositive ? "text-v-byright" : "text-v-prohibited"}`}>
            {fmtUsd(r.gap)}
          </dd>
        </div>
      </dl>
      <p className="text-[11px] leading-snug text-faint">
        Defaults are placeholders: 80% AMI and HUD FY2026 FMR for Pittsburgh should be confirmed against current HUD tables.
      </p>
    </div>
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
