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

	describe('all-users switch', () => {
		const allUsers = {
			PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
			PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS: 'true',
			PRIVATE_MULTI_CALENDAR_CONNECTIONS_EXCLUDED_USER_IDS: 'legacy-a, legacy-b'
		};

		it('admits every user without an allowlist entry', () => {
			expect(isMultiCalendarUserAllowed('new-user', allUsers)).toBe(true);
		});

		it('keeps excluded legacy users on the legacy runtime', () => {
			expect(isMultiCalendarUserAllowed('legacy-a', allUsers)).toBe(false);
			expect(isMultiCalendarUserAllowed('legacy-b', allUsers)).toBe(false);
		});

		it('lets the exact allowlist win over the exclusion', () => {
			expect(
				isMultiCalendarUserAllowed('legacy-a', {
					...allUsers,
					PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: 'legacy-a'
				})
			).toBe(true);
		});

		it('does nothing while the main flag is off', () => {
			expect(
				isMultiCalendarUserAllowed('new-user', {
					...allUsers,
					PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'false'
				})
			).toBe(false);
		});

		it('requires an explicit truthy value', () => {
			expect(
				isMultiCalendarUserAllowed('new-user', {
					...allUsers,
					PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS: '*'
				})
			).toBe(false);
		});

		it('ignores a wildcard in the exclusion list', () => {
			expect(
				isMultiCalendarUserAllowed('new-user', {
					...allUsers,
					PRIVATE_MULTI_CALENDAR_CONNECTIONS_EXCLUDED_USER_IDS: '*'
				})
			).toBe(true);
		});
	});
});
