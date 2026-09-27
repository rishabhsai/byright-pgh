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
import type { Lot, RuleSet, Triage, Typology, Verdict } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import type { ColorMode } from "./ByRightApp";
import { TRIAGE_COLOR, TRIAGE_INK, TRIAGE_ORDER, TRIAGE_WORD, VERDICT_COLOR, VERDICT_ORDER } from "./verdict";
import Segmented from "./ui/Segmented";

// Turbopack cannot resolve MapLibre 6's module worker; serve a copy from /public.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const SORT: Record<Verdict, number> = { "by-right": 5, review: 4, variance: 3, prohibited: 2, unknown: 1 };
const TSORT: Record<Triage, number> = { green: 5, yellow: 4, red: 3, gray: 1 };

const VERDICT_PAINT: ExpressionSpecification = [
  "match",
  ["get", "v"],
  "by-right",
  VERDICT_COLOR["by-right"],
  "review",
  VERDICT_COLOR.review,
  "variance",
  VERDICT_COLOR.variance,
  "prohibited",
  VERDICT_COLOR.prohibited,
  VERDICT_COLOR.unknown,
];

const TRIAGE_PAINT: ExpressionSpecification = [
  "match",
  ["get", "t"],
  "green",
  TRIAGE_COLOR.green,
  "yellow",
  TRIAGE_COLOR.yellow,
  "red",
  TRIAGE_COLOR.red,
  TRIAGE_COLOR.gray,
];

/** [west, south, east, north] */
export type FitBounds = [number, number, number, number];

/** What the hover card says about a lot: one reason line, never two competing colors. */
export interface HoverInfo {
  lot: Lot;
  triage: Triage | null;
  /** The verdict the dot is colored by in verdict mode. */
  verdict: Verdict | null;
  line: string | null;
  /** Set when the detail panel shows a different proposal than the dot's color. */
  note: string | null;
}

interface Props {
  lots: Lot[];
  verdicts: Verdict[];
  triages: Triage[];
  colorMode: ColorMode;
  onColorMode: (m: ColorMode) => void;
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
}

type Hover = { x: number; y: number; i: number; w: number; h: number } | null;

type GeoData = Parameters<GeoJSONSource["setData"]>[0];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function buildData(
  lots: Lot[],
  verdicts: Verdict[],
  triages: Triage[],
  mode: ColorMode,
  matches: boolean[],
  changed: boolean[] | null,
): GeoData {
  return {
    type: "FeatureCollection",
    features: lots.map((l, i) => {
      const v = verdicts[i] ?? "unknown";
      const t = triages[i] ?? "gray";
      const m = matches[i] ? 1 : 0;
      const c = changed?.[i] && m ? 1 : 0;
      return {
        type: "Feature" as const,
        id: i,
        geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
        properties: { i, v, t, m, c, k: c * 6 + (mode === "triage" ? TSORT[t] : SORT[v]) },
      };
    }),
  };
}

// ≈3.5 px at the opening zoom (11.5), 6 px at 14.
const RADIUS: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 9, 2, 11.5, 3.5, 14, 6, 16, 9, 18, 13];
const MATCHED: ExpressionSpecification = ["==", ["get", "m"], 1];
const RINGED: ExpressionSpecification = ["==", ["get", "c"], 1];

const STRIP_VERDICT: Record<Verdict, string> = {
  "by-right": "Allowed",
  review: "Staff approval",
  variance: "Hearing",
  prohibited: "Not allowed",
  unknown: "Not checked",
};

const STRIP_TRIAGE: Record<Triage, string> = {
  green: "Ready",
  yellow: "Needs money or hearing",
  red: "Blocked",
  gray: "Not checked",
};

