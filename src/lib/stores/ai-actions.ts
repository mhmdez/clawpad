export type AiActionType =
  | "improve"
  | "simplify"
  | "expand"
  | "summarize"
  | "fix-grammar"
  | "continue";

export interface PendingAiAction {
  messageId: string;
  pagePath?: string;
  action: AiActionType;
  selectionText: string;
  blockIds: string[];
  selectionFrom?: number;
  selectionTo?: number;
  anchor?: { left: number; bottom: number; width?: number };
  createdAt: number;
}

const pendingActions = new Map<string, PendingAiAction>();

export function addAiAction(action: PendingAiAction) {
  pendingActions.set(action.messageId, action);
}

export function getAiAction(messageId: string) {
  return pendingActions.get(messageId);
}

export function removeAiAction(messageId: string) {
  pendingActions.delete(messageId);
}
