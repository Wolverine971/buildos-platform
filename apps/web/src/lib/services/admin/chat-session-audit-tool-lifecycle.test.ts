// apps/web/src/lib/services/admin/chat-session-audit-tool-lifecycle.test.ts
import { describe, expect, it } from 'vitest';
import {
	shouldHideMergedToolOutcomeEvent,
	toolDisplayName,
	toolLifecycleDisplayState
} from './chat-session-audit-tool-lifecycle';
import type { AuditTimelineEvent } from './chat-session-audit-types';

const event = (
	id: string,
	eventType: string,
	payload: Record<string, unknown>,
	timestamp = `2026-04-12T12:00:0${id.at(-1) ?? '0'}.000Z`
): AuditTimelineEvent => ({
	id,
	timestamp,
	type: 'turn_event',
	severity: payload.success === false ? 'error' : 'info',
	title: `Turn Event: ${eventType}`,
	summary: '',
	turn_index: 1,
	payload: {
		event_type: eventType,
		...payload
	}
});

describe('chat-session-audit-tool-lifecycle', () => {
	it('merges emitted and outcome events and hides the paired outcome row', () => {
		const events = [
			event('event-1', 'tool_call_emitted', {
				tool_call_id: 'call-1',
				tool_name: 'buildos_gateway',
				canonical_op: 'project.search',
				arguments: { query: 'outline' }
			}),
			event('event-2', 'tool_result_received', {
				tool_call_id: 'call-1',
				tool_name: 'buildos_gateway',
				success: true,
				duration_ms: 321,
				result: { matches: 2 }
			})
		];

		const merged = toolLifecycleDisplayState(events, 0);
		expect(merged.outcomeEvent?.id).toBe('event-2');
		expect(merged.displayTitle).toBe('Tool Call Completed: buildos_gateway');
		expect(merged.displaySummary).toContain('completed');
		expect(merged.displayPayload).toMatchObject({
			tool_call_id: 'call-1',
			arguments: { query: 'outline' },
			result: { matches: 2 },
			success: true
		});
		expect(shouldHideMergedToolOutcomeEvent(events, 1)).toBe(true);
		expect(toolLifecycleDisplayState(events, 1).hideEvent).toBe(true);
	});

	it('keeps mismatched outcomes visible and reads trace payload display names', () => {
		const events = [
			event('event-1', 'tool_call_emitted', {
				tool_call_id: 'call-1',
				tool_name: 'buildos_gateway'
			}),
			event('event-2', 'tool_result_received', {
				tool_call_id: 'call-2',
				success: true
			})
		];

		expect(toolLifecycleDisplayState(events, 0).outcomeEvent).toBeNull();
		expect(toolLifecycleDisplayState(events, 1).hideEvent).toBe(false);
		expect(
			toolDisplayName({
				source: 'assistant_message_metadata',
				trace_entry: { gateway_op: 'project.search' }
			})
		).toBe('project.search');
	});
});
