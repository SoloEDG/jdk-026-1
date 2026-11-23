export type SolveStatus = "unique" | "multiple" | "unsolvable" | "timeout";

export interface SolveResult {
  status: SolveStatus;
  /** 最多保留两份解，网格按行展开为 0/1 */
  solutions: number[][];
  /** 两份解取值不同的格子下标，非多解时为空 */
  diff: number[];
  budgetUsed: number;
  elapsedMs: number;
}

export interface SolveOptions {
  budget?: number;
  deadlineMs?: number;
  signal?: { cancelled: boolean };
}

function now(): number {
  return globalThis.performance ? performance.now() : Date.now();
}

/** 单次 step 的墙钟时间片，超时即返回 timeout，绝不长时间阻塞 */
export const STEP_TIME_SLICE_MS = 150;

/** 生成一条线索在长度 n 内的全部位掩码排布，位 i 对应第 i 格 */
export function linePatterns(clue: number[], n: number): number[] {
  if (clue.length === 1 && clue[0] === 0) return [0];
  const out: number[] = [];
  const place = (idx: number, start: number, mask: number): void => {
    if (idx === clue.length) {
      out.push(mask);
      return;
    }
    const len = clue[idx];
    const left = clue.length - idx - 1;
    const tail =
      left === 0
        ? 0
        : left + clue.slice(idx + 1).reduce((sum, v) => sum + v, 0);
    for (let s = start; s + len + tail <= n; s++) {
      let m = mask;
      for (let j = 0; j < len; j++) m |= 1 << (s + j);
      place(idx + 1, s + len + 1, m);
    }
  };
  place(0, 0, 0);
  return out;
}

export interface SolverController {
  step: (extraBudget?: number, timeSliceMs?: number) => SolveResult;
  get result(): SolveResult | null;
  get done(): boolean;
}

interface Snapshot {
  rowDomains: number[][];
  colDomains: number[][];
}

/**
 * 可恢复的数织求解器（AC 式约束传播 + 最小域分支 + 显式回溯栈）。
 * 位约定统一：行掩码位 c = 第 c 列；列掩码位 r = 第 r 行。
 * 结论只有唯一解 / 多解 / 无解 / 超时；超时绝不等于唯一解。
 */
