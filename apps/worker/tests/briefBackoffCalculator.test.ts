// apps/worker/tests/briefBackoffCalculator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase before importing the calculator
vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: vi.fn()
	}
}));

import { BriefBackoffCalculator } from '../src/lib/briefBackoffCalculator';
import { supabase } from '../src/lib/supabase';

const mockSupabase = supabase as any;

describe('BriefBackoffCalculator', () => {
	let calculator: BriefBackoffCalculator;

	beforeEach(() => {
		vi.clearAllMocks();
		calculator = new BriefBackoffCalculator();
	});

	/**
	 * Helper to mock user last visit data
	 */
	function mockUserLastVisit(daysAgo: number | null) {
		const lastVisit =
			daysAgo !== null
				? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
				: null;

		mockSupabase.from.mockReturnValueOnce({
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({
				data: { last_visit: lastVisit },
				error: null
			})
		});
	}

	/**
	 * Helper to mock last brief sent
	 */
	function mockLastBriefSent(daysAgo: number | null) {
		if (daysAgo === null) {
			// No brief found
			mockSupabase.from.mockReturnValueOnce({
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				order: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				single: vi.fn().mockResolvedValue({
					data: null,
					error: { code: 'PGRST116' } // No rows found
				})
			});
		} else {
			const briefDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

			mockSupabase.from.mockReturnValueOnce({
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				order: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				single: vi.fn().mockResolvedValue({
					data: {
						brief_date: briefDate.split('T')[0],
						generation_completed_at: briefDate
					},
					error: null
				})
			});
		}
	}

	describe('Active users (0-2 days inactive)', () => {
		it('should send normal briefs for users who logged in today', async () => {
			mockUserLastVisit(0);
			mockLastBriefSent(1);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('User is active (logged in within 2 days)');
		});

		it('should send normal briefs for users who logged in 1 day ago', async () => {
			mockUserLastVisit(1);
			mockLastBriefSent(1);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('User is active (logged in within 2 days)');
		});

		it('should send normal briefs for users who logged in 2 days ago', async () => {
			mockUserLastVisit(2);
			mockLastBriefSent(1);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('User is active (logged in within 2 days)');
		});
	});

	describe('Cooling off period (3 days inactive)', () => {
		it('should skip briefs during 3-day cooling off period', async () => {
			mockUserLastVisit(3);
			mockLastBriefSent(1);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('Cooling off period (3 days inactive)');
		});
	});

	describe('4-day re-engagement', () => {
		it('should send re-engagement email on day 4 if last brief was 2+ days ago', async () => {
			mockUserLastVisit(4);
			mockLastBriefSent(2);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(true);
			expect(result.daysSinceLastLogin).toBe(4);
			expect(result.reason).toBe('4-day re-engagement email');
		});

		it('should NOT send on day 4 if brief was sent recently (less than 2 days)', async () => {
			mockUserLastVisit(4);
			mockLastBriefSent(1);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.isReengagement).toBe(false);
		});
	});

	describe('First backoff period (5-13 days)', () => {
		it('should skip briefs during first backoff (day 5)', async () => {
			mockUserLastVisit(5);
			mockLastBriefSent(3);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('First backoff period (5-13 days)');
		});

		it('should skip briefs during first backoff (day 9)', async () => {
			mockUserLastVisit(9);
			mockLastBriefSent(7);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.reason).toBe('First backoff period (5-13 days)');
		});
	});

	describe('14-day re-engagement', () => {
		it('should send re-engagement email on day 14 if last brief was 10+ days ago', async () => {
			mockUserLastVisit(14);
			mockLastBriefSent(10);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(true);
			expect(result.daysSinceLastLogin).toBe(14);
			expect(result.engagementStage).toBe('reengagement');
			expect(result.reason).toBe('14-day re-engagement email');
		});

		it('should NOT send on day 14 if brief was sent recently (less than 10 days)', async () => {
			mockUserLastVisit(14);
			mockLastBriefSent(9);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.isReengagement).toBe(false);
		});
	});

	describe('Long backoff period (15-59 days)', () => {
		it('should skip briefs during long backoff (day 15)', async () => {
			mockUserLastVisit(15);
			mockLastBriefSent(10);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('Long backoff period (15-59 days)');
		});

		it('should skip briefs during long backoff (day 59)', async () => {
			mockUserLastVisit(59);
			mockLastBriefSent(45);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.reason).toBe('Long backoff period (15-59 days)');
		});
	});

	describe('Dormant account check-in (60+ days)', () => {
		it('loads only completed briefs for individual fallback decisions', async () => {
			mockUserLastVisit(120);
			const briefQuery = {
				select: vi.fn(),
				eq: vi.fn(),
				order: vi.fn(),
				limit: vi.fn(),
				single: vi.fn().mockResolvedValue({
					data: null,
					error: { code: 'PGRST116' }
				})
			};
			briefQuery.select.mockReturnValue(briefQuery);
			briefQuery.eq.mockReturnValue(briefQuery);
			briefQuery.order.mockReturnValue(briefQuery);
			briefQuery.limit.mockReturnValue(briefQuery);
			mockSupabase.from.mockReturnValueOnce(briefQuery);

			await calculator.shouldSendDailyBrief('user-1');

			expect(briefQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
			expect(briefQuery.eq).toHaveBeenCalledWith('generation_status', 'completed');
		});

		it('should send dormant check-in if no brief has ever been sent', async () => {
			mockUserLastVisit(60);
			mockLastBriefSent(null);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(true);
			expect(result.daysSinceLastLogin).toBe(60);
			expect(result.engagementStage).toBe('dormant');
			expect(result.reason).toContain('Dormant account check-in');
		});

		it('should send dormant check-in for very inactive users if 90+ days since last brief', async () => {
			mockUserLastVisit(120);
			mockLastBriefSent(90);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(true);
			expect(result.daysSinceLastLogin).toBe(120);
			expect(result.engagementStage).toBe('dormant');
		});

		it('should NOT send if last brief was sent less than 90 days ago', async () => {
			mockUserLastVisit(120);
			mockLastBriefSent(45);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.reason).toContain('Waiting for 90-day dormant interval');
		});
	});

	describe('Edge cases', () => {
		it('should send normal brief for new users with no last_visit', async () => {
			mockUserLastVisit(null);
			mockLastBriefSent(null);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.daysSinceLastLogin).toBe(0);
			expect(result.reason).toBe('No last visit recorded');
		});

		it('should handle users with no briefs ever sent', async () => {
			mockUserLastVisit(5);
			mockLastBriefSent(null);

			const result = await calculator.shouldSendDailyBrief('user-1');

			// Should be in first backoff period based on 5 days inactive
			expect(result.shouldSend).toBe(false);
			expect(result.reason).toBe('First backoff period (5-13 days)');
		});

		it('should handle database errors gracefully (null last_visit)', async () => {
			mockSupabase.from.mockReturnValueOnce({
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				single: vi.fn().mockResolvedValue({
					data: null,
					error: { message: 'Database error' }
				})
			});
			mockLastBriefSent(1);

			const result = await calculator.shouldSendDailyBrief('user-1');

			// Should treat as new user
			expect(result.shouldSend).toBe(true);
			expect(result.reason).toBe('No last visit recorded');
		});
	});

	describe('Automatic reset on user activity', () => {
		it('should resume normal briefs when inactive user returns (was at day 14, now at day 1)', async () => {
			mockUserLastVisit(1);
			mockLastBriefSent(14);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('User is active (logged in within 2 days)');
		});

		it('should resume normal briefs when long-inactive user returns (was at day 45, now at day 0)', async () => {
			mockUserLastVisit(0);
			mockLastBriefSent(45);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.reason).toBe('User is active (logged in within 2 days)');
		});
	});

	describe('Brief email opens and clicks count as activity', () => {
		const DAY_MS = 24 * 60 * 60 * 1000;
		const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

		type DeliveryRow = {
			recipient_user_id: string;
			opened_at: string | null;
			clicked_at: string | null;
		};

		/** The notification_deliveries query: select → in → eq → eq → gte (awaited). */
		function mockBriefEmailActivity(
			rows: DeliveryRow[],
			error: { message: string } | null = null
		) {
			const builder = {
				select: vi.fn().mockReturnThis(),
				in: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				gte: vi.fn().mockResolvedValue({ data: error ? null : rows, error })
			};
			mockSupabase.from.mockReturnValueOnce(builder);
			return builder;
		}

		it('keeps sending normal briefs to someone who reads the email but never opens the app', async () => {
			mockUserLastVisit(10);
			mockLastBriefSent(1);
			const deliveries = mockBriefEmailActivity([
				{ recipient_user_id: 'user-1', opened_at: daysAgo(3), clicked_at: null },
				{ recipient_user_id: 'user-1', opened_at: daysAgo(1), clicked_at: null }
			]);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(mockSupabase.from).toHaveBeenNthCalledWith(3, 'notification_deliveries');
			expect(deliveries.in).toHaveBeenCalledWith('recipient_user_id', ['user-1']);
			expect(deliveries.eq).toHaveBeenCalledWith('channel', 'email');
			expect(deliveries.eq).toHaveBeenCalledWith('payload->>event_type', 'brief.completed');
			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(false);
			expect(result.engagementStage).toBe('standard');
			expect(result.reason).toBe('User is active (opened a brief email within 2 days)');
			// Re-engagement copy quotes the app visit, so that stays literal.
			expect(result.daysSinceLastLogin).toBe(10);
			expect(result.daysSinceLastActivity).toBe(1);
		});

		it('uses the click when it is later than the open', async () => {
			mockUserLastVisit(10);
			mockLastBriefSent(1);
			mockBriefEmailActivity([
				{ recipient_user_id: 'user-1', opened_at: daysAgo(6), clicked_at: daysAgo(2) }
			]);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.daysSinceLastActivity).toBe(2);
			expect(result.shouldSend).toBe(true);
			expect(result.reason).toBe('User is active (opened a brief email within 2 days)');
		});

		it('uses the app visit when it is later than the last email open', async () => {
			mockUserLastVisit(1);
			mockLastBriefSent(1);
			mockBriefEmailActivity([
				{ recipient_user_id: 'user-1', opened_at: daysAgo(5), clicked_at: null }
			]);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.daysSinceLastActivity).toBe(1);
			expect(result.reason).toBe('User is active (logged in within 2 days)');
		});

		it('runs the backoff stages on the email open', async () => {
			mockUserLastVisit(30);
			mockLastBriefSent(3);
			mockBriefEmailActivity([
				{ recipient_user_id: 'user-1', opened_at: daysAgo(4), clicked_at: null }
			]);

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(true);
			expect(result.isReengagement).toBe(true);
			expect(result.reason).toBe('4-day re-engagement email');
			expect(result.daysSinceLastLogin).toBe(30);
		});

		it('falls back to app visits when the open lookup fails', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			mockUserLastVisit(10);
			mockLastBriefSent(1);
			mockBriefEmailActivity([], { message: 'deliveries unavailable' });

			const result = await calculator.shouldSendDailyBrief('user-1');

			expect(result.shouldSend).toBe(false);
			expect(result.reason).toBe('First backoff period (5-13 days)');
			expect(result.daysSinceLastActivity).toBe(10);
			warn.mockRestore();
		});

		it('batch path: one extra query for everyone, applied per user', async () => {
			mockSupabase.rpc = vi.fn().mockResolvedValue({
				data: [
					{
						user_id: 'reader',
						brief_date: daysAgo(1).slice(0, 10),
						generation_completed_at: daysAgo(1)
					},
					{
						user_id: 'lapsed',
						brief_date: daysAgo(1).slice(0, 10),
						generation_completed_at: daysAgo(1)
					}
				],
				error: null
			});
			mockSupabase.from.mockReturnValueOnce({
				select: vi.fn().mockReturnThis(),
				in: vi.fn().mockResolvedValue({
					data: [
						{ id: 'reader', last_visit: daysAgo(10) },
						{ id: 'lapsed', last_visit: daysAgo(10) }
					],
					error: null
				})
			});
			const deliveries = mockBriefEmailActivity([
				{ recipient_user_id: 'reader', opened_at: daysAgo(0), clicked_at: daysAgo(0) }
			]);

			const results = await calculator.shouldSendDailyBriefBatch(['reader', 'lapsed']);

			const deliveryQueries = mockSupabase.from.mock.calls.filter(
				([table]: [string]) => table === 'notification_deliveries'
			);
			expect(deliveryQueries).toHaveLength(1);
			expect(deliveries.in).toHaveBeenCalledWith('recipient_user_id', ['reader', 'lapsed']);
			expect(results.get('reader')).toMatchObject({
				shouldSend: true,
				engagementStage: 'standard',
				daysSinceLastLogin: 10,
				daysSinceLastActivity: 0
			});
			expect(results.get('lapsed')).toMatchObject({
				shouldSend: false,
				reason: 'First backoff period (5-13 days)',
				daysSinceLastActivity: 10
			});
		});
	});
});
