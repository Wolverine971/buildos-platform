// apps/worker/tests/agenticChatFixtureConsumer.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseQueue, type ProcessingJob } from '../src/lib/supabaseQueue';
import { supabase } from '../src/lib/supabase';
import {
	DEFAULT_AGENTIC_CHAT_FIXTURE_CONSUMER_CONFIG,
	createAgenticChatFixtureConsumer
} from '../src/workers/agentic-chat/fixtureConsumer';

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn(),
		from: vi.fn()
	}
}));

beforeEach(() => {
	vi.mocked(supabase.rpc).mockReset();
});

describe('Agentic Chat fixture consumer isolation', () => {
	it('constructs one inert chat-only queue with independent fixture policy', () => {
		const executor = { execute: vi.fn() };
		const consumer = createAgenticChatFixtureConsumer(executor as never);

		expect(consumer.config).toEqual(DEFAULT_AGENTIC_CHAT_FIXTURE_CONSUMER_CONFIG);
		expect(consumer.queue.getRegisteredJobTypes()).toEqual(['agentic_chat_turn']);
		expect(consumer.queue.getHealth()).toMatchObject({
			healthy: false,
			reason: 'queue_not_started'
		});
		expect(executor.execute).not.toHaveBeenCalled();
	});

	it('validates independent concurrency and timeout relationships', () => {
		const executor = { execute: vi.fn() };
		expect(() =>
			createAgenticChatFixtureConsumer(executor as never, { concurrency: 9 })
		).toThrow('concurrency cannot exceed 8');
		expect(() =>
			createAgenticChatFixtureConsumer(executor as never, {
				workerTimeoutMs: 1_000,
				stalledTimeoutMs: 1_000
			})
		).toThrow('stalled timeout must exceed');
		expect(() =>
			createAgenticChatFixtureConsumer(executor as never, { pollIntervalMs: 100 })
		).toThrow('polling cannot be below 250ms');
	});

	it('keeps saturated general slots independent from bounded chat slots', async () => {
		const generalJobs = Array.from({ length: 20 }, (_, index) =>
			claimedJob(index, 'send_notification')
		);
		const chatJobs = Array.from({ length: 2 }, (_, index) =>
			claimedJob(100 + index, 'agentic_chat_turn')
		);
		let generalClaimed = false;
		let chatClaimed = false;
		vi.mocked(supabase.rpc).mockImplementation(async (name, args) => {
			if (name === 'claim_pending_jobs') {
				const jobTypes = (args as { p_job_types: string[] }).p_job_types;
				if (jobTypes.length !== 1) throw new Error('Fixture queue mixed job types');
				if (jobTypes[0] === 'send_notification') {
					if (generalClaimed) return { data: [], error: null } as never;
					generalClaimed = true;
					return { data: generalJobs, error: null } as never;
				}
				if (jobTypes[0] === 'agentic_chat_turn') {
					if (chatClaimed) return { data: [], error: null } as never;
					chatClaimed = true;
					return { data: chatJobs, error: null } as never;
				}
				throw new Error(`Unexpected fixture job type ${jobTypes[0]}`);
			}
			if (name === 'complete_queue_job') return { data: true, error: null } as never;
			return { data: false, error: null } as never;
		});

		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const generalStarted: string[] = [];
		const chatStarted: string[] = [];
		const general = new SupabaseQueue({ batchSize: 20, pollInterval: 60_000 });
		general.process('send_notification', async (job: ProcessingJob) => {
			generalStarted.push(job.id);
			await gate;
		});
		const chat = createAgenticChatFixtureConsumer(
			{
				async execute(job) {
					chatStarted.push(job.id);
					await gate;
					return {
						outcome: 'completed',
						turnRunId: String(job.data.turnRunId),
						executionGeneration: 1,
						terminalStatus: 'completed',
						queueReconciled: true
					};
				}
			},
			{ concurrency: 2 }
		);

		await Promise.all([general.start(), chat.queue.start()]);
		await vi.waitFor(() => {
			expect(generalStarted).toHaveLength(20);
			expect(chatStarted).toHaveLength(2);
		});
		expect(general.getRegisteredJobTypes()).toEqual(['send_notification']);
		expect(chat.queue.getRegisteredJobTypes()).toEqual(['agentic_chat_turn']);
		expect(
			vi.mocked(supabase.rpc).mock.calls
				.filter(([name]) => name === 'claim_pending_jobs')
				.slice(0, 2)
				.map(([, args]) => args)
		).toEqual([
			{ p_job_types: ['send_notification'], p_batch_size: 20 },
			{ p_job_types: ['agentic_chat_turn'], p_batch_size: 2 }
		]);

		release();
		await Promise.all([general.stop(), chat.queue.stop()]);
		expect(
			vi
				.mocked(supabase.rpc)
				.mock.calls.filter(([name]) => name === 'complete_queue_job')
		).toHaveLength(20);
	});
});

function claimedJob(index: number, jobType: 'send_notification' | 'agentic_chat_turn') {
	const suffix = index.toString().padStart(3, '0');
	const timestamp = '2026-08-03T12:00:00.000Z';
	return {
		attempts: 0,
		completed_at: null,
		created_at: timestamp,
		dedup_key: `dedup-${suffix}`,
		error_message: null,
		id: `row-${suffix}`,
		job_type: jobType,
		max_attempts: 3,
		metadata: {
			turnRunId: `turn-${suffix}`,
			correlationId: `correlation-${suffix}`
		},
		priority: 10,
		processed_at: null,
		processing_token: `token-${suffix}`,
		queue_job_id: `job-${suffix}`,
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: `user-${suffix}`
	};
}
