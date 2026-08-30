import { randomUUID } from 'node:crypto';
import type { QueryResult } from 'pg';
import { LIBRI_QUEUE_TYPES, type LibriQueueType } from './bootstrap';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINIMUM_LEASE_MS = 5_000;
const MAXIMUM_LEASE_MS = 15 * 60_000;

export type LibriTransactionClient = {
	query: <T extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	) => Promise<QueryResult<T>>;
	release: () => void;
};

export type LibriTransactionalPool = {
	connect: () => Promise<LibriTransactionClient>;
};

export type EnqueueLibriStepInput = {
	stepId: string;
	scheduledFor?: Date;
	priority?: number;
};

export type EnqueueLibriStepReceipt = {
	queueJobId: string;
	queueRowId: string;
	stepId: string;
	runId: string;
	queueType: LibriQueueType;
	created: boolean;
};

export type ClaimLibriStepInput = {
	workerId: string;
	leaseDurationMs: number;
};

export type ClaimedLibriStep = {
	kind: 'claimed';
	queueJobId: string;
	queueRowId: string;
	processingToken: string;
	stepId: string;
	runId: string;
	libraryId: string;
	queueType: LibriQueueType;
	executionGeneration: number;
	leaseToken: string;
	leaseExpiresAt: string;
	payload: Record<string, unknown>;
};

export type QuarantinedLibriQueueJob = {
	kind: 'quarantined';
	queueJobId: string;
	queueRowId: string;
	reason: string;
};

export type ClaimLibriStepReceipt = ClaimedLibriStep | QuarantinedLibriQueueJob | null;

export type HeartbeatLibriStepInput = {
	queueRowId: string;
	stepId: string;
	processingToken: string;
	leaseToken: string;
	executionGeneration: number;
	workerId: string;
	leaseDurationMs: number;
};

export type CompleteLibriStepInput = Omit<
	HeartbeatLibriStepInput,
	'leaseDurationMs' | 'workerId'
> & {
	result?: Record<string, unknown>;
	provider?: string | null;
	model?: string | null;
	promptTokens?: number | null;
	completionTokens?: number | null;
	estimatedCostMicrousd?: number | null;
};

export type FailLibriStepInput = Omit<HeartbeatLibriStepInput, 'leaseDurationMs' | 'workerId'> & {
	errorClass: string;
	errorMessage: string;
	retry?: boolean;
	retryDelayMs?: number;
};

export type FailLibriStepReceipt = {
	accepted: boolean;
	outcome: 'retry_scheduled' | 'failed' | 'dead_letter' | 'stale';
	scheduledFor?: string;
};

export type CancelLibriRunInput = {
	runId: string;
	reason: string;
};

export type CancelLibriRunReceipt = {
	accepted: boolean;
	cancelledSteps: number;
	cancelledQueueJobs: number;
	remainingSteps: number;
};

export type RecoverStaleLibriLeasesInput = {
	limit?: number;
};

export type RecoverStaleLibriLeasesReceipt = {
	retried: number;
	deadLettered: number;
	cancelled: number;
};

export type LibriLifecyclePort = {
	enqueueStep: (input: EnqueueLibriStepInput) => Promise<EnqueueLibriStepReceipt>;
	claimNextStep: (input: ClaimLibriStepInput) => Promise<ClaimLibriStepReceipt>;
	heartbeatStep: (input: HeartbeatLibriStepInput) => Promise<boolean>;
	completeStep: (input: CompleteLibriStepInput) => Promise<boolean>;
	failStep: (input: FailLibriStepInput) => Promise<FailLibriStepReceipt>;
	cancelRun: (input: CancelLibriRunInput) => Promise<CancelLibriRunReceipt>;
	recoverStaleLeases: (
		input?: RecoverStaleLibriLeasesInput
	) => Promise<RecoverStaleLibriLeasesReceipt>;
};

type EnqueueContextRow = {
	step_id: string;
	run_id: string;
	library_id: string;
	queue_family: string;
	step_status: string;
	priority: number;
	payload_version: number;
	max_attempts: number;
	active_queue_job_id: string | null;
	run_status: string;
	correlation_id: string;
	created_by: string;
};

type QueueJobRow = {
	id: string;
	queue_job_id: string;
	job_type: string;
	metadata: Record<string, unknown> | null;
	status: string;
	processing_token?: string | null;
};

type ClaimContextRow = {
	step_id: string;
	run_id: string;
	library_id: string;
	queue_family: string;
	step_status: string;
	active_queue_job_id: string | null;
	attempts: number;
	max_attempts: number;
	payload: Record<string, unknown>;
	run_status: string;
	cancel_requested_at: string | null;
};

type LeasedStepRow = {
	step_id: string;
	run_id: string;
	queue_row_id: string;
	processing_token: string;
	attempts: number;
	max_attempts: number;
};

export function createLibriLifecycle(pool: LibriTransactionalPool): LibriLifecyclePort {
	return new LibriLifecycle(pool);
}

