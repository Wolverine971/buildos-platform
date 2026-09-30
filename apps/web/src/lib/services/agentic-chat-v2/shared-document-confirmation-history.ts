// apps/web/src/lib/services/agentic-chat-v2/shared-document-confirmation-history.ts
import type {
	FastChatHistoryMessageWithLineage,
	InterruptedToolExecutionSummaryRow
} from './session-service';

/** Filter before LIMIT so ordinary document saves cannot crowd out continuity. */
export const CHAT_CONTINUITY_EXECUTION_FILTER =
	'tool_name.in.(skill_load,request_turn_clarification),and(tool_name.eq.update_onto_document,result->>confirmation_kind.eq.shared_document_edit_v1,result->>status.eq.confirmation_required)';

export function isSharedDocumentConfirmationRow(row: InterruptedToolExecutionSummaryRow): boolean {
	const result = row.result;
	return Boolean(
		row.success &&
			row.tool_name === 'update_onto_document' &&
			result &&
			typeof result === 'object' &&
			!Array.isArray(result) &&
			result.confirmation_kind === 'shared_document_edit_v1' &&
			result.status === 'confirmation_required' &&
			typeof result.confirmation_token === 'string'
	);
}

/** Preserve exact calls and server receipts before the assistant's warning.
 * Only the immediately preceding assistant's previews are actionable recall.
 * Oversized/many previews are omitted whole, never turned into a different edit;
 * the actor can request a fresh preview when the original is no longer loaded. */
export function sharedDocumentConfirmationHistory(
	rows: readonly InterruptedToolExecutionSummaryRow[],
	pendingAssistantMessageId: string | null
): FastChatHistoryMessageWithLineage[] {
	if (!pendingAssistantMessageId) return [];
	const candidates = rows
		.filter(
			(row) =>
				row.message_id === pendingAssistantMessageId && isSharedDocumentConfirmationRow(row)
		)
		.slice(-3);
	const history: FastChatHistoryMessageWithLineage[] = [];
	let remainingChars = 24_000;
	for (const row of candidates) {
		const args = JSON.stringify(row.arguments);
		const result = JSON.stringify(row.result);
		if (args.length + result.length > remainingChars) continue;
		remainingChars -= args.length + result.length;
		const token = (row.result as { confirmation_token: string }).confirmation_token;
		// Never reuse the recalled provider call id: providers that number ids by
		// index ("call_0") would collide with this turn's own calls. The token is
		// a server-minted UUID, so this id is unique across turns.
		const callId = `shared-preview-${token}`;
		history.push(
			{
				role: 'assistant',
				content: '',
				continuityKind: 'shared_document_confirmation_v1',
				sourceMessageId: null,
				tool_calls: [
					{
						id: callId,
						type: 'function',
						function: { name: row.tool_name, arguments: args }
					}
				]
			},
			{
				role: 'tool',
				content: result,
				sourceMessageId: null,
				tool_call_id: callId,
				continuityKind: 'shared_document_confirmation_v1'
			}
		);
	}
	return history;
}
