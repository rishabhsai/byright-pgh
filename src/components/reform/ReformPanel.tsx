"use client";
import { useMemo, useState } from "react";
import CountUp from "../CountUp";
import { downloadText } from "../PlanView";
import { TYPOLOGY_LABEL, type Lot } from "@/lib/types";
import { CUSTOM_ID, PRESETS, TODAY_ID, leverLabel, lotScreen, type LeverResult, type RuleParams, type Screen } from "./engine";
import { changeText, leverChanges, parkingText, scenarioCsv, scenarioSummary, typologyText, type Change } from "./reformExport";

interface Props {
  lots: Lot[];
  /** Today's per-lot screen, for the CSV's gained/lost/net columns. */
  base: Screen[] | null;
  /** Today's allowed and candidate totals: every net is taken against these. */
  today: { allowed: number; candidates: number } | null;
  result: LeverResult | null;
  levers: LeverResult[] | null;
  /** The id of the active scenario ("custom" when it matches no preset). */
  activeId: string;
  params: RuleParams;
  /** The headline lags the inputs (params, comps or assumptions). */
  pending: boolean;
  /** The lever table lags the comps or assumptions. */
  leversPending: boolean;
  totalLots: number;
  /** The $/sf the headline's cost-screen count was computed at. */
  hardCostPerSf: number;
  onPreset: (id: string) => void;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "±0");
const deltaInk = (n: number) => (n > 0 ? "text-success-ink" : n < 0 ? "text-danger-ink" : "text-faint");