class LibriLifecycle implements LibriLifecyclePort {
	constructor(private readonly pool: LibriTransactionalPool) {}

	enqueueStep(input: EnqueueLibriStepInput): Promise<EnqueueLibriStepReceipt> {
		assertUuid(input.stepId, 'stepId');
		const scheduledFor = input.scheduledFor ?? new Date();
		assertDate(scheduledFor, 'scheduledFor');
		if (
			input.priority !== undefined &&
			(!Number.isSafeInteger(input.priority) || input.priority < 1 || input.priority > 1_000)
		) {
			throw new Error('priority must be an integer between 1 and 1000');
		}

		return withTransaction(this.pool, async (client) => {
			const contextResult = await client.query<EnqueueContextRow>(
				`SELECT
					step.id AS step_id,
					step.run_id,
					step.library_id,
					step.queue_family,
					step.status AS step_status,
					step.priority,
					step.payload_version,
					step.max_attempts,
					step.active_queue_job_id,
					run.status AS run_status,
					run.correlation_id,
					library.created_by
				FROM libri.research_steps step
				JOIN libri.research_runs run ON run.id = step.run_id
					AND run.library_id = step.library_id
				JOIN libri.libraries library ON library.id = step.library_id
				WHERE step.id = $1
				FOR UPDATE OF step, run`,
				[input.stepId]
			);
			const context = contextResult.rows[0];
			if (!context) throw new Error('Libri research step was not found');
			const queueType = parseQueueType(context.queue_family);
			if (!['pending', 'retry_wait', 'queued'].includes(context.step_status)) {
				throw new Error(
					`Libri research step cannot be enqueued from ${context.step_status}`
				);
			}
			if (!['queued', 'running'].includes(context.run_status)) {
				throw new Error(`Libri research run cannot accept work from ${context.run_status}`);
			}

			const dedupKey = `libri:research-step:${context.step_id}`;
			const metadata = {
				correlationId: context.correlation_id,
				libraryId: context.library_id,
				researchRunId: context.run_id,
				researchStepId: context.step_id,
				payloadVersion: context.payload_version
			};
			const queueJobId = `${queueType}_${randomUUID()}`;
			const inserted = await client.query<QueueJobRow>(
				`INSERT INTO public.queue_jobs (
					queue_job_id,
					user_id,
					job_type,
					metadata,
					status,
					priority,
					scheduled_for,
					dedup_key,
					attempts,
					max_attempts
				) VALUES ($1, $2, $3::public.queue_type, $4::jsonb, 'pending', $5, $6, $7, 0, $8)
				ON CONFLICT (dedup_key)
				WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
				DO NOTHING
				RETURNING id, queue_job_id, job_type::text, metadata, status::text`,
				[
					queueJobId,
					context.created_by,
					queueType,
					JSON.stringify(metadata),
					input.priority ?? context.priority,
					scheduledFor.toISOString(),
					dedupKey,
					context.max_attempts
				]
			);
			let queueJob = inserted.rows[0];
			const created = Boolean(queueJob);
			if (!queueJob) {
				const existing = await client.query<QueueJobRow>(
					`SELECT id, queue_job_id, job_type::text, metadata, status::text
					FROM public.queue_jobs
					WHERE dedup_key = $1 AND status IN ('pending', 'processing')
					ORDER BY created_at ASC
					LIMIT 1
					FOR UPDATE`,
					[dedupKey]
				);
				queueJob = existing.rows[0];
			}
			if (!queueJob || !queueJobMatchesStep(queueJob, context.step_id, queueType)) {
				throw new Error('Active Libri queue dedup row does not match the research step');
			}

			const stepUpdate = await client.query<{ id: string }>(
				`UPDATE libri.research_steps
				SET
					status = 'queued',
					scheduled_for = $2,
					active_queue_job_id = $3,
					active_processing_token = NULL,
					lease_token = NULL,
					lease_owner = NULL,
					leased_at = NULL,
					lease_expires_at = NULL,
					last_heartbeat_at = NULL,
					updated_at = now()
				WHERE id = $1
					AND status IN ('pending', 'retry_wait', 'queued')
					AND (active_queue_job_id IS NULL OR active_queue_job_id = $3)
				RETURNING id`,
				[context.step_id, scheduledFor.toISOString(), queueJob.id]
			);
			if (stepUpdate.rowCount !== 1) {
				throw new Error('Libri research step enqueue ownership changed');
			}

			return {
				queueJobId: queueJob.queue_job_id,
				queueRowId: queueJob.id,
				stepId: context.step_id,
				runId: context.run_id,
				queueType,
				created
			};
		});
	}

