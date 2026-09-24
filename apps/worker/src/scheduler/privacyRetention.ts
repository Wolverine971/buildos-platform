// apps/worker/src/scheduler/privacyRetention.ts
//
// Daily privacy retention (tasker 103). Every derived or pass-through store has a
// window enforced by one SQL function (supabase/migrations/20260924190000_privacy_retention.sql,
// 20260924190400_purge_soft_deleted_items.sql for soft-deleted rows,
// 20260924190600_privacy_gaps.sql, and the earlier cleanup_agentic_chat_* functions). Each call handles one bounded
// batch, so this job calls a function again until a batch affects nothing, or its
// store budget or the run budget is spent. Logs carry counts and error codes only.
import { queueConfig } from '../config/queueConfig';
import { supabase } from '../lib/supabase';

type RetentionError = { code?: string; message?: string } | null;

export type PrivacyRetentionClient = {
	rpc(
		name: string,
		args?: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: RetentionError }>;
	storage: {
		from(bucket: string): {
			remove(paths: string[]): PromiseLike<{ data: unknown; error: RetentionError }>;
		};
	};
};

type BatchContext = {
	client: PrivacyRetentionClient;
	batchSize: number;
	/** Storage names already removed in this run, to stop on a sweep that makes no progress. */
	seen: Set<string>;
};

export type PrivacyRetentionTask = {
	name: string;
	/** The SQL function this store's window lives in. */
	rpc: string;
	runBatch(context: BatchContext): Promise<Record<string, number>>;
};

export type PrivacyRetentionTaskResult = {
	name: string;
	status: 'drained' | 'budget_exhausted' | 'failed' | 'skipped';
	batches: number;
	counts: Record<string, number>;
	durationMs: number;
	errorCode?: string;
};

export type PrivacyRetentionSummary = {
	results: PrivacyRetentionTaskResult[];
	durationMs: number;
};

class RetentionTaskError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

// Error text can quote row values (e.g. constraint details), so only the SQLSTATE
// goes to the log, plus the message of a RAISE EXCEPTION (P0001): those are the
// fixed guard names our own functions and triggers raise.
function errorCode(error: unknown): string {
	if (error instanceof RetentionTaskError) return error.code;
	if (error && typeof error === 'object' && 'code' in error) {
		const { code, message } = error as { code?: unknown; message?: unknown };
		if (typeof code === 'string' && code) {
			return code === 'P0001' && typeof message === 'string'
				? `${code}:${message.slice(0, 120)}`
				: code;
		}
	}
	return error instanceof Error ? error.name : 'unknown';
}

function countsFrom(
	data: unknown,
	fallbackKey: string,
	countKeys?: string[]
): Record<string, number> {
	if (typeof data === 'number') return { [fallbackKey]: data };
	if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
	const summary = data as Record<string, unknown>;
	const keys = countKeys ?? Object.keys(summary);
	const counts: Record<string, number> = {};
	for (const key of keys) {
		const value = summary[key];
		if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value;
	}
	return counts;
}

/** One SQL cleanup function. `countKeys` names the counts in summaries that also echo settings. */
function rpcTask(name: string, countKeys?: string[]): PrivacyRetentionTask {
	return {
		name,
		rpc: name,
		async runBatch({ client, batchSize }) {
			const { data, error } = await client.rpc(name, { p_batch_size: batchSize });
			if (error) throw new RetentionTaskError(errorCode(error));
			return countsFrom(data, `${name}_affected`, countKeys);
		}
	};
}

/** SQL picks expired objects by path, age, and structural references; Storage deletes them. */
function storageTask(name: string, candidateRpc: string, bucket: string): PrivacyRetentionTask {
	const countKey = `${bucket}_objects_removed`;
	return {
		name,
		rpc: candidateRpc,
		async runBatch({ client, batchSize, seen }) {
			const { data, error } = await client.rpc(candidateRpc, {
				p_limit: Math.min(batchSize, 1000)
			});
			if (error) throw new RetentionTaskError(errorCode(error));
			const names = (Array.isArray(data) ? data : [])
				.map((row) => (row as { object_name?: unknown })?.object_name)
				.filter((value): value is string => typeof value === 'string' && value.length > 0);
			if (names.length === 0) return { [countKey]: 0 };
			if (names.every((objectName) => seen.has(objectName))) {
				throw new RetentionTaskError('storage_remove_no_progress');
			}

			const removal = await client.storage.from(bucket).remove(names);
			if (removal.error) throw new RetentionTaskError(errorCode(removal.error));
			for (const objectName of names) seen.add(objectName);
			return { [countKey]: names.length };
		}
	};
}

