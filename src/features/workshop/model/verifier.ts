import {
  createSolver,
  STEP_TIME_SLICE_MS,
  type SolveResult,
  type SolverController,
} from "../lib/solver";
import { VERIFY_BUDGET } from "../lib/draft";
import type { WorkerRequest, WorkerResponse } from "./solver.worker";

type Listener = (result: SolveResult | null) => void;

/**
 * 验证执行器：优先 Web Worker（不阻塞界面），不支持时退回主线程分片。
 * 每个请求都绑定 requestId 与画稿 contentKey，过期结果一律丢弃，
 * 旧验证结论绝不可能批准新画稿。
 */
export class Verifier {
  private worker: Worker | null = null;
  private fallback: SolverController | null = null;
  private fallbackKey = "";
  private requestId = 0;
  private listeners = new Set<Listener>();

  constructor() {
    if (typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.requestId !== this.requestId) return;
          this.emit(event.data.result);
        };
        this.worker.onerror = () => {
          this.worker?.terminate();
          this.worker = null;
        };
      } catch {
        this.worker = null;
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(result: SolveResult | null): void {
    this.listeners.forEach((l) => l(result));
  }

  /** 取消当前验证（不会产生任何可发布结论） */
  cancel(): void {
    this.requestId++;
    this.fallback = null;
    this.emit(null);
  }

  run(clues: number[][], resume = false): number {
    const id = ++this.requestId;
    if (this.worker) {
      const request: WorkerRequest = {
        requestId: id,
        clues,
        resume,
        budget: VERIFY_BUDGET,
      };
      this.worker.postMessage(request);
      return id;
    }
    this.runOnMainThread(id, clues, resume);
    return id;
  }

  private runOnMainThread(
    id: number,
    clues: number[][],
    resume: boolean,
  ): void {
    const key = JSON.stringify(clues);
    if (!resume || !this.fallback || this.fallbackKey !== key) {
      this.fallback = createSolver(clues);
      this.fallbackKey = key;
    }
    // 让浏览器在每片之间喘口气，保持大画稿编辑时的响应速度
    window.setTimeout(() => {
      if (id !== this.requestId || !this.fallback) return;
      const result = this.fallback.step(
        VERIFY_BUDGET,
        STEP_TIME_SLICE_MS,
      );
      if (id !== this.requestId) return;
      this.emit(result);
    }, 0);
  }
}