function MapView({
  lots,
  verdicts,
  triages,
  colorMode,
  onColorMode,
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
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("lots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Filtered-out lots stay as faint context but take no pointer events (no listeners on this layer).
      map.addLayer({
        id: "lots-ghost",
        type: "circle",
        source: "lots",
        filter: ["!", MATCHED],
        paint: {
          "circle-color": "#8a938e",
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
          "circle-color": TRIAGE_PAINT,
          "circle-radius": RADIUS,
          "circle-opacity": 0.85,
          "circle-stroke-color": ["case", RINGED, "#e0a800", "#ffffff"],
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
          "circle-color": "#0d5c5a",
          "circle-opacity": 0.14,
          "circle-stroke-color": "#0d5c5a",
          "circle-stroke-width": 2,
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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("lots") as GeoJSONSource | undefined)?.setData(
      buildData(lots, verdicts, triages, colorMode, matches, changed),
    );
    map.setPaintProperty("lots", "circle-color", colorMode === "triage" ? TRIAGE_PAINT : VERDICT_PAINT);
  }, [ready, lots, verdicts, triages, colorMode, matches, changed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const l = selectedIdx != null ? lots[selectedIdx] : null;
    const data = {
      type: "FeatureCollection",
      features: l
        ? [{ type: "Feature", geometry: { type: "Point", coordinates: [l.lon, l.lat] }, properties: {} }]
        : [],
    } as GeoData;
    (map.getSource("sel") as GeoJSONSource | undefined)?.setData(data);
  }, [ready, selectedIdx, lots]);

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
  const changedCount = useMemo(() => (changed ? changed.reduce((n, c, i) => (c && matches[i] ? n + 1 : n), 0) : 0), [changed, matches]);
  const width = hover?.w ?? 0;
  const flip = hover != null && width > 0 && hover.x > width - 290;
  const above = hover != null && hover.h > 0 && hover.y > hover.h - 150;

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
      {info && hover && (
        <div
          className="pointer-events-none absolute z-20 w-max max-w-[300px] rounded-lg border border-hairline bg-panel/95 px-3 py-2 shadow-[0_6px_20px_-6px_rgba(23,33,30,.25)] backdrop-blur"
          style={{
            ...(flip ? { right: width - hover.x + 14 } : { left: hover.x + 14 }),
            ...(above ? { bottom: hover.h - hover.y + 14 } : { top: hover.y + 14 }),
          }}
        >
          <div className="text-[13px] leading-snug font-medium text-ink">{info.lot.address || info.lot.id}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
            <span className="tabular-nums">{info.lot.zone || "No zone"}</span>
            {colorMode === "verdict" && info.verdict && (
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[info.verdict] }} />
                {STRIP_VERDICT[info.verdict]}
              </span>
            )}
            {colorMode === "triage" && info.triage && (
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: TRIAGE_INK[info.triage] }}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TRIAGE_COLOR[info.triage] }} />
                {TRIAGE_WORD[info.triage]}
              </span>
            )}
          </div>
          {info.line ? (
            <div className="mt-1 text-[12px] leading-4 text-ink">{info.line}</div>
          ) : (
            <div className="mt-1 text-[12px] text-faint">Evaluating…</div>
          )}
          {info.note && <div className="mt-1 text-[12px] leading-4 text-[#7a5400]">{info.note}</div>}
        </div>
      )}
      {changed && !loading && (changedCount > 0 || ringNote) && (
        <div className="fade-in absolute bottom-[52px] left-3 z-10 flex max-w-[calc(100%-24px)] items-center gap-1.5 rounded-md border border-gold/50 bg-gold-soft/95 px-2 py-1 text-[11px] text-[#6b5200] shadow-sm">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full border-2 border-[#e0a800]/70" />
          <span>
            {changedCount > 0
              ? `Gold ring: ${colorBy ? `${TYPOLOGY_LABEL[colorBy].toLowerCase()} verdict` : "best verdict"} or triage changes if the bill passes (${changedCount.toLocaleString("en-US")} lots)`
              : `The bill changes no ${colorBy ? `${TYPOLOGY_LABEL[colorBy].toLowerCase()} verdict` : "best verdict"} or triage here. ${ringNote}`}
          </span>
        </div>
      )}
      <div
        className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-56px)] items-center gap-3 overflow-hidden rounded-lg border border-hairline bg-panel/95 py-1 pr-3 pl-1 whitespace-nowrap shadow-sm backdrop-blur"
        title={
          colorMode === "triage"
            ? `Can it be built, and does it pay for itself${colorBy ? ` as a ${TYPOLOGY_LABEL[colorBy].toLowerCase()}` : ""}; ${ruleSet === "current" ? "today's code" : "with Bill 2025-1545"}`
            : `${colorBy ? `${TYPOLOGY_LABEL[colorBy]} verdict` : "Best verdict across five home types"}; ${ruleSet === "current" ? "today's code" : "with Bill 2025-1545"}`
        }
      >
        <Segmented<ColorMode>
          label="Color the map by"
          value={colorMode}
          onChange={onColorMode}
          className="shrink-0"
          options={[
            { value: "triage", label: "Triage" },
            { value: "verdict", label: colorBy ? TYPOLOGY_LABEL[colorBy].replace("House + backyard unit", "+ADU") : "Verdict" },
          ]}
        />
        {loading ? (
          <span className="text-[12px] text-muted">Evaluating 11,000+ lots…</span>
        ) : (
          <ul aria-label="Legend" className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted">
            {colorMode === "triage"
              ? TRIAGE_ORDER.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TRIAGE_COLOR[t] }} />
                    {STRIP_TRIAGE[t]}
                  </li>
                ))
              : VERDICT_ORDER.map((v) => (
                  <li key={v} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[v] }} />
                    {STRIP_VERDICT[v]}
                  </li>
                ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(MapView);
