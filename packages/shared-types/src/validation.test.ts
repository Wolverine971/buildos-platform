// packages/shared-types/src/validation.test.ts
import { describe, expect, it } from 'vitest';
import {
	ValidationError,
	isValidDateString,
	isValidISOString,
	isValidProgress,
	isValidTimezone,
	isValidUUID,
	tryValidateJobMetadata,
	validateDailyBriefMetadata,
	validateJobMetadata
} from './validation';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('shared-types validation helpers', () => {
	it('validates date, ISO timestamp, timezone, UUID, and progress primitives', () => {
		expect(isValidDateString('2026-07-06')).toBe(true);
		expect(isValidDateString('2026-7-6')).toBe(false);

		expect(isValidISOString('2026-07-06T12:30:00.000Z')).toBe(true);
		expect(isValidISOString('2026-07-06T12:30:00Z')).toBe(false);

		expect(isValidTimezone('UTC')).toBe(true);
		expect(isValidTimezone('America/New_York')).toBe(true);
		expect(isValidTimezone('america/new_york')).toBe(false);

		expect(isValidUUID(VALID_UUID)).toBe(true);
		expect(isValidUUID('not-a-uuid')).toBe(false);

		expect(isValidProgress(0)).toBe(true);
		expect(isValidProgress(100)).toBe(true);
		expect(isValidProgress(101)).toBe(false);
	});

	it('accepts valid daily brief metadata and preserves optional fields', () => {
		const metadata = validateDailyBriefMetadata({
			briefDate: '2026-07-06',
			timezone: 'America/New_York',
			options: {
				forceRegenerate: true,
				includeProjects: [VALID_UUID],
				engagementStage: 'standard'
			}
		});

		expect(metadata.briefDate).toBe('2026-07-06');
		expect(metadata.options?.includeProjects).toEqual([VALID_UUID]);
	});

	it('throws a field-specific ValidationError for malformed daily brief metadata', () => {
		expect(() =>
			validateDailyBriefMetadata({
				briefDate: '2026-07-06',
				timezone: 'America/New_York',
				options: {
					includeProjects: [VALID_UUID, 123]
				}
			})
		).toThrow(ValidationError);
	});

	it('enforces agent run metadata invariants through validateJobMetadata', () => {
		expect(() =>
			validateJobMetadata('agent_run', {
				run_id: VALID_UUID,
				trigger: 'manual',
				context_type: 'global',
				scope_mode: 'read_only',
				review_required: true
			})
		).toThrow(/review requires scope_mode=read_write/);
	});

	it('returns null instead of throwing from tryValidateJobMetadata', () => {
		expect(tryValidateJobMetadata('schedule_daily_sms', { userId: 'u1' })).toBeNull();
		expect(tryValidateJobMetadata('other', { any: 'payload' })).toEqual({ any: 'payload' });
	});
});
