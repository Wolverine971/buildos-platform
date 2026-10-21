// apps/web/src/lib/types/chat-share.ts
// Public snapshots are a whitelist. IDs exist only in the authenticated selection preview.
export type SharedChatMessageV1 = {
	role: 'user' | 'assistant';
	markdown: string;
	at: string;
	work?: { seconds: number; steps: number };
	made?: Array<{ kind: string; label: string }>;
	withheld?: { images?: number; files?: number; voice?: number };
};

export type SharedChatSnapshotV1 = {
	version: 1;
	title: string;
	messages: SharedChatMessageV1[];
};

export type ChatSharePreviewMessage = SharedChatMessageV1 & { id: string };
export type ChatShareFlag = { messageId: string; locked: boolean; reasons: string[] };
export type ChatSharePreview = {
	title: string;
	authorName: string;
	messages: ChatSharePreviewMessage[];
	truncated: { omittedMessages: number } | null;
	/**
	 * Messages the safety check can't cover alongside the rest ("Too long to check in one
	 * share"). Before a review: the oldest messages past the review budget. After a review:
	 * every message the review didn't cover. None of them can be published until a review
	 * covers them.
	 */
	outsideReview: string[];
	existing: {
		url: string;
		showAuthor: boolean;
		includedMessageIds: string[];
		updatedAt: string;
	} | null;
	fingerprint?: string;
	flags?: ChatShareFlag[];
};
