import type {
  Draft,
  PublishedPuzzle,
  Puzzle,
  PuzzleVersion,
} from "../../../shared/types";
import { WORKSHOP_COLLECTION } from "../lib/draft";

const PUBLISHED_KEY = "gejian.workshop.published.v1";

function sanitizeVersion(raw: unknown): PuzzleVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<PuzzleVersion>;
  if (
    typeof v.id !== "string" ||
    typeof v.puzzleId !== "string" ||
    typeof v.version !== "number" ||
    typeof v.title !== "string" ||
    typeof v.collection !== "string" ||
    typeof v.size !== "number" ||
    !Array.isArray(v.solution) ||
    v.solution.length !== v.size * v.size ||
    !v.solution.every((x) => x === 0 || x === 1)
  )
    return null;
  return {
    id: v.id,
    puzzleId: v.puzzleId,
    version: v.version,
    title: v.title,
    collection: v.collection,
    level: ["入门", "进阶", "挑战"].includes(v.level ?? "")
      ? (v.level as Puzzle["level"])
      : "入门",
    size: v.size,
    solution: v.solution.map(Number),
    color: typeof v.color === "string" ? v.color : "#536f98",
    publishedAt: Number(v.publishedAt) || Date.now(),
  };
}

function sanitize(raw: unknown): PublishedPuzzle | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PublishedPuzzle>;
  if (
    typeof p.puzzleId !== "string" ||
    typeof p.title !== "string" ||
    typeof p.currentVersion !== "number" ||
    typeof p.draftId !== "string" ||
    !Array.isArray(p.versions) ||
    !p.versions.length
  )
    return null;
  const versions = p.versions
    .map(sanitizeVersion)
    .filter((v): v is PuzzleVersion => v !== null);
  if (!versions.length) return null;
  return {
    puzzleId: p.puzzleId,
    title: p.title,
    collection: p.collection ?? WORKSHOP_COLLECTION,
    level: ["入门", "进阶", "挑战"].includes(p.level ?? "")
      ? (p.level as Puzzle["level"])
      : versions[versions.length - 1].level,
    color: typeof p.color === "string" ? p.color : "#536f98",
    currentVersion: p.currentVersion,
    draftId: p.draftId,
    versions: versions.sort((a, b) => a.version - b.version),
  };
}

export function loadPublished(): PublishedPuzzle[] {
  try {
    const raw = localStorage.getItem(PUBLISHED_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map(sanitize)
      .filter((p): p is PublishedPuzzle => p !== null);
  } catch {
    return [];
  }
}

export function savePublished(published: PublishedPuzzle[]): boolean {
  try {
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify(published));
    return true;
  } catch {
    return false;
  }
}

/** 把版本对象投影成解谜/展柜使用的 Puzzle 视图 */
export function versionToPuzzle(version: PuzzleVersion): Puzzle {
  return {
    id: version.id,
    title: version.title,
    collection: version.collection,
    level: version.level,
    size: version.size,
    solution: version.solution,
    color: version.color,
  };
}

export function publishedPuzzles(published: PublishedPuzzle[]): Puzzle[] {
  return published.map((p) =>
    versionToPuzzle(p.versions.find((v) => v.version === p.currentVersion)!),
  );
}

/** 全部版本视图（含历史旧版），保证别人正在解的旧版不会消失 */
export function allVersionPuzzles(published: PublishedPuzzle[]): Puzzle[] {
  return published.flatMap((p) => p.versions.map(versionToPuzzle));
}

export interface PublishInput {
  draft: Draft;
  title: string;
  level: Puzzle["level"];
  color: string;
}

/**
 * 发布或再发布。
 * 同一画稿再次发布形成不可变新版；旧版 id、答案与进度全部保留。
 */
export function publishDraft(
  published: PublishedPuzzle[],
  input: PublishInput,
): PublishedPuzzle[] {
  const versionNo = (() => {
    const existing = published.find((p) => p.draftId === input.draft.id);
    return existing ? existing.currentVersion + 1 : 1;
  })();
  const puzzleId =
    published.find((p) => p.draftId === input.draft.id)?.puzzleId ??
    crypto.randomUUID();
  const version: PuzzleVersion = {
    id: `wp-${puzzleId}-v${versionNo}`,
    puzzleId,
    version: versionNo,
    title: input.title.trim() || "未命名画稿",
    collection: WORKSHOP_COLLECTION,
    level: input.level,
    size: input.draft.size,
    solution: [...input.draft.cells],
    color: input.color,
    publishedAt: Date.now(),
  };
  const others = published.filter((p) => p.draftId !== input.draft.id);
  const previous = published.find((p) => p.draftId === input.draft.id);
  const next: PublishedPuzzle = previous
    ? {
        ...previous,
        title: version.title,
        level: version.level,
        color: version.color,
        currentVersion: versionNo,
        versions: [...previous.versions, version],
      }
    : {
        puzzleId,
        title: version.title,
        collection: WORKSHOP_COLLECTION,
        level: version.level,
        color: version.color,
        currentVersion: 1,
        draftId: input.draft.id,
        versions: [version],
      };
  return [...others, next];
}

export function versionLabel(puzzleId: string, version: number): string {
  return `v${version} · ${puzzleId}`;
}
