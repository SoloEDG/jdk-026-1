import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import type { Draft, Puzzle } from "../../../shared/types";
import {
  WORKSHOP_COLORS,
  suggestLevel,
  filledCount,
} from "../lib/draft";

export interface PublishForm {
  title: string;
  level: Puzzle["level"];
  color: string;
}

export function PublishDialog({
  draft,
  publishedVersions,
  onCancel,
  onConfirm,
}: {
  draft: Draft;
  publishedVersions: number;
  onCancel: () => void;
  onConfirm: (form: PublishForm) => void;
}) {
  const [title, setTitle] = useState(draft.title.trim() || "");
  const [level, setLevel] = useState<Puzzle["level"]>(
    suggestLevel(draft.size, filledCount(draft)),
  );
  const [color, setColor] = useState(WORKSHOP_COLORS[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop">
      <section
        className="modal publish-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
      >
        <button className="modal-close" aria-label="取消发布" onClick={onCancel}>
          <X size={19} />
        </button>
        <h2 id="publish-title">
          {publishedVersions ? `发布新版（当前第 ${publishedVersions} 版）` : "发布到题库"}
        </h2>
        <p>
          {publishedVersions
            ? "旧版会原样保留，朋友正在解的进度与记录不受影响。"
            : "发布后朋友即可从题库挑战，解出前展柜不会公开原图。"}
        </p>
        <label className="publish-field">
          <span>题目</span>
          <input
            value={title}
            maxLength={20}
            placeholder="给这幅画起个名字"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="publish-field">
          <span>难度</span>
          <div className="filter-tabs">
            {(["入门", "进阶", "挑战"] as const).map((l) => (
              <button
                key={l}
                className={level === l ? "active" : ""}
                onClick={() => setLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="publish-field">
          <span>揭晓颜色</span>
          <div className="color-row">
            {WORKSHOP_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`颜色 ${c}`}
                className={`color-swatch ${color === c ? "active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>再改改</button>
          <button className="primary" onClick={() => onConfirm({ title, level, color })}>
            <Send size={15} />
            {publishedVersions ? "发布新版" : "确认发布"}
          </button>
        </div>
      </section>
    </div>
  );
}
