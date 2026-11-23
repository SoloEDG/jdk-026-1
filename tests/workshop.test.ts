import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createSolver,
  linePatterns,
  solveNonogram,
  diffGrids,
} from "../src/features/workshop/lib/solver";
import { clueSet, runs } from "../src/shared/clues";
import { puzzles as builtinPuzzles } from "../src/features/catalog/model/puzzles";
import {
  contentKey,
  draftKey,
  resizeDraft,
  toggleCell,
  createDraftHelper,
  filledCount,
} from "./workshop.helpers";
import {
  publishDraft,
  versionToPuzzle,
  allVersionPuzzles,
} from "../src/features/workshop/model/publishedStore";
import type { Draft, Puzzle } from "../src/shared/types";

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});

function gridFromRows(rows: string[]): number[] {
  return rows.join("").split("").map(Number);
}

test("linePatterns enumerates every placement respecting gaps", () => {
  assert.deepEqual(linePatterns([0], 3), [0]);
  assert.deepEqual(linePatterns([3], 3), [0b111]);
  // 位 i 对应第 i 格；长度 1 的线索在 3 格中有三种位置：位 0、位 1、位 2
  assert.deepEqual(linePatterns([1], 3).sort((a, b) => a - b), [
    0b001,
    0b010,
    0b100,
  ]);
  // [2] 在长度 3 中有两种相邻位置
  assert.deepEqual(linePatterns([2], 3).sort((a, b) => a - b), [
    0b011,
    0b110,
  ]);
  // 1 1 在长度 4 中：两段之间至少一个空格，共 3 种合法排布
  assert.deepEqual(linePatterns([1, 1], 4).sort((a, b) => a - b), [
    0b0101,
    0b1001,
    0b1010,
  ]);
  // 每个排布两段之间确实至少隔一个空格
  for (const mask of linePatterns([1, 1], 4)) {
    const bits = [0, 1, 2, 3].map((i) => (mask >> i) & 1);
    const gap = bits.some((v, i) => v === 1 && bits[i + 1] === 1) === false;
    assert.ok(gap);
  }
});

test("a uniquely solvable drawing returns unique with its own grid", () => {
  const n = 5;
  const rows = ["01010", "11111", "11111", "01110", "00100"];
  const solution = gridFromRows(rows);
  const clues = clueSet(n, solution);
  const result = solveNonogram(clues);
  assert.equal(result.status, "unique");
  assert.equal(result.solutions.length, 1);
  assert.deepEqual(result.solutions[0], solution);
  assert.deepEqual(result.diff, []);
});

test("a blank 2x2-style ambiguous drawing is detected as multiple with a diff", () => {
  // 5x5 单格图案：同一线索（每行/列只可能是 1 或 0 的极简组合）天然多解。
  // 这里用两行各一段但列无法定位的结构构造多解：全空行线索为 0，
  // 两个 1x1 黑点放在不同列仍满足同样行线索——直接手工构造线索：
  // 行线索：第一行 [1]，其余 [0]；列线索全部 [0] 会无解，
  // 因此采用更稳妥的 2x2 棋盘多解（线索全为 [1]）。
  const n = 2;
  const clues: number[][] = [
    [1],
    [1],
    [1],
    [1],
  ];
  const result = solveNonogram(clues);
  assert.equal(result.status, "multiple");
  assert.equal(result.solutions.length, 2);
  assert.ok(result.diff.length > 0);
  assert.deepEqual(
    diffGrids(result.solutions[0], result.solutions[1]),
    result.diff,
  );
  // 两份解确实都满足线索
  for (const solution of result.solutions) {
    const derived = clueSet(n, solution);
    assert.deepEqual(derived, clues);
  }
});

test("contradictory clues are reported as unsolvable, never as unique", () => {
  // 行要求整行填满，列却要求全空
  const clues: number[][] = [
    [3],
    [3],
    [3],
    [0],
    [0],
    [0],
  ];
  const result = solveNonogram(clues);
  assert.equal(result.status, "unsolvable");
  assert.equal(result.solutions.length, 0);
});

test("budget exhaustion yields timeout, which must not be mistaken for unique", () => {
  // 15x15 全 [1] 行/列是组合爆炸场景；给极小预算强制超时
  const n = 15;
  const clues = Array.from({ length: n * 2 }, () => [1]);
  const result = solveNonogram(clues, { budget: 5 });
  assert.equal(result.status, "timeout");
  // 关键保证：超时状态下不能宣称唯一解
  assert.notEqual(result.status, "unique");
});

