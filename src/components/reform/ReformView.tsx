"use client";
import { memo, useId, useMemo, useState, type ReactNode } from "react";
import Segmented from "../ui/Segmented";
import Collapsible from "../ui/Collapsible";
import { BILL_ID, CUSTOM_ID, TODAY_ID, TODAY_PARAMS, leverLabel, presetById, sameParams, type LeverResult, type RuleParams, type SubKey } from "./engine";
import { leverChanges } from "./reformExport";

type Mode = typeof TODAY_ID | typeof BILL_ID | typeof CUSTOM_ID;

interface Props {
  presetId: string;
  params: RuleParams;
  /** Apply a preset by id; "custom" keeps the current params and opens the knobs. */
  onPreset: (id: string) => void;
  /** A knob changed: the scenario becomes custom. */
  onParams: (p: RuleParams) => void;
  lotCount: number;
}

const LOT_KNOBS: { key: SubKey; label: string; section: string }[] = [
  { key: "VL", label: "Very low (VL)", section: "§ 903.03.A" },
  { key: "L", label: "Low (L)", section: "§ 903.03.B" },
  { key: "M", label: "Moderate (M)", section: "§ 903.03.C" },
  { key: "H", label: "High (H)", section: "§ 903.03.D" },
  { key: "VH", label: "Very high (VH)", section: "§ 903.03.E" },
];

const AREA_MAX = 8000;
const sf = (v: number | null) => (v == null ? "none" : `${v.toLocaleString("en-US")} sf`);

const MODE_LABEL: Record<Mode, string> = { [TODAY_ID]: "Today", [BILL_ID]: "Bill 2025-1545", [CUSTOM_ID]: "Custom" };

/** "L 1,800 · VH 1,000": the knobs that differ from today, for a collapsed section's summary. */
function areaSummary(params: RuleParams): string {
  const moved = LOT_KNOBS.filter((k) => params.minLotArea[k.key] !== TODAY_PARAMS.minLotArea[k.key]).map(
    (k) => `${k.key} ${params.minLotArea[k.key] == null ? "none" : params.minLotArea[k.key]!.toLocaleString("en-US")}`,
  );
  return moved.length ? moved.join(" · ") : "Today's values";
}

