import type { Draft } from "../../../shared/types";
import {
  createDraft,
  MAX_SIZE,
  MIN_SIZE,
  resizeDraft,
} from "../lib/draft";

const DRAFT_KEY = "gejian.workshop.drafts.v1";

function sanitize(raw: unknown): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<Draft>;
  if (
    typeof d.id !== "string" ||
    typeof d.title !== "string" ||
    typeof d.size !== "number" ||
    d.size < MIN_SIZE ||
    d.size > MAX_SIZE ||
    !Array.isArray(d.cells) ||
    d.cells.length !== d.size * d.size ||
    !d.cells.every((v) => v === 0 || v === 1)
  )
    return null;
  return {
    id: d.id,
    title: d.title,
    size: d.size,
    cells: d.cells.map(Number),
    updatedAt: Number(d.updatedAt) || Date.now(),
  };
}

export function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map(sanitize)
      .filter((d): d is Draft => d !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveDrafts(drafts: Draft[]): boolean {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

/** 升级旧版本画稿到当前支持的尺寸（容错恢复，不丢画稿） */
export function ensureDraftSize(draft: Draft): Draft {
  return draft.size < MIN_SIZE
    ? resizeDraft(draft, MIN_SIZE)
    : draft.size > MAX_SIZE
      ? resizeDraft(draft, MAX_SIZE)
      : draft;
}

export function newDraft(size?: number): Draft {
  return createDraft(size);
}
