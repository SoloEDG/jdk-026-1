import { useMemo, useState } from "react";
import {
  Grid2X2,
  Images,
  Leaf,
  ArrowUpRight,
  CheckCircle2,
  X,
  PenTool,
} from "lucide-react";
import { puzzles as builtins } from "../features/catalog";
import { CatalogPanel } from "../features/catalog";
import { BoardPanel } from "../features/board";
import { AssistPanel } from "../features/assist";
import { JournalPanel } from "../features/journal";
import { GalleryPanel } from "../features/gallery";
import {
  WorkshopPanel,
  allVersionPuzzles,
  loadPublished,
} from "../features/workshop";
import { useGame } from "./useGame";

type Page = "play" | "gallery" | "workshop";

export function App() {
  // 工坊已发布作品（含历史版本）在应用层持有，题库/进度/展柜共用
  const [published, setPublished] = useState(() => loadPublished());
  const allPuzzles = useMemo(
    () => [...builtins, ...allVersionPuzzles(published)],
    [published],
  );
  const game = useGame(allPuzzles);
  const [page, setPage] = useState<Page>("play");
  const [resetting, setResetting] = useState(false);
  const open = (id: string) => {
    game.dispatch({ type: "open", id });
    game.clearMessage();
    setPage("play");
  };
  const intro: Record<Page, { h2: string }> = {
    play: { h2: "在数字之间，发现图案。" },
    gallery: { h2: "让每一次发现，都有归处。" },
    workshop: { h2: "亲手画一幅，让朋友从数字猜出来。" },
  };
  return (
    <div className="app-shell">
      <nav className="rail">
        <a className="brand-mark" href="#" aria-label="格间首页">
          <Grid2X2 size={25} />
        </a>
        <button
          className={page === "play" ? "active" : ""}
          onClick={() => setPage("play")}
          aria-label="解谜工作台"
        >
          <Grid2X2 size={21} />
          <span>解谜</span>
        </button>
        <button
          className={page === "workshop" ? "active" : ""}
          onClick={() => setPage("workshop")}
          aria-label="出题工坊"
        >
          <PenTool size={21} />
          <span>工坊</span>
        </button>
        <button
          className={page === "gallery" ? "active" : ""}
          onClick={() => setPage("gallery")}
          aria-label="作品展柜"
        >
          <Images size={21} />
          <span>展柜</span>
        </button>
        <span className="rail-bottom">
          <Leaf size={20} />
          <span>慢一点</span>
        </span>
      </nav>
      <div className="main-shell">
        <header className="topbar">
          <a href="#" className="wordmark" onClick={() => setPage("play")}>
            格间<span>gejian</span>
          </a>
          <div className="header-center">给思绪留一点空白</div>
          <div className="header-right">
            <span className="online-dot" />
            只属于你的专注时光
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <span className="eyebrow">NONOGRAM CLUB / 数织俱乐部</span>
              <h2>{intro[page].h2}</h2>
            </div>
            <div className="intro-note">
              不赶时间，只享受解开的瞬间。
              <ArrowUpRight size={16} />
            </div>
          </div>
          {page === "play" && (
            <>
              <div className="workspace">
                <CatalogPanel
                  document={game.document}
                  puzzles={allPuzzles}
                  onOpen={open}
                />
                <BoardPanel
                  puzzle={game.puzzle}
                  session={game.session}
                  onMark={(index, mark) =>
                    game.dispatch({ type: "mark", index, mark })
                  }
                  onUndo={() => game.dispatch({ type: "undo" })}
                  onReset={() => setResetting(true)}
                />
                <AssistPanel
                  puzzle={game.puzzle}
                  session={game.session}
                  message={game.message}
                  onHint={game.hint}
                  onCheck={game.check}
                />
              </div>
              <div className="bottom-row">
                <JournalPanel
                  document={game.document}
                  puzzles={allPuzzles}
                  saveState={game.saveState}
                  onSave={game.save}
                  onOpen={open}
                />
                <button
                  className="collection-teaser"
                  onClick={() => setPage("gallery")}
                >
                  <div>
                    <span className="eyebrow">THE REVEAL</span>
                    <h2>
                      {game.session.solved
                        ? "你的新作品，正在等你"
                        : "每一幅图，都藏着一个惊喜。"}
                    </h2>
                    <p>
                      {game.session.solved ? (
                        <>
                          <CheckCircle2 size={15} />
                          已完成「{game.puzzle.title}」· 去展柜看看
                        </>
                      ) : (
                        "完成解谜，让隐藏的图案成为你的收藏。"
                      )}
                    </p>
                    <span className="text-link">
                      打开我的展柜 <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <div className="teaser-art">✳</div>
                </button>
              </div>
            </>
          )}
          {/* 工坊保持挂载：切走再回来，画稿与编辑状态都不丢 */}
          <div hidden={page !== "workshop"}>
            <WorkshopPanel onPublishedChange={setPublished} />
          </div>
          {page === "gallery" && (
            <GalleryPanel
              document={game.document}
              puzzles={allPuzzles}
              onOpen={open}
            />
          )}
          <footer>
            格间 GEJIAN <span>把复杂交给数字，把片刻留给自己。</span>
            <span>本地保存 · 无需登录</span>
          </footer>
        </main>
      </div>
      {resetting && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <button
              className="modal-close"
              aria-label="取消重新开始"
              onClick={() => setResetting(false)}
            >
              <X size={19} />
            </button>
            <h2 id="reset-title">重新探索这幅图？</h2>
            <p>
              本题标记、计时和提示额度会重置。已完成的解题记录和收藏仍保留。
            </p>
            <div className="modal-actions">
              <button onClick={() => setResetting(false)}>继续解题</button>
              <button
                className="primary"
                onClick={() => {
                  game.dispatch({ type: "reset" });
                  game.clearMessage();
                  setResetting(false);
                }}
              >
                重新开始
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
