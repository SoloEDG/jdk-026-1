import type { Draft, Puzzle } from "../../../shared/types";

export const MIN_SIZE = 5;
export const MAX_SIZE = 25;
export const WORKSHOP_COLLECTION = "我的出题工坊";
/** 单步验证预算：用于区分“正在算”与“尚未结束” */
export const VERIFY_BUDGET = 60_000;
export const WORKSHOP_COLORS = [
  "#536f98",
  "#ba7c91",
  "#7e9a8e",
  "#b79770",
  "#ad9165",
  "#719488",
  "#9d84b8",
  "#6f93b5",
];

/** 当前画稿内容指纹。旧验证结果的 key 与现稿不一致时一律作废 */
export function contentKey(size: number, cells: readonly number[]): string {
  let hash = 2166136261;
  for (const value of cells) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return `${size}x${size}:${(hash >>> 0).toString(36)}`;
}

export function draftKey(draft: Draft): string {
  return contentKey(draft.size, draft.cells);
}

export function createDraft(size = MIN_SIZE): Draft {
  return {
    id: crypto.randomUUID(),
    title: "未命名画稿",
    size,
    cells: Array(size * size).fill(0),
    updatedAt: Date.now(),
  };
}

export function toggleCell(draft: Draft, index: number): Draft {
  if (index < 0 || index >= draft.cells.length) return draft;
  const cells = [...draft.cells];
  cells[index] = cells[index] ? 0 : 1;
  return { ...draft, cells, updatedAt: Date.now() };
}

export function clearDraft(draft: Draft): Draft {
  return {
    ...draft,
    cells: Array(draft.size * draft.size).fill(0),
    updatedAt: Date.now(),
  };
}

/** 调整尺寸：保留重叠区域的填涂，新增区域留空 */
export function resizeDraft(draft: Draft, size: number): Draft {
  if (size === draft.size) return draft;
  const next = Array(size * size).fill(0);
  for (let r = 0; r < Math.min(size, draft.size); r++) {
    for (let c = 0; c < Math.min(size, draft.size); c++) {
      next[r * size + c] = draft.cells[r * draft.size + c];
    }
  }
  return { ...draft, size, cells: next, updatedAt: Date.now() };
}

export function filledCount(draft: Draft): number {
  return draft.cells.reduce((sum, v) => sum + v, 0);
}

/** 依据尺寸给出默认难度建议，用户发布时仍可修改 */
export function suggestLevel(
  size: number,
  filled: number,
): Puzzle["level"] {
  if (size <= 7 || filled <= 12) return "入门";
  if (size <= 14) return "进阶";
  return "挑战";
}
