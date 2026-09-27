/// <reference lib="webworker" />
import {
  handleEvalRequest,
  handleReformRequest,
  isReformRequest,
  type EvalResponse,
  type EvalWorkerState,
  type ReformResponse,
  type WorkerRequest,
} from "./evalCompute";

const state: EvalWorkerState = { lots: [], evals: null };
const post = (res: EvalResponse | ReformResponse) => (self as unknown as Worker).postMessage(res);

self.onmessage = (e: MessageEvent<WorkerRequest>) =>
  isReformRequest(e.data) ? handleReformRequest(state, e.data, post) : handleEvalRequest(state, e.data, post);
