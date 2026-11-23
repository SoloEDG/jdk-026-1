import { Grid2X2, Check, PenLine } from "lucide-react";
import type { Puzzle, Session } from "../../../shared/types";
import { completion } from "../../../shared/document";
import { difficultyDots } from "../lib/filter";
import { WORKSHOP_COLLECTION } from "../../workshop/lib/draft";
export function PuzzleCard({
  puzzle,
  index,
  session,
  selected,
  onOpen,
}: {
  puzzle: Puzzle;
  index: number;
  session?: Session;
  selected: boolean;
  onOpen: () => void;
}) {
  const progress = session ? completion(session) : 0;
  const workshop = puzzle.collection === WORKSHOP_COLLECTION;
  const displayName =
    session?.solved || !workshop
      ? puzzle.title
      : `工坊谜题 ${String(index + 1).padStart(2, "0")}`;
  return (
    <button
      className={`puzzle-card ${selected ? "selected" : ""}`}
      onClick={onOpen}
    >
      <span className="puzzle-icon" style={{ color: puzzle.color }}>
        {session?.solved ? <Check size={22} /> : workshop ? <PenLine size={20} /> : <Grid2X2 size={22} />}
      </span>
      <span className="puzzle-info">
        <strong>{displayName}</strong>
        <small>
          {puzzle.size} × {puzzle.size}
          <i /> {puzzle.collection}
        </small>
        <span className="mini-track">
          <span style={{ width: progress + "%" }} />
        </span>
      </span>
      <span className="puzzle-meta">
        <span className="difficulty">
          {"●".repeat(difficultyDots(puzzle.level))}
          {"○".repeat(3 - difficultyDots(puzzle.level))}
        </span>
        <small>
          {session?.solved ? "已完成" : progress ? progress + "%" : "未开始"}
        </small>
      </span>
    </button>
  );
}