	claimNextStep(input: ClaimLibriStepInput): Promise<ClaimLibriStepReceipt> {
		assertWorkerId(input.workerId);
		assertLeaseDuration(input.leaseDurationMs);
		const processingToken = randomUUID();
		const leaseToken = randomUUID();
		const leaseExpiresAt = new Date(Date.now() + input.leaseDurationMs);

		return withTransaction(this.pool, async (client) => {
			const queueResult = await client.query<QueueJobRow>(
				`SELECT id, queue_job_id, job_type::text, metadata, status::text, processing_token
				FROM public.queue_jobs
				WHERE status = 'pending'
					AND job_type = ANY($1::public.queue_type[])
					AND scheduled_for <= now()
				ORDER BY priority ASC, scheduled_for ASC
				LIMIT 1
				FOR UPDATE SKIP LOCKED`,
				[LIBRI_QUEUE_TYPES]
			);
			const queueJob = queueResult.rows[0];
			if (!queueJob) return null;

			const stepId = readMetadataUuid(queueJob.metadata, 'researchStepId');
			if (!stepId) {
				return quarantineQueueJob(client, queueJob, 'libri_queue_metadata_invalid');
			}
			const stepResult = await client.query<ClaimContextRow>(
				`SELECT
					step.id AS step_id,
					step.run_id,
					step.library_id,
					step.queue_family,
					step.status AS step_status,
					step.active_queue_job_id,
					step.attempts,
					step.max_attempts,
					step.payload,
					run.status AS run_status,
					run.cancel_requested_at
				FROM libri.research_steps step
				JOIN libri.research_runs run ON run.id = step.run_id
					AND run.library_id = step.library_id
				WHERE step.id = $1
				FOR UPDATE OF step, run`,
				[stepId]
			);
			const context = stepResult.rows[0];
			const queueType = parseQueueType(queueJob.job_type);
			if (
				!context ||
				context.step_status !== 'queued' ||
				context.active_queue_job_id !== queueJob.id ||
				context.queue_family !== queueType ||
				context.attempts >= context.max_attempts ||
				context.cancel_requested_at !== null ||
				isTerminalRunStatus(context.run_status)
			) {
				return quarantineQueueJob(client, queueJob, 'libri_queue_step_contract_invalid');
			}

			const queueUpdate = await client.query<{ id: string }>(
				`UPDATE public.queue_jobs
				SET
					status = 'processing',
					processing_token = $2,
					started_at = now(),
					updated_at = now(),
					error_message = NULL
				WHERE id = $1 AND status = 'pending'
				RETURNING id`,
				[queueJob.id, processingToken]
			);
			if (queueUpdate.rowCount !== 1) throw new Error('Libri queue claim ownership changed');

			const stepUpdate = await client.query<{ execution_generation: number }>(
				`UPDATE libri.research_steps
				SET
					status = 'leased',
					attempts = attempts + 1,
					active_processing_token = $3,
					execution_generation = execution_generation + 1,
					lease_token = $4,
					lease_owner = $5,
					leased_at = now(),
					lease_expires_at = $6,
					last_heartbeat_at = now(),
					started_at = COALESCE(started_at, now()),
					completed_at = NULL,
					error_class = NULL,
					error_message = NULL,
					updated_at = now()
				WHERE id = $1
					AND active_queue_job_id = $2
					AND status = 'queued'
					AND attempts < max_attempts
				RETURNING execution_generation`,
				[
					context.step_id,
					queueJob.id,
					processingToken,
					leaseToken,
					input.workerId,
					leaseExpiresAt.toISOString()
				]
			);
			const executionGeneration = stepUpdate.rows[0]?.execution_generation;
			if (!Number.isSafeInteger(executionGeneration) || executionGeneration < 1) {
				throw new Error('Libri research step claim fence was not established');
			}

			await client.query(
				`UPDATE libri.research_runs
				SET
					status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
					started_at = COALESCE(started_at, now()),
					last_progress_at = now(),
					updated_at = now()
				WHERE id = $1`,
				[context.run_id]
			);

			return {
				kind: 'claimed',
				queueJobId: queueJob.queue_job_id,
				queueRowId: queueJob.id,
				processingToken,
				stepId: context.step_id,
				runId: context.run_id,
				libraryId: context.library_id,
				queueType,
				executionGeneration,
				leaseToken,
				leaseExpiresAt: leaseExpiresAt.toISOString(),
				payload: context.payload
			};
		});
	}

	heartbeatStep(input: HeartbeatLibriStepInput): Promise<boolean> {
		assertFenceInput(input);
		assertWorkerId(input.workerId);
		assertLeaseDuration(input.leaseDurationMs);
		const leaseExpiresAt = new Date(Date.now() + input.leaseDurationMs);

		return withTransaction(this.pool, async (client) => {
			const queueLock = await client.query<{ id: string }>(
				`SELECT id
				FROM public.queue_jobs
				WHERE id = $1 AND status = 'processing' AND processing_token = $2
				FOR UPDATE`,
				[input.queueRowId, input.processingToken]
			);
			if (queueLock.rowCount !== 1) return false;

			const stepUpdate = await client.query<{ run_id: string }>(
				`UPDATE libri.research_steps
				SET
					lease_expires_at = $7,
					last_heartbeat_at = now(),
					updated_at = now()
				WHERE id = $1
					AND active_queue_job_id = $2
					AND active_processing_token = $3
					AND execution_generation = $4
					AND lease_token = $5
					AND lease_owner = $6
					AND status = 'leased'
					AND lease_expires_at > now()
				RETURNING run_id`,
				[
					input.stepId,
					input.queueRowId,
					input.processingToken,
					input.executionGeneration,
					input.leaseToken,
					input.workerId,
					leaseExpiresAt.toISOString()
				]
			);
			const runId = stepUpdate.rows[0]?.run_id;
			if (!runId) return false;

			await client.query(
				`UPDATE public.queue_jobs SET updated_at = now()
				WHERE id = $1 AND status = 'processing' AND processing_token = $2`,
				[input.queueRowId, input.processingToken]
			);
			await client.query(
				`UPDATE libri.research_runs
				SET last_progress_at = now(), updated_at = now()
				WHERE id = $1 AND status IN ('running', 'cancelling')`,
				[runId]
			);
			return true;
		});
	}