// Order: the existing chat cleanups first (unchanged behavior, now drained), then
// the stores tasker 103 added. Windows live in the SQL functions.
export const PRIVACY_RETENTION_TASKS: PrivacyRetentionTask[] = [
	rpcTask('cleanup_agentic_chat_worker_artifacts', [
		'turn_events_deleted',
		'stream_states_deleted',
		'turn_signals_deleted',
		'input_artifacts_deleted',
		'effects_deleted'
	]),
	rpcTask('cleanup_agentic_chat_prompt_artifacts', [
		'prepared_prompts_deleted',
		'context_snapshots_deleted',
		'prompt_snapshots_deleted',
		'rendered_dumps_cleared'
	]),
	rpcTask('cleanup_agentic_chat_sensitive_transcripts', [
		'tool_executions_deleted',
		'turn_events_deleted'
	]),
	rpcTask('cleanup_expired_agent_call_bootstrap_links'),
	rpcTask('cleanup_agentic_chat_workflow_dispatches_v1', ['dispatches_deleted']),
	rpcTask('cleanup_privacy_chat_turn_effects'),
	rpcTask('cleanup_privacy_chat_turn_requests'),
	rpcTask('cleanup_privacy_chat_turn_checkpoints'),
	rpcTask('cleanup_privacy_chat_execution_observations'),
	rpcTask('cleanup_privacy_chat_turn_recovery_failures'),
	rpcTask('cleanup_privacy_chat_workflow_runs'),
	rpcTask('cleanup_privacy_chat_answer_comparisons'),
	rpcTask('cleanup_privacy_chat_prompt_evals'),
	rpcTask('cleanup_privacy_agent_tool_payloads'),
	rpcTask('cleanup_privacy_llm_usage_logs'),
	rpcTask('cleanup_privacy_error_logs'),
	rpcTask('cleanup_privacy_notification_logs'),
	rpcTask('cleanup_privacy_cron_logs'),
	rpcTask('cleanup_privacy_user_activity_logs'),
	rpcTask('cleanup_privacy_queue_jobs'),
	rpcTask('cleanup_privacy_tracking_network_data'),
	rpcTask('cleanup_privacy_public_page_views'),
	rpcTask('cleanup_privacy_security_logs'),
	rpcTask('cleanup_privacy_email_bodies'),
	rpcTask('cleanup_privacy_sms_bodies'),
	rpcTask('cleanup_privacy_calendar_analysis_events'),
	rpcTask('cleanup_privacy_calendar_analyses'),
	rpcTask('cleanup_privacy_oauth_states'),
	rpcTask('cleanup_privacy_email_scan_checks'),
	rpcTask('cleanup_privacy_access_audits'),
	rpcTask('cleanup_privacy_email_relevance_runs'),
	rpcTask('cleanup_privacy_agent_oauth_artifacts'),
	rpcTask('cleanup_privacy_native_search_cache'),
	rpcTask('cleanup_privacy_web_page_evidence'),
	// Data exports (20260924190300): expire rows first so the sweep sees them.
	rpcTask('cleanup_privacy_user_data_exports'),
	storageTask('chat_temp_images', 'list_privacy_chat_temp_orphans', 'onto-assets'),
	storageTask('brief_audio', 'claim_privacy_expired_brief_audio', 'brief-audio'),
	storageTask('user_data_exports', 'list_privacy_expired_user_exports', 'user-exports'),
	// Soft-deleted rows, 30 days after deletion (20260924190400_purge_soft_deleted_items.sql).
	// Storage goes first: a row whose object still exists is skipped until a later run.
	storageTask('deleted_asset_objects', 'list_privacy_deleted_asset_objects', 'onto-assets'),
	storageTask(
		'deleted_voice_note_audio',
		'list_privacy_deleted_voice_note_objects',
		'voice_notes'
	),
	rpcTask('cleanup_privacy_deleted_projects'),
	rpcTask('cleanup_privacy_deleted_project_items'),
	rpcTask('cleanup_privacy_deleted_voice_notes'),
	rpcTask('cleanup_privacy_deleted_contacts'),
	rpcTask('cleanup_privacy_deleted_profile_documents'),
	rpcTask('cleanup_privacy_deleted_connections'),
	rpcTask('cleanup_privacy_deleted_cycles'),
	// Notifications 90 d, Stripe webhook payloads 90 d, deleted brain dumps 30 d
	// (20260924190600_privacy_gaps.sql).
	rpcTask('cleanup_privacy_notifications'),
	rpcTask('cleanup_privacy_webhook_events'),
	rpcTask('cleanup_privacy_soft_deleted_braindumps')
];

