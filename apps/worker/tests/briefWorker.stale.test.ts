// apps/worker/tests/briefWorker.stale.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const mockSingle = vi.fn();
	const mockEq = vi.fn(() => ({
		single: mockSingle
	}));
	const mockSelect = vi.fn(() => ({
		eq: mockEq
	}));
	const mockFrom = vi.fn(() => ({
		select: mockSelect
	}));
	const mockUpdateJobStatus = vi.fn();
	const mockValidateBriefJobData = vi.fn((data) => data);
	const mockBroadcastUserEvent = vi.fn();
	const mockGenerateOntologyDailyBrief = vi.fn();

	return {
		mockSingle,
		mockFrom,
		mockUpdateJobStatus,
		mockValidateBriefJobData,
		mockBroadcastUserEvent,
		mockGenerateOntologyDailyBrief
	};
});

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.mockFrom
	}
}));

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: vi.fn()
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
		mocks.mockSingle.mockResolvedValue({
			data: {
				timezone: 'America/New_York'
			},
			error: null
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
});
