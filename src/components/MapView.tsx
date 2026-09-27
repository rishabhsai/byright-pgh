"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MLMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import type { Lot, RuleSet, Triage, Typology } from "@/lib/types";
import { TRIAGE_LABEL, TYPOLOGY_LABEL } from "@/lib/types";
import { TRIAGE_COLOR, TRIAGE_INK, TRIAGE_ORDER, TRIAGE_WORD } from "./verdict";

// Turbopack cannot resolve MapLibre 6's module worker; serve a copy from /public.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const TSORT: Record<Triage, number> = { green: 5, yellow: 4, red: 3, gray: 1 };

/** [west, south, east, north] */
export type FitBounds = [number, number, number, number];

/** What the hover card says about a lot: one reason line, never two competing colors. */
export interface HoverInfo {
  lot: Lot;
  triage: Triage | null;
  line: string | null;
  /** Set when the detail panel shows a different proposal than the dot's color. */
  note: string | null;
}

interface Props {
  lots: Lot[];
  triages: Triage[];
  matches: boolean[];
  /** Lots whose best verdict or triage changes under the bill; ringed in gold when set. */
  changed: boolean[] | null;
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  flyTo: { lon: number; lat: number; seq: number } | null;
  fitTo: { bounds: FitBounds; seq: number } | null;
  colorBy: Typology | null;
  ruleSet: RuleSet;
  hoverInfo: (i: number) => HoverInfo | null;
  /** Extra line for the bill's ring note, e.g. how to see lots that gain an ADU. */
  ringNote: string | null;
  /** The city-wide evaluation is still running: every dot is gray. */
  loading: boolean;
  /** Reform tab: color every lot by its scenario outcome against today instead of triage. */
  reform?: ReformPaint | null;
}

/** Per lot: 0 unchanged, 1 newly allowed, 2 newly a candidate, 3 lost (reform/engine SHIFT_CODE). */
export interface ReformPaint {
  codes: Uint8Array;
  label: string;
  pending: boolean;
  /** Under the legend: what the lot colors leave out (a lever that only adds home types on allowed lots). */
  note?: string | null;
}

const REFORM_LEGEND: { code: number; label: string; color: string }[] = [
  { code: 2, label: "Newly a candidate", color: "var(--color-success-ink)" },
  { code: 1, label: "Newly allowed", color: "var(--color-v-byright)" },
  { code: 3, label: "No longer allowed", color: "var(--color-v-prohibited)" },
  { code: 0, label: "Unchanged", color: "var(--color-control-edge)" },
];

type Hover = { x: number; y: number; i: number; w: number; h: number } | null;

const fmtN = (n: number) => n.toLocaleString("en-US");

type GeoData = Parameters<GeoJSONSource["setData"]>[0];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function buildData(
  lots: Lot[],
  triages: Triage[],
  matches: boolean[],
  changed: boolean[] | null,
  reform: Uint8Array | null,
): GeoData {
  return {
    type: "FeatureCollection",
    features: lots.map((l, i) => {
      const t = triages[i] ?? "gray";
      const m = matches[i] ? 1 : 0;
      const c = changed?.[i] && m ? 1 : 0;
      // r: the reform outcome code, -1 outside the Reform tab. Changed lots sort above unchanged ones.
      const r = reform ? (reform[i] ?? 0) : -1;
      return {
        type: "Feature" as const,
        id: i,
        geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
        properties: { i, t, m, c, r, k: reform ? (r === 0 ? 0 : 10 + r) : c * 6 + TSORT[t] },
      };
    }),
  };
}

// ≈3.5 px at the opening zoom (11.5), 6 px at 14.
const RADIUS: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 9, 2, 11.5, 3.5, 14, 6, 16, 9, 18, 13];
const MATCHED: ExpressionSpecification = ["==", ["get", "m"], 1];
const RINGED: ExpressionSpecification = ["==", ["get", "c"], 1];
const REFORM_ON: ExpressionSpecification = [">=", ["get", "r"], 0];
const REFORM_MOVED: ExpressionSpecification = [">", ["get", "r"], 0];
// One zoom curve for both modes (MapLibre allows a single zoom interpolate per expression). In the Reform tab,
// moved lots draw a step larger than unchanged ones so the change reads at city zoom.
const at = (triage: number, moved: number, same: number): ExpressionSpecification => ["case", REFORM_MOVED, moved, REFORM_ON, same, triage];
const LOT_RADIUS: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 9, at(2, 3, 1.5), 11.5, at(3.5, 4.5, 2.5), 14, at(6, 7, 5), 16, at(9, 10, 8), 18, at(13, 14, 12)];

/** Legend words: the lib's TRIAGE_LABEL, so the map, the header and About say the same thing. */
const STRIP_TRIAGE: Record<Triage, string> = TRIAGE_LABEL;