/** The Reform tab's controls pane: the scenario, then the knobs in collapsible groups, one 36px row per knob. */
function ReformView({ presetId, params, onPreset, onParams, lotCount }: Props) {
  const mode: Mode = presetId === TODAY_ID || presetId === BILL_ID ? presetId : CUSTOM_ID;
  const fromLever = mode === CUSTOM_ID && presetId !== CUSTOM_ID ? presetById(presetId) : null;
  const note = mode !== CUSTOM_ID ? presetById(presetId)?.note : null;
  const differs = !sameParams(params, TODAY_PARAMS);
  const set = <K extends keyof RuleParams>(k: K, v: RuleParams[K]) => onParams({ ...params, [k]: v });
  const setArea = (k: SubKey, v: number | null) => set("minLotArea", { ...params.minLotArea, [k]: v });
  const other = [
    params.hillsideMinLot !== TODAY_PARAMS.hillsideMinLot ? `Hillside ${sf(params.hillsideMinLot)}` : null,
    params.r1dAttachedWidthCap !== TODAY_PARAMS.r1dAttachedWidthCap ? `R1D ${params.r1dAttachedWidthCap} ft` : null,
  ].filter(Boolean);
  const switches = (
    [
      ["twoUnitInR1", "Two-unit in R1"],
      ["threeUnitInR2", "Three-unit in R2"],
      ["aduByRight", "ADUs by right"],
      ["parkingMinimums", "Parking minimums"],
    ] as const
  )
    .filter(([k]) => params[k] !== TODAY_PARAMS[k])
    .map(([k, l]) => `${l} ${params[k] ? "on" : "off"}`);

  return (
    <div>
      <Collapsible
        id="reform.scenario"
        title="Zoning levers"
        summary={mode === CUSTOM_ID ? "Custom" : MODE_LABEL[mode]}
        action={
          differs ? (
            <button onClick={() => onPreset(TODAY_ID)} className="shrink-0 text-caption font-medium text-accent hover:underline">
              Reset to today
            </button>
          ) : null
        }
      >
        <p className="text-caption text-muted">
          Hypothetical rule changes applied to the {lotCount ? lotCount.toLocaleString("en-US") : "11,338"} City lots. &lsquo;Allowed&rsquo; means the use table,
          minimum lot size and LNC FAR; setbacks and height are not modeled. Not a proposal; a lever to see where a rule binds.
        </p>
        <div className="mt-2">
          <Segmented<Mode>
            label="Scenario"
            size="sm"
            value={mode}
            onChange={(m) => onPreset(m)}
            options={[
              { value: TODAY_ID, label: "Today" },
              { value: BILL_ID, label: "Bill 2025-1545" },
              { value: CUSTOM_ID, label: "Custom" },
            ]}
          />
          {note && <p className="mt-1.5 text-caption text-muted">{note}</p>}
          {fromLever && <p className="mt-1.5 text-caption text-muted">Started from the lever &ldquo;{leverLabel(fromLever.label)}&rdquo;. Any knob edit makes it custom.</p>}
          {mode === CUSTOM_ID && !differs && <p className="mt-1.5 text-caption text-faint">Every knob is at today&apos;s value.</p>}
        </div>
      </Collapsible>

      {mode === CUSTOM_ID && (
        <>
          <Collapsible id="reform.lotsize" title="Minimum lot size" summary={areaSummary(params)}>
            <fieldset>
              <legend className="text-caption text-muted">Per density subdistrict. Step 100 sf; Very high has no minimum today (None).</legend>
              <div className="mt-1 divide-y divide-hairline">
                {LOT_KNOBS.map((k) => (
                  <AreaKnob
                    key={k.key}
                    label={k.label}
                    section={`${k.section}, today ${sf(TODAY_PARAMS.minLotArea[k.key])}`}
                    value={params.minLotArea[k.key]}
                    today={TODAY_PARAMS.minLotArea[k.key]}
                    nullable={k.key === "VH"}
                    max={AREA_MAX}
                    step={100}
                    unit="sf"
                    onChange={(v) => setArea(k.key, v)}
                  />
                ))}
              </div>
            </fieldset>
          </Collapsible>

          <Collapsible id="reform.other" title="Other dimensions" summary={other.length ? other.join(" · ") : "Today's values"}>
            <fieldset className="divide-y divide-hairline">
              <legend className="sr-only">Other dimensions</legend>
              <AreaKnob
                label="Hillside (H district)"
                section={`§ 905.02.C, today ${sf(TODAY_PARAMS.hillsideMinLot)}`}
                value={params.hillsideMinLot}
                today={TODAY_PARAMS.hillsideMinLot}
                max={AREA_MAX}
                step={100}
                unit="sf"
                onChange={(v) => set("hillsideMinLot", v ?? 0)}
              />
              <AreaKnob
                label="R1D attached width cap"
                section={`§ 911.04.A.69A, today ${TODAY_PARAMS.r1dAttachedWidthCap} ft`}
                value={params.r1dAttachedWidthCap}
                today={TODAY_PARAMS.r1dAttachedWidthCap}
                max={100}
                step={5}
                unit="ft"
                onChange={(v) => set("r1dAttachedWidthCap", v ?? 0)}
              />
            </fieldset>
          </Collapsible>

          <Collapsible id="reform.use" title="Use table and parking" summary={switches.length ? switches.join(" · ") : "Today's values"}>
            <fieldset>
              <legend className="sr-only">Use table and parking</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Toggle checked={params.twoUnitInR1} changed={params.twoUnitInR1 !== TODAY_PARAMS.twoUnitInR1} onChange={(v) => set("twoUnitInR1", v)} section="§ 911.02 use table; today not permitted in R1D, R1A">
                  Two-unit in R1
                </Toggle>
                <Toggle checked={params.threeUnitInR2} changed={params.threeUnitInR2 !== TODAY_PARAMS.threeUnitInR2} onChange={(v) => set("threeUnitInR2", v)} section="§ 911.02 use table; today not permitted in R2">
                  Three-unit in R2
                </Toggle>
                <Toggle checked={params.aduByRight} changed={params.aduByRight !== TODAY_PARAMS.aduByRight} onChange={(v) => set("aduByRight", v)} section="§ 912.08; today ADU Overlay only">
                  ADUs by right
                </Toggle>
                <Toggle checked={params.parkingMinimums} changed={params.parkingMinimums !== TODAY_PARAMS.parkingMinimums} onChange={(v) => set("parkingMinimums", v)} section="§ 914.02; reported, not checked against the lot">
                  Parking minimums
                </Toggle>
              </div>
            </fieldset>
          </Collapsible>
        </>
      )}
    </div>
  );
}

