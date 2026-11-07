// apps/worker/tests/agenticChatSourceQuote.test.ts
// Tasker 155: a write may say which of the user's words it came from (`from_quote`). It is
// display only: advertised on reviewed writes, split off at parse time, never a domain argument.
import { ONTOLOGY_WRITE_TOOLS, ONTOLOGY_READ_TOOLS } from '@buildos/agentic-chat-runtime/catalog';
import { describe, expect, it } from 'vitest';
import type { AgenticChatTurnProviderToolV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	appendToolCallDelta,
	completeToolCalls,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';
import { reviewedWorkerProviderToolDefinitionV1 } from '../src/workers/agentic-chat/provider/tool-surface';

function tool(name: string): AgenticChatTurnProviderToolV1 {
	const found = [...ONTOLOGY_WRITE_TOOLS, ...ONTOLOGY_READ_TOOLS].find(
		(entry) => entry.function.name === name
	);
	if (!found) throw new Error(`no ${name}`);
	return found as unknown as AgenticChatTurnProviderToolV1;
}

function complete(name: string, args: Record<string, unknown>) {
	const state = createToolCallAccumulator();
	appendToolCallDelta(state, [
		{ index: 0, id: 'call-1', function: { name, arguments: JSON.stringify(args) } }
	]);
	return completeToolCalls(state, [tool(name)])[0]!;
}

describe('from_quote', () => {
	it('is advertised on reviewed writes', () => {
		const surfaced = reviewedWorkerProviderToolDefinitionV1(tool('update_onto_task'));
		const properties = (
			surfaced!.function.parameters as { properties: Record<string, unknown> }
		).properties;
		expect(properties.from_quote).toMatchObject({ type: 'string' });
		expect((surfaced!.function.parameters as { required: string[] }).required).not.toContain(
			'from_quote'
		);
	});

	it('is split off the domain arguments when the call is parsed', () => {
		const call = complete('update_onto_task', {
			task_id: '33333333-3333-4333-8333-333333333333',
			due_at: '2026-11-09',
			from_quote: '  push the lease to Monday '
		});
		expect(call.sourceQuote).toBe('push the lease to Monday');
		expect(call.arguments).not.toHaveProperty('from_quote');
		expect(call.canonicalArguments).not.toContain('from_quote');
	});

	it('drops a quote that is not a string without failing the call', () => {
		const call = complete('update_onto_task', {
			task_id: '33333333-3333-4333-8333-333333333333',
			from_quote: 42
		});
		expect(call.sourceQuote).toBeUndefined();
		expect(call.arguments).not.toHaveProperty('from_quote');
	});
});
