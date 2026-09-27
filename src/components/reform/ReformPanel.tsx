"use client";
import { useMemo, useState } from "react";
import CountUp from "../CountUp";
import { downloadText } from "../PlanView";
import type { Lot } from "@/lib/types";
import { CUSTOM_ID, PRESETS, TODAY_ID, lotScreen, type LeverResult, type RuleParams, type Screen } from "./engine";
import { scenarioCsv, scenarioSummary } from "./reformExport";

interface Props {
  lots: Lot[];
  /** Today's per-lot screen, for the CSV's "+vs today" columns. */
  base: Screen[] | null;
  result: LeverResult | null;
  levers: LeverResult[] | null;
  /** The id of the active scenario ("custom" when it matches no preset). */
  activeId: string;
  params: RuleParams;
  pending: boolean;
  totalLots: number;
  hardCostPerSf: number;
  onPreset: (id: string) => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "±0");
const deltaInk = (n: number) => (n > 0 ? "text-success-ink" : n < 0 ? "text-danger-ink" : "text-faint");

/** The right panel while the Reform tab is open and no lot is selected. */
export default function ReformPanel({ lots, base, result, levers, activeId, params, pending, totalLots, hardCostPerSf, onPreset }: Props) {
  const [copied, setCopied] = useState(false);
  const sorted = useMemo(
    () =>
      levers
        ? [...levers].sort((a, b) => b.publicLotsNewlyAllowed - a.publicLotsNewlyAllowed || (a.presetId === TODAY_ID ? 1 : b.presetId === TODAY_ID ? -1 : 0))
        : null,
    [levers],
  );
  const maxNew = Math.max(1, ...(sorted ?? []).map((r) => r.publicLotsNewlyAllowed));

  const hoods = useMemo(
    () =>
      result
        ? [...result.byNeighborhood]
            .filter((h) => h.newlyAllowed > 0)
            .sort((a, b) => b.newlyAllowed - a.newlyAllowed || a.name.localeCompare(b.name))
            .slice(0, 10)
        : [],
    [result],
  );
  const families = useMemo(
    () => (result ? [...result.byDistrictFamily].filter((f) => f.allowed > 0 || f.newlyAllowed > 0).sort((a, b) => b.newlyAllowed - a.newlyAllowed || b.allowed - a.allowed) : []),
    [result],
  );

  // Every preset (and the custom scenario) per lot, only when asked: about a second for 11,338 lots.
  const exportCsv = () => {
    if (!levers || !base) return;
    const cols = PRESETS.map((p) => ({ label: p.label, allowed: lots.map((l) => lotScreen(l, p.params).allowed) }));
    if (activeId === CUSTOM_ID) cols.push({ label: "Custom scenario", allowed: lots.map((l) => lotScreen(l, params).allowed) });
    downloadText(`byright-reform-${activeId}.csv`, scenarioCsv(lots, cols, base.map((b) => b.allowed)), "text/csv;charset=utf-8");
  };
  const copySummary = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(scenarioSummary(result, params, totalLots, hardCostPerSf, window.location.href));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: nothing to show */
    }
  };

  return (
    <div data-scroll className="fade-in scroll-thin flex-1 space-y-section overflow-y-auto px-panel py-panel">
      <section aria-label="Scenario headline" aria-busy={pending || undefined} className="surface-card relative overflow-hidden p-card">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-headline text-ink">{result ? result.label : "Scenario"}</h2>
          <span aria-live="polite" className={`text-caption ${pending ? "text-muted" : "text-transparent"}`}>
            {pending ? "Recomputing…" : "Up to date"}
          </span>
        </div>
        {result ? (
          <div className={`transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
              <Figure n={result.publicLotsAllowed} delta={result.publicLotsNewlyAllowed} label="pass use table and lot size" />
              <Figure n={result.candidates} delta={result.candidatesNewly} label="candidates for staff review" />
            </dl>
            <p className="mt-4 text-body text-muted">
              Under this scenario: <b className="font-semibold text-ink tabular-nums">{fmt(result.publicLotsAllowed)}</b> public lots pass the use-table and
              lot-size screen (<span className={`tabular-nums ${deltaInk(result.publicLotsNewlyAllowed)}`}>{signed(result.publicLotsNewlyAllowed)}</span> vs
              today); <b className="font-semibold text-ink tabular-nums">{fmt(result.candidates)}</b> candidates for staff review (
              <span className={`tabular-nums ${deltaInk(result.candidatesNewly)}`}>{signed(result.candidatesNewly)}</span>);{" "}
              <b className="font-semibold text-ink tabular-nums">{fmt(result.clearingCostScreen)}</b> clear the cost screen at ${hardCostPerSf}/sf.
            </p>
            {result.parkingUnresolved > 0 && (
              <p className="mt-2 text-caption text-muted">{fmt(result.parkingUnresolved)} candidates carry a parking count the data cannot verify.</p>
            )}
          </div>
        ) : (
          <div aria-label="Computing the scenario" className="mt-3 space-y-3">
            <div className="flex gap-8">
              {[0, 1].map((k) => (
                <span key={k} className="inline-block h-10 w-24 animate-pulse rounded bg-surface" />
              ))}
            </div>
            <span className="block h-4 w-full animate-pulse rounded bg-surface" />
          </div>
        )}
      </section>

      <section aria-labelledby="levers-h">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="levers-h" className="text-title text-ink">
            Levers
          </h3>
          <span className="text-caption text-muted">Sorted by lots gained</span>
        </div>
        <p className="mt-1 text-caption text-muted">One rule change per row, against today&apos;s code. Click a row to apply it.</p>
        {sorted ? (
          <table className="mt-3 w-full table-fixed border-collapse text-caption">
            <colgroup>
              <col />
              <col className="w-[52px]" />
              <col className="w-[60px]" />
              <col className="w-[72px]" />
              <col className="w-[48px]" />
            </colgroup>
            <thead>
              <tr className="text-left align-bottom leading-tight text-muted">
                <th scope="col" className="pb-1.5 font-medium">
                  Lever
                </th>
                <th scope="col" className="pb-1.5 pl-2 text-right font-medium">
                  Allowed
                </th>
                <th scope="col" className="pb-1.5 pl-2 text-right font-medium">
                  +vs today
                </th>
                <th scope="col" className="pb-1.5 pl-2 text-right font-medium" title="Candidates for staff review">
                  Candidates
                </th>
                <th scope="col" className="pb-1.5 pl-2 text-right font-medium" title={`Clear the cost screen at $${hardCostPerSf}/sf`}>
                  Clear cost
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const on = r.presetId === activeId;
                const custom = r.presetId === CUSTOM_ID;
                return (
                  <tr
                    key={r.presetId}
                    aria-selected={on}
                    tabIndex={custom ? -1 : 0}
                    onClick={() => !custom && onPreset(r.presetId)}
                    onKeyDown={(e) => {
                      if (!custom && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onPreset(r.presetId);
                      }
                    }}
                    className={`border-t border-hairline tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                      on ? "bg-accent-soft" : custom ? "" : "cursor-pointer hover:bg-panel"
                    }`}
                  >
                    <td className="py-2 pr-2 pl-1.5">
                      <span className={`line-clamp-2 block text-callout ${on ? "font-medium text-accent" : "text-ink"}`} title={r.label}>
                        {r.label}
                      </span>
                      <span aria-hidden className="mt-1 block h-1 rounded-full bg-track">
                        <span
                          className="block h-full rounded-full bg-v-byright transition-[width] duration-200"
                          style={{ width: `${(Math.max(0, r.publicLotsNewlyAllowed) / maxNew) * 100}%` }}
                        />
                      </span>
                    </td>
                    <td className="py-2 pl-2 text-right text-ink">{fmt(r.publicLotsAllowed)}</td>
                    <td className={`py-2 text-right ${deltaInk(r.publicLotsNewlyAllowed)}`}>{signed(r.publicLotsNewlyAllowed)}</td>
                    <td className="py-2 text-right text-ink">
                      {fmt(r.candidates)}
                      {r.candidatesNewly !== 0 && <span className={`block ${deltaInk(r.candidatesNewly)}`}>{signed(r.candidatesNewly)}</span>}
                    </td>
                    <td className="py-2 pr-1.5 text-right text-ink">{fmt(r.clearingCostScreen)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div aria-hidden className="mt-3 space-y-2">
            {[0, 1, 2, 3, 4].map((k) => (
              <div key={k} className="h-9 animate-pulse rounded bg-panel" />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="moves-h">
        <h3 id="moves-h" className="text-title text-ink">
          Where it moves
        </h3>
        <p className="mt-1 text-caption text-muted">Lots newly passing the use-table and lot-size screen under this scenario.</p>
        {result && hoods.length === 0 && <p className="mt-3 text-callout text-muted">No neighborhood gains a lot. Loosen a lot-size minimum to see where it binds.</p>}
        {hoods.length > 0 && <Bars label="Neighborhoods" rows={hoods.map((h) => ({ key: h.name, name: h.name, n: h.newlyAllowed, of: h.allowed }))} />}
        {families.length > 0 && (
          <Bars label="District families" rows={families.map((f) => ({ key: f.family, name: f.family, n: f.newlyAllowed, of: f.allowed }))} />
        )}
      </section>

      <section aria-label="Export" className="grid grid-cols-2 gap-2">
        <button onClick={exportCsv} disabled={!levers || !base} className="button-primary flex-col text-center disabled:cursor-wait disabled:opacity-50">
          Download scenario CSV
          <span className="block text-caption font-normal text-white/75">Neighborhoods × levers</span>
        </button>
        <button onClick={copySummary} disabled={!result || pending} className="button-secondary flex-col bg-panel text-center hover:bg-control disabled:cursor-wait disabled:opacity-50">
          {copied ? "Summary copied" : "Copy summary"}
          <span className="block text-caption font-normal text-muted">Counts, rules and link</span>
        </button>
      </section>
    </div>
  );
}

function Figure({ n, delta, label }: { n: number; delta: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="order-2 mt-1 text-caption text-muted">{label}</dt>
      <dd className="order-1 flex items-baseline gap-2">
        <span className="text-display text-ink tabular-nums">
          <CountUp value={n} />
        </span>
        <span className={`text-headline tabular-nums ${deltaInk(delta)}`}>{signed(delta)}</span>
      </dd>
    </div>
  );
}

function Bars({ label, rows }: { label: string; rows: { key: string; name: string; n: number; of: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 px-1.5 text-caption">
        <h4 className="min-w-0 flex-1 font-medium text-ink">{label}</h4>
        <span className="w-12 text-right text-muted">gained</span>
        <span className="w-14 text-right text-muted">allowed</span>
      </div>
      <ol className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="relative flex items-center gap-2 px-1.5 py-0.5 text-caption" title={`${r.name}: ${fmt(r.n)} newly allowed, ${fmt(r.of)} allowed in all`}>
            <span aria-hidden className="absolute inset-y-0.5 left-0 rounded-sm bg-v-byright/20 transition-[width] duration-200" style={{ width: `${(r.n / max) * 100}%` }} />
            <span className="relative min-w-0 flex-1 truncate text-ink">{r.name}</span>
            <span className="relative w-12 text-right font-medium text-success-ink tabular-nums">{r.n > 0 ? `+${fmt(r.n)}` : "0"}</span>
            <span className="relative w-14 text-right text-muted tabular-nums">{fmt(r.of)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
