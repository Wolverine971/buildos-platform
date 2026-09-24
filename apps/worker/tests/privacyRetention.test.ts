// apps/worker/tests/privacyRetention.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PRIVACY_RETENTION_TASKS,
	type PrivacyRetentionClient,
	type PrivacyRetentionTask,
	runPrivacyRetention
} from '../src/scheduler/privacyRetention';

type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };

function fakeClient(
	respond: (name: string, args: Record<string, unknown>, call: number) => RpcResponse,
	remove: (bucket: string, paths: string[]) => RpcResponse = () => ({ data: [], error: null })
) {
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const removals: Array<{ bucket: string; paths: string[] }> = [];
	const perName = new Map<string, number>();
	const client: PrivacyRetentionClient = {
		async rpc(name, args = {}) {
			const call = (perName.get(name) ?? 0) + 1;
			perName.set(name, call);
			calls.push({ name, args });
			return respond(name, args, call);
		},
		storage: {
			from(bucket) {
				return {
					async remove(paths) {
						removals.push({ bucket, paths });
						return remove(bucket, paths);
					}
				};
			}
		}
	};
	return { client, calls, removals };
}

function tasksNamed(...names: string[]): PrivacyRetentionTask[] {
	return names.map((name) => {
		const task = PRIVACY_RETENTION_TASKS.find((candidate) => candidate.name === name);
		if (!task) throw new Error(`unknown task ${name}`);
		return task;
	});
}