	completeStep(input: CompleteLibriStepInput): Promise<boolean> {
		assertFenceInput(input);
		assertUsage(input.promptTokens, 'promptTokens');
		assertUsage(input.completionTokens, 'completionTokens');
		assertUsage(input.estimatedCostMicrousd, 'estimatedCostMicrousd');
		const result = input.result ?? {};
		if (Array.isArray(result) || result === null) {
			throw new Error('result must be a JSON object');
		}

		return withTransaction(this.pool, async (client) => {
			const queueLock = await client.query<{ id: string }>(
				`SELECT id
				FROM public.queue_jobs
				WHERE id = $1 AND status = 'processing' AND processing_token = $2
				FOR UPDATE`,
				[input.queueRowId, input.processingToken]
			);
			if (queueLock.rowCount !== 1) return false;

			const stepLock = await client.query<{ run_id: string }>(
				`SELECT run_id
				FROM libri.research_steps
				WHERE id = $1
					AND active_queue_job_id = $2
					AND active_processing_token = $3
					AND execution_generation = $4
					AND lease_token = $5
					AND status = 'leased'
					AND lease_expires_at > now()
				FOR UPDATE`,
				[
					input.stepId,
					input.queueRowId,
					input.processingToken,
					input.executionGeneration,
					input.leaseToken
				]
			);
			const runId = stepLock.rows[0]?.run_id;
			if (!runId) return false;

			const runLock = await client.query<{ cancel_requested_at: string | null }>(
				`SELECT cancel_requested_at
				FROM libri.research_runs
				WHERE id = $1
				FOR UPDATE`,
				[runId]
			);
			const run = runLock.rows[0];
			if (!run || run.cancel_requested_at) return false;
			const queueUpdate = await client.query<{ id: string }>(
				`UPDATE public.queue_jobs
				SET
					status = 'completed',
					processing_token = NULL,
					completed_at = now(),
					updated_at = now(),
					result = $3::jsonb,
					error_message = NULL
				WHERE id = $1 AND status = 'processing' AND processing_token = $2
				RETURNING id`,
				[input.queueRowId, input.processingToken, JSON.stringify(result)]
			);
			if (queueUpdate.rowCount !== 1)
				throw new Error('Libri queue completion ownership changed');

			const stepUpdate = await client.query<{ id: string }>(
				`UPDATE libri.research_steps
				SET
					status = 'completed',
					result = $6::jsonb,
					active_processing_token = NULL,
					lease_token = NULL,
					lease_owner = NULL,
					leased_at = NULL,
					lease_expires_at = NULL,
					last_heartbeat_at = now(),
					provider = $7,
					model = $8,
					prompt_tokens = $9,
					completion_tokens = $10,
					estimated_cost_microusd = $11,
					completed_at = now(),
					error_class = NULL,
					error_message = NULL,
					updated_at = now()
				WHERE id = $1
					AND active_queue_job_id = $2
					AND active_processing_token = $3
					AND execution_generation = $4
					AND lease_token = $5
					AND status = 'leased'
				RETURNING id`,
				[
					input.stepId,
					input.queueRowId,
					input.processingToken,
					input.executionGeneration,
					input.leaseToken,
					JSON.stringify(result),
					input.provider ?? null,
					input.model ?? null,
					input.promptTokens ?? null,
					input.completionTokens ?? null,
					input.estimatedCostMicrousd ?? null
				]
			);
			if (stepUpdate.rowCount !== 1)
				throw new Error('Libri step completion ownership changed');

			await client.query(
				`UPDATE libri.research_runs
				SET
					completed_steps = completed_steps + 1,
					last_progress_at = now(),
					updated_at = now()
				WHERE id = $1`,
				[runId]
			);
			await finalizeRunIfDone(client, runId);
			return true;
		});
	}

