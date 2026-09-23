// apps/worker/tests/helpers/workflowEndToEnd.ts
import { loadSpecialistSnapshotV2 } from '../../src/workers/agentic-chat/workflow/specialist-snapshot-store';
import type { SpecialistShadowObserver } from '../../src/workers/agentic-chat/workflow/specialist-selection-shadow';
import type { WorkflowContextFinderPortV1 } from '../../src/workers/agentic-chat/workflow/context-finder-port';
// apps/worker/tests/helpers/workflowEndToEnd.ts
//
// DISPOSABLE DATABASE ONLY. The Tasker 86 → 87 worker path against the frozen SQL:
// real admission RPC, real claim, real v4 input reader, real preparation store,
// Tasker 87's runner behind the runner port, the real stream publisher (with a
// recording Broadcast port), and the real terminal writer. Only the project context
// loader and the provider network are stand-ins. Used by the end-to-end tests and
// by the separate worker process in the restart proof.
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import {
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	type AgenticChatTurnClaimResultV1,
	buildAgenticChatWorkflowReviewIntentV1,
	hashAgenticChatWorkflowRequestV1
} from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import { SupabaseAgenticChatExecutionControlAdapter } from '../../src/workers/agentic-chat/turn/execution-control';
import { SupabaseAgenticChatExecutionInputAdapter } from '../../src/workers/agentic-chat/turn/execution-input';
import type { AgenticChatTurnProviderClientPortV1 } from '../../src/workers/agentic-chat/provider/contracts';
import { AgenticChatProviderCapacity } from '../../src/workers/agentic-chat/provider/provider-capacity';
import {
	type AgenticChatBroadcastMessageV1,
	AgenticChatStreamPublisher
} from '../../src/workers/agentic-chat/stream/stream-publisher';
import { SupabaseAgenticChatPersistenceAdapter } from '../../src/workers/agentic-chat/stream/supabase-stream-publisher-adapters';
import { SupabaseAgenticChatWorkflowPreparationStore } from '../../src/workers/agentic-chat/workflow/preparation-store';
import { AgenticChatWorkflowTurnPreparer } from '../../src/workers/agentic-chat/workflow/raw-turn-preparation';
import {
	AgenticChatWorkflowRunner,
	type AgenticChatWorkflowRunnerOptionsV1
} from '../../src/workers/agentic-chat/workflow/workflow-runner';
import { AgenticChatWorkflowRunnerAdapter } from '../../src/workers/agentic-chat/workflow/workflow-runner-adapter';
import { SupabaseAgenticChatWorkflowStore } from '../../src/workers/agentic-chat/workflow/workflow-store';
import { createPgSupabaseShim } from './workflowPostgres';

export const E2E_USER_ID = 'f1000000-0000-4000-8000-000000000001';
export const E2E_ACTOR_ID = 'f2000000-0000-4000-8000-000000000001';
export const E2E_PROJECT_ID = 'f3000000-0000-4000-8000-000000000001';

