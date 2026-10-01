// apps/web/src/lib/components/agent/shared-document-edit-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import {
	chooseSharedDocumentEdit,
	collectSharedDocumentEditCards,
	extractSharedDocumentEditCard,
	placeSharedDocumentEditCards
} from './shared-document-edit-cards';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [CARD, SESSION, DOC, PARENT, CHILD] = Array.from({ length: 5 }, (_, n) => id(n + 1)) as [
	string,
	string,
	string,
	string,
	string
];

function cardReceipt(resolution?: Record<string, unknown>) {
	return {
		status: 'confirmation_required',
		requires_user_action: true,
		confirmation_kind: 'shared_document_edit_v1',
		card_version: 2,
		card_id: CARD,
		client_action: {
			kind: 'confirm_shared_document_edit',
			action_id: CARD,
			card_id: CARD,
			session_id: SESSION,
			document_id: DOC,
			document_title: 'Rate card',
			parent_project_id: PARENT,
			parent_name: 'Wayne Strategies',
			child_project_id: CHILD,
			shared_with_count: 5,
			change: null,
			field_changes: [],
			expires_at: '2099-01-01T00:00:00.000Z'
		},
		...(resolution ? { card_resolution: resolution } : {})
	};
}

function activity(result: unknown, status: ActivityEntry['status'] = 'completed'): ActivityEntry {
	return {
		id: `activity-${Math.random()}`,
		content: 'update_onto_document',
		timestamp: new Date(),
		activityType: 'tool_call',
		status,
		metadata: { toolName: 'update_onto_document', result }
	};
}

function block(id: string, activities: ActivityEntry[], status: ThinkingBlockMessage['status']) {
	return {
		id,
		type: 'thinking_block',
		content: '',
		timestamp: new Date(),
		activities,
		status
	} as unknown as UIMessage;
}

const message = (id: string, type: 'user' | 'assistant') =>
	({ id, type, content: id, timestamp: new Date() }) as unknown as UIMessage;

const resolution = {
	version: 1,
	card_id: CARD,
	choice: 'apply',
	outcome: 'applied',
	resolved_at: '2026-09-30T12:05:00.000Z',
	document_id: DOC,
	document_title: 'Rate card',
	parent_project_id: PARENT,
	parent_name: 'Wayne Strategies',
	shared_with_count: 5,
	copy: null
};

describe('shared-document edit cards in chat', () => {
	it('reads the card from a live tool result and from a restored execution', () => {
		const live = extractSharedDocumentEditCard(
			activity({ tool_call_id: 'c1', success: true, result: cardReceipt() })
		);
		expect(live?.action.card_id).toBe(CARD);
		expect(live?.resolution).toBeNull();

		const restored = extractSharedDocumentEditCard(activity(cardReceipt(resolution)));
		expect(restored?.resolution?.outcome).toBe('applied');
	});

	it('ignores pending, failed, and unrelated tool results', () => {
		expect(extractSharedDocumentEditCard(activity(cardReceipt(), 'pending'))).toBeNull();
		expect(extractSharedDocumentEditCard(activity(cardReceipt(), 'failed'))).toBeNull();
		expect(
			extractSharedDocumentEditCard(activity({ document: { id: DOC, title: 'Saved' } }))
		).toBeNull();
		expect(
			extractSharedDocumentEditCard(
				activity({ client_action: { kind: 'connect_google_gmail' } })
			)
		).toBeNull();
	});

	it('keeps one card per id, preferring the resolved copy', () => {
		const cards = collectSharedDocumentEditCards([
			activity(cardReceipt(resolution)),
			activity(cardReceipt())
		]);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.resolution?.outcome).toBe('applied');
	});

	it('places cards under the reply of their turn, or the thinking block before it starts', () => {
		const streaming = placeSharedDocumentEditCards([
			message('u1', 'user'),
			block('b1', [activity(cardReceipt())], 'active')
		]);
		expect(streaming.get('b1')).toMatchObject({ turnActive: true });

		const finished = placeSharedDocumentEditCards([
			message('u1', 'user'),
			block('b1', [activity(cardReceipt())], 'completed'),
			message('a1', 'assistant'),
			message('u2', 'user'),
			message('a2', 'assistant')
		]);
		expect([...finished.keys()]).toEqual(['a1']);
		expect(finished.get('a1')).toMatchObject({ turnActive: false });
		expect(finished.get('a1')!.cards[0]!.action.document_title).toBe('Rate card');
	});

	it('sends only the card id, its session and the choice', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ success: true, data: { resolution } }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		const result = await chooseSharedDocumentEdit(
			{ card_id: CARD, session_id: SESSION },
			'apply',
			fetchImpl as never
		);
		expect(result).toMatchObject({ status: 'resolved', resolution: { outcome: 'applied' } });
		expect(fetchImpl).toHaveBeenCalledWith(`/api/chat/shared-document-edits/${CARD}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ choice: 'apply', session_id: SESSION })
		});
	});

	it('passes server errors through with their code', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ success: false, error: 'Expired.', code: 'CARD_EXPIRED' }),
					{ status: 410 }
				)
		);
		await expect(
			chooseSharedDocumentEdit({ card_id: CARD, session_id: SESSION }, 'copy', fetchImpl)
		).resolves.toEqual({ status: 'error', code: 'CARD_EXPIRED', message: 'Expired.' });
	});
});
