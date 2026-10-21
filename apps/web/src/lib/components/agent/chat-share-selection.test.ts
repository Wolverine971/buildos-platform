// apps/web/src/lib/components/agent/chat-share-selection.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatSharePreview } from '$lib/types/chat-share';
import { defaultChatShareSelection, reviewedChatShareSelection } from './chat-share-selection';

function preview(): ChatSharePreview {
	return {
		title: 'A plan',
		authorName: 'DJ',
		truncated: null,
		outsideReview: [],
		messages: [
			{ id: 'included', role: 'user', markdown: 'Hello', at: '2026-10-18T12:00:00Z' },
			{ id: 'excluded', role: 'assistant', markdown: 'Private', at: '2026-10-18T12:01:00Z' },
			{ id: 'new', role: 'assistant', markdown: 'New reply', at: '2026-10-18T14:00:00Z' }
		],
		existing: {
			url: 'https://build-os.com/share/token',
			showAuthor: true,
			includedMessageIds: ['included'],
			updatedAt: '2026-10-18T13:00:00Z'
		}
	};
}

describe('chat share selection', () => {
	it('reapplies an existing selection and includes newer messages', () => {
		expect(defaultChatShareSelection(preview())).toEqual(['included', 'new']);
	});
	it('starts with all messages on a new share, except any review findings', () => {
		const value = {
			...preview(),
			existing: null,
			flags: [{ messageId: 'excluded', locked: false, reasons: ['Personal information'] }]
		};
		expect(defaultChatShareSelection(value)).toEqual(['included', 'new']);
	});
	it('a new review preserves deliberate exclusions and unchecks every flagged message', () => {
		const before = preview();
		const after = {
			...before,
			flags: [{ messageId: 'included', locked: true, reasons: ['Credential'] }]
		};
		expect(
			reviewedChatShareSelection(after, before.messages.slice(0, 2), ['included'])
		).toEqual(['new']);
	});
	it('leaves messages outside the review budget unchecked, before and after a review', () => {
		const value = { ...preview(), existing: null, outsideReview: ['included'] };
		expect(defaultChatShareSelection(value)).toEqual(['excluded', 'new']);
		expect(
			reviewedChatShareSelection(value, value.messages, ['included', 'excluded', 'new'])
		).toEqual(['excluded', 'new']);
	});
});
