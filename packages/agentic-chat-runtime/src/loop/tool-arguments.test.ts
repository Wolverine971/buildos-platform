// packages/agentic-chat-runtime/src/loop/tool-arguments.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import {
	backfillCommissionedDocumentUpdateContent,
	logToolArgumentAnomaly,
	normalizeToolCallDefaults,
	REDACTED_DURABLE_TEXT,
	sanitizeToolCallsForReplay,
	stampProjectCreateGenerationModel
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

describe('logToolArgumentAnomaly', () => {
	it('logs only argument shape rather than content or correlation identifiers', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const hiddenTail = 'TAIL_SECRET_victim@example.com';
		const rawArgs = JSON.stringify({ content: `${'x'.repeat(500)}${hiddenTail}` });

		logToolArgumentAnomaly({
			sessionId: 'session-1',
			anomaly: {
				kind: 'malformed',
				toolCallId: 'call-1',
				toolName: 'update_onto_document',
				rawArgs,
				parseError: 'invalid JSON'
			}
		});

		const metadata = warn.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(metadata.argsShape).toEqual({ type: 'string', chars: rawArgs.length });
		expect(metadata).not.toHaveProperty('sessionId');
		expect(metadata).not.toHaveProperty('toolCallId');
		expect(JSON.stringify(warn.mock.calls)).not.toContain(hiddenTail);
		warn.mockRestore();
	});
});

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

describe('normalizeToolCallDefaults', () => {
	it('maps the legacy skill_load reference argument to the canonical skill field', () => {
		const normalized = normalizeToolCallDefaults(
			toolCall('skill_load', {
				reference: 'calendar_management',
				format: 'full'
			})
		);

		expect(JSON.parse(normalized.function.arguments)).toMatchObject({
			reference: 'calendar_management',
			skill: 'calendar_management',
			format: 'full'
		});
	});
});

describe('stampProjectCreateGenerationModel', () => {
	it('replaces model-authored attribution with the orchestrator-selected model', () => {
		const original = toolCall('create_onto_project', {
			project: { name: 'Book workspace' },
			meta: { model: 'gpt-4o', confidence: 0.92 }
		});

		const stamped = stampProjectCreateGenerationModel(original, 'google/gemini-3.7-flash');

		expect(JSON.parse(stamped.function.arguments).meta).toEqual({
			model: 'google/gemini-3.7-flash',
			confidence: 0.92
		});
		expect(JSON.parse(original.function.arguments).meta.model).toBe('gpt-4o');
	});

	it('does not alter unrelated tool calls', () => {
		const original = toolCall('create_onto_task', {
			meta: { model: 'model-authored-value' }
		});

		expect(stampProjectCreateGenerationModel(original, 'actual/model')).toBe(original);
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
