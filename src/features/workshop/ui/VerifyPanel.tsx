import {
  CheckCircle2,
  XCircle,
  Copy,
  Hourglass,
  Loader2,
  ArrowUpRight,
  GitCompareArrows,
} from "lucide-react";
import type { Draft, VerifyView } from "../../../shared/types";

function statusCopy(status: VerifyView["status"]): {
  title: string;
  detail: string;
} {
  switch (status) {
    case "unique":
      return { title: "唯一解，可以发布", detail: "这些行列线索只能推出一幅图案。" };
    case "multiple":
      return { title: "存在多个解", detail: "同样的线索能画出不同图案，请修改画稿。" };
    case "unsolvable":
      return { title: "无解", detail: "行列线索互相矛盾，没有任何图案能同时满足。" };
    case "timeout":
      return {
        title: "计算尚未结束",
        detail: "预算内还没得出结论。超时不等于唯一解，请继续计算后再发布。",
      };
    default:
      return { title: "正在验证…", detail: "正在穷举所有可能，稍候片刻。" };
  }
}

function DiffGrid({
  draft,
  verify,
  variant,
}: {
  draft: Draft;
  verify: VerifyView;
  variant: number;
}) {
  const solution = verify.solutions[variant];
  return (
    <div
      className="diff-grid"
      style={{ gridTemplateColumns: `repeat(${draft.size}, 1fr)` }}
      aria-label={`第 ${variant + 1} 份解`}
    >
      {solution.map((value, i) => {
        const differs = verify.diff.includes(i);
        return (
          <span
            key={i}
            className={differs ? "diff-hot" : value ? "diff-fill" : ""}
            title={differs ? `第 ${i + 1} 格两解不同` : undefined}
          />
        );
      })}
    </div>
  );
}

export function VerifyPanel({
  draft,
  verify,
  onVerify,
  onContinue,
}: {
  draft: Draft;
  verify: VerifyView | null;
  onVerify: () => void;
  onContinue: () => void;
}) {
  const running = verify?.status === "running";
  const info = verify ? statusCopy(verify.status) : null;
  return (
    <section className="panel verify-panel">
      <span className="eyebrow">UNIQUENESS CHECK · 唯一性验证</span>
      <h2>先确认，再发布</h2>
      <p className="muted">
        只有对应当前画稿、且完整证明“唯一解”的结论才能发布。
      </p>
      <button className="verify-button" onClick={onVerify} disabled={running}>
        {running ? (
          <Loader2 size={17} className="spin" />
        ) : (
          <Hourglass size={17} />
        )}
        {verify ? "重新验证当前画稿" : "开始验证"}
      </button>
      {verify && info && (
        <div className={`verify-result ${verify.status}`} role="status">
          <div className="verify-head">
            {verify.status === "unique" && <CheckCircle2 size={19} />}
            {(verify.status === "multiple" ||
              verify.status === "unsolvable") && <XCircle size={19} />}
            {(verify.status === "timeout" ||
              verify.status === "running") && <Loader2 size={19} className="spin" />}
            <strong>{info.title}</strong>
          </div>
          <p>{info.detail}</p>
          <small className="verify-meta">
            预算 {verify.budgetUsed.toLocaleString()} · 用时{" "}
            {(verify.elapsedMs / 1000).toFixed(2)} 秒
          </small>
          {verify.status === "timeout" && (
            <button className="continue-button" onClick={onContinue}>
              <ArrowUpRight size={15} /> 继续计算（保留当前进度）
            </button>
          )}
          {verify.status === "multiple" && verify.solutions.length === 2 && (
            <div className="diff-wrap">
              <div className="diff-title">
                <GitCompareArrows size={15} />
                两份不同解，高亮 {verify.diff.length} 处差异
              </div>
              <div className="diff-pair">
                <figure>
                  <DiffGrid draft={draft} verify={verify} variant={0} />
                  <figcaption>
                    <Copy size={12} /> 解一
                  </figcaption>
                </figure>
                <figure>
                  <DiffGrid draft={draft} verify={verify} variant={1} />
                  <figcaption>
                    <Copy size={12} /> 解二
                  </figcaption>
                </figure>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
