import { createSolver, STEP_TIME_SLICE_MS } from "../lib/solver";
import type { SolveResult } from "../lib/solver";
import { VERIFY_BUDGET } from "../lib/draft";

export interface WorkerRequest {
  requestId: number;
  clues: number[][];
  resume: boolean;
  budget: number;
}

export interface WorkerResponse {
  requestId: number;
  result: SolveResult;
}

let controller: ReturnType<typeof createSolver> | null = null;
let lastCluesKey = "";

function cluesKey(clues: number[][]): string {
  return JSON.stringify(clues);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, clues, resume, budget } = event.data;
  const key = cluesKey(clues);
  if (!resume || !controller || key !== lastCluesKey) {
    controller = createSolver(clues);
    lastCluesKey = key;
  }
  const result = controller.step(
    budget ?? VERIFY_BUDGET,
    STEP_TIME_SLICE_MS,
  );
  const response: WorkerResponse = { requestId, result };
  (self as unknown as Worker).postMessage(response);
};