test("a timed-out solver can resume and eventually reach a complete conclusion", () => {
  // 用一个需要多轮传播与回溯、但可在若干真实预算切片内收敛的 8x8 画稿
  const n = 8;
  const rows = ["11110000", "11110000", "00111100", "00111100", "00001111", "00001111", "00000011", "00000011"];
  const clues = clueSet(n, gridFromRows(rows));
  const controller = createSolver(clues);
  // 每个切片给足以覆盖至少一整轮传播的预算（模拟工坊 VERIFY_BUDGET 分片）
  const PER_SLICE = 1000;
  let result = controller.step(PER_SLICE, 60_000);
  let guard = 0;
  while (result.status === "timeout" && guard < 1000) {
    assert.equal(controller.done, false, "超时期间不能宣称完成");
    result = controller.step(PER_SLICE, 60_000);
    guard++;
  }
  assert.ok(
    result.status === "unique" || result.status === "multiple",
    "最终必须得到完整结论，而不是停在 timeout",
  );
  assert.equal(controller.done, true);

  // 结论必须与一次性求解一致
  const oneShot = solveNonogram(clues);
  assert.equal(oneShot.status, result.status);
});

test("cancellation signal stops computation without producing a publishable verdict", () => {
  const n = 12;
  const clues = Array.from({ length: n * 2 }, () => [1]);
  const signal = { cancelled: true };
  // 预算很小且已取消：必须停在 timeout，绝不给出唯一解
  const result = solveNonogram(clues, { budget: 3, signal });
  assert.equal(result.status, "timeout");
  assert.notEqual(result.status, "unique");

  // 未取消时同样的小预算也只会 timeout，可继续 resume
  const controller = createSolver(clues);
  const first = controller.step(3);
  assert.equal(first.status, "timeout");
  assert.equal(controller.done, false);
});

test("content key changes on every edit so stale verdicts cannot approve new art", () => {
  const draft = createDraftHelper(5);
  const before = draftKey(draft);
  const edited = toggleCell(draft, 0);
  const after = draftKey(edited);
  assert.notEqual(before, after);
  // 不同尺寸即使同内容指纹前缀也不同
  const resized = resizeDraft(edited, 6);
  assert.notEqual(contentKey(resized.size, resized.cells), after);
  // 改回原样应恢复同一指纹
  const restored = toggleCell(edited, 0);
  assert.equal(draftKey(restored), before);
});

test("resize keeps overlapping ink and pads new cells empty", () => {
  const draft = createDraftHelper(5);
  const painted: Draft = {
    ...draft,
    cells: [
      1, 1, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
      0, 0, 0, 0, 1,
    ],
  };
  const bigger = resizeDraft(painted, 6);
  assert.equal(bigger.cells.length, 36);
  // 重叠区域按 (行,列) 坐标保留：对角线五个 1 仍然在
  for (let k = 0; k < 5; k++) assert.equal(bigger.cells[k * 6 + k], 1);
  // 新增的第 6 列/行全部留空
  for (let i = 0; i < 6; i++) {
    assert.equal(bigger.cells[i * 6 + 5], 0);
    assert.equal(bigger.cells[5 * 6 + i], 0);
  }
  const smaller = resizeDraft(painted, 2);
  assert.deepEqual(smaller.cells, [1, 1, 0, 1]);
});

test("publishing creates immutable versions and never mutates old ones", () => {
  let draft: Draft = {
    id: "d1",
    title: "小方块",
    size: 3,
    cells: gridFromRows(["111", "101", "111"]),
    updatedAt: Date.now(),
  };
  const first = publishDraft([], {
    draft,
    title: "小方块",
    level: "入门",
    color: "#123456",
  });
  assert.equal(first.length, 1);
  assert.equal(first[0].currentVersion, 1);
  const v1 = first[0].versions[0];
  const v1Snapshot = [...v1.solution];

  // 修改画稿后再次发布 -> 新版，旧版保留
  draft = { ...draft, cells: gridFromRows(["110", "101", "011"]) };
  const second = publishDraft(first, {
    draft,
    title: "小方块改",
    level: "进阶",
    color: "#654321",
  });
  assert.equal(second[0].currentVersion, 2);
  assert.equal(second[0].versions.length, 2);
  // 旧版答案未被改动
  assert.deepEqual(second[0].versions[0].solution, v1Snapshot);
  assert.notEqual(
    second[0].versions[0].id,
    second[0].versions[1].id,
  );
  // 两个版本都能作为独立 Puzzle 被打开，进度按 id 隔离
  const all = allVersionPuzzles(second);
  assert.equal(all.length, 2);
  assert.ok(all.every((p: Puzzle) => p.solution.length === 9));
  const view = versionToPuzzle(second[0].versions[0]);
  assert.equal(view.id, second[0].versions[0].id);
});

test("every built-in puzzle still verifies as uniquely solvable via the new solver", () => {
  // 间接保证新求解器与既有题库结论一致
  for (const puzzle of builtinPuzzles) {
    const result = solveNonogram(clueSet(puzzle.size, puzzle.solution));
    assert.equal(
      result.status,
      "unique",
      `${puzzle.id} should be unique, got ${result.status}`,
    );
    assert.deepEqual(result.solutions[0], puzzle.solution);
  }
});

test("runs helper still treats empty lines as zero clue", () => {
  assert.deepEqual(runs([0, 0, 0]), [0]);
  assert.equal(filledCount({ cells: [1, 0, 1, 1] } as Draft), 3);
});