	failStep(input: FailLibriStepInput): Promise<FailLibriStepReceipt> {
		assertFenceInput(input);
		assertNonemptyText(input.errorClass, 'errorClass', 120);
		assertNonemptyText(input.errorMessage, 'errorMessage', 10_000);
		if (
			input.retryDelayMs !== undefined &&
			(!Number.isSafeInteger(input.retryDelayMs) ||
				input.retryDelayMs < 0 ||
				input.retryDelayMs > 24 * 60 * 60_000)
		) {
			throw new Error('retryDelayMs must be between 0 and 86400000');
		}

		return withTransaction(this.pool, async (client) => {
			const queueLock = await client.query<{ id: string }>(
				`SELECT id
				FROM public.queue_jobs
				WHERE id = $1 AND status = 'processing' AND processing_token = $2
				FOR UPDATE`,
				[input.queueRowId, input.processingToken]
			);
			if (queueLock.rowCount !== 1) return staleFailureReceipt();

			const stepLock = await client.query<{
				run_id: string;
				attempts: number;
				max_attempts: number;
			}>(
				`SELECT run_id, attempts, max_attempts
				FROM libri.research_steps
				WHERE id = $1
					AND active_queue_job_id = $2
					AND active_processing_token = $3
					AND execution_generation = $4
					AND lease_token = $5
					AND status = 'leased'
				FOR UPDATE`,
				[
					input.stepId,
					input.queueRowId,
					input.processingToken,
					input.executionGeneration,
					input.leaseToken
				]
			);
			const step = stepLock.rows[0];
			if (!step) return staleFailureReceipt();

			const runLock = await client.query<{ cancel_requested_at: string | null }>(
				`SELECT cancel_requested_at
				FROM libri.research_runs
				WHERE id = $1
				FOR UPDATE`,
				[step.run_id]
			);
			const run = runLock.rows[0];
			if (!run || run.cancel_requested_at) return staleFailureReceipt();

			const shouldRetry = input.retry !== false && step.attempts < step.max_attempts;
			if (shouldRetry) {
				const scheduledFor = new Date(
					Date.now() + (input.retryDelayMs ?? retryDelayMs(step.attempts))
				);
				await client.query(
					`UPDATE public.queue_jobs
					SET
						status = 'pending',
						processing_token = NULL,
						attempts = $3,
						scheduled_for = $4,
						started_at = NULL,
						completed_at = NULL,
						updated_at = now(),
						error_message = $5
					WHERE id = $1 AND status = 'processing' AND processing_token = $2`,
					[
						input.queueRowId,
						input.processingToken,
						step.attempts,
						scheduledFor.toISOString(),
						input.errorMessage
					]
				);
				await client.query(
					`UPDATE libri.research_steps
					SET
						status = 'queued',
						scheduled_for = $6,
						active_processing_token = NULL,
						lease_token = NULL,
						lease_owner = NULL,
						leased_at = NULL,
						lease_expires_at = NULL,
						last_heartbeat_at = NULL,
						completed_at = NULL,
						error_class = $7,
						error_message = $8,
						updated_at = now()
					WHERE id = $1
						AND active_queue_job_id = $2
						AND active_processing_token = $3
						AND execution_generation = $4
						AND lease_token = $5
						AND status = 'leased'`,
					[
						input.stepId,
						input.queueRowId,
						input.processingToken,
						input.executionGeneration,
						input.leaseToken,
						scheduledFor.toISOString(),
						input.errorClass,
						input.errorMessage
					]
				);
				await touchRun(client, step.run_id);
				return {
					accepted: true,
					outcome: 'retry_scheduled',
					scheduledFor: scheduledFor.toISOString()
				};
			}

			const terminalStatus = step.attempts >= step.max_attempts ? 'dead_letter' : 'failed';
			await client.query(
				`UPDATE public.queue_jobs
				SET
					status = 'failed',
					processing_token = NULL,
					attempts = $3,
					completed_at = now(),
					updated_at = now(),
					error_message = $4
				WHERE id = $1 AND status = 'processing' AND processing_token = $2`,
				[input.queueRowId, input.processingToken, step.attempts, input.errorMessage]
			);
			await client.query(
				`UPDATE libri.research_steps
				SET
					status = $6,
					active_processing_token = NULL,
					lease_token = NULL,
					lease_owner = NULL,
					leased_at = NULL,
					lease_expires_at = NULL,
					last_heartbeat_at = NULL,
					completed_at = now(),
					error_class = $7,
					error_message = $8,
					updated_at = now()
				WHERE id = $1
					AND active_queue_job_id = $2
					AND active_processing_token = $3
					AND execution_generation = $4
					AND lease_token = $5
					AND status = 'leased'`,
				[
					input.stepId,
					input.queueRowId,
					input.processingToken,
					input.executionGeneration,
					input.leaseToken,
					terminalStatus,
					input.errorClass,
					input.errorMessage
				]
			);
			await client.query(
				`UPDATE libri.research_runs
				SET
					failed_steps = failed_steps + CASE WHEN $2 = 'failed' THEN 1 ELSE 0 END,
					dead_letter_steps = dead_letter_steps
						+ CASE WHEN $2 = 'dead_letter' THEN 1 ELSE 0 END,
					last_progress_at = now(),
					updated_at = now()
				WHERE id = $1`,
				[step.run_id, terminalStatus]
			);
			await finalizeRunIfDone(client, step.run_id);
			return {
				accepted: true,
				outcome: terminalStatus
			};
		});
	}

