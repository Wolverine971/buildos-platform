// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { validateToolCalls } from './tool-validation';

const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';

function createToolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `${name}:test`,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

const updateDocumentTool: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'update_onto_document',
		description: 'Update document',
		parameters: {
			type: 'object',
			properties: {
				document_id: { type: 'string' },
				content: { type: 'string' },
				update_strategy: { type: 'string' },
				merge_instructions: { type: 'string' },
				props: { type: 'object' }
			},
			required: ['document_id']
		}
	}
};

describe('tool validation', () => {
	it('rejects document append calls that provide merge instructions but no content', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					update_strategy: 'append',
					merge_instructions: 'Append under Progress Updates.',
					props: {}
				})
			],
			[updateDocumentTool]
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors).toContain(
			'update_onto_document append requires non-empty content.'
		);
		expect(issues[0]?.errors).toContain(
			'No update fields provided for onto.document.update. Include at least one field to change.'
		);
	});

	it('allows document append calls with non-empty content', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					update_strategy: 'append',
					content: '## Progress Updates\n\n- Chapter 2 complete.',
					merge_instructions: 'Append under Progress Updates.'
				})
			],
			[updateDocumentTool]
		);

		expect(issues).toEqual([]);
	});

	it('rejects internal tool markup in durable write text', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					content: '## Progress\n\n</parameter><parameter name="update_strategy">replace'
				})
			],
			[updateDocumentTool]
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors).toContain(
			'args.content contains internal tool-call markup (parameter_tag). Remove the tool syntax and pass only user-visible content.'
		);
	});
});
