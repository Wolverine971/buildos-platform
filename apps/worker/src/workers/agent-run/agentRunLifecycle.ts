// apps/worker/src/workers/agent-run/agentRunLifecycle.ts
import type { Database, Json } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';

export type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'];
export class AgentRunSupersededError extends Error {
	constructor() {
		super('Agent Run execution ownership changed');
	}
}

export function assertAgentRunNotAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error('Agent run executor aborted', { cause: signal.reason });
}

/** Fence each paid call / operation, including individual items in a batch. */
export async function assertAgentRunOwnership(
	runId: string,
	generation: number,
	signal?: AbortSignal
): Promise<void> {
	assertAgentRunNotAborted(signal);
	const { data, error } = await supabase
		.from('agent_runs')
		.select('id')
		.eq('id', runId)
		.eq('execution_generation', generation)
		.eq('status', 'running')
		.is('commit_started_at', null)
		.maybeSingle();
	if (error) throw new Error(`Failed to verify Agent Run ownership: ${error.message}`);
	assertAgentRunNotAborted(signal);
	if (!data) throw new AgentRunSupersededError();
}

// Narrow RPC type while generated database types may lag the additive migration.
interface CheckpointClient {
	rpc(
		name: 'checkpoint_agent_run_execution',
		args: {
			p_run_id: string;
			p_execution_generation: number;
			p_patch: Json;
			p_signal_ids: string[];
			p_completion_content: string | null;
			p_execution: Json | null;
		}
	): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
}

export async function checkpointAgentRun(params: {
	runId: string;
	generation: number;
	patch?: Record<string, unknown>;
	signalIds?: string[];
	completionContent?: string;
	execution?: Record<string, unknown>;
	signal?: AbortSignal;
}): Promise<void> {
	assertAgentRunNotAborted(params.signal);
	const { data, error } = await (supabase as unknown as CheckpointClient).rpc(
		'checkpoint_agent_run_execution',
		{
			p_run_id: params.runId,
			p_execution_generation: params.generation,
			p_patch: (params.patch ?? {}) as Json,
			p_signal_ids: params.signalIds ?? [],
			p_completion_content: params.completionContent ?? null,
			p_execution: (params.execution ?? null) as Json | null
		}
	);
	if (error) throw new Error(`Failed to checkpoint Agent Run: ${error.message}`);
	if (!data) throw new AgentRunSupersededError();
}