	async cancelRun(input: CancelLibriRunInput): Promise<CancelLibriRunReceipt> {
		assertUuid(input.runId, 'runId');
		assertNonemptyText(input.reason, 'reason', 1_000);

		const signalled = await withTransaction(this.pool, async (client) => {
			const run = await client.query<{ status: string }>(
				'SELECT status FROM libri.research_runs WHERE id = $1 FOR UPDATE',
				[input.runId]
			);
			const status = run.rows[0]?.status;
			if (!status) throw new Error('Libri research run was not found');
			if (status === 'cancelled') return true;
			if (isTerminalRunStatus(status)) return false;
			await client.query(
				`UPDATE libri.research_runs
				SET
					cancel_requested_at = COALESCE(cancel_requested_at, now()),
					cancel_reason = $2,
					status = 'cancelling',
					started_at = COALESCE(started_at, now()),
					updated_at = now()
				WHERE id = $1`,
				[input.runId, input.reason]
			);
			return true;
		});
		if (!signalled) {
			return {
				accepted: false,
				cancelledSteps: 0,
				cancelledQueueJobs: 0,
				remainingSteps: 0
			};
		}

		return withTransaction(this.pool, async (client) => {
			const activeQueueIds = await client.query<{ active_queue_job_id: string }>(
				`SELECT active_queue_job_id
				FROM libri.research_steps
				WHERE run_id = $1
					AND active_queue_job_id IS NOT NULL`,
				[input.runId]
			);
			const queueIds = activeQueueIds.rows.map((row) => row.active_queue_job_id);
			let lockedQueueIds: string[] = [];
			if (queueIds.length > 0) {
				const lockedQueues = await client.query<{ id: string }>(
					`SELECT id
					FROM public.queue_jobs
					WHERE id = ANY($1::uuid[]) AND status IN ('pending', 'processing')
					FOR UPDATE SKIP LOCKED`,
					[queueIds]
				);
				lockedQueueIds = lockedQueues.rows.map((row) => row.id);
			}
			const lockedSteps = await client.query<{ id: string }>(
				`SELECT id
				FROM libri.research_steps
				WHERE run_id = $1
					AND status NOT IN (
						'completed', 'failed', 'cancelled', 'skipped',
						'needs_review', 'dead_letter'
					)
				FOR UPDATE SKIP LOCKED`,
				[input.runId]
			);
			await client.query('SELECT id FROM libri.research_runs WHERE id = $1 FOR UPDATE', [
				input.runId
			]);

			let cancelledQueueJobs = 0;
			if (lockedQueueIds.length > 0) {
				const queueUpdate = await client.query(
					`UPDATE public.queue_jobs
					SET
						status = 'cancelled',
						processing_token = NULL,
						completed_at = now(),
						updated_at = now(),
						error_message = $2
					WHERE id = ANY($1::uuid[]) AND status IN ('pending', 'processing')`,
					[lockedQueueIds, input.reason]
				);
				cancelledQueueJobs = queueUpdate.rowCount ?? 0;
			}
			const stepIds = lockedSteps.rows.map((row) => row.id);
			let cancelledSteps = 0;
			if (stepIds.length > 0) {
				const stepUpdate = await client.query(
					`UPDATE libri.research_steps
					SET
						status = 'cancelled',
						active_processing_token = NULL,
						lease_token = NULL,
						lease_owner = NULL,
						leased_at = NULL,
						lease_expires_at = NULL,
						last_heartbeat_at = NULL,
						completed_at = now(),
						error_class = 'cancelled',
						error_message = $2,
						updated_at = now()
					WHERE id = ANY($1::uuid[])
						AND status NOT IN (
							'completed', 'failed', 'cancelled', 'skipped',
							'needs_review', 'dead_letter'
						)`,
					[stepIds, input.reason]
				);
				cancelledSteps = stepUpdate.rowCount ?? 0;
			}
			const remainingSteps = await countRemainingSteps(client, input.runId);
			await client.query(
				`UPDATE libri.research_runs
				SET
					status = CASE WHEN $2 = 0 THEN 'cancelled' ELSE status END,
					finished_at = CASE WHEN $2 = 0 THEN now() ELSE finished_at END,
					last_progress_at = now(),
					updated_at = now()
				WHERE id = $1`,
				[input.runId, remainingSteps]
			);
			return { accepted: true, cancelledSteps, cancelledQueueJobs, remainingSteps };
		});
	}

	recoverStaleLeases(
		input: RecoverStaleLibriLeasesInput = {}
	): Promise<RecoverStaleLibriLeasesReceipt> {
		const limit = input.limit ?? 10;
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
			throw new Error('limit must be an integer between 1 and 50');
		}

