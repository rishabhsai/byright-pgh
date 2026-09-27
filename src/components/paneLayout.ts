import type { CSSProperties } from "react";

/** The two resizable panes beside the map: the left rail and the detail panel. */
export type Pane = "rail" | "panel";

/** User-set pane widths in px; null keeps the design default (see `defaultWidth`). */
export interface Widths {
  rail: number | null;
  panel: number | null;
}

export interface Layout extends Widths {
  /** Viewport is at least `WIDE_AT` wide: the panel default is 440px instead of 380px. */
  wide: boolean;
}

export const STORAGE_KEY = "byright.layout.v1";
export const MAP_MIN = 360;
export const WIDE_AT = 1440;
export const LIMITS: Record<Pane, { min: number; max: number }> = {
  rail: { min: 280, max: 520 },
  panel: { min: 340, max: 720 },
};
/** The CSS variables `.pane-rail` and `.pane-detail` read (globals.css). */
export const PANE_VAR: Record<Pane, string> = { rail: "--rail-w", panel: "--panel-w" };

const NONE: Widths = { rail: null, panel: null };
const SERVER: Layout = { ...NONE, wide: false };

export function defaultWidth(pane: Pane, wide: boolean): number {
  return pane === "rail" ? 360 : wide ? 440 : 380;
}

export function clampWidth(pane: Pane, px: number): number {
  const { min, max } = LIMITS[pane];
  return Math.min(max, Math.max(min, Math.round(px)));
}

function validWidth(pane: Pane, v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= LIMITS[pane].min && v <= LIMITS[pane].max ? Math.round(v) : null;
}

/** Stored JSON to widths; anything malformed or out of range is dropped. */
export function parseWidths(raw: string | null): Widths {
  if (!raw) return NONE;
  try {
    const v = JSON.parse(raw) as Partial<Record<Pane, unknown>> | null;
    if (!v || typeof v !== "object") return NONE;
    return { rail: validWidth("rail", v.rail), panel: validWidth("panel", v.panel) };
  } catch {
    return NONE;
  }
}

/** Keep as many user widths as leave the map `MAP_MIN` px; defaults fill the rest. */
export function fitWidths(w: Widths, viewport: number): Widths {
  const wide = viewport >= WIDE_AT;
  const fits = (c: Widths) =>
    (c.rail ?? defaultWidth("rail", wide)) + (c.panel ?? defaultWidth("panel", wide)) + MAP_MIN <= viewport;
  const candidates: Widths[] = [w, { rail: w.rail, panel: null }, { rail: null, panel: w.panel }];
  return candidates.find(fits) ?? NONE;
}

export function layoutStyle(l: Widths): CSSProperties {
  const style: Record<string, string> = {};
  if (l.rail != null) style[PANE_VAR.rail] = `${l.rail}px`;
  if (l.panel != null) style[PANE_VAR.panel] = `${l.panel}px`;
  return style as CSSProperties;
}

// Store for useSyncExternalStore: persisted widths, re-fitted to the viewport on resize.
let stored: Widths | null = null;
let snapshot: Layout = SERVER;
const listeners = new Set<() => void>();

function readStored(): Widths {
  try {
    return parseWidths(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return NONE;
  }
}

function recompute(): boolean {
  stored ??= readStored();
  const vw = window.innerWidth;
  const next = { ...fitWidths(stored, vw), wide: vw >= WIDE_AT };
  if (next.rail === snapshot.rail && next.panel === snapshot.panel && next.wide === snapshot.wide) return false;
  snapshot = next;
  return true;
}

function onResize() {
  if (recompute()) listeners.forEach((l) => l());
}

export function subscribeLayout(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("resize", onResize);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("resize", onResize);
  };
}

export function getLayout(): Layout {
  if (stored === null) recompute();
  return snapshot;
}

export function getServerLayout(): Layout {
  return SERVER;
}

