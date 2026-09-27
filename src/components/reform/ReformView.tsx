"use client";
import { memo, useId, useState, type ReactNode } from "react";
import Segmented from "../ui/Segmented";
import { BILL_ID, CUSTOM_ID, TODAY_ID, TODAY_PARAMS, leverLabel, presetById, sameParams, type RuleParams, type SubKey } from "./engine";

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

function ReformView({ presetId, params, onPreset, onParams, lotCount }: Props) {
  const mode: Mode = presetId === TODAY_ID || presetId === BILL_ID ? presetId : CUSTOM_ID;
  const fromLever = mode === CUSTOM_ID && presetId !== CUSTOM_ID ? presetById(presetId) : null;
  const note = mode !== CUSTOM_ID ? presetById(presetId)?.note : null;
  const differs = !sameParams(params, TODAY_PARAMS);
  const set = <K extends keyof RuleParams>(k: K, v: RuleParams[K]) => onParams({ ...params, [k]: v });
  const setArea = (k: SubKey, v: number | null) => set("minLotArea", { ...params.minLotArea, [k]: v });

  return (
    <div role="tabpanel" aria-label="Reform" data-scroll className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-hairline px-panel pt-2 pb-panel">
        <h2 className="text-title">Zoning levers</h2>
        <p className="mt-1.5 text-callout text-muted">
          Hypothetical rule changes applied to the {lotCount ? lotCount.toLocaleString("en-US") : "11,338"} City lots. &lsquo;Allowed&rsquo; means the use table,
          minimum lot size and LNC FAR; setbacks and height are not modeled. Not a proposal; a lever to see where a rule binds.
        </p>
        <div className="mt-4">
          <span className="mb-1 block text-caption text-muted">Scenario</span>
          <Segmented<Mode>
            label="Scenario"
            value={mode}
            onChange={(m) => onPreset(m)}
            options={[
              { value: TODAY_ID, label: "Today" },
              { value: BILL_ID, label: "Bill 2025-1545" },
              { value: CUSTOM_ID, label: "Custom" },
            ]}
          />
          {note && <p className="mt-2 text-caption text-muted">{note}</p>}
          {fromLever && <p className="mt-2 text-caption text-muted">Started from the lever &ldquo;{leverLabel(fromLever.label)}&rdquo;. Any knob edit makes it custom.</p>}
        </div>
      </div>

      {mode === CUSTOM_ID && (
        <div className="space-y-6 px-panel pt-4 pb-panel">
          <fieldset>
            <legend className="text-headline text-ink">Minimum lot size</legend>
            <p className="mt-0.5 text-caption text-muted">Per density subdistrict. Step 100 sf; Very high has no minimum today (None).</p>
            <div className="mt-3 space-y-4">
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

          <fieldset className="space-y-4 border-t border-hairline pt-4">
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

          <fieldset className="border-t border-hairline pt-4">
            <legend className="sr-only">Use table and parking</legend>
            <div className="space-y-2">
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
        </div>
      )}

      <div className="px-panel pb-panel">
        {differs ? (
          <button onClick={() => onPreset(TODAY_ID)} className="text-callout font-medium text-accent hover:underline">
            Reset to today
          </button>
        ) : (
          <p className="text-caption text-faint">{mode === CUSTOM_ID ? "Every knob is at today's value." : ""}</p>
        )}
      </div>
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
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="flex min-w-0 items-center gap-1.5 text-callout font-medium text-ink">
          {label}
          <ChangedDot on={changed} />
        </label>
        <div className="flex shrink-0 items-center gap-1">
          {nullable && (
            <button
              type="button"
              aria-pressed={none}
              onClick={() => onChange(none ? last : null)}
              title={none ? "No minimum. Click to set one." : "Remove the minimum"}
              className={`mr-1 h-7 rounded-full px-2.5 text-caption font-medium transition-colors ${none ? "bg-accent-soft text-accent" : "bg-control text-muted hover:bg-track hover:text-ink"}`}
            >
              None
            </button>
          )}
          <StepButton label={`Decrease ${label}`} onClick={dec} disabled={value == null || value <= 0}>
            <path d="M3 6h6" />
          </StepButton>
          <div className="input-shell flex w-[84px] items-center">
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
              className="w-full min-w-0 bg-transparent py-1 pl-2 text-right text-callout tabular-nums placeholder:text-faint"
              style={{ outline: "none" }}
            />
            <span className="pr-2 pl-1 text-caption text-faint select-none">{unit}</span>
          </div>
          <StepButton label={`Increase ${label}`} onClick={inc}>
            <path d="M3 6h6M6 3v6" />
          </StepButton>
        </div>
      </div>
      <p className="mt-0.5 text-caption text-muted">{section}</p>
      <input
        type="range"
        aria-label={`${label}, slider`}
        min={0}
        max={max}
        step={step}
        value={value ?? 0}
        disabled={none}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1.5 block w-full accent-accent ${none ? "cursor-not-allowed opacity-30" : ""}`}
      />
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
      className="flex h-7 w-7 items-center justify-center rounded-full bg-control text-ink transition-colors hover:bg-track disabled:text-faint disabled:hover:bg-control"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
        {children}
      </svg>
    </button>
  );
}

function Toggle({ checked, changed, onChange, section, children }: { checked: boolean; changed: boolean; onChange: (v: boolean) => void; section: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1 select-none">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-callout font-medium text-ink">
          {children}
          <ChangedDot on={changed} />
        </span>
        <span className="block text-caption text-muted">{section}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-control-edge transition-colors peer-checked:bg-v-byright peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-thumb after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

export default memo(ReformView);
