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
  /** The input `triages` and `evidence` were computed from; lags the latest input while a run is in flight. */
  input: TriageInput | null;
  /** Set when the city-wide pass failed on the worker and on the main thread. */
  error: string | null;
}

const EMPTY: CityEval = { evals: null, triages: null, evidence: null, input: null, error: null };

/** A worker that has not answered a request in this long is treated as failed. */
const WORKER_TIMEOUT_MS = 20_000;

interface InFlight {
  rev: number;
  input: TriageInput;
  lots: Lot[];
  triages: Triages | null;
}

/**
 * Runs the city-wide evaluation off the main thread. Rules run once per lots array; triage and
 * evidence re-run whenever `input` changes. Each request carries a revision; only the in-flight
 * revision's parts are accepted, and once evidence exists a revision's triages and evidence are
 * published together, so the UI never mixes colors from one input with evidence from another.
 * Only the first load publishes in parts (evals, then triages) so the stats paint early.
 * If the worker cannot start, errors, or stalls, the same functions run on the main thread.
 * Findings and evidence come back slimmed (see slimEvaluations); call evaluateLot for one lot's full text.
 */
export function useCityEval(lots: Lot[], input: TriageInput | null): CityEval {
  const [state, setState] = useState<CityEval>(EMPTY);
  const worker = useRef<Worker | null>(null);
  const workerDown = useRef(false);
  const sentLots = useRef<Lot[] | null>(null);
  const evalsRef = useRef<{ lots: Lot[]; evals: Evaluations } | null>(null);
  const syncEvals = useRef<{ lots: Lot[]; evals: Evaluations } | null>(null);
  const inflight = useRef<InFlight | null>(null);
  const queued = useRef<{ input: TriageInput; lots: Lot[] } | null>(null);
  const hasEvidence = useRef(false);
  const rev = useRef(0);
  const watchdog = useRef<number | null>(null);
  const send = useRef<(inp: TriageInput, lots: Lot[]) => void>(() => {});

  useEffect(() => {
    const clearWatchdog = () => {
      if (watchdog.current != null) window.clearTimeout(watchdog.current);
      watchdog.current = null;
    };

    const next = () => {
      const q = queued.current;
      queued.current = null;
      if (q) send.current(q.input, q.lots);
    };

    const receive = (res: EvalResponse) => {
      const cur = inflight.current;
      if (!cur || res.seq !== cur.rev) return; // a stale revision
      if (res.part === "error") {
        fail(res.message);
        return;
      }
      if (res.part === "evals") {
        console.info(`[byright] evaluated ${cur.lots.length} lots × 5 home types × 2 rule sets in ${res.ms} ms`);
        evalsRef.current = { lots: cur.lots, evals: res.evals };
        if (!hasEvidence.current) setState((p) => ({ ...p, evals: res.evals, error: null }));
        return;
      }
      if (res.part === "triages") {
        cur.triages = res.triages;
        if (!hasEvidence.current) setState((p) => ({ ...p, evals: evalsRef.current?.evals ?? p.evals, triages: res.triages, error: null }));
        return;
      }
      clearWatchdog();
      hasEvidence.current = true;
      inflight.current = null;
      setState({ evals: evalsRef.current?.evals ?? null, triages: cur.triages, evidence: res.evidence, input: cur.input, error: null });
      next();
    };

    const runSync = (cur: InFlight) => {
      // Deferred a tick so the skeleton paints first.
      window.setTimeout(() => {
        if (inflight.current !== cur) return;
        try {
          let t = performance.now();
          if (syncEvals.current?.lots !== cur.lots) {
            syncEvals.current = { lots: cur.lots, evals: evaluateAll(cur.lots) };
            receive({ seq: cur.rev, part: "evals", evals: syncEvals.current.evals, ms: Math.round(performance.now() - t) });
            t = performance.now();
          }
          const ev = syncEvals.current.evals;
          const triages = triageAll(cur.lots, ev, cur.input);
          receive({ seq: cur.rev, part: "triages", triages, ms: Math.round(performance.now() - t) });
          receive({ seq: cur.rev, part: "evidence", evidence: evidenceAll(cur.lots, ev, triages, cur.input), ms: 0 });
        } catch (err) {
          inflight.current = null;
          setState((p) => ({ ...p, error: err instanceof Error ? err.message : String(err) }));
        }
      }, 0);
    };

    // The worker failed: stop using it and redo the in-flight request on the main thread.
    const fail = (why: string) => {
      console.warn(`[byright] evaluation worker failed (${why}); computing on the main thread`);
      clearWatchdog();
      workerDown.current = true;
      worker.current?.terminate();
      worker.current = null;
      sentLots.current = null;
      const cur = inflight.current;
      if (!cur) return;
      const retry: InFlight = { ...cur, rev: ++rev.current, triages: null };
      inflight.current = retry;
      runSync(retry);
    };

    const ensureWorker = (): Worker | null => {
      if (worker.current || workerDown.current || typeof Worker === "undefined") return worker.current;
      try {
        const w = new Worker(new URL("./eval.worker.ts", import.meta.url));
        w.onmessage = (e: MessageEvent<EvalResponse>) => receive(e.data);
        w.onerror = (e) => {
          e.preventDefault();
          fail(e.message || "worker error");
        };
        w.onmessageerror = () => fail("unreadable message");
        worker.current = w;
        return w;
      } catch (err) {
        workerDown.current = true;
        console.warn(`[byright] evaluation worker could not start (${err instanceof Error ? err.message : String(err)})`);
        return null;
      }
    };

    send.current = (inp, forLots) => {
      const cur: InFlight = { rev: ++rev.current, input: inp, lots: forLots, triages: null };
      inflight.current = cur;
      const w = ensureWorker();
      if (!w) {
        runSync(cur);
        return;
      }
      const req: EvalRequest = { ...inp, seq: cur.rev, lots: sentLots.current !== forLots ? forLots : undefined };
      try {
        w.postMessage(req);
        sentLots.current = forLots;
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        return;
      }
      clearWatchdog();
      watchdog.current = window.setTimeout(() => {
        if (inflight.current === cur) fail("no answer");
      }, WORKER_TIMEOUT_MS);
    };

    // Start the worker now so its boot overlaps the lots.json fetch.
    ensureWorker();

    return () => {
      clearWatchdog();
      worker.current?.terminate();
      worker.current = null;
      sentLots.current = null;
      inflight.current = null;
      queued.current = null;
    };
  }, []);

  useEffect(() => {
    if (!lots.length || !input) return;
    if (inflight.current) queued.current = { input, lots };
    else send.current(input, lots);
  }, [lots, input]);

  return lots.length ? state : EMPTY;
}