		return withTransaction(this.pool, async (client) => {
			const stale = await client.query<LeasedStepRow>(
				`SELECT
					step.id AS step_id,
					step.run_id,
					job.id AS queue_row_id,
					job.processing_token,
					step.attempts,
					step.max_attempts
				FROM public.queue_jobs job
				JOIN libri.research_steps step ON step.active_queue_job_id = job.id
				WHERE job.status = 'processing'
					AND job.job_type = ANY($1::public.queue_type[])
					AND job.processing_token IS NOT NULL
					AND step.status = 'leased'
					AND step.active_processing_token = job.processing_token
					AND step.lease_expires_at <= now()
				ORDER BY step.lease_expires_at ASC, step.id ASC
				LIMIT $2
				FOR UPDATE OF job, step SKIP LOCKED`,
				[LIBRI_QUEUE_TYPES, limit]
			);
			let retried = 0;
			let deadLettered = 0;
			let cancelled = 0;
			const terminalRunIds = new Set<string>();
			for (const step of stale.rows) {
				const run = await client.query<{ cancel_requested_at: string | null }>(
					`SELECT cancel_requested_at
					FROM libri.research_runs
					WHERE id = $1
					FOR UPDATE`,
					[step.run_id]
				);
				if (run.rows[0]?.cancel_requested_at) {
					await client.query(
						`UPDATE public.queue_jobs
						SET
							status = 'cancelled',
							processing_token = NULL,
							completed_at = now(),
							updated_at = now(),
							error_message = 'cancel_requested'
						WHERE id = $1 AND processing_token = $2 AND status = 'processing'`,
						[step.queue_row_id, step.processing_token]
					);
					await client.query(
						`UPDATE libri.research_steps
						SET
							status = 'cancelled',
							active_processing_token = NULL,
							lease_token = NULL,
							lease_owner = NULL,
							leased_at = NULL,
							lease_expires_at = NULL,
							last_heartbeat_at = NULL,
							completed_at = now(),
							error_class = 'cancelled',
							error_message = 'cancel_requested',
							updated_at = now()
						WHERE id = $1
							AND active_queue_job_id = $2
							AND active_processing_token = $3
							AND status = 'leased'`,
						[step.step_id, step.queue_row_id, step.processing_token]
					);
					terminalRunIds.add(step.run_id);
					cancelled += 1;
					continue;
				}
				if (step.attempts < step.max_attempts) {
					const scheduledFor = new Date(Date.now() + retryDelayMs(step.attempts));
					await client.query(
						`UPDATE public.queue_jobs
						SET
							status = 'pending',
							processing_token = NULL,
							attempts = $3,
							scheduled_for = $4,
							started_at = NULL,
							completed_at = NULL,
							updated_at = now(),
							error_message = 'stale_lease'
						WHERE id = $1 AND processing_token = $2 AND status = 'processing'`,
						[
							step.queue_row_id,
							step.processing_token,
							step.attempts,
							scheduledFor.toISOString()
						]
					);
					await resetStaleStep(client, step, 'queued', scheduledFor.toISOString());
					await touchRun(client, step.run_id);
					retried += 1;
				} else {
					await client.query(
						`UPDATE public.queue_jobs
						SET
							status = 'failed',
							processing_token = NULL,
							attempts = $3,
							completed_at = now(),
							updated_at = now(),
							error_message = 'stale_lease_exhausted'
						WHERE id = $1 AND processing_token = $2 AND status = 'processing'`,
						[step.queue_row_id, step.processing_token, step.attempts]
					);
					await resetStaleStep(client, step, 'dead_letter', null);
					await client.query(
						`UPDATE libri.research_runs
						SET
							dead_letter_steps = dead_letter_steps + 1,
							last_progress_at = now(),
							updated_at = now()
						WHERE id = $1`,
						[step.run_id]
					);
					terminalRunIds.add(step.run_id);
					deadLettered += 1;
				}
			}
			for (const runId of terminalRunIds) await finalizeRunIfDone(client, runId);
			return { retried, deadLettered, cancelled };
		});
	}
}

function staleFailureReceipt(): FailLibriStepReceipt {
	return { accepted: false, outcome: 'stale' };
}

async function resetStaleStep(
	client: LibriTransactionClient,
	step: LeasedStepRow,
	status: 'queued' | 'dead_letter',
	scheduledFor: string | null
): Promise<void> {
	await client.query(
		`UPDATE libri.research_steps
		SET
			status = $4,
			scheduled_for = COALESCE($5, scheduled_for),
			active_processing_token = NULL,
			lease_token = NULL,
			lease_owner = NULL,
			leased_at = NULL,
			lease_expires_at = NULL,
			last_heartbeat_at = NULL,
			completed_at = CASE WHEN $4 = 'dead_letter' THEN now() ELSE NULL END,
			error_class = 'stale_lease',
			error_message = CASE
				WHEN $4 = 'dead_letter' THEN 'stale_lease_exhausted'
				ELSE 'stale_lease'
			END,
			updated_at = now()
		WHERE id = $1
			AND active_queue_job_id = $2
			AND active_processing_token = $3
			AND status = 'leased'`,
		[step.step_id, step.queue_row_id, step.processing_token, status, scheduledFor]
	);
}