// A store that still has rows after this many batches resumes on the next run.
const MAX_BATCHES_PER_TASK = 1_000;

function sumCounts(counts: Record<string, number>): number {
	return Object.values(counts).reduce((total, value) => total + value, 0);
}

function formatCounts(counts: Record<string, number>): string {
	return Object.entries(counts)
		.map(([key, value]) => `${key}=${value}`)
		.join(', ');
}

export async function runPrivacyRetention(
	options: {
		client?: PrivacyRetentionClient;
		tasks?: PrivacyRetentionTask[];
		batchSize?: number;
		taskBudgetMs?: number;
		totalBudgetMs?: number;
		now?: () => number;
	} = {}
): Promise<PrivacyRetentionSummary> {
	const client = options.client ?? (supabase as unknown as PrivacyRetentionClient);
	const tasks = options.tasks ?? PRIVACY_RETENTION_TASKS;
	const batchSize = options.batchSize ?? queueConfig.privacyRetentionBatchSize;
	const taskBudgetMs = options.taskBudgetMs ?? queueConfig.privacyRetentionTaskBudgetMs;
	const totalBudgetMs = options.totalBudgetMs ?? queueConfig.privacyRetentionTotalBudgetMs;
	const now = options.now ?? Date.now;
	const runStartedAt = now();
	const results: PrivacyRetentionTaskResult[] = [];

	for (const task of tasks) {
		const taskStartedAt = now();
		if (taskStartedAt - runStartedAt >= totalBudgetMs) {
			results.push({
				name: task.name,
				status: 'skipped',
				batches: 0,
				counts: {},
				durationMs: 0
			});
			continue;
		}

		const counts: Record<string, number> = {};
		const context: BatchContext = { client, batchSize, seen: new Set() };
		let status: PrivacyRetentionTaskResult['status'] = 'budget_exhausted';
		let batches = 0;
		let failure: string | undefined;

		while (batches < MAX_BATCHES_PER_TASK) {
			const elapsed = now();
			if (
				elapsed - taskStartedAt >= taskBudgetMs ||
				elapsed - runStartedAt >= totalBudgetMs
			) {
				break;
			}
			let batch: Record<string, number>;
			try {
				batch = await task.runBatch(context);
			} catch (error) {
				status = 'failed';
				failure = errorCode(error);
				break;
			}
			batches += 1;
			for (const [key, value] of Object.entries(batch)) {
				counts[key] = (counts[key] ?? 0) + value;
			}
			if (sumCounts(batch) === 0) {
				status = 'drained';
				break;
			}
		}

		const result: PrivacyRetentionTaskResult = {
			name: task.name,
			status,
			batches,
			counts,
			durationMs: now() - taskStartedAt,
			...(failure ? { errorCode: failure } : {})
		};
		results.push(result);

		if (status === 'failed') {
			console.warn(
				`⚠️ Privacy retention ${task.name} failed (code=${failure}) after ${batches} batch(es)${sumCounts(counts) > 0 ? `: ${formatCounts(counts)}` : ''}`
			);
		} else if (status === 'budget_exhausted') {
			console.warn(
				`⚠️ Privacy retention ${task.name} stopped at its budget after ${batches} batch(es); the next run continues: ${formatCounts(counts)}`
			);
		} else if (sumCounts(counts) > 0) {
			console.log(`🧹 Privacy retention ${task.name}: ${formatCounts(counts)}`);
		}
	}

	const summary: PrivacyRetentionSummary = { results, durationMs: now() - runStartedAt };
	const tally = (status: PrivacyRetentionTaskResult['status']) =>
		results.filter((result) => result.status === status).length;
	console.log(
		`🧹 Privacy retention finished in ${summary.durationMs}ms: drained=${tally('drained')}/${results.length}, failed=${tally('failed')}, budget=${tally('budget_exhausted')}, skipped=${tally('skipped')}, affected=${results.reduce((total, result) => total + sumCounts(result.counts), 0)}`
	);
	return summary;
}
