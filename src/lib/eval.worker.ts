/// <reference lib="webworker" />
import type { Lot } from "./types";
import {
  evaluateAll,
  evidenceAll,
  slimEvaluations,
  slimEvidence,
  triageAll,
  type EvalRequest,
  type EvalResponse,
  type Evaluations,
} from "./evalCompute";

let lots: Lot[] = [];
let evals: Evaluations | null = null;

const post = (res: EvalResponse) => (self as unknown as Worker).postMessage(res);

// Payloads are slimmed: a structured clone of the full findings costs the main thread ~1 s to read.
self.onmessage = (e: MessageEvent<EvalRequest>) => {
  const req = e.data;
  try {
    let t = performance.now();
    if (req.lots) {
      lots = req.lots;
      evals = evaluateAll(lots);
      post({ seq: req.seq, part: "evals", evals: slimEvaluations(evals), ms: Math.round(performance.now() - t) });
      t = performance.now();
    }
    if (!evals) throw new Error("no lots evaluated yet");
    const triages = triageAll(lots, evals, req);
    post({ seq: req.seq, part: "triages", triages, ms: Math.round(performance.now() - t) });
    t = performance.now();
    const evidence = evidenceAll(lots, evals, triages, req);
    post({ seq: req.seq, part: "evidence", evidence: slimEvidence(evidence), ms: Math.round(performance.now() - t) });
  } catch (err) {
    post({ seq: req.seq, part: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
