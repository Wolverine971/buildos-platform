// packages/agentic-chat-runtime/src/worker-tool-policy.test.ts
import { describe, expect, it } from 'vitest';
import { TOOL_METADATA } from './catalog/metadata';
import {
	AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1,
	AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1,
	AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1,
	auditAgenticChatWorkerToolPolicyV1,
	findAgenticChatWorkerUnavailableToolNamesV1
} from './worker-tool-policy';

describe('Agentic Chat worker tool policy', () => {
	it('explicitly partitions every signed public tool', () => {
		expect(() => auditAgenticChatWorkerToolPolicyV1()).not.toThrow();
		const executableMetadata = AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1.filter((name) =>
			Object.hasOwn(TOOL_METADATA, name)
		);
		expect(
			[...executableMetadata, ...AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1].sort()
		).toEqual(Object.keys(TOOL_METADATA).sort());
	});

	it('fails closed for unknown and external-account tools', () => {
		expect(
			findAgenticChatWorkerUnavailableToolNamesV1([
				'get_project_overview',
				'list_calendar_events',
				'future_unclassified_tool'
			])
		).toEqual(['future_unclassified_tool', 'list_calendar_events']);
	});

	it('executes global document reads and explicitly omits preloaded domain discovery', () => {
		expect(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1).toContain('get_document_outline');
		expect(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1).toContain('read_document_section');
		expect(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1).toContain('domain_search');
		expect(AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1).toContain('declare_read_only_turn');
		expect(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1).not.toContain(
			'declare_read_only_turn'
		);
		// Retired 2026-09-02 (Decision 2): zero measured calls and inert on the
		// immutable worker surface. It is no longer a signed public tool at all.
		expect(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1).not.toContain('change_chat_context');
		expect(findAgenticChatWorkerUnavailableToolNamesV1(['change_chat_context'])).toEqual([
			'change_chat_context'
		]);
	});
});
