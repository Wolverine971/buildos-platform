// apps/web/src/lib/services/agentic-chat-v2/shared-document-confirmation-history.test.ts
import { describe, expect, it } from 'vitest';
import {
	projectWorkerFrozenHistorySnapshot,
	buildInterruptedToolHistorySummary
} from './session-service';
import { sharedDocumentConfirmationHistory } from './shared-document-confirmation-history';
import { composeFastChatHistory } from './history-composer';

const row = {
	message_id: 'warning',
	provider_tool_call_id: 'preview-1',
	tool_name: 'update_onto_document',
	gateway_op: 'onto.document.update',
	sequence_index: 1,
	success: true,
	error_message: null,
	arguments: { document_id: 'shared-doc', edits: [{ old_text: 'A & B\n', new_text: 'C < D\n' }] },
	result: {
		status: 'confirmation_required',
		confirmation_kind: 'shared_document_edit_v1',
		confirmation_token: 'token',
		requires_user_action: true,
		shared_document: { shared_with_count: 3 }
	}
};

describe('shared document confirmation history', () => {
	it.each([0, 10])(
		'keeps paired calls and complete receipts through history compression (%s earlier messages)',
		(count) => {
			const pending = sharedDocumentConfirmationHistory(
				[{ ...row, result: { ...row.result, message: 'Shared impact\n'.repeat(120) } }],
				'warning'
			);
			const history = composeFastChatHistory({
				history: [
					...Array.from({ length: count }, () => ({
						role: 'user' as const,
						content: 'Earlier'
					})),
					...pending,
					{
						role: 'assistant',
						content: 'Confirm the shared edit affecting all 3 projects?'
					}
				]
			}).historyForModel;
			expect(
				history.filter(
					(message) => message.continuityKind === 'shared_document_confirmation_v1'
				)
			).toEqual(pending);
			expect(history.at(-1)!.content).toContain('Confirm the shared edit');
		}
	);
	it('carries exact edit and server receipt before the warning into the frozen next turn', () => {
		const history = projectWorkerFrozenHistorySnapshot({
			messages: [
				{
					id: 'warning',
					role: 'assistant',
					content: 'This changes the shared copy in 3 projects. Confirm?',
					metadata: null,
					created_at: null
				}
			],
			attachments: [],
			interrupted_tool_executions: [],
			loaded_skill_executions: [row]
		});
		expect(history.map((message) => message.role)).toEqual(['assistant', 'tool', 'assistant']);
		expect(JSON.parse(history[0]!.tool_calls![0]!.function.arguments)).toEqual(row.arguments);
		expect(JSON.parse(history[1]!.content)).toEqual(row.result);
		expect(history[0]!.tool_calls![0]!.id).toBe('shared-preview-token');
		expect(history[1]!.tool_call_id).toBe('shared-preview-token');
		expect(history[0]!.sourceMessageId).toBeNull();
		expect(history[2]!.sourceMessageId).toBe('warning');
	});

	it('never reuses a recalled provider call id that could collide with this turn', () => {
		const history = sharedDocumentConfirmationHistory(
			[
				{ ...row, provider_tool_call_id: 'call_0' },
				{
					...row,
					provider_tool_call_id: null,
					result: { ...row.result, confirmation_token: 'token-2' }
				}
			],
			'warning'
		);
		expect(history.map((message) => message.tool_calls?.[0]?.id ?? message.tool_call_id)).toEqual(
			[
				'shared-preview-token',
				'shared-preview-token',
				'shared-preview-token-2',
				'shared-preview-token-2'
			]
		);
	});

	it('does not resurrect older, failed, or committed document edits as confirmations', () => {
		expect(sharedDocumentConfirmationHistory([row], 'later')).toEqual([]);
		expect(sharedDocumentConfirmationHistory([{ ...row, success: false }], 'warning')).toEqual(
			[]
		);
		expect(
			sharedDocumentConfirmationHistory(
				[{ ...row, result: { document: { id: 'saved' } } }],
				'warning'
			)
		).toEqual([]);
	});

	it('omits an oversized edit whole instead of corrupting exact confirmation arguments', () => {
		expect(
			sharedDocumentConfirmationHistory(
				[{ ...row, arguments: { content: 'a'.repeat(24_000) } }],
				'warning'
			)
		).toEqual([]);
	});

	it('does not claim that an interrupted confirmation preview updated the document', () => {
		expect(buildInterruptedToolHistorySummary([row])).toBeNull();
	});
});
