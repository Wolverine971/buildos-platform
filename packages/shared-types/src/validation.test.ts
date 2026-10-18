// packages/shared-types/src/validation.test.ts
import { describe, expect, it } from 'vitest';
import { isProjectCalendarDeletionSnapshot } from './queue-types';
import { isValidTimezone, isValidUUID, validateAgentRunMetadata } from './validation';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('shared-types validation helpers', () => {
	it('validates timezone and UUID primitives', () => {
		expect(isValidTimezone('UTC')).toBe(true);
		expect(isValidTimezone('America/New_York')).toBe(true);
		expect(isValidTimezone('america/new_york')).toBe(false);

		expect(isValidUUID(VALID_UUID)).toBe(true);
		expect(isValidUUID('not-a-uuid')).toBe(false);
	});

	it('enforces agent run metadata invariants', () => {
		expect(() =>
			validateAgentRunMetadata({
				run_id: VALID_UUID,
				trigger: 'manual',
				context_type: 'global',
				scope_mode: 'read_only',
				review_required: true
			})
		).toThrow(/review requires scope_mode=read_write/);
	});
});

describe('project calendar deletion snapshot guard', () => {
	const snapshot = {
		externalEventId: 'google-event',
		calendarId: 'calendar',
		calendarSourceId: VALID_UUID
	};
	it('accepts a snapshot that carries provider identity', () => {
		expect(isProjectCalendarDeletionSnapshot(snapshot)).toBe(true);
	});
	it.each([{}, { externalEventId: 'google-event', calendarId: ' ' }, null])(
		'rejects invalid deletion snapshots',
		(input) => {
			expect(isProjectCalendarDeletionSnapshot(input)).toBe(false);
		}
	);
});
