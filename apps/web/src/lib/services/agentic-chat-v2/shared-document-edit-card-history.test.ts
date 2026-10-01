// apps/web/src/lib/services/agentic-chat-v2/shared-document-edit-card-history.test.ts
//
// The user resolves a shared-document confirm card between chat turns. The next
// turn learns the outcome from a structured note after the reply that showed
// the card, built from the card row the history window already loads.
import { describe, expect, it } from 'vitest';
import type { Json } from '@buildos/shared-types';
import type { ChatHistoryToolExecutionRow } from './turn-admission';
import {
	buildInterruptedToolHistorySummary,
	projectWorkerFrozenHistorySnapshot
} from './session-service';
import {
	SHARED_DOCUMENT_EDIT_CARD_NOTE_LIMIT,
	sharedDocumentEditCardNotes
} from './shared-document-edit-card-history';
import { composeFastChatHistory } from './history-composer';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [SESSION, CHILD, PARENT, DOC, FOLDER, MESSAGE, COPY] = Array.from({ length: 7 }, (_, n) =>
	id(n + 1)
) as [string, string, string, string, string, string, string];

function receipt(cardId = id(50), resolution?: Record<string, unknown>) {
	return {
		status: 'confirmation_required',
		requires_user_action: true,
		confirmation_kind: 'shared_document_edit_v1',
		card_version: 2,
		card_id: cardId,
		source_user_message_id: MESSAGE,
		pending_edit: {
			document_id: DOC,
			child_project_id: CHILD,
			parent_project_id: PARENT,
			shared_folder_id: FOLDER,
			shared_with_count: 5,
			document_version: '2026-09-30T12:00:00+00:00',
			arguments: { document_id: DOC, content: 'SECRET-BODY' }
		},
		client_action: {
			kind: 'confirm_shared_document_edit',
			action_id: cardId,
			card_id: cardId,
			session_id: SESSION,
			document_id: DOC,
			document_title: 'Rate card',
			parent_project_id: PARENT,
			parent_name: 'Wayne Strategies',
			child_project_id: CHILD,
			shared_with_count: 5,
			change: null,
			field_changes: [],
			expires_at: '2026-10-01T12:00:00.000Z'
		},
		message: 'Nothing has changed yet.',
		...(resolution ? { card_resolution: resolution } : {})
	};
}

function resolution(cardId: string, outcome: string, copy: Record<string, unknown> | null = null) {
	return {
		version: 1,
		card_id: cardId,
		choice: outcome === 'copied' ? 'copy' : 'apply',
		outcome,
		resolved_at: '2026-09-30T12:05:00.000Z',
		document_id: DOC,
		document_title: 'Rate card',
		parent_project_id: PARENT,
		parent_name: 'Wayne Strategies',
		shared_with_count: 5,
		copy
	};
}

function row(messageId: string, result: unknown): ChatHistoryToolExecutionRow {
	return {
		message_id: messageId,
		provider_tool_call_id: 'call_0',
		tool_name: 'update_onto_document',
		gateway_op: 'onto.document.update',
		sequence_index: 1,
		success: true,
		error_message: null,
		arguments: { document_id: DOC, content: 'SECRET-BODY' },
		result: result as Json
	};
}

function noteState(content: string) {
	return JSON.parse(content.slice(content.indexOf('{'))) as Record<string, unknown>;
}

describe('shared-document edit card history', () => {
	it('follows the reply that showed the card with its pending state, never the edit body', () => {
		const history = projectWorkerFrozenHistorySnapshot({
			messages: [
				{
					id: 'reply',
					role: 'assistant',
					content:
						'I’d update "Rate card" in Wayne Strategies. Choose in the card below.',
					metadata: null,
					created_at: null
				}
			],
			attachments: [],
			interrupted_tool_executions: [],
			loaded_skill_executions: [row('reply', receipt())]
		});
		expect(history.map((message) => message.role)).toEqual(['assistant', 'system']);
		expect(history[1]).toMatchObject({
			continuityKind: 'shared_document_edit_card_v1',
			sourceMessageId: null
		});
		expect(noteState(history[1]!.content)).toMatchObject({
			card_id: id(50),
			document_title: 'Rate card',
			owner_project: 'Wayne Strategies',
			shared_with_count: 5,
			state: 'pending'
		});
		expect(history[1]!.content).not.toContain('SECRET-BODY');
		// No recalled tool call the model could copy.
		expect(history.some((message) => message.tool_calls?.length)).toBe(false);
	});

	it.each([
		['applied', null, 'Update shared doc'],
		['cancelled', null, 'Nothing changed'],
		['stale', null, 'nothing was saved']
	])('tells the next turn the card was %s', (outcome, copy, phrase) => {
		const card = id(51);
		const notes = sharedDocumentEditCardNotes([
			row('reply', receipt(card, resolution(card, outcome, copy)))
		]);
		const note = notes.get('reply')![0]!.content;
		expect(noteState(note)).toMatchObject({ state: outcome, resolved_at: expect.any(String) });
		expect(note).toContain(phrase);
	});

	it('gives the next turn the copy’s id after Copy here', () => {
		const card = id(52);
		const notes = sharedDocumentEditCardNotes([
			row(
				'reply',
				receipt(
					card,
					resolution(card, 'copied', {
						document_id: COPY,
						project_id: CHILD,
						project_name: 'Redline',
						title: 'Rate card',
						edit_applied: true
					})
				)
			)
		]);
		expect(noteState(notes.get('reply')![0]!.content)).toMatchObject({
			state: 'copied',
			copy_document_id: COPY,
			copy_project_id: CHILD
		});
	});

	it('keeps only the latest cards, and ignores retired typed-yes previews', () => {
		const rows = Array.from({ length: SHARED_DOCUMENT_EDIT_CARD_NOTE_LIMIT + 2 }, (_, n) =>
			row(`reply-${n}`, receipt(id(60 + n)))
		);
		rows.push(
			row('legacy', {
				status: 'confirmation_required',
				confirmation_kind: 'shared_document_edit_v1',
				confirmation_token: id(99)
			})
		);
		const notes = sharedDocumentEditCardNotes(rows);
		expect([...notes.keys()]).toEqual(['reply-2', 'reply-3', 'reply-4']);
	});

	it('survives history compression whole', () => {
		const notes = sharedDocumentEditCardNotes([row('reply', receipt())]).get('reply')!;
		const composed = composeFastChatHistory({
			history: [
				...Array.from({ length: 30 }, (_, n) => ({
					role: (n % 2 ? 'assistant' : 'user') as 'assistant' | 'user',
					content: `Earlier ${n} ${'words '.repeat(80)}`
				})),
				{ role: 'assistant', content: 'Choose in the card below.' },
				...notes,
				{ role: 'user', content: 'ok' },
				{ role: 'assistant', content: 'Sure.' }
			]
		});
		expect(composed.compressed).toBe(true);
		const history = composed.historyForModel;
		expect(
			history.filter((message) => message.continuityKind === 'shared_document_edit_card_v1')
		).toEqual(notes);
	});

	it('never reports a card preview as a saved write after an interruption', () => {
		expect(buildInterruptedToolHistorySummary([row('reply', receipt())])).toBeNull();
	});
});