export const e2eId = (prefix: string, n: number) =>
	`${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export type E2EClaim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;
export type E2ELease = { claim: E2EClaim; token: string; job: string };

/** Project context with the record ids the scripted specialists cite. */
export function e2eProjectContext(projectId: string): MasterPromptContext {
	return {
		contextType: 'project',
		entityId: projectId,
		projectId,
		contextLoadSource: 'rpc',
		timezone: 'America/New_York',
		data: {
			project: {
				id: projectId,
				name: 'Workshop launch',
				description: 'Spring workshop for forty makers.',
				updated_at: '2026-09-17T10:00:00Z'
			},
			goals: [],
			tasks: [
				{ id: 'task-1', title: 'Book the venue', updated_at: '2026-09-11T00:00:00Z' },
				{ id: 'task-2', title: 'Confirm the caterer', updated_at: '2026-09-12T00:00:00Z' }
			],
			documents: [],
			events: []
		}
	} as unknown as MasterPromptContext;
}

export async function seedE2EOwner(admin: Client): Promise<void> {
	await admin.query('INSERT INTO public.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [
		E2E_USER_ID
	]);
	await admin.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [
		E2E_USER_ID
	]);
	await admin.query(
		`INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES ($1, 'human', 'Owner', $2)
		ON CONFLICT DO NOTHING`,
		[E2E_ACTOR_ID, E2E_USER_ID]
	);
	await admin.query(
		`INSERT INTO public.onto_projects (id, name, created_by) VALUES ($1, 'Workshop launch', $2)
		ON CONFLICT DO NOTHING`,
		[E2E_PROJECT_ID, E2E_ACTOR_ID]
	);
}

export async function admitE2ETurn(
	shim: ReturnType<typeof createPgSupabaseShim>,
	n: number
): Promise<string> {
	const message = `Review the project: what should happen next? (${n})`;
	const request = {
		clientTurnId: `e2e-client-${n}`,
		streamRunId: `e2e-stream-${n}`,
		context: { type: 'project' as const, entityId: E2E_PROJECT_ID, projectId: E2E_PROJECT_ID },
		message,
		reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
		policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
		policyRef: 'internal-project-review:v1'
	};
	const { data, error } = await shim.rpc('create_agentic_chat_workflow_turn_with_job_v1', {
		p_user_id: E2E_USER_ID,
		p_session_id: null,
		p_turn_run_id: e2eId('f5', n),
		p_user_message_id: e2eId('f6', n),
		p_request_artifact_id: e2eId('f7', n),
		p_stream_run_id: request.streamRunId,
		p_client_turn_id: request.clientTurnId,
		p_transport_decision_id: e2eId('f8', n),
		p_correlation_id: e2eId('f9', n),
		p_project_id: E2E_PROJECT_ID,
		p_message: message,
		p_review_intent: request.reviewIntent,
		p_policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
		p_policy_ref: request.policyRef,
		p_request_hash: await hashAgenticChatWorkflowRequestV1(request),
		p_cache_ref: null
	});
	if (error || (data as { outcome?: string } | null)?.outcome !== 'newly_admitted') {
		throw new Error(`admission failed: ${JSON.stringify(error ?? data)}`);
	}
	return e2eId('f5', n);
}

/** Stands in for the queue consumer's lease, then the real ordinary claim. */
export async function leaseAndClaimE2E(
	admin: Client,
	shim: ReturnType<typeof createPgSupabaseShim>,
	turnRunId: string
): Promise<E2ELease> {
	const token = randomUUID();
	const { rows } = await admin.query(
		`UPDATE public.queue_jobs jobs
		SET status = 'processing', processing_token = $2, started_at = now(), updated_at = now()
		FROM public.chat_turn_runs turns
		WHERE turns.id = $1 AND jobs.id = turns.queue_job_id AND jobs.status = 'pending'
		RETURNING jobs.id`,
		[turnRunId, token]
	);
	if (!rows[0]) throw new Error('no pending job to lease');
	const job = rows[0].id as string;
	const claim = await new SupabaseAgenticChatExecutionControlAdapter(shim as never).claim({
		turnRunId,
		queueJobId: job,
		processingToken: token
	});
	if (claim.outcome !== 'claimed' && claim.outcome !== 'matching_current_claim') {
		throw new Error(`claim failed: ${claim.outcome}`);
	}
	return { claim: claim as E2EClaim, token, job };
}

export function buildE2EWorker(input: {
	shim: ReturnType<typeof createPgSupabaseShim>;
	client: AgenticChatTurnProviderClientPortV1;
	runner?: AgenticChatWorkflowRunnerOptionsV1;
	specialistWorkflowsEnabled?: boolean;
	documentReadToolsEnabled?: boolean;
	documentEvidenceHandoffEnabled?: boolean;
	publishedSpecialistsEnabled?: boolean;
	projectReviewV2Enabled?: boolean;
	projectReviewV3Enabled?: boolean;
	observeSelection?: SpecialistShadowObserver;
	findContext?: WorkflowContextFinderPortV1;
	context?: MasterPromptContext;
	onError?: (report: { stage: string; turnRunId: string; error: unknown }) => void;
}) {
	const { shim } = input;
	const broadcasts: AgenticChatBroadcastMessageV1[] = [];
	const publisher = new AgenticChatStreamPublisher({
		persistence: new SupabaseAgenticChatPersistenceAdapter(shim as never),
		broadcast: {
			publish: async (message) => {
				broadcasts.push(message);
				return 'sent';
			}
		}
	});
	publisher.start();
	const control = new SupabaseAgenticChatExecutionControlAdapter(shim as never);
	const store = new SupabaseAgenticChatWorkflowStore(shim as never);
	const summaries: unknown[] = [];
	const adapter = new AgenticChatWorkflowRunnerAdapter({
		runner: new AgenticChatWorkflowRunner(
			{
				store,
				client: input.client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 2 })
			},
			{ capacityPollMs: 5, meter: { settleRetryDelayMs: 5 }, ...input.runner }
		),
		store,
		control: {
			finalize: control.finalize.bind(control),
			recoverWorkflow: control.recoverWorkflow.bind(control)
		},
		publisher,
		onRunSummary: (summary) => summaries.push(summary),
		onError: input.onError
	});
	const preparer = new AgenticChatWorkflowTurnPreparer({
		input: new SupabaseAgenticChatExecutionInputAdapter(shim as never),
		store: new SupabaseAgenticChatWorkflowPreparationStore(shim as never, shim as never),
		loadContext: (async ({ projectId }: { projectId: string }) =>
			input.context ?? e2eProjectContext(projectId)) as never,
		publisher,
		control,
		runner: adapter,
		allowedUserIds: [E2E_USER_ID],
		specialistWorkflowsEnabled: input.specialistWorkflowsEnabled,
		documentReadToolsEnabled: input.documentReadToolsEnabled,
		documentEvidenceHandoffEnabled: input.documentEvidenceHandoffEnabled,
		publishedSpecialistsEnabled: input.publishedSpecialistsEnabled,
		projectReviewV2Enabled: input.projectReviewV2Enabled,
		projectReviewV3Enabled: input.projectReviewV3Enabled,
		observeSelection: input.observeSelection,
		findContext: input.findContext,
		loadSpecialistSnapshot: (identity) => loadSpecialistSnapshotV2(shim as never, identity),
		onTiming: () => undefined,
		onError: input.onError ?? (() => undefined)
	});
	return {
		publisher,
		broadcasts,
		summaries,
		store,
		execute(lease: E2ELease, signal: AbortSignal = new AbortController().signal) {
			return preparer.execute({
				envelope: {
					turnRunId: lease.claim.turnRunId,
					queueJobId: lease.job,
					processingToken: lease.token
				},
				claim: lease.claim,
				signal,
				invocationDeadlineAtMs: Date.now() + 300_000
			});
		},
		async stop() {
			await publisher.stop();
		}
	};
}

/** Durable facts a test asserts on, read with the admin connection. */
export async function e2eFacts(admin: Client, turnRunId: string) {
	const [turn, job, steps, dispatches, events, messages, run, effects] = await Promise.all([
		admin.query(
			`SELECT status, execution_generation, failure_code, mutation_reserved_at, irreversible_boundary_at
			FROM public.chat_turn_runs WHERE id = $1`,
			[turnRunId]
		),
		admin.query(
			`SELECT jobs.status, jobs.attempts FROM public.queue_jobs jobs
			JOIN public.chat_turn_runs turns ON turns.queue_job_id = jobs.id WHERE turns.id = $1`,
			[turnRunId]
		),
		admin.query(
			`SELECT step_key, status, attempts_used, failure_code FROM public.chat_turn_workflow_steps
			WHERE turn_run_id = $1 ORDER BY step_key`,
			[turnRunId]
		),
		admin.query(
			`SELECT step_key, physical_attempt, dispatch_kind, state, reserved_micro_usd::bigint AS reserved,
				actual_micro_usd::bigint AS actual, reserved_generation
			FROM public.chat_turn_workflow_dispatches WHERE turn_run_id = $1 ORDER BY reserved_at, physical_attempt`,
			[turnRunId]
		),
		admin.query(
			`SELECT execution_generation, sequence_index, event_type FROM public.chat_turn_events
			WHERE turn_run_id = $1 ORDER BY execution_generation, sequence_index`,
			[turnRunId]
		),
		admin.query(
			`SELECT messages.id, messages.content FROM public.chat_messages messages
			JOIN public.chat_turn_runs turns ON turns.session_id = messages.session_id
			WHERE turns.id = $1 AND messages.role = 'assistant'`,
			[turnRunId]
		),
		admin.query(
			`SELECT phase, terminal_outcome, synthesis_status, synthesis_quality, answer_text, recovery_count
			FROM public.chat_turn_workflow_runs WHERE turn_run_id = $1`,
			[turnRunId]
		),
		admin.query(
			'SELECT count(*)::int AS count FROM public.chat_turn_effects WHERE turn_run_id = $1',
			[turnRunId]
		)
	]);
	return {
		turn: turn.rows[0] as Record<string, any>,
		job: job.rows[0] as Record<string, any>,
		steps: steps.rows as Array<Record<string, any>>,
		dispatches: dispatches.rows.map((row) => ({
			...row,
			reserved: Number(row.reserved),
			actual: row.actual === null ? null : Number(row.actual)
		})) as Array<Record<string, any>>,
		events: events.rows as Array<Record<string, any>>,
		messages: messages.rows as Array<{ id: string; content: string }>,
		run: run.rows[0] as Record<string, any>,
		effects: effects.rows[0]!.count as number
	};
}

/** Rows in the fixture's domain tables; a read-only review must never change them. */
export async function e2eDomainRowCounts(admin: Client): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const table of ['onto_projects', 'onto_actors', 'onto_project_members', 'onto_assets']) {
		const { rows } = await admin.query(`SELECT count(*)::int AS count FROM public.${table}`);
		counts[table] = rows[0]!.count as number;
	}
	return counts;
}
