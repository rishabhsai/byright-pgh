/// <reference lib="webworker" />
import { handleEvalRequest, type EvalRequest, type EvalResponse, type EvalWorkerState } from "./evalCompute";

const state: EvalWorkerState = { lots: [], evals: null };
const post = (res: EvalResponse) => (self as unknown as Worker).postMessage(res);

self.onmessage = (e: MessageEvent<EvalRequest>) => handleEvalRequest(state, e.data, post);
