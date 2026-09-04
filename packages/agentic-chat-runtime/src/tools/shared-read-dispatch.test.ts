// packages/agentic-chat-runtime/src/tools/shared-read-dispatch.test.ts
import { describe, expect, it } from 'vitest';
import { TOOL_METADATA } from '../catalog/metadata';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
	executeAgenticChatSharedReadToolV1,
	isAgenticChatSharedReadToolNameV1
} from './shared-read-dispatch';

const unusedContext = {} as AgenticChatSharedReadContextV1;

describe('shared read dispatch', () => {
	it('exports one unique, metadata-backed catalog', () => {
		expect(new Set(AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1).size).toBe(
			AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1.length
		);
		// 35 ontology/overview reads + the three calendar reads the worker gained
		// on 2026-09-03 (list_calendar_events, get_calendar_event_details,
		// get_project_calendar) + the five email tools it gained on 2026-09-04
		// (get_external_account_status, request_email_account_connection,
		// list_email_accounts, search_email_messages, get_email_message).
		expect(AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1).toHaveLength(43);
		for (const toolName of AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1) {
			expect(TOOL_METADATA[toolName], `${toolName} is missing TOOL_METADATA`).toBeDefined();
			expect(isAgenticChatSharedReadToolNameV1(toolName)).toBe(true);
		}
		expect(isAgenticChatSharedReadToolNameV1('update_onto_task')).toBe(false);
	});

	it('dispatches a typed context-free utility through the shared envelope', async () => {
		await expect(
			executeAgenticChatSharedReadToolV1({
				toolName: 'get_field_info',
				context: unusedContext,
				arguments: { entity_type: 'ontology_task', field_name: 'title' }
			})
		).resolves.toMatchObject({
			entity_type: 'ontology_task',
			message: 'Field information for ontology_task.title'
		});
	});
});