async function touchRun(client: LibriTransactionClient, runId: string): Promise<void> {
	await client.query(
		`UPDATE libri.research_runs
		SET last_progress_at = now(), updated_at = now()
		WHERE id = $1`,
		[runId]
	);
}

async function countRemainingSteps(client: LibriTransactionClient, runId: string): Promise<number> {
	const remaining = await client.query<{ remaining_steps: string }>(
		`SELECT count(*)::text AS remaining_steps
		FROM libri.research_steps
		WHERE run_id = $1
			AND status NOT IN (
				'completed', 'failed', 'cancelled', 'skipped',
				'needs_review', 'dead_letter'
			)`,
		[runId]
	);
	return Number(remaining.rows[0]?.remaining_steps ?? '0');
}

async function finalizeRunIfDone(client: LibriTransactionClient, runId: string): Promise<void> {
	if ((await countRemainingSteps(client, runId)) !== 0) return;
	await client.query(
		`UPDATE libri.research_runs
		SET
			status = CASE
				WHEN cancel_requested_at IS NOT NULL THEN 'cancelled'
				WHEN (dead_letter_steps > 0 OR failed_steps > 0)
					AND completed_steps > 0 THEN 'partial'
				WHEN dead_letter_steps > 0 OR failed_steps > 0 THEN 'failed'
				ELSE 'completed'
			END,
			finished_at = now(),
			updated_at = now()
		WHERE id = $1`,
		[runId]
	);
}

function retryDelayMs(attempts: number): number {
	return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

async function quarantineQueueJob(
	client: LibriTransactionClient,
	queueJob: QueueJobRow,
	reason: string
): Promise<QuarantinedLibriQueueJob> {
	await client.query(
		`UPDATE public.queue_jobs
		SET
			status = 'failed',
			processing_token = NULL,
			attempts = COALESCE(attempts, 0) + 1,
			completed_at = now(),
			updated_at = now(),
			error_message = $2
		WHERE id = $1 AND status = 'pending'`,
		[queueJob.id, reason]
	);
	return {
		kind: 'quarantined',
		queueJobId: queueJob.queue_job_id,
		queueRowId: queueJob.id,
		reason
	};
}

async function withTransaction<T>(
	pool: LibriTransactionalPool,
	work: (client: LibriTransactionClient) => Promise<T>
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await work(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		try {
			await client.query('ROLLBACK');
		} catch {
			// Preserve the original lifecycle failure; a broken connection is discarded by pg.
		}
		throw error;
	} finally {
		client.release();
	}
}

function queueJobMatchesStep(
	queueJob: QueueJobRow,
	stepId: string,
	queueType: LibriQueueType
): boolean {
	return (
		queueJob.job_type === queueType &&
		queueJob.status === 'pending' &&
		readMetadataUuid(queueJob.metadata, 'researchStepId') === stepId
	);
}

function readMetadataUuid(metadata: Record<string, unknown> | null, key: string): string | null {
	const value = metadata?.[key];
	return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function parseQueueType(value: string): LibriQueueType {
	if ((LIBRI_QUEUE_TYPES as readonly string[]).includes(value)) {
		return value as LibriQueueType;
	}
	throw new Error(`Unsupported Libri queue family: ${value}`);
}

function isTerminalRunStatus(status: string): boolean {
	return [
		'completed',
		'partial',
		'failed',
		'cancelled',
		'needs_review',
		'budget_exhausted'
	].includes(status);
}

function assertFenceInput(
	input: Pick<
		HeartbeatLibriStepInput,
		'queueRowId' | 'stepId' | 'processingToken' | 'leaseToken' | 'executionGeneration'
	>
): void {
	assertUuid(input.queueRowId, 'queueRowId');
	assertUuid(input.stepId, 'stepId');
	assertUuid(input.processingToken, 'processingToken');
	assertUuid(input.leaseToken, 'leaseToken');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw new Error('executionGeneration must be a positive integer');
	}
}

function assertUuid(value: string, name: string): void {
	if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID`);
}

function assertWorkerId(value: string): void {
	if (value.trim().length < 1 || value.length > 128) {
		throw new Error('workerId must contain between 1 and 128 characters');
	}
}

function assertLeaseDuration(value: number): void {
	if (!Number.isSafeInteger(value) || value < MINIMUM_LEASE_MS || value > MAXIMUM_LEASE_MS) {
		throw new Error('leaseDurationMs must be between 5000 and 900000');
	}
}

function assertDate(value: Date, name: string): void {
	if (Number.isNaN(value.getTime())) throw new Error(`${name} must be a valid date`);
}

function assertUsage(value: number | null | undefined, name: string): void {
	if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 0)) {
		throw new Error(`${name} must be a non-negative integer`);
	}
}

function assertNonemptyText(value: string, name: string, maximumLength: number): void {
	if (value.trim().length < 1 || value.length > maximumLength) {
		throw new Error(`${name} must contain between 1 and ${maximumLength} characters`);
	}
}
