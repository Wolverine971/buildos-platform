// apps/worker/tests/briefWorker.stale.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const mockResponses = {
		user: {
			data: {
				timezone: 'America/New_York'
			},
			error: null as { code?: string; message: string } | null
		},
		existingBrief: {
			data: null as {
				id: string;
				generation_status: string;
				updated_at: string;
			} | null,
			error: null as { code?: string; message: string } | null
		},
		notificationPrefs: {
			data: null as {
				should_email_daily_brief?: boolean;
				should_sms_daily_brief?: boolean;
			} | null,
			error: {
				code: 'PGRST116',
				message: 'No rows returned'
			} as { code?: string; message: string } | null
		},
		projectBriefs: {
			data: [] as Array<{ id: string; metadata: Record<string, unknown> }>,
			error: null as { code?: string; message: string } | null
		},
		ontologyDailyBriefMetadata: {
			data: {
				metadata: {}
			} as { metadata: Record<string, unknown> } | null,
			error: null as { code?: string; message: string } | null
		},
		queueUpdate: {
			data: null,
			error: null as { code?: string; message: string } | null
		}
	};
	const mockUpdates = [] as Array<{
		table: string;
		payload: Record<string, unknown>;
		filters: Array<{ type: string; column: string; value: unknown }>;
	}>;

	function makeResponse(table: string, filters: Array<{ column: string; value: unknown }>) {
		if (table === 'users') return Promise.resolve(mockResponses.user);
		if (table === 'user_notification_preferences') {
			return Promise.resolve(mockResponses.notificationPrefs);
		}
		if (table === 'ontology_project_briefs') {
			return Promise.resolve(mockResponses.projectBriefs);
		}
		if (table === 'ontology_daily_briefs') {
			if (filters.some((filter) => filter.column === 'id')) {
				return Promise.resolve(mockResponses.ontologyDailyBriefMetadata);
			}
			return Promise.resolve(mockResponses.existingBrief);
		}
		return Promise.resolve({ data: null, error: null });
	}

	function createBuilder(table: string) {
		const filters = [] as Array<{ type: string; column: string; value: unknown }>;
		let updatePayload: Record<string, unknown> | null = null;

		const execute = () => {
			if (updatePayload) {
				return Promise.resolve(mockResponses.queueUpdate);
			}

			return makeResponse(table, filters);
		};

		const builder = {
			select: vi.fn(() => builder),
			update: vi.fn((payload: Record<string, unknown>) => {
				updatePayload = payload;
				mockUpdates.push({ table, payload, filters });
				return builder;
			}),
			eq: vi.fn((column: string, value: unknown) => {
				filters.push({ type: 'eq', column, value });
				return builder;
			}),
			in: vi.fn((column: string, value: unknown) => {
				filters.push({ type: 'in', column, value });
				return builder;
			}),
			order: vi.fn(() => builder),
			limit: vi.fn(() => builder),
			single: vi.fn(() => execute()),
			maybeSingle: vi.fn(() => execute()),
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				execute().then(resolve, reject)
		};

		return builder;
	}

	const mockFrom = vi.fn((table: string) => createBuilder(table));
	const mockUpdateJobStatus = vi.fn();
	const mockValidateBriefJobData = vi.fn((data) => data);
	const mockBroadcastUserEvent = vi.fn();
	const mockGenerateOntologyDailyBrief = vi.fn();
	const mockCreateServiceClient = vi.fn(() => ({
		rpc: vi.fn().mockResolvedValue({ data: null, error: null })
	}));

	return {
		mockResponses,
		mockUpdates,
		mockFrom,
		mockUpdateJobStatus,
		mockValidateBriefJobData,
		mockBroadcastUserEvent,
		mockGenerateOntologyDailyBrief,
		mockCreateServiceClient
	};
});

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.mockFrom
	}
}));

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: mocks.mockCreateServiceClient
}));

vi.mock('../src/workers/shared/queueUtils', () => ({
	updateJobStatus: mocks.mockUpdateJobStatus,
	validateBriefJobData: mocks.mockValidateBriefJobData,
	broadcastUserEvent: mocks.mockBroadcastUserEvent
}));

vi.mock('../src/workers/brief/ontologyBriefGenerator', () => ({
	generateOntologyDailyBrief: mocks.mockGenerateOntologyDailyBrief
}));

vi.mock('@buildos/shared-utils', () => ({
	generateCorrelationId: vi.fn(() => '00000000-0000-4000-8000-000000000000')
}));

import { processBriefJob } from '../src/workers/brief/briefWorker';
import type { BriefJobData } from '../src/workers/shared/queueUtils';
import type { LegacyJob } from '../src/workers/shared/jobAdapter';

function createBriefJob(data: BriefJobData): LegacyJob<BriefJobData> {
	return {
		id: 'job-stale-brief',
		processingToken: 'claim-token',
		data: {
			...data,
			userId: data.userId
		},
		opts: {},
		timestamp: Date.now(),
		attemptsMade: 0,
		updateProgress: vi.fn(),
		log: vi.fn()
	};
}

