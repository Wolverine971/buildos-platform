// apps/worker/src/workers/consolidation/runtime.ts
// Run helpers shared by the consolidation survey and merge jobs.
import { supabase } from '../../lib/supabase';
import type { JSONUsageEvent } from '../../lib/services/smart-llm-service';

export type RunRow = {
	id: string;
	user_id: string;
	root_project_id: string;
	project_ids: string[];
	status: string;
	plan: unknown;
	cost_usd: number | string;
	created_at: string;
};

/** A survey of DJ's largest family costs about a cent; this stops a runaway. */
export const RUN_COST_CAP_USD = 0.25;

export class CostCapError extends Error {}

/**
 * Whose spend: `all` (the run's total, merges included, for display), `run`
 * (survey, replans and the web's readings, for the run's cap; merges have
 * their own), or one merge's own calls.
 */
export type SpendScope = 'all' | 'run' | { cluster: string };

/**
 * What a run (or one of its merges) has really cost: every logged model call,
 * including attempts that failed and responses that came back unusable. The
 * in-job tracker only sees calls that succeed in that attempt; on 10-04 it
 * showed $0.050 for a run that had spent $0.090.
 */
export async function loggedSpend(run: RunRow, scope: SpendScope = 'all'): Promise<number> {
	const cluster = typeof scope === 'object' ? scope.cluster : null;
	let query = supabase
		.from('llm_usage_logs')
		.select('total_cost_usd')
		.gte('created_at', run.created_at)
		// For one merge, only its own calls (the survey's decision for that group is the run's).
		.like('operation_type', cluster ? 'consolidation_merge_%' : 'consolidation_%')
		.eq('metadata->>consolidation_run_id', run.id);
	if (cluster) query = query.eq('metadata->>consolidation_cluster', cluster);
	if (scope === 'run') query = query.not('operation_type', 'like', 'consolidation_merge_%');
	const { data, error } = await query.limit(2000);
	if (error) throw new Error(`Read logged spend: ${error.message}`);
	const total = (data ?? []).reduce((sum, row) => sum + (Number(row.total_cost_usd) || 0), 0);
	return Math.round(total * 10_000) / 10_000;
}

export async function loadRun(runId: string): Promise<RunRow | null> {
	const { data, error } = await supabase
		.from('consolidation_runs')
		.select('id, user_id, root_project_id, project_ids, status, plan, cost_usd, created_at')
		.eq('id', runId)
		.maybeSingle();
	if (error) throw new Error(`Load consolidation run: ${error.message}`);
	return (data as RunRow | null) ?? null;
}

/**
 * Writes the run only while it is in one of `onlyFrom`, so a late job never
 * revives a run the owner applied or cancelled meanwhile. False when skipped.
 */
export async function updateRun(
	runId: string,
	patch: Record<string, unknown>,
	onlyFrom?: string[]
): Promise<boolean> {
	let query = supabase
		.from('consolidation_runs')
		.update({ ...patch, updated_at: new Date().toISOString() } as never)
		.eq('id', runId);
	if (onlyFrom) query = query.in('status', onlyFrom);
	const { data, error } = await query.select('id');
	if (error) throw new Error(`Update consolidation run: ${error.message}`);
	return (data ?? []).length > 0;
}

/** A run still taking answers. */
export const DECIDING = ['waiting', 'review'];

/**
 * Runs `fn` over items, `limit` at a time. The first failure stops handing out
 * work and aborts the calls still in flight (through the signal each call
 * gets), so a failed job doesn't keep paying for calls nobody will use.
 */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number, signal: AbortSignal) => Promise<R>,
	parent?: AbortSignal
): Promise<R[]> {
	const controller = new AbortController();
	const onAbort = () => controller.abort(parent?.reason);
	if (parent?.aborted) onAbort();
	else parent?.addEventListener('abort', onAbort, { once: true });
	const results: R[] = new Array(items.length);
	let next = 0;
	let failure: { error: unknown } | null = null;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (!failure && !controller.signal.aborted && next < items.length) {
			const index = next++;
			try {
				results[index] = await fn(items[index]!, index, controller.signal);
			} catch (error) {
				if (!failure) {
					failure = { error };
					controller.abort(error);
				}
				return;
			}
		}
	});
	try {
		await Promise.all(workers);
	} finally {
		parent?.removeEventListener('abort', onAbort);
	}
	if (failure) throw (failure as { error: unknown }).error;
	parent?.throwIfAborted();
	return results;
}

export function usageTracker(startUsd: number, capUsd = RUN_COST_CAP_USD, what = 'consolidation') {
	let cost = startUsd;
	return {
		onUsage: (event: JSONUsageEvent) => {
			cost += event.totalCost ?? 0;
			return Promise.resolve();
		},
		/** Catches up with what other jobs on the same run or merge have logged meanwhile. */
		sync(loggedUsd: number) {
			cost = Math.max(cost, loggedUsd);
		},
		check() {
			if (cost > capUsd)
				throw new CostCapError(
					`This ${what} stopped at its $${capUsd} spending cap. Nothing changed.`
				);
		},
		get total() {
			return Math.round(cost * 10_000) / 10_000;
		}
	};
}
