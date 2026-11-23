export type Mark = "unknown" | "filled" | "cross";
export type Tool = "filled" | "cross" | "unknown";
export interface Puzzle {
  id: string;
  title: string;
  collection: string;
  level: "入门" | "进阶" | "挑战";
  size: number;
  solution: number[];
  color: string;
}
export interface Move {
  index: number;
  before: Mark;
  after: Mark;
}
export interface Session {
  puzzleId: string;
  marks: Mark[];
  moves: Move[];
  hints: number;
  checks: number;
  seconds: number;
  solved: boolean;
  updatedAt: number;
}
export interface SolveRecord {
  id: string;
  puzzleId: string;
  seconds: number;
  hints: number;
  checks: number;
  finishedAt: number;
}
export interface GameDocument {
  version: 1;
  activeId: string;
  sessions: Record<string, Session>;
  records: SolveRecord[];
}
export type VerifyStatus =
  | "running"
  | "unique"
  | "multiple"
  | "unsolvable"
  | "timeout";
export interface VerifyView {
  status: VerifyStatus;
  contentKey: string;
  elapsedMs: number;
  budgetUsed: number;
  solutions: number[][];
  diff: number[];
}
export interface Draft {
  id: string;
  title: string;
  size: number;
  cells: number[];
  updatedAt: number;
}
export interface PuzzleVersion {
  id: string;
  puzzleId: string;
  version: number;
  title: string;
  collection: string;
  level: Puzzle["level"];
  size: number;
  solution: number[];
  color: string;
  publishedAt: number;
}
export interface PublishedPuzzle {
  puzzleId: string;
  title: string;
  collection: string;
  level: Puzzle["level"];
  color: string;
  currentVersion: number;
  draftId: string;
  versions: PuzzleVersion[];
}
export type GameAction =
  | { type: "open"; id: string }
  | { type: "mark"; index: number; mark: Mark }
  | { type: "undo" }
  | { type: "hint"; index: number; mark: Mark }
  | { type: "check" }
  | { type: "tick" }
  | { type: "reset" };
