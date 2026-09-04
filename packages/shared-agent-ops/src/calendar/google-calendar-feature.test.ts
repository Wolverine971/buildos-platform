// packages/shared-agent-ops/src/calendar/google-calendar-feature.test.ts
import { describe, expect, it } from 'vitest';
import { isMultiCalendarUserAllowed } from './google-calendar-feature';

describe('isMultiCalendarUserAllowed', () => {
	it('requires both the global flag and exact user match', () => {
		expect(
			isMultiCalendarUserAllowed('user-a', {
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: 'user-a,user-b'
			})
		).toBe(true);
		expect(
			isMultiCalendarUserAllowed('user-c', {
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: 'user-a,user-b'
			})
		).toBe(false);
	});

	it('does not treat a wildcard as an allowlist', () => {
		expect(
			isMultiCalendarUserAllowed('user-a', {
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
				PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: '*'
			})
		).toBe(false);
	});

	it('stays disabled by default', () => {
		expect(isMultiCalendarUserAllowed('user-a', {})).toBe(false);
	});
});
