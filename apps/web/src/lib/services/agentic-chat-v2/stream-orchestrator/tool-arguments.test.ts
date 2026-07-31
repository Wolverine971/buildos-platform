// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import {
	backfillCommissionedDocumentUpdateContent,
	REDACTED_DURABLE_TEXT,
	sanitizeToolCallsForReplay
} from './tool-arguments';

function toolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `call:${name}`,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

describe('sanitizeToolCallsForReplay', () => {
	it('redacts invalid durable text in nested args without relying on path parsing', () => {
		const originalArgs = {
			task_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
			props: {
				'chapter.notes': 'Keep the visible note\n<parameter name="update_strategy">replace'
			}
		};

		const [sanitizedCall] = sanitizeToolCallsForReplay(
			[toolCall('update_onto_task', originalArgs)],
			{
				redactInvalidDurableText: true
			}
		);

		const sanitizedArgs = JSON.parse(sanitizedCall?.function.arguments ?? '{}');
		expect(sanitizedArgs.props['chapter.notes']).toBe(REDACTED_DURABLE_TEXT);
		expect(JSON.stringify(sanitizedCall)).not.toContain('<parameter');
		expect(originalArgs.props['chapter.notes']).toContain('<parameter');
	});
});

describe('backfillCommissionedDocumentUpdateContent', () => {
	it('uses the current commissioned canon when a merge call omitted content', () => {
		const original = toolCall('update_onto_document', {
			document_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
			update_strategy: 'merge_llm',
			merge_instructions: 'Update the character motivation.',
			props: ''
		});

		const result = backfillCommissionedDocumentUpdateContent(
			original,
			'Ilyan is using Mara to reach the Salt Archive.'
		);

		expect(JSON.parse(result.function.arguments)).toMatchObject({
			document_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
			update_strategy: 'merge_llm',
			content: 'Ilyan is using Mara to reach the Salt Archive.'
		});
		expect(original.function.arguments).not.toContain('Salt Archive');
	});

	it('does not replace model content or affect non-merge updates', () => {
		const withContent = toolCall('update_onto_document', {
			document_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
			update_strategy: 'append',
			content: 'Model-authored projection'
		});
		const replacement = toolCall('update_onto_document', {
			document_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
			update_strategy: 'replace'
		});

		expect(backfillCommissionedDocumentUpdateContent(withContent, 'Fallback canon')).toBe(
			withContent
		);
		expect(backfillCommissionedDocumentUpdateContent(replacement, 'Fallback canon')).toBe(
			replacement
		);
	});
});
