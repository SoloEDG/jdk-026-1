import { clueSet } from "../../../shared/clues";
import type { Draft } from "../../../shared/types";
import { filledCount } from "../lib/draft";

function cellSize(size: number): number {
  if (size <= 10) return 30;
  if (size <= 15) return 24;
  if (size <= 20) return 19;
  return 15;
}

function fontFor(size: number): number {
  return size <= 12 ? 10 : size <= 20 ? 8 : 7;
}

/** 出题画稿编辑区：黑白填涂 + 实时行列线索预览 */
export function EditorGrid({
  draft,
  onToggle,
}: {
  draft: Draft;
  onToggle: (index: number) => void;
}) {
  const clues = clueSet(draft.size, draft.cells);
  const size = cellSize(draft.size);
  const gutter = Math.max(46, Math.min(86, draft.size * 5.2));
  const fontSize = fontFor(draft.size);
  return (
    <div className="editor-scroll">
      <div
        className="puzzle-grid workshop-grid"
        style={{
          gridTemplateColumns: `${gutter}px repeat(${draft.size}, ${size}px)`,
          gridTemplateRows: `${gutter}px repeat(${draft.size}, ${size}px)`,
          ["--editor-font" as string]: `${fontSize}px`,
        }}
      >
        <div className="grid-corner">
          <span>
            {draft.size}×{draft.size}
          </span>
          <small>填涂 {filledCount(draft)}</small>
        </div>
        {clues.slice(draft.size).map((values, col) => (
          <div className="clue vertical preview" key={"c" + col}>
            {values.map((v, i) => (
              <span key={i}>{v}</span>
            ))}
          </div>
        ))}
        {Array.from({ length: draft.size }, (_, row) => (
          <div className="grid-row" key={row}>
            <div className="clue preview">
              {clues[row].map((v, i) => (
                <span key={i}>{v}</span>
              ))}
            </div>
            {Array.from({ length: draft.size }, (_, col) => {
              const index = row * draft.size + col;
              const on = draft.cells[index] === 1;
              return (
                <button
                  key={col}
                  aria-label={`第${row + 1}行第${col + 1}列 ${on ? "已填" : "空白"}`}
                  className={`cell workshop-cell ${on ? "filled" : "unknown"} ${
                    (col + 1) % 5 === 0 ? "major-right" : ""
                  } ${(row + 1) % 5 === 0 ? "major-bottom" : ""}`}
                  onClick={() => onToggle(index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (on) onToggle(index);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
