// apps/worker/tests/scheduler.comprehensive.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { calculateNextRunTime, validateUserPreference } from '../src/scheduler';
import type { Database } from '@buildos/shared-types';

type UserBriefPreference = Database['public']['Tables']['user_brief_preferences']['Row'];

describe('Scheduler - calculateNextRunTime', () => {
	describe('Daily Frequency', () => {
		it("should schedule for today if time hasn't passed", () => {
			const now = new Date('2025-10-01T08:00:00Z'); // 8 AM UTC
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(9);
			expect(result?.getUTCMinutes()).toBe(0);
			expect(result?.getUTCDate()).toBe(1); // Same day
		});

		it('should schedule for tomorrow if time has passed', () => {
			const now = new Date('2025-10-01T10:00:00Z'); // 10 AM UTC
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(9);
			expect(result?.getUTCDate()).toBe(2); // Next day
		});

		it('should handle timezone conversion correctly (America/New_York)', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // 12 PM UTC = 8 AM EDT
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00', // 9 AM local time
				is_active: true,
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'America/New_York');

			expect(result).not.toBeNull();
			// 9 AM EDT = 1 PM UTC (EDT is UTC-4)
			expect(result?.getUTCHours()).toBe(13);
		});

		it('should handle timezone conversion correctly (Asia/Tokyo)', () => {
			const now = new Date('2025-10-01T00:00:00Z'); // Midnight UTC
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',
				is_active: true,
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'Asia/Tokyo');

			expect(result).not.toBeNull();
			// 9 AM JST = 12 AM UTC (JST is UTC+9)
			expect(result?.getUTCHours()).toBe(0);
		});

		it('should handle DST transitions correctly', () => {
			// Test during DST transition (spring forward)
			const now = new Date('2025-03-09T06:00:00Z'); // Day before DST
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',
				is_active: true,
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'America/New_York');

			expect(result).not.toBeNull();
			// date-fns-tz should handle DST automatically
			expect(result).toBeInstanceOf(Date);
		});

		it('should remove milliseconds for precise scheduling', () => {
			const now = new Date('2025-10-01T08:00:00.123Z'); // With milliseconds
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCMilliseconds()).toBe(0);
		});
	});

	describe('Weekly Frequency', () => {
		it('should schedule for next occurrence of day_of_week', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Wednesday, Oct 1
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'weekly',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: 1, // Monday
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCDay()).toBe(1); // Monday
			// Should be next Monday (Oct 6)
			expect(result?.getUTCDate()).toBe(6);
		});

		it("should schedule for today if day_of_week matches and time hasn't passed", () => {
			const now = new Date('2025-10-06T08:00:00Z'); // Monday, Oct 6, 8 AM
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'weekly',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: 1, // Monday
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCDate()).toBe(6); // Same day (today)
			expect(result?.getUTCHours()).toBe(9);
		});

		it('should schedule for next week if day_of_week matches but time has passed', () => {
			const now = new Date('2025-10-06T10:00:00Z'); // Monday, Oct 6, 10 AM
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'weekly',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: 1, // Monday
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCDay()).toBe(1); // Monday
			// Should be next Monday (Oct 13)
			expect(result?.getUTCDate()).toBe(13);
		});

		it('should handle all days of week (0-6)', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Wednesday, Oct 1

			for (let day = 0; day <= 6; day++) {
				const preference: UserBriefPreference = {
					id: 'test-id',
					user_id: 'user-1',
					frequency: 'weekly',
					time_of_day: '09:00:00',

					is_active: true,
					// email_daily_brief removed - now in user_notification_preferences
					day_of_week: day,
					created_at: '2025-01-01T00:00:00Z',
					updated_at: '2025-01-01T00:00:00Z'
				};

				const result = calculateNextRunTime(preference, now, 'UTC');
				expect(result).not.toBeNull();
				expect(result?.getUTCDay()).toBe(day);
			}
		});
	});

	describe('Custom Frequency', () => {
		it('should treat custom frequency as daily', () => {
			const now = new Date('2025-10-01T08:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'custom',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(9);
			expect(result?.getUTCDate()).toBe(1); // Same day
		});
	});

	describe('Invalid Inputs', () => {
		it('should return null for invalid time_of_day format', () => {
			const now = new Date('2025-10-01T12:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: 'invalid-time',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).toBeNull();
		});

		it('should return null for hours > 23', () => {
			const now = new Date('2025-10-01T12:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '25:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).toBeNull();
		});

		it('should return null for minutes > 59', () => {
			const now = new Date('2025-10-01T12:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:75:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).toBeNull();
		});

		it('should return null for negative values', () => {
			const now = new Date('2025-10-01T12:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '-01:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).toBeNull();
		});

		it('should return null for unknown frequency', () => {
			const now = new Date('2025-10-01T12:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'unknown' as any,
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).toBeNull();
		});
	});

	describe('Edge Cases', () => {
		it('should handle midnight time (00:00:00)', () => {
			const now = new Date('2025-10-01T23:00:00Z'); // 11 PM
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '00:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(0);
			expect(result?.getUTCDate()).toBe(2); // Next day
		});

		it('should handle end of day time (23:59:59)', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Noon
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '23:59:59',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(23);
			expect(result?.getUTCMinutes()).toBe(59);
			expect(result?.getUTCSeconds()).toBe(59);
			expect(result?.getUTCDate()).toBe(1); // Same day
		});

		it('should handle month boundaries correctly', () => {
			const now = new Date('2025-10-31T20:00:00Z'); // Oct 31, 8 PM
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCDate()).toBe(1); // Nov 1
			expect(result?.getUTCMonth()).toBe(10); // November (0-indexed)
		});

		it('should handle year boundaries correctly', () => {
			const now = new Date('2025-12-31T20:00:00Z'); // Dec 31, 8 PM
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCDate()).toBe(1); // Jan 1
			expect(result?.getUTCMonth()).toBe(0); // January
			expect(result?.getUTCFullYear()).toBe(2026);
		});

		it('should handle null timezone by using default UTC', () => {
			const now = new Date('2025-10-01T08:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',
				timezone: null,
				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(9);
		});

		it('should handle null time_of_day with default', () => {
			const now = new Date('2025-10-01T08:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: null,

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			// Should use default 09:00:00
			expect(result?.getUTCHours()).toBe(9);
		});

		it('should handle null frequency with default daily', () => {
			const now = new Date('2025-10-01T08:00:00Z');
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: null,
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCHours()).toBe(9);
		});
	});
});

