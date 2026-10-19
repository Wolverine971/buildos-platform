// packages/agentic-chat-runtime/src/loop/write-ledger.calendar.test.ts
import { describe, expect, it } from 'vitest';
import type { FastToolExecution } from './shared';
import { buildWriteLedger } from './write-ledger';

function calendarWrite(payload: Record<string, unknown>): FastToolExecution {
	return {
		toolCall: {
			id: 'calendar-1',
			type: 'function',
			function: {
				name: 'create_calendar_event',
				arguments: JSON.stringify({ title: 'Birthday' })
			}
		},
		result: { tool_call_id: 'calendar-1', success: true, result: payload }
	};
}

describe('calendar persistence during reconnect', () => {
	it('credits a saved BuildOS row even in an older reconnect receipt', () => {
		expect(
			buildWriteLedger([
				calendarWrite({
					ok: false,
					event_id: 'event-1',
					synced: false,
					error_code: 'reconnect_required'
				})
			])
		).toMatchObject([{ status: 'success', entityId: 'event-1' }]);
	});
	it('keeps a reconnect failure without a saved row as failed', () => {
		expect(
			buildWriteLedger([
				calendarWrite({
					ok: false,
					event_id: null,
					synced: false,
					error_code: 'reconnect_required'
				})
			])
		).toMatchObject([{ status: 'failure' }]);
	});
	it('does not credit a transport failure or uncertain outcome even with an event id', () => {
		const failed = calendarWrite({
			ok: false,
			event_id: 'event-1',
			error_code: 'reconnect_required'
		});
		failed.result.success = false;
		const uncertain = calendarWrite({
			ok: false,
			event_id: 'event-1',
			error_code: 'reconnect_required',
			effect_outcome: 'uncertain'
		});
		expect(buildWriteLedger([failed, uncertain])).toMatchObject([
			{ status: 'failure' },
			{ status: 'failure', uncertain: true }
		]);
	});
});
