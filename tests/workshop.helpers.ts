import type { Draft } from "../src/shared/types";
import {
  contentKey,
  draftKey,
  resizeDraft,
  toggleCell,
  filledCount,
} from "../src/features/workshop";
import { createDraft } from "../src/features/workshop/lib/draft";

export { contentKey, draftKey, resizeDraft, toggleCell, filledCount };

export function createDraftHelper(size: number): Draft {
  return createDraft(size);
}