describe('runPrivacyRetention', () => {
	const printed = (method: 'log' | 'warn') =>
		vi
			.mocked(console[method])
			.mock.calls.map((args) => args.map(String).join(' '))
			.join('\n');

	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('calls a function again until a batch affects nothing, then sums its counts', async () => {
		const { client, calls } = fakeClient((name, _args, call) => ({
			data: { error_logs_deleted: call < 3 ? 500 : call === 3 ? 12 : 0 },
			error: null
		}));

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('cleanup_privacy_error_logs'),
			batchSize: 500
		});

		expect(calls).toHaveLength(4);
		expect(calls.every((call) => call.args.p_batch_size === 500)).toBe(true);
		expect(summary.results[0]).toMatchObject({
			name: 'cleanup_privacy_error_logs',
			status: 'drained',
			batches: 4,
			counts: { error_logs_deleted: 1012 }
		});
	});

	it('counts only the named keys of summaries that echo their settings', async () => {
		const { client, calls } = fakeClient((_name, _args, call) => ({
			data: {
				turn_events_deleted: call === 1 ? 3 : 0,
				stream_states_deleted: 0,
				turn_signals_deleted: 0,
				input_artifacts_deleted: 0,
				effects_deleted: 0,
				terminal_retention_days: 7,
				batch_size: 500
			},
			error: null
		}));

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('cleanup_agentic_chat_worker_artifacts')
		});

		// Without countKeys the echoed 7-day/500-row settings would never reach zero.
		expect(calls).toHaveLength(2);
		expect(summary.results[0]?.status).toBe('drained');
		expect(summary.results[0]?.counts.turn_events_deleted).toBe(3);
		expect(summary.results[0]?.counts).not.toHaveProperty('batch_size');
	});

	it('isolates a failing store: later stores still run, and only the SQLSTATE is logged', async () => {
		const { client, calls } = fakeClient((name) =>
			name === 'cleanup_privacy_email_bodies'
				? {
						data: null,
						error: {
							code: '23502',
							message: 'null value in column "body" violates not-null constraint'
						}
					}
				: { data: {}, error: null }
		);

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed(
				'cleanup_privacy_error_logs',
				'cleanup_privacy_email_bodies',
				'cleanup_privacy_sms_bodies'
			)
		});

		expect(calls.map((call) => call.name)).toEqual([
			'cleanup_privacy_error_logs',
			'cleanup_privacy_email_bodies',
			'cleanup_privacy_sms_bodies'
		]);
		expect(summary.results.map((result) => result.status)).toEqual([
			'drained',
			'failed',
			'drained'
		]);
		expect(summary.results[1]?.errorCode).toBe('23502');
		const warnings = printed('warn');
		expect(warnings).toContain('code=23502');
		expect(warnings).not.toContain('not-null constraint');
	});

	it('keeps the fixed guard name of a RAISE EXCEPTION', async () => {
		const { client } = fakeClient(() => ({
			data: null,
			error: { code: 'P0001', message: 'agentic_chat_control_row_retention_not_elapsed' }
		}));

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('cleanup_privacy_chat_workflow_runs')
		});

		expect(summary.results[0]?.errorCode).toBe(
			'P0001:agentic_chat_control_row_retention_not_elapsed'
		);
	});

	it('also isolates a store whose call throws', async () => {
		const client: PrivacyRetentionClient = {
			rpc: vi.fn(async (name: string) => {
				if (name === 'cleanup_privacy_cron_logs') throw new TypeError('fetch failed');
				return { data: {}, error: null };
			}),
			storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) }
		};

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('cleanup_privacy_cron_logs', 'cleanup_privacy_queue_jobs')
		});

		expect(summary.results.map((result) => [result.status, result.errorCode])).toEqual([
			['failed', 'TypeError'],
			['drained', undefined]
		]);
	});

	it('stops a store at its budget and moves on to the next store', async () => {
		let clock = 0;
		const { client, calls } = fakeClient((name) => {
			clock += 40;
			return name === 'cleanup_privacy_llm_usage_logs'
				? { data: { llm_usage_logs_deleted: 500 }, error: null }
				: { data: {}, error: null };
		});

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('cleanup_privacy_llm_usage_logs', 'cleanup_privacy_error_logs'),
			taskBudgetMs: 100,
			totalBudgetMs: 10_000,
			now: () => clock
		});

		expect(summary.results[0]).toMatchObject({
			status: 'budget_exhausted',
			batches: 3,
			counts: { llm_usage_logs_deleted: 1500 }
		});
		expect(summary.results[1]?.status).toBe('drained');
		expect(calls.filter((call) => call.name === 'cleanup_privacy_error_logs')).toHaveLength(1);
		expect(printed('warn')).toContain('stopped at its budget');
	});

	it('skips the remaining stores once the run budget is spent', async () => {
		let clock = 0;
		const { client, calls } = fakeClient(() => {
			clock += 60;
			return { data: { error_logs_deleted: 1 }, error: null };
		});

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed(
				'cleanup_privacy_error_logs',
				'cleanup_privacy_cron_logs',
				'cleanup_privacy_queue_jobs'
			),
			taskBudgetMs: 100,
			totalBudgetMs: 150,
			now: () => clock
		});

		expect(summary.results.map((result) => result.status)).toEqual([
			'budget_exhausted',
			'budget_exhausted',
			'skipped'
		]);
		expect(calls.some((call) => call.name === 'cleanup_privacy_queue_jobs')).toBe(false);
	});

	it('removes storage candidates through the Storage API until none are left', async () => {
		const pages = [
			[{ object_name: 'u1/b1.mp3' }, { object_name: 'u1/b2.mp3' }],
			[{ object_name: 'u2/b3.mp3' }],
			[]
		];
		const { client, calls, removals } = fakeClient((_name, _args, call) => ({
			data: pages[call - 1] ?? [],
			error: null
		}));

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('brief_audio'),
			batchSize: 200
		});

		expect(calls.every((call) => call.name === 'claim_privacy_expired_brief_audio')).toBe(true);
		expect(calls[0]?.args).toEqual({ p_limit: 200 });
		expect(removals).toEqual([
			{ bucket: 'brief-audio', paths: ['u1/b1.mp3', 'u1/b2.mp3'] },
			{ bucket: 'brief-audio', paths: ['u2/b3.mp3'] }
		]);
		expect(summary.results[0]).toMatchObject({
			status: 'drained',
			counts: { 'brief-audio_objects_removed': 3 }
		});
	});

	it('fails a storage sweep that keeps returning objects it already removed', async () => {
		const { client, removals } = fakeClient(() => ({
			data: [{ object_name: 'users/u1/chat-temp/t1/original.png' }],
			error: null
		}));

		const summary = await runPrivacyRetention({
			client,
			tasks: tasksNamed('chat_temp_images')
		});

		expect(removals).toHaveLength(1);
		expect(summary.results[0]).toMatchObject({
			status: 'failed',
			errorCode: 'storage_remove_no_progress'
		});
	});

	it('logs store names and counts, never object paths or row content', async () => {
		const { client } = fakeClient((name, _args, call) => {
			if (name === 'list_privacy_chat_temp_orphans') {
				return {
					data: call === 1 ? [{ object_name: 'users/u1/chat-temp/t1/original.png' }] : [],
					error: null
				};
			}
			return { data: { error_logs_deleted: call === 1 ? 2 : 0 }, error: null };
		});

		await runPrivacyRetention({
			client,
			tasks: tasksNamed('cleanup_privacy_error_logs', 'chat_temp_images')
		});

		const output = `${printed('log')}\n${printed('warn')}`;
		expect(output).toContain('cleanup_privacy_error_logs: error_logs_deleted=2');
		expect(output).toContain('chat_temp_images: onto-assets_objects_removed=1');
		expect(output).not.toContain('users/u1');
	});

	it('schedules every retention function the migration defines, plus the existing chat cleanups', () => {
		const migration = readFileSync(
			resolve(
				process.cwd(),
				'../../supabase/migrations/20260924190000_privacy_retention.sql'
			),
			'utf8'
		);
		const defined = [
			...migration.matchAll(
				/CREATE OR REPLACE FUNCTION public\.((?:cleanup|list|claim)_privacy_[a-z_]+)\(/g
			)
		].map((match) => match[1]);
		const scheduled = PRIVACY_RETENTION_TASKS.map((task) => task.rpc);

		expect(defined.length).toBeGreaterThan(25);
		expect(new Set(scheduled).size).toBe(scheduled.length);
		expect(scheduled).toEqual(
			expect.arrayContaining([
				...defined,
				'cleanup_agentic_chat_worker_artifacts',
				'cleanup_agentic_chat_prompt_artifacts',
				'cleanup_agentic_chat_sensitive_transcripts',
				'cleanup_expired_agent_call_bootstrap_links',
				'cleanup_agentic_chat_workflow_dispatches_v1'
			])
		);
	});
});
