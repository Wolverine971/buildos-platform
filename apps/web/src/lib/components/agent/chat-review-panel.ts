// apps/web/src/lib/components/agent/chat-review-panel.ts
// Lets a card inside the chat (the duplicate-check strip) open a consolidation
// run in the chat modal's side panel instead of navigating away (tasker 122).
// AgentChatModal provides it; anywhere else the strip falls back to a link.
import { getContext, setContext } from 'svelte';

export const CHAT_REVIEW_PANEL_KEY = Symbol('agent-chat-review-panel');

export type ChatReviewPanel = {
	/** Shows this consolidation run (a duplicate check or a full review) beside the chat. */
	open(runId: string): void;
};

export function provideChatReviewPanel(panel: ChatReviewPanel): void {
	setContext(CHAT_REVIEW_PANEL_KEY, panel);
}

export function useChatReviewPanel(): ChatReviewPanel | null {
	return getContext<ChatReviewPanel | undefined>(CHAT_REVIEW_PANEL_KEY) ?? null;
}