export function createSolver(clues: number[][]): SolverController {
  const n = clues.length / 2;
  const full = (1 << n) - 1;
  const initialRows = clues
    .slice(0, n)
    .map((clue) => linePatterns(clue, n));
  const initialCols = clues
    .slice(n)
    .map((clue) => linePatterns(clue, n));

  let rowDomains = initialRows.map((d) => [...d]);
  let colDomains = initialCols.map((d) => [...d]);
  const solutions: number[][] = [];
  let budgetUsed = 0;
  let stepWork = 0;
  let stepWorkLimit = Number.POSITIVE_INFINITY;
  const startedAt = now();
  let stepDeadline = Number.POSITIVE_INFINITY;
  let finished: SolveResult | null = null;

  // 显式回溯栈：每个分支保存分支前的完整域快照
  interface Frame {
    snapshot: Snapshot;
    orient: "row" | "col";
    line: number;
    options: number[];
    tried: number;
  }
  const stack: Frame[] = [];
  // 栈顶帧选择已应用、传播尚未收敛时为 true；超时后无回滚续跑
  let pending = false;

  const exceeded = (opts: SolveOptions): boolean => {
    // stepWork 统计本切片实际完成的工作量，快照回滚不会让它归零，
    // 因此每个切片都能推进固定工作量而不会在同一预算点反复超时
    if (stepWork >= stepWorkLimit) return true;
    if (opts.signal?.cancelled) return true;
    // 时间仅作为兜底：每 1024 个预算单位检查一次
    if ((budgetUsed & 1023) === 0 && now() >= stepDeadline) return true;
    return false;
  };

  const clone = (): Snapshot => ({
    rowDomains: rowDomains.map((d) => [...d]),
    colDomains: colDomains.map((d) => [...d]),
  });

  const restore = (s: Snapshot): void => {
    rowDomains = s.rowDomains.map((d) => [...d]);
    colDomains = s.colDomains.map((d) => [...d]);
  };

  /** 一组掩码的公共必填位（交集）与公共必空位（并集之外） */
  const forced = (domain: number[]): { fill: number; empty: number } => {
    let fill = full;
    let union = 0;
    for (const mask of domain) {
      fill &= mask;
      union |= mask;
    }
    return { fill, empty: full & ~union };
  };

  /**
   * 带时间片检查的域过滤：单条线候选很多时也不会一次阻塞超过切片。
   * 返回 null 表示时间片已到，调用方应作为 timeout 处理。
   */
  const filterDomain = (
    domain: number[],
    mustFill: number,
    mustEmpty: number,
  ): number[] | null => {
    const out: number[] = [];
    const length = domain.length;
    for (let i = 0; i < length; i++) {
      if ((i & 4095) === 0 && now() >= stepDeadline) return null;
      const m = domain[i];
      if ((m & mustEmpty) === 0 && (m & mustFill) === mustFill) out.push(m);
    }
    return out;
  };

  /**
   * 反复做对称弧相容：行域用列线索推出的强制格收窄，列域反之，
   * 两个方向都真正参与约束，直至任一侧不再变化或某域为空。
   * 返回 false 表示当前分支无解，"timeout" 表示预算耗尽。
   */
  const propagate = (opts: SolveOptions): boolean | "timeout" => {
    let changed = true;
    while (changed) {
      changed = false;
      // 由列域推出每一列在各行的强制状态
      const colForced = colDomains.map(forced);
      // 用列强制格收窄行域
      for (let r = 0; r < n; r++) {
        budgetUsed++;
        stepWork++;
        if (exceeded(opts)) return "timeout";
        let mustFill = 0;
        let mustEmpty = 0;
        for (let c = 0; c < n; c++) {
          if ((colForced[c].fill >> r) & 1) mustFill |= 1 << c;
          if ((colForced[c].empty >> r) & 1) mustEmpty |= 1 << c;
        }
        const before = rowDomains[r].length;
        const filtered = filterDomain(
          rowDomains[r],
          mustFill,
          mustEmpty,
        );
        if (filtered === null) return "timeout";
        if (!filtered.length) return false;
        rowDomains[r] = filtered;
        if (filtered.length !== before) changed = true;
      }
      // 由（已收窄的）行域推出每一行在各列的强制状态
      const rowForced = rowDomains.map(forced);
      // 用行强制格收窄列域
      for (let c = 0; c < n; c++) {
        budgetUsed++;
        stepWork++;
        if (exceeded(opts)) return "timeout";
        let mustFill = 0;
        let mustEmpty = 0;
        for (let r = 0; r < n; r++) {
          if ((rowForced[r].fill >> c) & 1) mustFill |= 1 << r;
          if ((rowForced[r].empty >> c) & 1) mustEmpty |= 1 << r;
        }
        const before = colDomains[c].length;
        const filtered = filterDomain(
          colDomains[c],
          mustFill,
          mustEmpty,
        );
        if (filtered === null) return "timeout";
        if (!filtered.length) return false;
        colDomains[c] = filtered;
        if (filtered.length !== before) changed = true;
      }
    }
    return true;
  };

  const isSolved = (): boolean => {
    if (!rowDomains.every((d) => d.length === 1)) return false;
    if (!colDomains.every((d) => d.length === 1)) return false;
    // 行单值与列单值必须在每个格子上一致
    for (let r = 0; r < n; r++) {
      const rowMask = rowDomains[r][0];
      for (let c = 0; c < n; c++) {
        const rowBit = (rowMask >> c) & 1;
        const colBit = (colDomains[c][0] >> r) & 1;
        if (rowBit !== colBit) return false;
      }
    }
    return true;
  };

  const extract = (): number[] => {
    const grid: number[] = [];
    for (let r = 0; r < n; r++) {
      const mask = rowDomains[r][0];
      for (let c = 0; c < n; c++) grid.push((mask >> c) & 1);
    }
    return grid;
  };

  const pick = (): Frame | null => {
    type Choice = {
      orient: "row" | "col";
      line: number;
      options: number[];
    };
    let choice: Choice | null = null;
    for (let r = 0; r < n; r++) {
      const d = rowDomains[r];
      if (d.length > 1 && (choice === null || d.length < choice.options.length))
        choice = { orient: "row", line: r, options: d };
    }
    for (let c = 0; c < n; c++) {
      const d = colDomains[c];
      if (d.length > 1 && (choice === null || d.length < choice.options.length))
        choice = { orient: "col", line: c, options: d };
    }
    if (choice === null) return null;
    return {
      snapshot: clone(),
      orient: choice.orient,
      line: choice.line,
      options: choice.options,
      tried: 0,
    };
  };

  const applyChoice = (frame: Frame): void => {
    const mask = frame.options[frame.tried];
    if (frame.orient === "row") rowDomains[frame.line] = [mask];
    else colDomains[frame.line] = [mask];
  };

  const backtrack = (): boolean => {
    while (stack.length) {
      const frame = stack[stack.length - 1];
      frame.tried++;
      if (frame.tried < frame.options.length) {
        restore(frame.snapshot);
        applyChoice(frame);
        // 新候选已应用，等待传播收敛
        pending = true;
        return true;
      }
      stack.pop();
    }
    pending = false;
    return false;
  };

  const build = (status: SolveStatus): SolveResult => {
    const diff: number[] = [];
    if (status === "multiple" && solutions.length === 2) {
      const [a, b] = solutions;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    }
    return {
      status,
      solutions: solutions.map((s) => [...s]),
      diff,
      budgetUsed,
      elapsedMs: now() - startedAt,
    };
  };

  const step = (
    extraBudget = Number.POSITIVE_INFINITY,
    timeSliceMs: number = STEP_TIME_SLICE_MS,
  ): SolveResult => {
    if (finished) return finished;
    // 每次 step 都是独立的时间片与独立工作量配额
    stepWork = 0;
    stepWorkLimit = extraBudget;
    stepDeadline = now() + timeSliceMs;
    const opts: SolveOptions = {};

    if (stack.length === 0 && solutions.length === 0 && !pending) {
      const initial = propagate(opts);
      if (initial === "timeout") return (finished = build("timeout"));
      if (initial === false) return (finished = build("unsolvable"));
    }

    while (true) {
      if (exceeded(opts)) return (finished = build("timeout"));

      if (isSolved()) {
        solutions.push(extract());
        pending = false;
        if (solutions.length === 2) return (finished = build("multiple"));
        if (!backtrack())
          return (finished = solutions.length
            ? build("unique")
            : build("unsolvable"));
        const outcome = propagate(opts);
        if (outcome === "timeout") return (finished = build("timeout"));
        if (outcome === false && !backtrack())
          return (finished = solutions.length
            ? build("unique")
            : build("unsolvable"));
        continue;
      }

      // 超时续跑（pending=true）：域是自洽超集，直接继续传播，不重新选帧
      if (!pending) {
        const frame = pick();
        if (!frame) {
          if (!backtrack())
            return (finished = solutions.length
              ? build("unique")
              : build("unsolvable"));
          continue;
        }
        stack.push(frame);
        applyChoice(frame);
      }
      pending = true;
      const outcome = propagate(opts);
      if (outcome === "timeout") {
        // 不回滚：已收窄的域仍是合法超集，保留栈顶帧下个切片继续传播
        return (finished = build("timeout"));
      }
      pending = false;
      if (outcome === false) {
        // 当前候选矛盾：backtrack 推进本帧下一候选（内部恢复快照），
        // 不能先 pop，否则本帧剩余候选被跳过
        if (!backtrack())
          return (finished = solutions.length
            ? build("unique")
            : build("unsolvable"));
      }
    }
  };

  return {
    step,
    get result() {
      return finished;
    },
    get done() {
      return finished !== null && finished.status !== "timeout";
    },
  };
}

/** 一次性求解；预算/时间耗尽返回 timeout，绝不误报为唯一解 */
export function solveNonogram(
  clues: number[][],
  options: SolveOptions = {},
): SolveResult {
  const controller = createSolver(clues);
  const startedAt = now();
  const budget = options.budget ?? Number.POSITIVE_INFINITY;
  const slice =
    options.deadlineMs !== undefined
      ? options.deadlineMs
      : STEP_TIME_SLICE_MS;
  let result = controller.step(budget, slice);
  let guard = 0;
  // 无预算上限时持续切片直到结论；有预算上限时单个 step 即按预算截止
  while (
    budget === Number.POSITIVE_INFINITY &&
    result.status === "timeout" &&
    !options.signal?.cancelled &&
    guard < 1_000_000 &&
    (options.deadlineMs === undefined ||
      now() - startedAt < options.deadlineMs)
  ) {
    result = controller.step(budget, slice);
    guard++;
  }
  return result;
}

/** 对比两份网格，返回取值不同的下标 */
export function diffGrids(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    if (a[i] !== b[i]) out.push(i);
  return out;
}
