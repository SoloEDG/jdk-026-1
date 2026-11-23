import { FilePenLine, Plus, Trash2 } from "lucide-react";
import type { Draft } from "../../../shared/types";
import { filledCount } from "../lib/draft";

export function DraftList({
  drafts,
  activeId,
  onSelect,
  onCreate,
  onRemove,
}: {
  drafts: Draft[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <aside className="panel draft-list">
      <div className="section-top">
        <span className="eyebrow">THE WORKSHOP · 出题工坊</span>
        <FilePenLine size={15} />
      </div>
      <h2>我的画稿</h2>
      <p className="muted">自动保存，切走再回来也能继续画。</p>
      <button className="create-draft" onClick={onCreate}>
        <Plus size={16} /> 新建空白画稿
      </button>
      <div className="draft-items">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className={`draft-card ${activeId === draft.id ? "selected" : ""}`}
          >
            <button
              className="draft-open"
              onClick={() => onSelect(draft.id)}
              title="打开画稿"
            >
              <span className="draft-thumb">
                <span
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${draft.size},1fr)`,
                    width: "100%",
                    aspectRatio: "1",
                  }}
                >
                  {draft.cells.map((v, i) => (
                    <i key={i} className={v ? "on" : ""} />
                  ))}
                </span>
              </span>
              <span className="draft-info">
                <strong>{draft.title || "未命名画稿"}</strong>
                <small>
                  {draft.size}×{draft.size} · {filledCount(draft)} 格
                </small>
              </span>
            </button>
            <button
              className="draft-delete"
              aria-label={`删除画稿 ${draft.title}`}
              onClick={() => onRemove(draft.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!drafts.length && (
          <p className="muted empty-drafts">
            还没有画稿，点击上方按钮开始第一幅。
          </p>
        )}
      </div>
    </aside>
  );
}