describe('Scheduler - validateUserPreference', () => {
	it('should validate valid daily preference', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'daily',
			time_of_day: '09:00:00'
		};

		const errors = validateUserPreference(preference);

		expect(errors).toHaveLength(0);
	});

	it('should validate valid weekly preference', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'weekly',
			time_of_day: '09:00:00',

			day_of_week: 1
		};

		const errors = validateUserPreference(preference);

		expect(errors).toHaveLength(0);
	});

	it('should reject invalid frequency', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'invalid' as any,
			time_of_day: '09:00:00'
		};

		const errors = validateUserPreference(preference);

		expect(errors).toContain('Invalid frequency. Must be daily, weekly, or custom');
	});

	it('should reject invalid time_of_day format', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'daily',
			time_of_day: '9am'
		};

		const errors = validateUserPreference(preference);

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('time_of_day');
	});

	it('should reject invalid hours', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'daily',
			time_of_day: '25:00:00'
		};

		const errors = validateUserPreference(preference);

		expect(errors).toContain('Invalid hours in time_of_day');
	});

	it('should reject invalid minutes', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'daily',
			time_of_day: '09:75:00'
		};

		const errors = validateUserPreference(preference);

		expect(errors).toContain('Invalid minutes in time_of_day');
	});

	it('should reject invalid seconds', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'daily',
			time_of_day: '09:00:75'
		};

		const errors = validateUserPreference(preference);

		expect(errors).toContain('Invalid seconds in time_of_day');
	});

	it('should reject day_of_week < 0', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'weekly',
			time_of_day: '09:00:00',
			day_of_week: -1
		};

		const errors = validateUserPreference(preference);

		expect(errors).toContain(
			'Invalid day_of_week. Must be between 0 (Sunday) and 6 (Saturday)'
		);
	});

	it('should reject day_of_week > 6', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'weekly',
			time_of_day: '09:00:00',
			day_of_week: 7
		};

		const errors = validateUserPreference(preference);

		expect(errors).toContain(
			'Invalid day_of_week. Must be between 0 (Sunday) and 6 (Saturday)'
		);
	});

	it('should accept all valid day_of_week values (0-6)', () => {
		for (let day = 0; day <= 6; day++) {
			const preference: Partial<UserBriefPreference> = {
				frequency: 'weekly',
				time_of_day: '09:00:00',
				day_of_week: day
			};

			const errors = validateUserPreference(preference);
			expect(errors).toHaveLength(0);
		}
	});

	it('should accumulate multiple errors', () => {
		const preference: Partial<UserBriefPreference> = {
			frequency: 'invalid' as any,
			time_of_day: '25:75:99',
			day_of_week: 10
		};

		const errors = validateUserPreference(preference);

		expect(errors.length).toBeGreaterThan(3);
		expect(errors).toContain('Invalid frequency. Must be daily, weekly, or custom');
		expect(errors).toContain('Invalid hours in time_of_day');
		expect(errors).toContain('Invalid minutes in time_of_day');
		expect(errors).toContain('Invalid seconds in time_of_day');
		expect(errors).toContain(
			'Invalid day_of_week. Must be between 0 (Sunday) and 6 (Saturday)'
		);
	});
});

