// apps/web/src/lib/services/agentic-chat/execution/tool-execution/call-decoder.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import { ToolExecutionError } from '../../shared/types';
import { isToolArgumentRecord } from './argument-values';
import { decodeToolArguments, resolveToolCall } from './call-decoder';

describe('call-decoder', () => {
	it('resolves nested calls first and falls back to legacy direct arguments', () => {
		const nested = {
			id: 'nested',
			function: { name: '  web_search  ', arguments: '{"query":"nested"}' },
			name: 'legacy_name',
			arguments: { query: 'legacy' }
		} as unknown as ChatToolCall;
		const legacyFallback = {
			id: 'legacy',
			function: { name: ' web_search ', arguments: '   ' },
			arguments: { query: 'legacy' }
		} as unknown as ChatToolCall;

		expect(resolveToolCall(nested)).toEqual({
			name: 'web_search',
			rawArguments: '{"query":"nested"}'
		});
		expect(resolveToolCall(legacyFallback)).toEqual({
			name: 'web_search',
			rawArguments: { query: 'legacy' }
		});
	});

	it('returns typed scalar-recovery diagnostics for supported tools', () => {
		const result = decodeToolArguments('  product roadmap  ', 'web_search');

		expect(result).toEqual({
			ok: true,
			args: { query: 'product roadmap' },
			diagnostics: [
				{
					type: 'string_argument_fallback',
					reason: 'non_json_string',
					value: 'product roadmap'
				}
			]
		});
	});

	it('recovers double-encoded JSON containing raw control characters', () => {
		const rawArguments = JSON.stringify('{"content":"Hello\nWorld"}');

		const result = decodeToolArguments(rawArguments, 'create_onto_document');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.args).toEqual({ content: 'Hello\nWorld' });
		expect(result.diagnostics.map((diagnostic) => diagnostic.type)).toEqual([
			'control_characters_sanitized',
			'nested_json_reparsed'
		]);
	});

	it('returns the existing ToolExecutionError shape for invalid JSON', () => {
		const result = decodeToolArguments('{not-json', 'create_onto_task');

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toBeInstanceOf(ToolExecutionError);
		expect(result.error.message).toContain(
			'Invalid JSON for tool arguments: Expected property name or'
		);
	});

	it('deep-clones caller-owned argument objects', () => {
		const callerArguments = {
			nested: { status: 'original' },
			items: [{ id: 'one' }]
		};
		const snapshot = structuredClone(callerArguments);

		const result = decodeToolArguments(callerArguments, 'custom_tool');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.args).toEqual(snapshot);
		expect(result.args).not.toBe(callerArguments);
		expect(result.args.nested).not.toBe(callerArguments.nested);
		if (isToolArgumentRecord(result.args.nested)) {
			result.args.nested.status = 'changed';
		}
		expect(callerArguments).toEqual(snapshot);
	});
});
