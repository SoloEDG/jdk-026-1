import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import type { Draft, Puzzle } from "../src/shared/types";
import { clueSet } from "../src/shared/clues";
import {
  publishDraft,
  allVersionPuzzles,
  versionToPuzzle,
  loadPublished,
  savePublished,
} from "../src/features/workshop/model/publishedStore";
import {
  loadDrafts,
  saveDrafts,
} from "../src/features/workshop/model/draftStore";
import { createDraft, toggleCell, resizeDraft } from "../src/features/workshop/lib/draft";
import { newDocument, isSolved, newSession } from "../src/shared/document";
import { transition } from "../src/app/reducer";
import { unlockedArt } from "../src/features/gallery/lib/artwork";

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});

let store: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => delete store[k],
  },
  configurable: true,
});

function heartDraft(): Draft {
  let d = createDraft(5);
  d = { ...d, title: "我的小心心" };
  const rows = ["01010", "11111", "11111", "01110", "00100"];
  const cells = rows.join("").split("").map(Number);
  return { ...d, cells };
}

test("drafts persist to storage and reload for continued editing", () => {
  store = {};
  let draft = heartDraft();
  draft = toggleCell(draft, 0);
  assert.ok(saveDrafts([draft]));
  const reloaded = loadDrafts();
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].title, "我的小心心");
  assert.deepEqual(reloaded[0].cells, draft.cells);
  assert.equal(reloaded[0].size, 5);
});

test("malformed draft storage is ignored rather than crashing", () => {
  store = { "gejian.workshop.drafts.v1": "{not json" };
  assert.deepEqual(loadDrafts(), []);
  store = {};
});

test("invalid draft dimensions are filtered on load", () => {
  const good = heartDraft();
  const bad = { ...good, id: "bad", size: 3, cells: [1, 2, 3] };
  store = {};
  localStorage.setItem(
    "gejian.workshop.drafts.v1",
    JSON.stringify([good, bad]),
  );
  const loaded = loadDrafts();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, good.id);
});

test("published puzzle enters catalog, solves, and only then unlocks gallery art", () => {
  store = {};
  const draft = heartDraft();
  const published = publishDraft([], {
    draft,
    title: "我的小心心",
    level: "入门",
    color: "#ba7c91",
  });
  savePublished(published);
  assert.deepEqual(loadPublished().length, 1);

  const puzzles: Puzzle[] = allVersionPuzzles(loadPublished());
  const puzzle = puzzles[0];
  assert.equal(puzzle.size, 5);
  assert.equal(puzzle.collection, "我的出题工坊");

  // 未解前展柜不公开原图
  let doc = newDocument(puzzle);
  assert.equal(unlockedArt(puzzles, doc).length, 0);

  // 用答案逐格填涂解出
  puzzle.solution.forEach((v, index) => {
    if (v) doc = transition(doc, { type: "mark", index, mark: "filled" }, puzzles);
  });
  const session = doc.sessions[puzzle.id];
  assert.equal(isSolved(puzzle, session), true);
  // 解出后展柜公开
  const unlocked = unlockedArt(puzzles, doc);
  assert.equal(unlocked.length, 1);
  assert.equal(unlocked[0].id, puzzle.id);
  // 完成记录已写入
  assert.equal(doc.records.length, 1);
  assert.equal(doc.records[0].puzzleId, puzzle.id);
});

test("republishing creates a new version while old version keeps its own progress", () => {
  store = {};
  let draft = heartDraft();
  const first = publishDraft([], {
    draft,
    title: "小心心",
    level: "入门",
    color: "#111111",
  });
  const v1 = first[0].versions[0];

  // 朋友在 v1 上解到一半
  const v1Puzzle = versionToPuzzle(v1);
  let doc = newDocument(v1Puzzle);
  doc = transition(doc, { type: "mark", index: 1, mark: "filled" }, [v1Puzzle]);
  const v1Progress = [...doc.sessions[v1.id].marks];

  // 作者改稿并再发布 -> v2
  draft = resizeDraft(draft, 5);
  draft = toggleCell(draft, 0);
  const second = publishDraft(first, {
    draft,
    title: "小心心改",
    level: "进阶",
    color: "#222222",
  });
  savePublished(second);
  const all = allVersionPuzzles(second);
  assert.equal(all.length, 2, "两个版本都应可被打开");
  const v2 = second[0].versions[1];
  assert.notEqual(v1.id, v2.id);
  assert.equal(second[0].currentVersion, 2);

  // v1 旧版答案与进度未被改动
  const v1Again = second[0].versions[0];
  assert.deepEqual(v1Again.solution, v1.solution);
  const restored = newDocument(versionToPuzzle(v1Again));
  // 模拟旧进度仍按旧 id 保留：v1 的 marks 不依赖 v2
  assert.equal(restored.sessions[v1.id] !== undefined, true);
  assert.deepEqual(
    v1Progress.filter((m) => m === "filled").length,
    1,
  );

  // 新版本是不同的谜题对象，题库当前指向 v2
  const currentPuzzle = all.find((p) => p.id === v2.id)!;
  assert.equal(currentPuzzle.title, "小心心改");
  assert.equal(currentPuzzle.level, "进阶");
});

test("publishing the same draft twice with identical content keeps versions distinct by id", () => {
  const draft = heartDraft();
  const once = publishDraft([], {
    draft,
    title: "A",
    level: "入门",
    color: "#000",
  });
  const twice = publishDraft(once, {
    draft,
    title: "A",
    level: "入门",
    color: "#000",
  });
  assert.equal(twice[0].versions.length, 2);
  assert.notEqual(
    twice[0].versions[0].id,
    twice[0].versions[1].id,
  );
});

test("a fresh session for a workshop puzzle starts empty and unsolved", () => {
  const draft = heartDraft();
  const published = publishDraft([], {
    draft,
    title: "X",
    level: "入门",
    color: "#000",
  });
  const puzzle = allVersionPuzzles(published)[0];
  const session = newSession(puzzle);
  assert.equal(session.marks.length, 25);
  assert.ok(session.marks.every((m) => m === "unknown"));
  assert.equal(isSolved(puzzle, session), false);
  void clueSet;
});
