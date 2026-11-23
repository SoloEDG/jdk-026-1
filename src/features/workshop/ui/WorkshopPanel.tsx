import { useEffect, useState } from "react";
import {
  Eraser,
  Expand,
  Shrink,
  Send,
  CircleAlert,
  Info,
} from "lucide-react";
import type { Draft, PublishedPuzzle } from "../../../shared/types";
import { MAX_SIZE, MIN_SIZE, resizeDraft, toggleCell } from "../lib/draft";
import { useWorkshop, type PublishOutcome } from "../model/useWorkshop";
import { EditorGrid } from "./EditorGrid";
import { VerifyPanel } from "./VerifyPanel";
import { DraftList } from "./DraftList";
import { PublishDialog, type PublishForm } from "./PublishDialog";

export function WorkshopPanel({
  onPublishedChange,
}: {
  onPublishedChange?: (published: PublishedPuzzle[]) => void;
}) {
  const workshop = useWorkshop();
  const { active, verify } = workshop;
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<PublishOutcome | null>(null);

  // 发布结果同步给应用层，题库与展柜立即收录新版本
  useEffect(() => {
    onPublishedChange?.(workshop.published);
  }, [workshop.published, onPublishedChange]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const mutate = (updater: (draft: Draft) => Draft) =>
    workshop.updateActive(updater);

  const publishedVersions = active
    ? workshop.published.find((p) => p.draftId === active.id)?.currentVersion ??
      0
    : 0;

  const confirmPublish = (form: PublishForm) => {
    const outcome = workshop.publish(form.title, form.level, form.color);
    setToast(outcome);
    if (outcome.ok) setPublishing(false);
  };

  if (!active) {
    return (
      <div className="workspace workshop-workspace">
        <DraftList
          drafts={workshop.drafts}
          activeId={workshop.activeId}
          onSelect={workshop.select}
          onCreate={() => workshop.create()}
          onRemove={workshop.remove}
        />
        <section className="panel editor-panel empty-editor">
          <Info size={26} />
          <h2>从一张空白网格开始</h2>
          <p className="muted">
            亲手画出黑白答案，调整尺寸、预览行列线索，验证唯一后就能发给朋友猜。
          </p>
          <button className="primary big-create" onClick={() => workshop.create()}>
            新建第一幅画稿
          </button>
        </section>
      </div>
    );
  }

  const stale =
    verify !== null && verify.contentKey !== workshop.activeKey;

  return (
    <div className="workspace workshop-workspace">
      <DraftList
        drafts={workshop.drafts}
        activeId={workshop.activeId}
        onSelect={workshop.select}
        onCreate={() => workshop.create()}
        onRemove={workshop.remove}
      />
      <section className="panel editor-panel">
        <div className="editor-heading">
          <input
            className="title-input"
            value={active.title}
            maxLength={20}
            aria-label="画稿标题"
            placeholder="给画稿起个名字"
            onChange={(e) =>
              mutate((d) => ({ ...d, title: e.target.value }))
            }
          />
          <span className="save-state">{workshop.saveState}</span>
        </div>
        <div className="editor-toolbar">
          <div className="tool-group">
            <button
              aria-label="缩小一格"
              title="缩小"
              disabled={active.size <= MIN_SIZE}
              onClick={() => mutate((d) => resizeDraft(d, d.size - 1))}
            >
              <Shrink size={16} />
            </button>
            <span className="size-readout">
              {active.size} × {active.size}
            </span>
            <button
              aria-label="放大一格"
              title="放大"
              disabled={active.size >= MAX_SIZE}
              onClick={() => mutate((d) => resizeDraft(d, d.size + 1))}
            >
              <Expand size={16} />
            </button>
          </div>
          <div className="tool-group">
            <button onClick={() => mutate((d) => ({ ...d, cells: d.cells.map(() => 0), updatedAt: Date.now() }))}>
              <Eraser size={16} /> 清空
            </button>
            <button
              className="publish-trigger"
              disabled={!workshop.canPublish}
              title={
                workshop.canPublish
                  ? "发布到题库"
                  : "只有当前画稿验证为唯一解后才能发布"
              }
              onClick={() => setPublishing(true)}
            >
              <Send size={16} /> 发布
            </button>
          </div>
        </div>
        <p className="editor-hint">
          左键填涂 / 再点取消；可边改边验证，任何修改都会让旧结论失效。
        </p>
        <EditorGrid
          draft={active}
          onToggle={(index) => mutate((d) => toggleCell(d, index))}
        />
        {stale && (
          <div className="stale-banner" role="alert">
            <CircleAlert size={15} />
            画稿已修改，下面这份验证结论属于旧内容，不能用于发布，请重新验证。
          </div>
        )}
      </section>
      <div className="workshop-side">
        <VerifyPanel
          draft={active}
          verify={stale ? null : verify}
          onVerify={workshop.verifyNow}
          onContinue={workshop.continueVerify}
        />
        <section className="panel version-panel">
          <span className="eyebrow">VERSIONS · 版本</span>
          <h2>发布记录</h2>
          {publishedVersions ? (
            <p className="muted">
              已发布 {publishedVersions} 个版本。再次发布会生成新版，旧版与朋友的解题进度保持不变。
            </p>
          ) : (
            <p className="muted">尚未发布。验证为唯一解后即可进入题库。</p>
          )}
        </section>
      </div>
      {publishing && (
        <PublishDialog
          draft={active}
          publishedVersions={publishedVersions}
          onCancel={() => setPublishing(false)}
          onConfirm={confirmPublish}
        />
      )}
      {toast && (
        <div className={`toast ${toast.ok ? "ok" : "warn"}`} role="status">
          {toast.ok ? <Info size={16} /> : <CircleAlert size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
