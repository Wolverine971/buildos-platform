// apps/web/src/lib/services/openrouter-v2/tool-call-assembler.test.ts

import { describe, expect, it } from 'vitest';
import { isValidJsonObject, ToolCallAssembler } from './tool-call-assembler';

describe('ToolCallAssembler', () => {
	it('assembles fragmented tool arguments by index', () => {
		const assembler = new ToolCallAssembler();

		assembler.ingest({
			index: 0,
			id: 'call_1',
			function: { name: 'tool_exec', arguments: '{"op":"onto.task.list"' }
		});
		assembler.ingest({ index: 0, function: { arguments: ',"args":{"limit":5}}' } });

		const [toolCall] = assembler.drain();
		expect(toolCall.id).toBe('call_1');
		expect(toolCall.function.name).toBe('tool_exec');
		expect(toolCall.function.arguments).toBe('{"op":"onto.task.list","args":{"limit":5}}');
	});

	it('resolves missing index using tool call id', () => {
		const assembler = new ToolCallAssembler();

		assembler.ingest({ id: 'call_abc', function: { name: 'tool_help', arguments: '{"path"' } });
		assembler.ingest({ id: 'call_abc', function: { arguments: ':"root"}' } });

		const [toolCall] = assembler.drain();
		expect(toolCall.id).toBe('call_abc');
		expect(toolCall.function.arguments).toBe('{"path":"root"}');
	});

	it('tracks pending state correctly', () => {
		const assembler = new ToolCallAssembler();
		expect(assembler.hasPending()).toBe(false);

		assembler.ingest({ index: 0, function: { name: 'tool_exec', arguments: '{}' } });
		expect(assembler.hasPending()).toBe(true);

		assembler.clear();
		expect(assembler.hasPending()).toBe(false);
	});
});

describe('isValidJsonObject', () => {
	it('returns true only for valid JSON payloads', () => {
		expect(isValidJsonObject('{"ok":true}')).toBe(true);
		expect(isValidJsonObject('')).toBe(false);
		expect(isValidJsonObject('{"bad"')).toBe(false);
	});
});