/** The right panel while the Reform tab is open and no lot is selected. */
export default function ReformPanel({ lots, base, today, result, levers, activeId, params, pending, leversPending, totalLots, hardCostPerSf, onPreset }: Props) {
  const [copied, setCopied] = useState(false);
  const sorted = useMemo(
    () =>
      levers
        ? [...levers].sort((a, b) => b.publicLotsNewlyAllowed - a.publicLotsNewlyAllowed || (a.presetId === TODAY_ID ? 1 : b.presetId === TODAY_ID ? -1 : 0))
        : null,
    [levers],
  );
  const maxNew = Math.max(1, ...(sorted ?? []).map((r) => r.publicLotsNewlyAllowed));
  const todayRow = levers?.find((r) => r.presetId === TODAY_ID) ?? null;
  const change = result && today ? leverChanges(result, today) : null;
  const types = result ? typologyText(result, TYPOLOGY_LABEL) : null;

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
    const cols = PRESETS.map((p) => ({ label: p.label, lots: lots.map((l) => lotScreen(l, p.params)) }));
    if (activeId === CUSTOM_ID) cols.push({ label: "Custom scenario", lots: lots.map((l) => lotScreen(l, params)) });
    const csv = scenarioCsv(lots, cols, base, { presetId: activeId, params, generatedAt: new Date() });
    downloadText(`byright-reform-${activeId}.csv`, csv, "text/csv;charset=utf-8");
  };
  const copySummary = async () => {
    if (!result || !today || !todayRow) return;
    try {
      const text = scenarioSummary(result, params, totalLots, hardCostPerSf, window.location.href, { ...today, parkingUnresolved: todayRow.parkingUnresolved }, TYPOLOGY_LABEL);
      await navigator.clipboard.writeText(text);
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
          <h2 className="text-headline text-ink">{result ? leverLabel(result.label) : "Scenario"}</h2>
          <span aria-live="polite" className={`shrink-0 text-caption ${pending ? "text-muted" : "text-transparent"}`}>
            {pending ? "Recomputing…" : "Up to date"}
          </span>
        </div>
        {result && change ? (
          <div className={`transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
              <Figure n={result.publicLotsAllowed} change={change.lots} label="pass use table and lot size" />
              <Figure n={result.candidates} change={change.candidates} label="candidates for staff review" />
            </dl>
            <dl className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-callout">
              <div className="flex gap-3">
                <dt className="w-[132px] shrink-0 text-muted">Home-type options</dt>
                <dd className="min-w-0 text-ink tabular-nums">
                  {types ?? <span className="text-muted">No change</span>}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-[132px] shrink-0 text-muted">Parking to verify</dt>
                <dd className="min-w-0 text-ink tabular-nums">
                  {todayRow ? parkingText(result.parkingUnresolved, todayRow.parkingUnresolved) : fmt(result.parkingUnresolved)}
                  <span className="text-muted"> candidates</span>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-body text-muted">
              Under this scenario: <b className="font-semibold text-ink tabular-nums">{fmt(result.publicLotsAllowed)}</b> public lots pass the use-table and
              lot-size screen ({changeText(change.lots)} vs today); <b className="font-semibold text-ink tabular-nums">{fmt(result.candidates)}</b> candidates
              for staff review ({changeText(change.candidates)}); <b className="font-semibold text-ink tabular-nums">{fmt(result.clearingCostScreen)}</b> clear
              the cost screen at ${hardCostPerSf}/sf.
            </p>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("moves-h");
                el?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              }}
              className="mt-3 inline-flex items-center gap-1 text-callout font-medium text-accent hover:underline"
            >
              Where it moves
              <span aria-hidden>↓</span>
            </button>
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

      <section aria-labelledby="levers-h" aria-busy={leversPending || undefined}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="levers-h" className="text-title text-ink">
            Levers
          </h3>
          <span aria-live="polite" className="text-caption text-muted">
            {leversPending && sorted ? "Recomputing…" : "Sorted by lots gained"}
          </span>
        </div>
        <p className="mt-1 text-caption text-muted">One rule change per row, against today&apos;s code. Net is allowed minus today&apos;s. Click a row to apply it.</p>
        {sorted && today ? (
          <table className={`mt-3 w-full table-fixed border-collapse text-caption transition-opacity ${leversPending ? "opacity-60" : ""}`}>
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[29%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="align-bottom leading-tight text-muted">
                {[
                  ["Allowed", "Lots allowed under the lever"],
                  ["Gained", "Lots allowed under the lever that are not today"],
                  ["Lost", "Lots allowed today that are not under the lever"],
                  ["Net", "Allowed minus today's allowed"],
                  ["Candidates", "Candidates for staff review, and net against today"],
                  ["Clear", `Clear the cost screen at $${hardCostPerSf}/sf`],
                ].map(([h, tip], k) => (
                  <th key={h} scope="col" title={tip} className={`pb-1.5 text-right font-medium ${k === 5 ? "pr-1.5" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {sorted.map((r) => {
              const on = r.presetId === activeId;
              const custom = r.presetId === CUSTOM_ID;
              const ch = leverChanges(r, today);
              const rowTypes = typologyText(r, TYPOLOGY_LABEL);
              const rowParking = todayRow && r.parkingUnresolved !== todayRow.parkingUnresolved ? parkingText(r.parkingUnresolved, todayRow.parkingUnresolved) : null;
              return (
                <tbody
                  key={r.presetId}
                  aria-current={on || undefined}
                  aria-label={r.label}
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
                  <tr>
                    <th scope="rowgroup" colSpan={6} className="px-1.5 pt-2 text-left font-normal">
                      <span className={`block text-callout ${on ? "font-medium text-accent" : "text-ink"}`}>{leverLabel(r.label)}</span>
                      <span aria-hidden className="mt-1 block h-1 rounded-full bg-track">
                        <span
                          className="block h-full rounded-full bg-v-byright transition-[width] duration-200"
                          style={{ width: `${(Math.max(0, r.publicLotsNewlyAllowed) / maxNew) * 100}%` }}
                        />
                      </span>
                    </th>
                  </tr>
                  <tr className="align-top">
                    <td className="pt-1 pb-2 text-right text-ink">{fmt(r.publicLotsAllowed)}</td>
                    <td className={`pt-1 pb-2 text-right ${ch.lots.gained ? "text-success-ink" : "text-faint"}`}>{fmt(ch.lots.gained)}</td>
                    <td className={`pt-1 pb-2 text-right ${ch.lots.lost ? "text-danger-ink" : "text-faint"}`}>{fmt(ch.lots.lost)}</td>
                    <td className={`pt-1 pb-2 text-right font-medium ${deltaInk(ch.lots.net)}`}>{signed(ch.lots.net)}</td>
                    <td className="pt-1 pb-2 text-right whitespace-nowrap text-ink">
                      {fmt(r.candidates)} <span className={deltaInk(ch.candidates.net)}>{signed(ch.candidates.net)}</span>
                    </td>
                    <td className="pt-1 pr-1.5 pb-2 text-right text-ink">{fmt(r.clearingCostScreen)}</td>
                  </tr>
                  {(rowTypes || rowParking) && (
                    <tr>
                      <td colSpan={6} className="px-1.5 pb-2 text-left text-muted">
                        {rowTypes && (
                          <span className="block">
                            Home-type options: <span className="text-ink">{rowTypes}</span>
                          </span>
                        )}
                        {rowParking && (
                          <span className="block">
                            Parking to verify: <span className="text-ink">{rowParking}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
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
        <h3 id="moves-h" className="scroll-mt-4 text-title text-ink">
          Where it moves
        </h3>
        <p className="mt-1 text-caption text-muted">Lots newly passing the use-table and lot-size screen under this scenario (gains only; losses are in the headline).</p>
        {result && hoods.length === 0 && <p className="mt-3 text-callout text-muted">No neighborhood gains a lot. Loosen a lot-size minimum to see where it binds.</p>}
        {hoods.length > 0 && <Bars label="Neighborhoods" rows={hoods.map((h) => ({ key: h.name, name: h.name, n: h.newlyAllowed, of: h.allowed }))} />}
        {families.length > 0 && (
          <Bars label="District families" rows={families.map((f) => ({ key: f.family, name: f.family, n: f.newlyAllowed, of: f.allowed }))} />
        )}
      </section>

      <section aria-label="Export">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={exportCsv} disabled={!levers || !base} className="button-secondary text-callout disabled:cursor-wait disabled:opacity-50">
            Download CSV
          </button>
          <button onClick={copySummary} disabled={!result || pending || !todayRow} className="button-secondary text-callout disabled:cursor-wait disabled:opacity-50">
            {copied ? "Summary copied" : "Copy summary"}
          </button>
        </div>
        <p className="mt-2 text-caption text-muted">CSV: every neighborhood × lever, gained, lost and net, with the scenario&apos;s rules. Summary: counts, rules and link.</p>
      </section>
    </div>
  );
}

function Figure({ n, change, label }: { n: number; change: Change; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="order-3 mt-0.5 text-caption text-muted">{label}</dt>
      <dd className="order-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-display text-ink tabular-nums">
          <CountUp value={n} />
        </span>
        <span className={`text-callout font-medium whitespace-nowrap tabular-nums ${deltaInk(change.net)}`}>net {signed(change.net)}</span>
      </dd>
      <dd className="order-2 mt-0.5 text-caption text-muted tabular-nums">
        {fmt(change.gained)} gained · {fmt(change.lost)} lost
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