/** Marks a knob whose value differs from today's code. */
function ChangedDot({ on }: { on: boolean }) {
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-accent" : "bg-transparent"}`} />;
}

function AreaKnob({
  label,
  section,
  value,
  today,
  nullable = false,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  section: string;
  value: number | null;
  today: number | null;
  nullable?: boolean;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  const changed = value !== today;
  // The value to restore when "None" is switched off.
  const [last, setLast] = useState<number>(value ?? today ?? step * 10);
  if (value != null && value !== last) setLast(value);
  const clamp = (n: number) => Math.max(0, Math.min(100_000, Math.round(n / step) * step));
  const dec = () => {
    if (value == null || value <= 0) return;
    onChange(clamp(value - step));
  };
  const inc = () => onChange(value == null ? step : clamp(value + step));
  const none = nullable && value == null;
  return (
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 py-[3px]">
      <div className="min-w-0">
        <div className="flex h-4 items-center gap-2">
          <label htmlFor={id} title={label} className="flex w-[104px] shrink-0 items-center gap-1 text-caption font-medium text-ink">
            <span className="truncate">{label}</span>
            <ChangedDot on={changed} />
          </label>
          <input
            type="range"
            aria-label={`${label}, slider`}
            min={0}
            max={max}
            step={step}
            value={value ?? 0}
            disabled={none}
            onChange={(e) => onChange(Number(e.target.value))}
            className="knob-slider min-w-0 flex-1"
          />
        </div>
        <p title={section} className="truncate text-[11px] leading-[14px] text-faint">
          {section}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {nullable && (
          <button
            type="button"
            aria-pressed={none}
            onClick={() => onChange(none ? last : null)}
            title={none ? "No minimum. Click to set one." : "Remove the minimum"}
            className={`mr-0.5 h-6 rounded-full px-2 text-caption font-medium transition-colors ${none ? "bg-accent-soft text-accent" : "bg-control text-muted hover:bg-track hover:text-ink"}`}
          >
            None
          </button>
        )}
        <StepButton label={`Decrease ${label}`} onClick={dec} disabled={value == null || value <= 0}>
          <path d="M3 6h6" />
        </StepButton>
        <div className="input-shell flex h-7 min-h-7 w-[68px] items-center">
          <input
            id={id}
            inputMode="numeric"
            autoComplete="off"
            disabled={none}
            value={value == null ? "" : value.toLocaleString("en-US")}
            placeholder={nullable ? "none" : "0"}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 6);
              onChange(digits === "" ? 0 : Math.min(100_000, Number(digits)));
            }}
            className="w-full min-w-0 bg-transparent py-0.5 pl-1.5 text-right text-caption tabular-nums placeholder:text-faint"
            style={{ outline: "none" }}
          />
          <span className="pr-1.5 pl-0.5 text-[11px] text-faint select-none">{unit}</span>
        </div>
        <StepButton label={`Increase ${label}`} onClick={inc}>
          <path d="M3 6h6M6 3v6" />
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-control text-ink transition-colors hover:bg-track disabled:text-faint disabled:hover:bg-control"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
        {children}
      </svg>
    </button>
  );
}

function Toggle({ checked, changed, onChange, section, children }: { checked: boolean; changed: boolean; onChange: (v: boolean) => void; section: string; children: ReactNode }) {
  return (
    <label title={section} className="flex min-w-0 cursor-pointer items-start justify-between gap-2 select-none">
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-caption font-medium text-ink">
          <span className="truncate">{children}</span>
          <ChangedDot on={changed} />
        </span>
        <span className="line-clamp-2 text-[11px] leading-[14px] text-faint">{section}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-px inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-control-edge transition-colors peer-checked:bg-v-byright peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-thumb after:transition-transform peer-checked:after:translate-x-3"
      />
    </label>
  );
}

