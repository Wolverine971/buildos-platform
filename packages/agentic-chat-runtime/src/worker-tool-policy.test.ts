// packages/agentic-chat-runtime/src/worker-tool-policy.test.ts
import { describe, expect, it } from 'vitest';
import { TOOL_METADATA } from './loop';
import {
	AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1,
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
});
