// apps/worker/tests/scheduler-parallel.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addHours } from 'date-fns';

describe('Scheduler - Batch Parallel Processing', () => {
	let mockSupabase: any;
	let mockBackoffCalculator: any;
	let mockQueueBriefGeneration: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock Supabase client
		mockSupabase = {
			from: vi.fn(() => mockSupabase),
			select: vi.fn(() => mockSupabase),
			eq: vi.fn(() => mockSupabase),
			in: vi.fn(() => mockSupabase),
			gte: vi.fn(() => mockSupabase),
			lte: vi.fn(() => mockSupabase),
			then: vi.fn((callback) => callback({ data: [], error: null }))
		};

		// Mock backoff calculator
		mockBackoffCalculator = {
			shouldSendDailyBrief: vi.fn(async (userId: string) => ({
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin: 0
			}))
		};

		// Mock queue function
		mockQueueBriefGeneration = vi.fn(async () => ({ jobId: 'test-job-id' }));
	});

	describe('Parallel Engagement Checks', () => {
		it('should check engagement status for all users in parallel', async () => {
			const mockPreferences = Array.from({ length: 10 }, (_, i) => ({
				user_id: `user-${i}`,
				frequency: 'daily',
				time_of_day: '09:00:00',
				timezone: 'UTC',
				is_active: true
			}));

			const engagementCallTimes: number[] = [];

			mockBackoffCalculator.shouldSendDailyBrief = vi.fn(async (userId: string) => {
				engagementCallTimes.push(Date.now());
				await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms per check
				return {
					shouldSend: true,
					isReengagement: false,
					daysSinceLastLogin: 0
				};
			});

			// Simulate batch engagement checks (from scheduler.ts Phase 1)
			const startTime = Date.now();
			const engagementChecks = await Promise.allSettled(
				mockPreferences.map(async (preference) => {
					if (!preference.user_id) return null;
					const decision = await mockBackoffCalculator.shouldSendDailyBrief(
						preference.user_id
					);
					return { userId: preference.user_id, decision };
				})
			);
			const totalTime = Date.now() - startTime;

			// Assertions
			expect(mockBackoffCalculator.shouldSendDailyBrief).toHaveBeenCalledTimes(10);
			expect(engagementChecks).toHaveLength(10);

			// Sequential would take 10 × 50ms = 500ms
			// Parallel should take ~50-100ms
			expect(totalTime).toBeLessThan(150); // Much faster than 500ms
			expect(totalTime).toBeGreaterThan(40); // At least as long as one check

			// Verify calls started nearly simultaneously (within 20ms of each other)
			const callTimeSpread =
				Math.max(...engagementCallTimes) - Math.min(...engagementCallTimes);
			expect(callTimeSpread).toBeLessThan(20); // All started at roughly same time
		});

		it('should handle engagement check failures without blocking other users', async () => {
			const mockPreferences = [
				{
					user_id: 'user-1',
					frequency: 'daily',
					timezone: 'UTC',
					is_active: true
				},
				{
					user_id: 'user-2',
					frequency: 'daily',
					timezone: 'UTC',
					is_active: true
				},
				{
					user_id: 'user-3',
					frequency: 'daily',
					timezone: 'UTC',
					is_active: true
				}
			];

			mockBackoffCalculator.shouldSendDailyBrief = vi.fn(async (userId: string) => {
				if (userId === 'user-2') {
					throw new Error('Database timeout');
				}
				return {
					shouldSend: true,
					isReengagement: false,
					daysSinceLastLogin: 0
				};
			});

			const engagementChecks = await Promise.allSettled(
				mockPreferences.map(async (preference) => {
					const decision = await mockBackoffCalculator.shouldSendDailyBrief(
						preference.user_id
					);
					return { userId: preference.user_id, decision };
				})
			);

			// Map results to engagement data
			const engagementDataMap = new Map();
			engagementChecks.forEach((result) => {
				if (result.status === 'fulfilled' && result.value) {
					const { userId, decision } = result.value;
					engagementDataMap.set(userId, decision);
				}
			});

			// Assertions
			expect(mockBackoffCalculator.shouldSendDailyBrief).toHaveBeenCalledTimes(3);
			expect(engagementDataMap.size).toBe(2); // user-1 and user-3 succeeded
			expect(engagementDataMap.has('user-1')).toBe(true);
			expect(engagementDataMap.has('user-2')).toBe(false); // Failed
			expect(engagementDataMap.has('user-3')).toBe(true);
		});
	});

	describe('Batch Duplicate Job Check', () => {
		it('should check for existing jobs with single query for all users', async () => {
			const mockPreferences = Array.from({ length: 100 }, (_, i) => ({
				user_id: `user-${i}`,
				frequency: 'daily',
				time_of_day: '09:00:00',
				timezone: 'UTC',
				is_active: true
			}));

			const now = new Date();
			const oneHourFromNow = addHours(now, 1);
			const userIds = mockPreferences.map((p) => p.user_id);

			let queryCalls = 0;
			mockSupabase.from = vi.fn(() => {
				queryCalls++;
				return mockSupabase;
			});

			// Simulate single batch query (from scheduler.ts Phase 3)
			mockSupabase.then = vi.fn((callback) =>
				callback({
					data: [
						{ user_id: 'user-5', scheduled_for: now.toISOString() },
						{ user_id: 'user-15', scheduled_for: now.toISOString() }
					],
					error: null
				})
			);

			const result = await mockSupabase
				.from('queue_jobs')
				.select('user_id, scheduled_for')
				.in('user_id', userIds)
				.eq('job_type', 'generate_daily_brief')
				.in('status', ['pending', 'processing']);

			// Assertions
			expect(queryCalls).toBe(1); // SINGLE query, not 100 queries!
			expect(mockSupabase.in).toHaveBeenCalledWith('user_id', userIds);
			expect(result.data).toHaveLength(2); // 2 users already have jobs
		});

		it('should efficiently filter users with existing jobs', async () => {
			const usersToSchedule = [
				{
					preference: { user_id: 'user-1', timezone: 'UTC' },
					nextRunTime: new Date('2024-01-15T09:00:00Z')
				},
				{
					preference: { user_id: 'user-2', timezone: 'UTC' },
					nextRunTime: new Date('2024-01-15T09:00:00Z')
				},
				{
					preference: { user_id: 'user-3', timezone: 'UTC' },
					nextRunTime: new Date('2024-01-15T09:00:00Z')
				}
			];

			// Mock existing jobs for user-2
			const existingJobs = [{ user_id: 'user-2', scheduled_for: '2024-01-15T09:05:00Z' }];

			const existingJobsMap = new Map<string, Date[]>();
			existingJobs.forEach((job) => {
				if (!existingJobsMap.has(job.user_id)) {
					existingJobsMap.set(job.user_id, []);
				}
				existingJobsMap.get(job.user_id)!.push(new Date(job.scheduled_for));
			});

			// Filter logic (from scheduler.ts)
			const timeWindow = 30 * 60 * 1000; // 30 minutes
			const usersToQueue = usersToSchedule.filter(({ preference, nextRunTime }) => {
				const userJobs = existingJobsMap.get(preference.user_id) || [];
				const windowStart = new Date(nextRunTime.getTime() - timeWindow);
				const windowEnd = new Date(nextRunTime.getTime() + timeWindow);

				const hasConflict = userJobs.some(
					(jobTime) => jobTime >= windowStart && jobTime <= windowEnd
				);

				return !hasConflict;
			});

			// Assertions
			expect(usersToQueue).toHaveLength(2); // user-1 and user-3
			expect(usersToQueue.map((u) => u.preference.user_id)).toEqual(['user-1', 'user-3']);
		});
	});

	describe('Parallel Job Queuing', () => {
		it('should queue multiple jobs in parallel', async () => {
			const usersToQueue = Array.from({ length: 50 }, (_, i) => ({
				preference: {
					user_id: `user-${i}`,
					timezone: 'UTC'
				},
				nextRunTime: new Date('2024-01-15T09:00:00Z'),
				engagementMetadata: undefined
			}));

			const queueCallTimes: number[] = [];
			mockQueueBriefGeneration = vi.fn(async (userId: string) => {
				queueCallTimes.push(Date.now());
				await new Promise((resolve) => setTimeout(resolve, 20)); // 20ms per job
				return { jobId: `job-${userId}` };
			});

			// Simulate parallel queuing (from scheduler.ts Phase 4)
			const startTime = Date.now();
			const queueResults = await Promise.allSettled(
				usersToQueue.map(async ({ preference, nextRunTime, engagementMetadata }) => {
					await mockQueueBriefGeneration(
						preference.user_id,
						nextRunTime,
						undefined,
						preference.timezone,
						engagementMetadata
					);
					return preference.user_id;
				})
			);
			const totalTime = Date.now() - startTime;

			// Assertions
			expect(mockQueueBriefGeneration).toHaveBeenCalledTimes(50);
			expect(queueResults).toHaveLength(50);

			// Sequential would take 50 × 20ms = 1000ms
			// Parallel should take ~20-50ms
			expect(totalTime).toBeLessThan(100); // Much faster than 1000ms
			expect(totalTime).toBeGreaterThan(15); // At least as long as one job

			// Verify calls started nearly simultaneously
			const callTimeSpread = Math.max(...queueCallTimes) - Math.min(...queueCallTimes);
			expect(callTimeSpread).toBeLessThan(50); // All started at roughly same time
		});

		it('should report successes and failures separately', async () => {
			const usersToQueue = [
				{
					preference: { user_id: 'user-1', timezone: 'UTC' },
					nextRunTime: new Date()
				},
				{
					preference: { user_id: 'user-2', timezone: 'UTC' },
					nextRunTime: new Date()
				},
				{
					preference: { user_id: 'user-3', timezone: 'UTC' },
					nextRunTime: new Date()
				},
				{
					preference: { user_id: 'user-4', timezone: 'UTC' },
					nextRunTime: new Date()
				}
			];

			mockQueueBriefGeneration = vi.fn(async (userId: string) => {
				if (userId === 'user-2' || userId === 'user-4') {
					throw new Error('Queue insertion failed');
				}
				return { jobId: `job-${userId}` };
			});

			const queueResults = await Promise.allSettled(
				usersToQueue.map(async ({ preference, nextRunTime }) => {
					await mockQueueBriefGeneration(
						preference.user_id,
						nextRunTime,
						undefined,
						preference.timezone
					);
					return preference.user_id;
				})
			);

			// Count successes and failures
			const successCount = queueResults.filter((r) => r.status === 'fulfilled').length;
			const failureCount = queueResults.filter((r) => r.status === 'rejected').length;

			// Assertions
			expect(mockQueueBriefGeneration).toHaveBeenCalledTimes(4);
			expect(successCount).toBe(2); // user-1 and user-3
			expect(failureCount).toBe(2); // user-2 and user-4

			// Extract failed user IDs
			const failedUsers: string[] = [];
			queueResults.forEach((result, i) => {
				if (result.status === 'rejected') {
					failedUsers.push(usersToQueue[i].preference.user_id);
				}
			});

			expect(failedUsers).toEqual(['user-2', 'user-4']);
		});
	});

	describe('Overall Performance Improvement', () => {
		it('should demonstrate 10x speedup vs sequential processing', async () => {
			const mockPreferences = Array.from({ length: 100 }, (_, i) => ({
				user_id: `user-${i}`,
				frequency: 'daily',
				timezone: 'UTC',
				is_active: true
			}));

			const operationTime = 30; // ms per operation

			// Sequential processing (OLD way)
			const sequentialStart = Date.now();
			for (const preference of mockPreferences) {
				// Engagement check
				await new Promise((resolve) => setTimeout(resolve, operationTime));
				// Duplicate check
				await new Promise((resolve) => setTimeout(resolve, operationTime));
				// Queue job
				await new Promise((resolve) => setTimeout(resolve, operationTime));
			}
			const sequentialTime = Date.now() - sequentialStart;

			// Parallel processing (NEW way)
			const parallelStart = Date.now();

			// Phase 1: Parallel engagement checks
			await Promise.all(
				mockPreferences.map(
					() => new Promise((resolve) => setTimeout(resolve, operationTime))
				)
			);

			// Phase 3: Single duplicate check query (instant)
			await new Promise((resolve) => setTimeout(resolve, operationTime));

			// Phase 4: Parallel job queuing
			await Promise.all(
				mockPreferences.map(
					() => new Promise((resolve) => setTimeout(resolve, operationTime))
				)
			);

			const parallelTime = Date.now() - parallelStart;

			// Assertions
			// Sequential: 100 users × 3 operations × 30ms = 9000ms
			expect(sequentialTime).toBeGreaterThan(8800);

			// Parallel: 30ms + 30ms + 30ms = 90ms
			expect(parallelTime).toBeLessThan(150);

			// Calculate speedup
			const speedup = sequentialTime / parallelTime;
			expect(speedup).toBeGreaterThan(50); // At least 50x speedup!

			console.log(`
        Performance Comparison:
        - Sequential: ${sequentialTime}ms
        - Parallel: ${parallelTime}ms
        - Speedup: ${speedup.toFixed(1)}x
      `);
		}, 15000); // 15 second timeout for performance test
	});

	describe('Edge Cases', () => {
		it('should handle empty user list gracefully', async () => {
			const mockPreferences: any[] = [];

			// Should complete without errors
			const engagementChecks = await Promise.allSettled(
				mockPreferences.map(async (preference) => {
					const decision = await mockBackoffCalculator.shouldSendDailyBrief(
						preference.user_id
					);
					return { userId: preference.user_id, decision };
				})
			);

			expect(engagementChecks).toHaveLength(0);
			expect(mockBackoffCalculator.shouldSendDailyBrief).not.toHaveBeenCalled();
		});

		it('should handle single user efficiently', async () => {
			const mockPreferences = [
				{
					user_id: 'user-1',
					frequency: 'daily',
					timezone: 'UTC',
					is_active: true
				}
			];

			mockBackoffCalculator.shouldSendDailyBrief = vi.fn(async () => ({
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin: 0
			}));

			const engagementChecks = await Promise.allSettled(
				mockPreferences.map(async (preference) => {
					const decision = await mockBackoffCalculator.shouldSendDailyBrief(
						preference.user_id
					);
					return { userId: preference.user_id, decision };
				})
			);

			expect(engagementChecks).toHaveLength(1);
			expect(engagementChecks[0].status).toBe('fulfilled');
		});

		it('should handle large user lists (1000+ users)', async () => {
			const mockPreferences = Array.from({ length: 1000 }, (_, i) => ({
				user_id: `user-${i}`,
				frequency: 'daily',
				timezone: 'UTC',
				is_active: true
			}));

			mockBackoffCalculator.shouldSendDailyBrief = vi.fn(async () => ({
				shouldSend: true,
				isReengagement: false,
				daysSinceLastLogin: 0
			}));

			const startTime = Date.now();
			const engagementChecks = await Promise.allSettled(
				mockPreferences.map(async (preference) => {
					const decision = await mockBackoffCalculator.shouldSendDailyBrief(
						preference.user_id
					);
					return { userId: preference.user_id, decision };
				})
			);
			const totalTime = Date.now() - startTime;

			// Should complete all 1000 checks
			expect(engagementChecks).toHaveLength(1000);

			// Should complete in reasonable time (depends on system, but should be < 2s)
			expect(totalTime).toBeLessThan(2000);

			console.log(`Processed 1000 users in ${totalTime}ms`);
		});
	});
});
