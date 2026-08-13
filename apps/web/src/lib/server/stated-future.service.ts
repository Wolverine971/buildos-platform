// apps/web/src/lib/server/stated-future.service.ts
//
// Deterministic forward-carry capture — the floor beneath the stated-future repair gate.
//
// The user says "that's done, I'm just waiting to hear back from them"; the agent records the
// outcome and drops the future. Measured lifetime 1/27 on `task-complete-cold-reference` across
// every prompt placement AND a model-judged repair gate (three placements at 0/5; the tightened
// gate reached 1/5). The model keeps first refusal — this runs only after the gate fired and the
// model still created no durable record — so the auto-write is genuinely last resort (D1 decision,
// AGENTIC_CHAT_QUALITY_STATE_2026-07-26 §6).
//
// The task is titled from the user's verbatim words, never a paraphrase: a regex chose this
// sentence, so the record must stay auditable back to what the user actually said.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	buildStatedFutureTaskDescription,
	buildStatedFutureTaskTitle,
	STATED_FUTURE_SOURCE,
	STATED_FUTURE_TASK_TYPE_KEY
} from '@buildos/agentic-chat-runtime/loop';

type Client = SupabaseClient<Database>;

export {
	buildStatedFutureTaskDescription,
	buildStatedFutureTaskTitle,
	STATED_FUTURE_SOURCE,
	STATED_FUTURE_TASK_TYPE_KEY
};

async function resolveActorId(supabase: Client, userId: string): Promise<string> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', { p_user_id: userId });
	if (error) throw error;
	if (!data) throw new Error('[stated-future] ensure_actor_for_user returned no actor');
	return data as unknown as string;
}

export interface CreateStatedFutureTaskParams {
	projectId: string;
	userId: string;
	/** Idempotency scope — one capture per turn, even if finalization runs twice. */
	streamRunId: string;
	/** The clause that tripped the gate, verbatim from the user. */
	clause: string;
	/** The full user message, for provenance in the description. */
	userMessage: string;
}

export type CreateStatedFutureTaskResult =
	| { status: 'created'; taskId: string; title: string }
	| { status: 'duplicate'; taskId: string }
	| { status: 'skipped'; reason: string };

/**
 * Creates the forward-carry task via `onto_task_create_atomic` (transactional insert + built-in
 * idempotency replay). Callers should await this before closing the response — a fire-and-forget
 * write races end-of-turn assertions.
 */
export async function createStatedFutureTask(
	supabase: Client,
	params: CreateStatedFutureTaskParams
): Promise<CreateStatedFutureTaskResult> {
	if (!params.projectId) return { status: 'skipped', reason: 'no_project' };
	if (!params.streamRunId) return { status: 'skipped', reason: 'no_stream_run_id' };
	const title = buildStatedFutureTaskTitle(params.clause);
	if (!title) return { status: 'skipped', reason: 'empty_clause' };

	const actorId = await resolveActorId(supabase, params.userId);
	const { data, error } = await supabase.rpc(
		'onto_task_create_atomic' as never,
		{
			p_task: {
				project_id: params.projectId,
				title,
				description: buildStatedFutureTaskDescription(params),
				type_key: STATED_FUTURE_TASK_TYPE_KEY,
				state_key: 'todo',
				created_by: actorId,
				props: {
					source: STATED_FUTURE_SOURCE,
					source_stream_run_id: params.streamRunId
				}
			},
			p_source: 'agent',
			p_idempotency_key: `${STATED_FUTURE_SOURCE}:${params.streamRunId}`
		} as never
	);
	if (error) throw error;
	const result = data as { task?: { id?: string }; idempotent_replay?: boolean } | null;
	const taskId = result?.task?.id;
	if (!taskId) throw new Error('[stated-future] onto_task_create_atomic returned no task');
	if (result?.idempotent_replay) return { status: 'duplicate', taskId };
	return { status: 'created', taskId, title };
}