function MapView({
  lots,
  triages,
  matches,
  changed,
  selectedIdx,
  onSelect,
  flyTo,
  fitTo,
  colorBy,
  ruleSet,
  hoverInfo,
  ringNote,
  loading,
  reform = null,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!el.current) return;
    const palette = getComputedStyle(document.documentElement);
    const color = (name: string) => palette.getPropertyValue(`--color-${name}`).trim();
    const triageOnly: ExpressionSpecification = [
      "match", ["get", "t"],
      "green", color("v-byright"),
      "yellow", color("v-variance"),
      "red", color("v-prohibited"),
      color("v-unknown"),
    ];
    const triagePaint: ExpressionSpecification = [
      "case",
      REFORM_ON,
      ["match", ["get", "r"], 1, color("v-byright"), 2, color("success-ink"), 3, color("v-prohibited"), color("control-edge")],
      triageOnly,
    ];
    const map = new MLMap({
      container: el.current,
      style: STYLE_URL,
      center: [-79.99, 40.44],
      zoom: 11.5,
      minZoom: 9,
      maxZoom: 19,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      // Resized below, once per frame, so the canvas follows the pane handles while they are dragged.
      trackResize: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // Compact attribution opens expanded; fold it to its (i) button so it never sits under the legend strip.
    const foldAttribution = () =>
      map.getContainer().querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")?.classList.remove("maplibregl-compact-show");
    map.once("idle", foldAttribution);
    map.on("resize", foldAttribution);

    map.on("load", () => {
      foldAttribution();
      map.addSource("lots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Filtered-out lots stay as faint context but take no pointer events (no listeners on this layer).
      map.addLayer({
        id: "lots-ghost",
        type: "circle",
        source: "lots",
        filter: ["!", MATCHED],
        paint: {
          "circle-color": color("faint"),
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1, 11.5, 1.8, 14, 3, 18, 6],
          "circle-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "lots",
        type: "circle",
        source: "lots",
        filter: MATCHED,
        layout: { "circle-sort-key": ["get", "k"] },
        paint: {
          "circle-color": triagePaint,
          "circle-radius": LOT_RADIUS,
          "circle-opacity": ["case", REFORM_ON, ["case", REFORM_MOVED, 0.95, 0.55], 0.85],
          "circle-stroke-color": ["case", RINGED, color("v-variance"), color("panel")],
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", RINGED, 1, 0],
            12,
            ["case", RINGED, 1.4, 0.4],
            14,
            ["case", RINGED, 1.8, 1],
            17,
            ["case", RINGED, 2.4, 1.5],
          ],
          "circle-stroke-opacity": ["case", RINGED, 0.5, 0.9],
        },
      });
      map.addLayer({
        id: "sel-halo",
        type: "circle",
        source: "sel",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 14, 18, 24],
          "circle-color": color("accent"),
          "circle-opacity": 0.14,
          "circle-stroke-color": color("accent"),
          "circle-stroke-width": 2,
        },
      });
      // The selected lot always draws in its triage color, even when the filters ghost it.
      map.addLayer({
        id: "sel-dot",
        type: "circle",
        source: "sel",
        paint: {
          "circle-color": triagePaint,
          "circle-radius": RADIUS,
          "circle-stroke-color": color("panel"),
          "circle-stroke-width": 1.5,
        },
      });
      map.on("click", "lots", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (f) onSelectRef.current(f.properties.i as number);
      });
      map.on("mousemove", "lots", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        map.getCanvas().style.cursor = "pointer";
        if (f) setHover({ x: e.point.x, y: e.point.y, i: f.properties.i as number, w: map.getCanvas().clientWidth, h: map.getCanvas().clientHeight });
      });
      map.on("mouseleave", "lots", () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
      map.on("movestart", () => setHover(null));
      setReady(true);
    });

    let frame = 0;
    const resizer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        map.resize();
        map.redraw();
      });
    });
    resizer.observe(el.current);

    return () => {
      resizer.disconnect();
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("lots") as GeoJSONSource | undefined)?.setData(buildData(lots, triages, matches, changed, reform?.codes ?? null));
  }, [ready, lots, triages, matches, changed, reform?.codes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const l = selectedIdx != null ? lots[selectedIdx] : null;
    const data = {
      type: "FeatureCollection",
      features: l
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [l.lon, l.lat] },
              properties: { t: triages[selectedIdx!] ?? "gray", r: reform ? (reform.codes[selectedIdx!] ?? 0) : -1 },
            },
          ]
        : [],
    } as GeoData;
    (map.getSource("sel") as GeoJSONSource | undefined)?.setData(data);
  }, [ready, selectedIdx, lots, triages, reform]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !flyTo) return;
    const center: [number, number] = [flyTo.lon, flyTo.lat];
    const zoom = Math.max(map.getZoom(), 16);
    if (reducedMotion()) map.jumpTo({ center, zoom });
    else map.flyTo({ center, zoom, speed: 1.4, curve: 1.5 });
  }, [ready, flyTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !fitTo) return;
    const [w, s, e, n] = fitTo.bounds;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 40, maxZoom: 15, duration: reducedMotion() ? 0 : 600 },
    );
  }, [ready, fitTo]);

  const info = hover ? hoverInfo(hover.i) : null;
  const reformCounts = useMemo(() => {
    const n = [0, 0, 0, 0];
    if (reform) for (const c of reform.codes) n[c]++;
    return n;
  }, [reform]);
  const changedCount = useMemo(() => (changed ? changed.reduce((n, c, i) => (c && matches[i] ? n + 1 : n), 0) : 0), [changed, matches]);
  const width = hover?.w ?? 0;
  const flip = hover != null && width > 0 && hover.x > width - 290;
  const above = hover != null && hover.h > 0 && hover.y > hover.h - 150;

  return (
    <div className="map-overlays">
      <div ref={el} className="h-full w-full" style={{ position: "absolute", inset: 0 }} />
      {info && hover && (
        <div
          className="pointer-events-none absolute z-20 w-max max-w-[300px] surface-card px-4 py-3 shadow-overlay"
          style={{
            ...(flip ? { right: width - hover.x + 14 } : { left: hover.x + 14 }),
            ...(above ? { bottom: hover.h - hover.y + 14 } : { top: hover.y + 14 }),
          }}
        >
          <div className="text-callout font-medium text-ink">{info.lot.address || info.lot.id}</div>
          <div className="mt-0.5 flex items-center gap-2 text-caption text-muted">
            <span className="tabular-nums">{info.lot.zone || "No zone"}</span>
            {info.triage && (
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: TRIAGE_INK[info.triage] }}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TRIAGE_COLOR[info.triage] }} />
                {TRIAGE_WORD[info.triage]}
              </span>
            )}
          </div>
          {info.line ? (
            <div className="mt-1 text-caption text-ink">{info.line}</div>
          ) : (
            <div className="mt-1 text-caption text-faint">Evaluating…</div>
          )}
          {info.note && <div className="mt-1 text-caption text-warning-ink">{info.note}</div>}
        </div>
      )}
      {changed && !loading && (changedCount > 0 || ringNote) && (
        <div className="fade-in map-scenario z-10 flex items-center gap-2 px-4 py-3 text-caption text-warning-ink">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full border-2 border-v-variance/70" />
          <span>
            {changedCount > 0
              ? `Gold ring: ${colorBy ? `${TYPOLOGY_LABEL[colorBy].toLowerCase()} verdict` : "best verdict"} or triage changes if the bill passes (${changedCount.toLocaleString("en-US")} lots)`
              : `The bill changes no ${colorBy ? `${TYPOLOGY_LABEL[colorBy].toLowerCase()} verdict` : "best verdict"} or triage here. ${ringNote}`}
          </span>
        </div>
      )}
      {reform ? (
        <div className="map-legend z-10 rounded-card px-5 py-3" title={`Each City lot under “${reform.label}” against today's code: use table, minimum lot size and LNC FAR`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="shrink-0 text-caption font-medium text-ink">
              Lot eligibility (any home type)
              <span className="font-normal text-muted"> · {reform.label}</span>
            </span>
            {reform.pending ? (
              <span aria-live="polite" className="text-caption text-muted">Recomputing…</span>
            ) : null}
            <ul aria-label="Legend" className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted ${reform.pending ? "opacity-60" : ""}`}>
              <li className="inline-flex flex-wrap items-center gap-x-1.5 whitespace-nowrap">
                Gained <span className="font-medium text-ink tabular-nums">{fmtN(reformCounts[1] + reformCounts[2])}</span> =
                <span aria-hidden className="ml-0.5 h-2 w-2 rounded-full" style={{ background: "var(--color-v-byright)" }} />
                <span className="text-ink tabular-nums">{fmtN(reformCounts[1])}</span> newly allowed +
                <span aria-hidden className="ml-0.5 h-2 w-2 rounded-full" style={{ background: "var(--color-success-ink)" }} />
                <span className="text-ink tabular-nums">{fmtN(reformCounts[2])}</span> newly candidates
              </li>
              {REFORM_LEGEND.filter((x) => x.code === 3 || x.code === 0).map((x) => (
                <li key={x.code} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: x.color }} />
                  {x.label}
                  <span className="text-ink tabular-nums">{fmtN(reformCounts[x.code])}</span>
                </li>
              ))}
            </ul>
          </div>
          {reform.note && <p className="mt-1.5 text-caption text-muted">{reform.note}</p>}
        </div>
      ) : (
        <div
          className="map-legend z-10 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
          title={`Triage for ${colorBy ? `a ${TYPOLOGY_LABEL[colorBy].toLowerCase()} (Home type filter)` : "each lot's best home type"}; ${ruleSet === "current" ? "today's code" : "with Bill 2025-1545"}`}
        >
          <span className="shrink-0 text-caption font-medium text-ink">{colorBy ? TYPOLOGY_LABEL[colorBy] : "Best home type"}</span>
          {loading ? (
            <span className="text-caption text-muted">Evaluating 11,000+ lots…</span>
          ) : (
            <ul
              aria-label="Legend"
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted"
            >
              {TRIAGE_ORDER.map((t) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: TRIAGE_COLOR[t] }}
                  />
                  {STRIP_TRIAGE[t]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(MapView);
