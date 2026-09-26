"use client";
import { useEffect, useRef, useState } from "react";
import type { Lot } from "./types";
import {
  evaluateAll,
  evidenceAll,
  triageAll,
  type EvalRequest,
  type EvalResponse,
  type Evaluations,
  type EvidenceByRuleSet,
  type Triages,
  type TriageInput,
} from "./evalCompute";

export interface CityEval {
  evals: Evaluations | null;
  triages: Triages | null;
  evidence: EvidenceByRuleSet | null;
  /** The input the evidence (the last part) was computed from; lags the latest input while a run is in flight. */
  input: TriageInput | null;
}

const EMPTY: CityEval = { evals: null, triages: null, evidence: null, input: null };

/**
 * Runs the city-wide evaluation off the main thread. Rules run once per lots array; triage and
 * evidence re-run whenever `input` changes. Latest input wins: while a run is in flight only the
 * newest pending input is kept. Findings and evidence come back slimmed (see slimEvaluations);
 * call evaluateLot for one lot's full text. Falls back to the main thread without Worker.
 */
export function useCityEval(lots: Lot[], input: TriageInput | null): CityEval {
  const [state, setState] = useState<CityEval>(EMPTY);
  const worker = useRef<Worker | null>(null);
  const sentLots = useRef<Lot[] | null>(null);
  const syncEvals = useRef<Evaluations | null>(null);
  const busy = useRef(false);
  const queued = useRef<TriageInput | null>(null);
  const inputs = useRef(new Map<number, TriageInput>());
  const seq = useRef(0);
  const sendRef = useRef<(inp: TriageInput) => void>(() => {});

  // Start the worker on mount so its boot overlaps the lots.json fetch.
  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const w = new Worker(new URL("./eval.worker.ts", import.meta.url));
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
      sentLots.current = null;
      busy.current = false;
    };
  }, []);

  useEffect(() => {
    if (!lots.length || !input) return;

    const receive = (res: EvalResponse) => {
      if (res.part === "evals") {
        console.info(`[byright] evaluated ${lots.length} lots × 5 home types × 2 rule sets in ${res.ms} ms (worker)`);
        setState((prev) => ({ ...prev, evals: res.evals }));
        return;
      }
      if (res.part === "triages") {
        setState((prev) => ({ ...prev, triages: res.triages }));
        return;
      }
      const inp = inputs.current.get(res.seq) ?? null;
      inputs.current.delete(res.seq);
      setState((prev) => ({ ...prev, evidence: res.evidence, input: inp }));
      busy.current = false;
      const next = queued.current;
      queued.current = null;
      if (next) sendRef.current(next);
    };

    sendRef.current = (inp: TriageInput) => {
      busy.current = true;
      const s = ++seq.current;
      inputs.current.set(s, inp);
      const withLots = sentLots.current !== lots;
      sentLots.current = lots;
      const req: EvalRequest = { ...inp, seq: s, lots: withLots ? lots : undefined };

      const w = worker.current;
      if (w) {
        w.onmessage = (e: MessageEvent<EvalResponse>) => receive(e.data);
        w.postMessage(req);
        return;
      }
      // Synchronous fallback, deferred a tick so the skeleton paints first.
      setTimeout(() => {
        let t = performance.now();
        if (req.lots) {
          syncEvals.current = evaluateAll(req.lots);
          receive({ seq: s, part: "evals", evals: syncEvals.current, ms: Math.round(performance.now() - t) });
          t = performance.now();
        }
        const ev = syncEvals.current!;
        const triages = triageAll(lots, ev, req);
        receive({ seq: s, part: "triages", triages, ms: Math.round(performance.now() - t) });
        t = performance.now();
        receive({ seq: s, part: "evidence", evidence: evidenceAll(lots, ev, triages, req), ms: Math.round(performance.now() - t) });
      }, 0);
    };

    if (busy.current) queued.current = input;
    else sendRef.current(input);
  }, [lots, input]);

  return lots.length ? state : EMPTY;
}