describe('processBriefJob stale daily brief guard', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-12T14:00:00Z'));
		vi.clearAllMocks();
		mocks.mockUpdates.length = 0;
		mocks.mockResponses.user = {
			data: {
				timezone: 'America/New_York'
			},
			error: null
		};
		mocks.mockResponses.existingBrief = {
			data: null,
			error: null
		};
		mocks.mockResponses.notificationPrefs = {
			data: null,
			error: {
				code: 'PGRST116',
				message: 'No rows returned'
			}
		};
		mocks.mockResponses.projectBriefs = {
			data: [],
			error: null
		};
		mocks.mockResponses.ontologyDailyBriefMetadata = {
			data: {
				metadata: {}
			},
			error: null
		};
		mocks.mockResponses.queueUpdate = {
			data: null,
			error: null
		};
		mocks.mockGenerateOntologyDailyBrief.mockResolvedValue({
			id: 'new-brief-1'
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('completes stale missed daily brief jobs without generating a brief', async () => {
		const job = createBriefJob({
			userId: 'user-1',
			briefDate: '2026-04-11',
			timezone: 'America/New_York',
			notificationScheduledFor: '2026-04-11T13:00:00.000Z'
		});

		await processBriefJob(job);

		expect(mocks.mockValidateBriefJobData).toHaveBeenCalledWith(job.data);
		expect(mocks.mockUpdateJobStatus).toHaveBeenCalledWith(
			'job-stale-brief',
			'processing',
			'brief',
			undefined,
			'claim-token'
		);
		expect(mocks.mockUpdateJobStatus).toHaveBeenCalledWith(
			'job-stale-brief',
			'completed',
			'brief',
			undefined,
			'claim-token'
		);
		expect(mocks.mockGenerateOntologyDailyBrief).not.toHaveBeenCalled();
		expect(mocks.mockBroadcastUserEvent).not.toHaveBeenCalled();
		expect(job.log).toHaveBeenCalledWith(
			'Brief date 2026-04-11 is before current local date 2026-04-12 in America/New_York'
		);
	});

	it('completes jobs for already completed briefs without generating or emitting completion', async () => {
		mocks.mockResponses.existingBrief = {
			data: {
				id: 'existing-brief-1',
				generation_status: 'completed',
				updated_at: '2026-04-12T13:55:00.000Z'
			},
			error: null
		};
		const job = createBriefJob({
			userId: 'user-1',
			briefDate: '2026-04-12',
			timezone: 'America/New_York',
			options: {
				forceRegenerate: false
			}
		});

		await processBriefJob(job);

		expect(mocks.mockGenerateOntologyDailyBrief).not.toHaveBeenCalled();
		expect(mocks.mockBroadcastUserEvent).not.toHaveBeenCalled();
		expect(mocks.mockCreateServiceClient).not.toHaveBeenCalled();
		expect(mocks.mockUpdateJobStatus).toHaveBeenCalledWith(
			'job-stale-brief',
			'completed',
			'brief',
			undefined,
			'claim-token'
		);
		expect(job.log).toHaveBeenCalledWith('Brief 2026-04-12 already completed');
		expect(mocks.mockUpdates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: 'queue_jobs',
					payload: expect.objectContaining({
						metadata: expect.objectContaining({
							skipReason: 'skipped_existing_brief',
							existingBriefId: 'existing-brief-1'
						})
					})
				})
			])
		);
	});

	it('regenerates an already completed brief when forceRegenerate is true', async () => {
		mocks.mockResponses.existingBrief = {
			data: {
				id: 'existing-brief-1',
				generation_status: 'completed',
				updated_at: '2026-04-12T13:55:00.000Z'
			},
			error: null
		};
		const job = createBriefJob({
			userId: 'user-1',
			briefDate: '2026-04-12',
			timezone: 'America/New_York',
			options: {
				forceRegenerate: true
			}
		});

		await processBriefJob(job);

		expect(mocks.mockGenerateOntologyDailyBrief).toHaveBeenCalledWith(
			'user-1',
			'2026-04-12',
			expect.objectContaining({ forceRegenerate: true }),
			'America/New_York',
			'job-stale-brief'
		);
		expect(mocks.mockUpdates).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: 'queue_jobs',
					payload: expect.objectContaining({
						metadata: expect.objectContaining({
							skipReason: 'skipped_existing_brief'
						})
					})
				})
			])
		);
	});

	it('completes jobs for fresh processing briefs without generating', async () => {
		mocks.mockResponses.existingBrief = {
			data: {
				id: 'existing-brief-1',
				generation_status: 'processing',
				updated_at: '2026-04-12T13:55:00.000Z'
			},
			error: null
		};
		const job = createBriefJob({
			userId: 'user-1',
			briefDate: '2026-04-12',
			timezone: 'America/New_York'
		});

		await processBriefJob(job);

		expect(mocks.mockGenerateOntologyDailyBrief).not.toHaveBeenCalled();
		expect(job.log).toHaveBeenCalledWith('Brief 2026-04-12 is already processing');
		expect(mocks.mockUpdates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: 'queue_jobs',
					payload: expect.objectContaining({
						metadata: expect.objectContaining({
							skipReason: 'skipped_fresh_processing_brief',
							existingBriefId: 'existing-brief-1'
						})
					})
				})
			])
		);
	});

	it('generates when the existing processing brief is stale', async () => {
		mocks.mockResponses.existingBrief = {
			data: {
				id: 'existing-brief-1',
				generation_status: 'processing',
				updated_at: '2026-04-12T13:49:00.000Z'
			},
			error: null
		};
		const job = createBriefJob({
			userId: 'user-1',
			briefDate: '2026-04-12',
			timezone: 'America/New_York'
		});

		await processBriefJob(job);

		expect(mocks.mockGenerateOntologyDailyBrief).toHaveBeenCalledWith(
			'user-1',
			'2026-04-12',
			undefined,
			'America/New_York',
			'job-stale-brief'
		);
		expect(mocks.mockUpdates).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: 'queue_jobs',
					payload: expect.objectContaining({
						metadata: expect.objectContaining({
							skipReason: 'skipped_fresh_processing_brief'
						})
					})
				})
			])
		);
	});
});