/** Set one pane's width (null restores its default) and persist it. */
export function setPaneWidth(pane: Pane, px: number | null) {
  stored = { ...(stored ?? readStored()), [pane]: px == null ? null : clampWidth(pane, px) };
  persist();
  if (recompute()) listeners.forEach((l) => l());
}

// ---- Rail split and collapsed sections --------------------------------------------------------------------
// The rail stacks a controls pane over a results pane; the share the controls pane may take is per tab.
// Both live in the same storage key as the widths.

export type SplitTab = "lots" | "plan" | "reform";

export interface Prefs {
  /** Fraction of the rail's split area the controls pane may take, per tab; absent keeps the default. */
  split: Partial<Record<SplitTab, number>>;
  /** Section id to collapsed (true) or expanded (false); absent keeps the section's default. */
  collapsed: Record<string, boolean>;
}

export const SPLIT_DEFAULT: Record<SplitTab, number> = { lots: 0.44, plan: 0.4, reform: 0.55 };
export const SPLIT_LIMITS = { min: 0.08, max: 0.9 };
/** The controls pane keeps one section row; the results pane keeps a header and two list rows. */
export const SPLIT_MIN_PX = { controls: 40, results: 140 };

const NO_PREFS: Prefs = { split: {}, collapsed: {} };
const SPLIT_TABS: SplitTab[] = ["lots", "plan", "reform"];

export function clampSplit(f: number): number {
  return Math.min(SPLIT_LIMITS.max, Math.max(SPLIT_LIMITS.min, Math.round(f * 1000) / 1000));
}

/** Stored JSON to prefs; malformed or out-of-range entries are dropped. */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return NO_PREFS;
  try {
    const v = JSON.parse(raw) as { split?: unknown; collapsed?: unknown } | null;
    if (!v || typeof v !== "object") return NO_PREFS;
    const split: Prefs["split"] = {};
    if (v.split && typeof v.split === "object") {
      for (const t of SPLIT_TABS) {
        const f = (v.split as Record<string, unknown>)[t];
        if (typeof f === "number" && Number.isFinite(f) && f >= SPLIT_LIMITS.min && f <= SPLIT_LIMITS.max) split[t] = f;
      }
    }
    const collapsed: Prefs["collapsed"] = {};
    if (v.collapsed && typeof v.collapsed === "object") {
      for (const [k, b] of Object.entries(v.collapsed as Record<string, unknown>)) if (typeof b === "boolean") collapsed[k] = b;
    }
    return { split, collapsed };
  } catch {
    return NO_PREFS;
  }
}

let prefs: Prefs | null = null;
const prefListeners = new Set<() => void>();

function readPrefs(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return NO_PREFS;
  }
}

function persist() {
  const w = stored ?? readStored();
  const p = prefs ?? readPrefs();
  const out: Record<string, unknown> = {};
  if (w.rail != null) out.rail = w.rail;
  if (w.panel != null) out.panel = w.panel;
  if (Object.keys(p.split).length) out.split = p.split;
  if (Object.keys(p.collapsed).length) out.collapsed = p.collapsed;
  try {
    if (!Object.keys(out).length) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    // Private mode or a full quota: the layout still applies for this session.
  }
}

export function subscribePrefs(listener: () => void): () => void {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}

export function getPrefs(): Prefs {
  prefs ??= readPrefs();
  return prefs;
}

export function getServerPrefs(): Prefs {
  return NO_PREFS;
}

function setPrefs(next: Prefs) {
  prefs = next;
  persist();
  prefListeners.forEach((l) => l());
}

/** Set the controls pane's share for one tab (null restores the default) and persist it. */
export function setSplit(tab: SplitTab, f: number | null) {
  const p = getPrefs();
  const split = { ...p.split };
  if (f == null) delete split[tab];
  else split[tab] = clampSplit(f);
  setPrefs({ ...p, split });
}

/** Remember whether a rail section is collapsed. */
export function setCollapsed(id: string, collapsed: boolean) {
  const p = getPrefs();
  if (p.collapsed[id] === collapsed) return;
  setPrefs({ ...p, collapsed: { ...p.collapsed, [id]: collapsed } });
}