describe('Scheduler - Integration Tests', () => {
	describe('Timezone Edge Cases', () => {
		it('should handle Pacific/Auckland timezone (UTC+12/+13)', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Noon UTC
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00', // 9 AM NZDT (UTC+13)
				is_active: true,
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'Pacific/Auckland');

			expect(result).not.toBeNull();
			// 9 AM NZDT = 8 PM previous day UTC (during DST)
			expect(result).toBeInstanceOf(Date);
		});

		it('should handle America/Los_Angeles timezone (UTC-7/-8)', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Noon UTC
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00', // 9 AM PDT (UTC-7)
				is_active: true,
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'America/Los_Angeles');

			expect(result).not.toBeNull();
			// 9 AM PDT = 4 PM UTC
			expect(result?.getUTCHours()).toBe(16);
		});
	});

	describe('Real-World Scenarios', () => {
		it('should schedule correctly for a user in New York at 9 AM local', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Noon UTC = 8 AM EDT
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'daily',
				time_of_day: '09:00:00',
				is_active: true,
				day_of_week: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'America/New_York');

			expect(result).not.toBeNull();
			// Should schedule for today at 9 AM local (1 PM UTC)
			expect(result?.getUTCHours()).toBe(13);
			expect(result?.getUTCDate()).toBe(1); // Same day
		});

		it('should schedule for next Monday for weekly frequency', () => {
			const now = new Date('2025-10-01T12:00:00Z'); // Wednesday
			const preference: UserBriefPreference = {
				id: 'test-id',
				user_id: 'user-1',
				frequency: 'weekly',
				time_of_day: '09:00:00',

				is_active: true,
				// email_daily_brief removed - now in user_notification_preferences
				day_of_week: 1, // Monday
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};

			const result = calculateNextRunTime(preference, now, 'UTC');

			expect(result).not.toBeNull();
			expect(result?.getUTCDay()).toBe(1); // Monday
			// Next Monday is Oct 6
			expect(result?.getUTCDate()).toBe(6);
		});
	});
});
