import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Draft,
  PublishedPuzzle,
  Puzzle,
  VerifyView,
} from "../../../shared/types";
import { clueSet } from "../../../shared/clues";
import {
  draftKey,
  filledCount,
  suggestLevel,
  WORKSHOP_COLORS,
} from "../lib/draft";
import {
  loadDrafts,
  newDraft,
  saveDrafts,
} from "./draftStore";
import {
  loadPublished,
  publishDraft,
  savePublished,
  type PublishInput,
} from "./publishedStore";
import { Verifier } from "./verifier";
import type { SolveResult } from "../lib/solver";

export interface PublishOutcome {
  ok: boolean;
  message: string;
  puzzle?: Puzzle;
}

export function useWorkshop() {
  const [drafts, setDrafts] = useState<Draft[]>(() => loadDrafts());
  const [activeId, setActiveId] = useState<string | null>(
    () => loadDrafts()[0]?.id ?? null,
  );
  const [published, setPublished] = useState<PublishedPuzzle[]>(() =>
    loadPublished(),
  );
  const [verify, setVerify] = useState<VerifyView | null>(null);
  const [saveState, setSaveState] = useState("画稿已自动保存");
  const verifierRef = useRef<Verifier | null>(null);
  if (!verifierRef.current) verifierRef.current = new Verifier();
  const verifier = verifierRef.current;

  const active = drafts.find((d) => d.id === activeId) ?? drafts[0] ?? null;
  const activeKey = active ? draftKey(active) : "";
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;

  // 自动保存画稿（防抖），切走再回来仍可继续编辑
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveState(saveDrafts(drafts) ? "画稿已自动保存" : "保存失败");
    }, 300);
    return () => window.clearTimeout(timer);
  }, [drafts]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSaveState(savePublished(published) ? "题库已更新" : "保存失败"),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [published]);

  // 验证结果回调：只有与当前画稿内容一致的结论才会被采纳
  useEffect(() => {
    const unsubscribe = verifier.subscribe((result) => {
      if (!result) return;
      const key = activeKeyRef.current;
      // 结果到达时画稿已变化或已切换：旧结论直接丢弃
      setVerify((previous) => {
        if (!previous || previous.contentKey !== key) return previous;
        return toView(result, key);
      });
    });
    return unsubscribe;
  }, [verifier]);

  const invalidate = useCallback(
    (next: Draft) => {
      // 画稿一变，旧验证结果立刻作废，且终止仍在跑的旧计算
      verifier.cancel();
      setVerify((previous) =>
        previous && previous.contentKey === draftKey(next)
          ? previous
          : null,
      );
    },
    [verifier],
  );

  const updateActive = useCallback(
    (updater: (draft: Draft) => Draft) => {
      setDrafts((list) =>
        list.map((d) => {
          if (!active || d.id !== active.id) return d;
          const next = updater(d);
          if (next !== d) invalidate(next);
          return next;
        }),
      );
    },
    [active, invalidate],
  );

  const create = useCallback((size?: number) => {
    const draft = newDraft(size);
    verifier.cancel();
    setVerify(null);
    setDrafts((list) => [draft, ...list]);
    setActiveId(draft.id);
  }, [verifier]);

  const remove = useCallback(
    (id: string) => {
      verifier.cancel();
      setVerify(null);
      setDrafts((list) => {
        const next = list.filter((d) => d.id !== id);
        if (activeId === id) setActiveId(next[0]?.id ?? null);
        return next;
      });
    },
    [verifier, activeId],
  );

  const select = useCallback(
    (id: string) => {
      verifier.cancel();
      setVerify(null);
      setActiveId(id);
    },
    [verifier],
  );

  const startVerification = useCallback(
    (resume = false) => {
      if (!active) return;
      const key = draftKey(active);
      const clues = clueSet(active.size, active.cells);
      // 只有对应当前内容的验证才能进入“计算中”
      setVerify({
        status: "running",
        contentKey: key,
        elapsedMs: 0,
        budgetUsed: 0,
        solutions: [],
        diff: [],
      });
      verifier.run(clues, resume);
    },
    [active, verifier],
  );

  const canPublish = useMemo(() => {
    return (
      !!active &&
      verify !== null &&
      verify.status === "unique" &&
      verify.contentKey === activeKey &&
      filledCount(active) > 0
    );
  }, [active, verify, activeKey]);

  const publish = useCallback(
    (title: string, level: Puzzle["level"], color: string): PublishOutcome => {
      if (!active)
        return { ok: false, message: "请先选择一幅画稿。" };
      if (filledCount(active) === 0)
        return { ok: false, message: "空白画稿不能发布，请先画上图案。" };
      if (!verify)
        return { ok: false, message: "尚未完成验证，不能发布。" };
      if (verify.contentKey !== draftKey(active))
        return {
          ok: false,
          message: "画稿已修改，旧的验证结果不能用于发布，请重新验证。",
        };
      if (verify.status === "timeout")
        return {
          ok: false,
          message: "验证尚未结束，计算超时不等于唯一解，请继续计算。",
        };
      if (verify.status === "unsolvable")
        return { ok: false, message: "该画稿无解，无法发布。" };
      if (verify.status === "multiple")
        return {
          ok: false,
          message: "该画稿存在多个解，请调整图案后重新验证。",
        };
      if (verify.status !== "unique")
        return { ok: false, message: "验证仍在进行，请稍候。" };
      const input: PublishInput = {
        draft: active,
        title: title.trim() || active.title,
        level,
        color,
      };
      const nextPublished = publishDraft(published, input);
      setPublished(nextPublished);
      const entry = nextPublished.find((p) => p.draftId === active.id)!;
      const current = entry.versions.find(
        (v) => v.version === entry.currentVersion,
      )!;
      return {
        ok: true,
        message:
          current.version === 1
            ? `「${current.title}」已发布到题库。`
            : `已形成第 ${current.version} 版，旧版玩家进度不受影响。`,
        puzzle: {
          id: current.id,
          title: current.title,
          collection: current.collection,
          level: current.level,
          size: current.size,
          solution: current.solution,
          color: current.color,
        },
      };
    },
    [active, verify, published],
  );

  const defaultLevel = active
    ? suggestLevel(active.size, filledCount(active))
    : "入门";

  return {
    drafts,
    active,
    activeId,
    activeKey,
    published,
    verify,
    canPublish,
    saveState,
    colors: WORKSHOP_COLORS,
    defaultLevel,
    create,
    remove,
    select,
    updateActive,
    verifyNow: () => startVerification(false),
    continueVerify: () => startVerification(true),
    publish,
  };
}

function toView(result: SolveResult, contentKey: string): VerifyView {
  return {
    status: result.status,
    contentKey,
    elapsedMs: result.elapsedMs,
    budgetUsed: result.budgetUsed,
    solutions: result.solutions,
    diff: result.diff,
  };
}
