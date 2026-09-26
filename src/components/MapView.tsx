"use client";
import { memo, useEffect, useRef, useState } from "react";
import {
  Map as MLMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { Lot, RuleSet, Typology, Verdict } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { VERDICT_COLOR, VERDICT_SHORT, VerdictLegend } from "./verdict";

// Turbopack cannot resolve MapLibre 6's module worker; serve a copy from /public.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const SORT: Record<Verdict, number> = { "by-right": 5, review: 4, variance: 3, prohibited: 2, unknown: 1 };

interface Props {
  lots: Lot[];
  verdicts: Verdict[];
  matches: boolean[];
  /** Lots whose verdicts differ between rule sets; ringed in gold when set. */
  changed: boolean[] | null;
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  flyTo: { lon: number; lat: number; seq: number } | null;
  colorBy: Typology | null;
  ruleSet: RuleSet;
}

type Hover = { x: number; y: number; i: number } | null;

type GeoData = Parameters<GeoJSONSource["setData"]>[0];

function buildData(lots: Lot[], verdicts: Verdict[], matches: boolean[], changed: boolean[] | null): GeoData {
  return {
    type: "FeatureCollection",
    features: lots.map((l, i) => {
      const v = verdicts[i] ?? "unknown";
      const m = matches[i] ? 1 : 0;
      const c = changed?.[i] && m ? 1 : 0;
      return {
        type: "Feature" as const,
        id: i,
        geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] },
        properties: { i, v, m, c, k: m * 10 + c * 6 + SORT[v] },
      };
    }),
  };
}

function MapView({ lots, verdicts, matches, changed, selectedIdx, onSelect, flyTo, colorBy, ruleSet }: Props) {
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
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("lots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "lots",
        type: "circle",
        source: "lots",
        layout: { "circle-sort-key": ["get", "k"] },
        paint: {
          "circle-color": [
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
          ],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 12, 3, 14, 5, 16, 8, 18, 12],
          "circle-opacity": ["case", ["==", ["get", "m"], 1], 0.9, 0.12],
          "circle-stroke-color": ["case", ["==", ["get", "c"], 1], "#e0a800", "#ffffff"],
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["case", ["==", ["get", "c"], 1], 0.5, 0],
            12,
            ["case", ["==", ["get", "c"], 1], 1, 0.3],
            14,
            ["case", ["==", ["get", "c"], 1], 2, 1],
            17,
            ["case", ["==", ["get", "c"], 1], 3, 1.5],
          ],
          "circle-stroke-opacity": ["case", ["==", ["get", "m"], 1], 0.95, 0.1],
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
        if (f) setHover({ x: e.point.x, y: e.point.y, i: f.properties.i as number });
      });
      map.on("mouseleave", "lots", () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
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
    (map.getSource("lots") as GeoJSONSource | undefined)?.setData(buildData(lots, verdicts, matches, changed));
  }, [ready, lots, verdicts, matches, changed]);

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
    map.flyTo({
      center: [flyTo.lon, flyTo.lat],
      zoom: Math.max(map.getZoom(), 16),
      speed: 1.4,
      curve: 1.5,
      essential: true,
    });
  }, [ready, flyTo]);

  const hl = hover ? lots[hover.i] : null;
  const hv = hover ? verdicts[hover.i] : null;

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
      {hl && hv && hover && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[260px] rounded-lg border border-hairline bg-panel/95 px-3 py-2 shadow-[0_6px_20px_-6px_rgba(23,33,30,.25)] backdrop-blur"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-[13px] font-medium text-ink">{hl.address || hl.id}</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {hl.neighborhood} <span className="text-faint">in</span> {hl.zone || "no zone"}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: VERDICT_COLOR[hv] }}>
            <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[hv] }} />
            <span className="font-medium">{VERDICT_SHORT[hv]}</span>
            <span className="text-muted">{colorBy ? `for ${TYPOLOGY_LABEL[colorBy].toLowerCase()}` : "best case"}</span>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-lg border border-hairline bg-panel/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="mb-1 text-[11px] text-muted">
          {colorBy ? `Colored by ${TYPOLOGY_LABEL[colorBy].toLowerCase()}` : "Colored by best verdict across five home types"}
          <span className={ruleSet === "current" ? "" : "font-medium text-[#7a5a00]"}>
            {ruleSet === "current" ? ", today's code" : ", with Bill 2025-1545"}
          </span>
        </div>
        <VerdictLegend />
        {changed && (
          <div className="fade-in mt-1.5 flex items-center gap-1.5 text-[11px] text-[#7a5a00]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#e0a800] bg-v-byright" />
            Gold ring: a verdict on this lot changes under the bill
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MapView);
