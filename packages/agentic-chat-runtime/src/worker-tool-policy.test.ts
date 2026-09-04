// packages/agentic-chat-runtime/src/worker-tool-policy.test.ts
import { describe, expect, it } from 'vitest';
import { TOOL_METADATA } from './catalog/metadata';
import {
	AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1,
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

	it('fails closed for unknown tools while executing the ported external reads', () => {
		expect(
			findAgenticChatWorkerUnavailableToolNamesV1([
				'get_project_overview',
				// Calendar READS moved to the worker on 2026-09-03, the WRITES on
				// 2026-09-04.
				'list_calendar_events',
				'create_calendar_event',
				// The five email tools moved on 2026-09-04.
				'search_email_messages',
				'delete_onto_task',
				'future_unclassified_tool'
			])
		).toEqual(['delete_onto_task', 'future_unclassified_tool']);
	});

	it('executes the five email tools, including the browser OAuth handoff', () => {
		for (const name of [
			'get_external_account_status',
			'request_email_account_connection',
			'list_email_accounts',
			'search_email_messages',
			'get_email_message'
		]) {
			expect(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1, name).toContain(name);
			expect(AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1, name).not.toContain(name);
		}
		// The handoff is signed `write` in TOOL_METADATA because it asks the user
		// to grant access; it performs no mutation, so the worker executes it on
		// the read lane rather than through the reviewed mutation catalog.
		expect(
			findAgenticChatWorkerUnavailableToolNamesV1(['request_email_account_connection'])
		).toEqual([]);
	});

	it('executes the three calendar reads and all four calendar writes', () => {
		for (const name of [
			'list_calendar_events',
			'get_calendar_event_details',
			'get_project_calendar'
		]) {
			expect(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1, name).toContain(name);
			expect(AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1, name).not.toContain(name);
		}
		// 2026-09-04: the writes run on the worker and call Google directly, so
		// a calendar turn no longer renegotiates onto the legacy web engine.
		for (const name of [
			'create_calendar_event',
			'update_calendar_event',
			'delete_calendar_event',
			'set_project_calendar'
		]) {
			expect(AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1, name).toContain(name);
			expect(AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1, name).not.toContain(name);
		}
		expect(
			findAgenticChatWorkerUnavailableToolNamesV1([
				'create_calendar_event',
				'update_calendar_event',
				'delete_calendar_event',
				'set_project_calendar'
			])
		).toEqual([]);
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
