// apps/web/src/lib/components/agent/chat-share-selection.ts
import type { ChatSharePreview } from '$lib/types/chat-share';

/**
 * Older exclusions remain excluded; messages written since publication start included.
 * Flagged messages and messages outside the review budget start unchecked.
 */
export function defaultChatShareSelection(preview: ChatSharePreview): string[] {
	const existing = preview.existing;
	const selected = new Set(existing?.includedMessageIds ?? []);
	const updatedAt = existing ? Date.parse(existing.updatedAt) : Number.NEGATIVE_INFINITY;
	const flagged = new Set(preview.flags?.map((flag) => flag.messageId) ?? []);
	const outside = new Set(preview.outsideReview ?? []);
	return preview.messages
		.filter(
			(message) =>
				!flagged.has(message.id) &&
				!outside.has(message.id) &&
				(!existing || selected.has(message.id) || Date.parse(message.at) > updatedAt)
		)
		.map((message) => message.id);
}

/**
 * New review findings must be acknowledged again, including a refreshed 409 preview.
 * A message the review could not cover is unchecked.
 */
export function reviewedChatShareSelection(
	preview: ChatSharePreview,
	previousMessages: ChatSharePreview['messages'],
	previousSelection: readonly string[]
): string[] {
	const previousIds = new Set(previousMessages.map((message) => message.id));
	const selected = new Set(previousSelection);
	const flagged = new Set(preview.flags?.map((flag) => flag.messageId) ?? []);
	const outside = new Set(preview.outsideReview ?? []);
	return preview.messages
		.filter(
			(message) =>
				!flagged.has(message.id) &&
				!outside.has(message.id) &&
				(selected.has(message.id) || !previousIds.has(message.id))
		)
		.map((message) => message.id);
}