const fmtN = (n: number) => n.toLocaleString("en-US");
const signedN = (n: number) => (n > 0 ? `+${fmtN(n)}` : n < 0 ? `−${fmtN(Math.abs(n))}` : "±0");
const deltaInk = (n: number) => (n > 0 ? "text-success-ink" : n < 0 ? "text-danger-ink" : "text-faint");

/**
 * The Reform tab's results pane: every lever as one row (lots gained as a bar, net against today, candidates),
 * sorted by lots gained. A row applies its lever; the right panel keeps the full table.
 */
export function LeverList({
  levers,
  today,
  activeId,
  pending,
  onPreset,
}: {
  levers: LeverResult[] | null;
  today: { allowed: number; candidates: number } | null;
  activeId: string;
  pending: boolean;
  onPreset: (id: string) => void;
}) {
  const sorted = useMemo(
    () =>
      levers
        ? [...levers].sort((a, b) => b.publicLotsNewlyAllowed - a.publicLotsNewlyAllowed || (a.presetId === TODAY_ID ? 1 : b.presetId === TODAY_ID ? -1 : 0))
        : null,
    [levers],
  );
  const maxNew = Math.max(1, ...(sorted ?? []).map((r) => r.publicLotsNewlyAllowed));
  return (
    <>
      <div className="grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 px-4 text-caption">
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink">Levers</span>{" "}
          <span aria-live="polite" className="text-muted">
            {pending && sorted ? "Recomputing…" : "Sorted by lots gained"}
          </span>
        </span>
        <span title="Allowed minus today's allowed" className="w-12 text-right text-muted">
          Net
        </span>
        <span title="Candidates for staff review, and net against today" className="w-[76px] text-right text-muted">
          Candidates
        </span>
      </div>
      <ul aria-label="Levers, sorted by lots gained. Choose one to apply it." data-scroll className={`scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
        {sorted && today
          ? sorted.map((r) => {
              const on = r.presetId === activeId;
              const custom = r.presetId === CUSTOM_ID;
              const ch = leverChanges(r, today);
              return (
                <li key={r.presetId}>
                  <button
                    type="button"
                    disabled={custom}
                    aria-current={on || undefined}
                    title={`${r.label}: ${fmtN(r.publicLotsAllowed)} allowed, ${fmtN(ch.lots.gained)} gained, ${fmtN(ch.lots.lost)} lost, ${fmtN(r.clearingCostScreen)} clear the cost screen`}
                    onClick={() => onPreset(r.presetId)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-control px-2 py-1.5 text-left text-caption transition-colors ${
                      on ? "bg-accent-soft" : custom ? "" : "hover:bg-surface"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`line-clamp-2 ${on ? "font-medium text-accent" : "text-ink"}`}>{r.label.replace(/\s*\(§[^)]*\)\s*$/, "")}</span>
                      <span aria-hidden className="mt-1 block h-[3px] rounded-full bg-track">
                        <span className="block h-full rounded-full bg-v-byright transition-[width] duration-200" style={{ width: `${(Math.max(0, r.publicLotsNewlyAllowed) / maxNew) * 100}%` }} />
                      </span>
                    </span>
                    <span className={`w-12 text-right font-medium tabular-nums ${deltaInk(ch.lots.net)}`}>{signedN(ch.lots.net)}</span>
                    <span className="w-[76px] text-right whitespace-nowrap text-ink tabular-nums">
                      {fmtN(r.candidates)} <span className={deltaInk(ch.candidates.net)}>{signedN(ch.candidates.net)}</span>
                    </span>
                  </button>
                </li>
              );
            })
          : [0, 1, 2, 3, 4].map((k) => <li key={k} aria-hidden className="mx-2 my-1.5 h-8 animate-pulse rounded bg-surface" />)}
      </ul>
    </>
  );
}

export default memo(ReformView);
