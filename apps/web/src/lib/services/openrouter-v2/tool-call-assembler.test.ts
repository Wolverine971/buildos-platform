// apps/web/src/lib/services/openrouter-v2/tool-call-assembler.test.ts

import { describe, expect, it } from 'vitest';
import { isValidJsonObject, ToolCallAssembler } from './tool-call-assembler';

describe('ToolCallAssembler', () => {
	it('assembles fragmented tool arguments by index', () => {
		const assembler = new ToolCallAssembler();

		assembler.ingest({
			index: 0,
			id: 'call_1',
			function: { name: 'list_onto_tasks', arguments: '{"limit"' }
		});
		assembler.ingest({ index: 0, function: { arguments: ':5}' } });

		const [toolCall] = assembler.drain();
		expect(toolCall.id).toBe('call_1');
		expect(toolCall.function.name).toBe('list_onto_tasks');
		expect(toolCall.function.arguments).toBe('{"limit":5}');
	});

	it('resolves missing index using tool call id', () => {
		const assembler = new ToolCallAssembler();

		assembler.ingest({ id: 'call_abc', function: { name: 'tool_schema', arguments: '{"op"' } });
		assembler.ingest({ id: 'call_abc', function: { arguments: ':"onto.task.update"}' } });

		const [toolCall] = assembler.drain();
		expect(toolCall.id).toBe('call_abc');
		expect(toolCall.function.arguments).toBe('{"op":"onto.task.update"}');
	});

	it('tracks pending state correctly', () => {
		const assembler = new ToolCallAssembler();
		expect(assembler.hasPending()).toBe(false);

		assembler.ingest({ index: 0, function: { name: 'update_onto_task', arguments: '{}' } });
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
