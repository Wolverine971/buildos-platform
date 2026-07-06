// apps/worker/src/workers/project-loop/auditEnqueue.ts
import type {
	Json,
	ProjectAuditDepth,
	ProjectAuditTriggerReason,
	ProjectAuditTriggerSnapshot
} from '@buildos/shared-types';
import {
	auditSizeClassForInsert,
	buildProjectAuditTriggerSnapshot,
	evaluateProjectAuditTrigger,
	recordProjectAuditTriggerEvaluation
} from '@buildos/shared-agent-ops/project-audits';
import { projectAuditDedupKey, readProjectLoopQueueMetadata } from '@buildos/shared-agent-ops';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { captureWorkerEvent } from '../../lib/posthog';
import { supabase } from '../../lib/supabase';
import { resolveProjectLoopOwnerUserIds } from './enqueue';

type QueueProjectAuditResult = {
	queued: boolean;
	auditId?: string;
	runId?: string;
	jobId?: string;
	evaluationId?: string;
	decision?: string;
	reason?: string;
};

type ScheduledAuditEnqueueResult = {
	queued: number;
	scanned: number;
	skippedInvalidOwner: number;
	skipped: number;
	failed: number;
	deferred: number;
};

function projectAuditTriggerEvaluationDedupKey(params: {
	projectId: string;
	triggerReason: ProjectAuditTriggerReason;
	scheduledFor: string;
}): string {
	return `project-audit-trigger:${params.projectId}:${params.triggerReason}:${params.scheduledFor.slice(0, 16)}`;
}

function captureAuditTriggerMetric(params: {
	userId: string;
	event: 'project_audit_queued' | 'project_audit_skipped' | 'project_audit_queue_failed';
	projectId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth: ProjectAuditDepth;
	decision?: string | null;
	reason?: string | null;
	auditId?: string | null;
	runId?: string | null;
	evaluationId?: string | null;
	projectSizeClass?: string | null;
}): void {
	captureWorkerEvent(params.userId, params.event, {
		project_id: params.projectId,
		trigger_reason: params.triggerReason,
		audit_depth: params.auditDepth,
		decision: params.decision ?? null,
		reason: params.reason ?? null,
		audit_id: params.auditId ?? null,
		run_id: params.runId ?? null,
		evaluation_id: params.evaluationId ?? null,
		project_size_class: params.projectSizeClass ?? null
	});
}

async function resolveQueueJobDetails(
	queueRecordId: string
): Promise<{ queueJobId: string; metadata: unknown }> {
	const { data, error } = await supabase
		.from('queue_jobs')
		.select('queue_job_id, metadata')
		.eq('id', queueRecordId)
		.maybeSingle();
	if (error || !data?.queue_job_id) {
		throw new Error(
			error?.message ?? `Failed to resolve queue job details for record ${queueRecordId}`
		);
	}
	return {
		queueJobId: data.queue_job_id,
		metadata: data?.metadata
	};
}

async function createAuditChatSession(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
}): Promise<string> {
	const title =
		params.triggerReason === 'manual'
			? 'Manual Complete Project Audit'
			: 'Complete Project Audit';
	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: 'project',
			entity_id: params.projectId,
			status: 'active',
			chat_type: 'project_audit',
			title,
			agent_metadata: {
				source: 'project_audit',
				project_id: params.projectId,
				trigger_reason: params.triggerReason
			} as Json
		})
		.select('id')
		.single();
	if (sessionError || !session?.id) {
		throw sessionError ?? new Error('Failed to create project audit chat session');
	}

	const { error: linkError } = await supabase.from('chat_sessions_projects').insert({
		chat_session_id: session.id,
		project_id: params.projectId
	});
	if (linkError) throw new Error(linkError.message);

	return session.id as string;
}

async function scheduleProjectAuditTriggerEvaluation(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth: ProjectAuditDepth;
	scheduledFor: string | null;
	triggerEvaluationId?: string | null;
}): Promise<void> {
	if (!params.scheduledFor) return;
	const scheduledMs = Date.parse(params.scheduledFor);
	if (!Number.isFinite(scheduledMs) || scheduledMs <= Date.now()) return;

	const { error } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: 'buildos_project_loop',
		p_metadata: {
			mode: 'complete_audit_trigger_evaluation',
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: params.triggerReason,
			auditDepth: params.auditDepth,
			triggerEvaluationId: params.triggerEvaluationId ?? undefined
		} as unknown as Json,
		p_priority: 8,
		p_scheduled_for: params.scheduledFor,
		p_dedup_key: projectAuditTriggerEvaluationDedupKey({
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			scheduledFor: params.scheduledFor
		})
	});

	if (error) {
		console.error('[ProjectAudits] failed to schedule trigger re-evaluation:', error.message);
	}
}

export async function queueProjectAuditFromWorker(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth?: ProjectAuditDepth;
	now?: Date;
}): Promise<QueueProjectAuditResult> {
	if (!PROJECT_LOOPS_ENABLED) return { queued: false, reason: 'feature_disabled' };

	const auditDepth = params.auditDepth ?? 'standard';
	const evaluated = await evaluateProjectAuditTrigger({
		supabase,
		projectId: params.projectId,
		userId: params.userId,
		triggerReason: params.triggerReason,
		now: params.now
	});

	if (evaluated.evaluation.decision !== 'queued' || !evaluated.snapshot) {
		const evaluationId = await recordProjectAuditTriggerEvaluation({
			supabase,
			evaluation: evaluated.evaluation
		});
		if (evaluated.evaluation.decision === 'deferred_quiet_period') {
			await scheduleProjectAuditTriggerEvaluation({
				projectId: params.projectId,
				userId: params.userId,
				triggerReason: params.triggerReason,
				auditDepth,
				scheduledFor: evaluated.evaluation.quiet_until,
				triggerEvaluationId: evaluationId
			});
		}
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_skipped',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: evaluated.evaluation.reason_summary,
			evaluationId,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			evaluationId: evaluationId ?? undefined,
			decision: evaluated.evaluation.decision,
			reason: evaluated.evaluation.reason_summary
		};
	}

	let chatSessionId: string;
	try {
		chatSessionId = await createAuditChatSession({
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: params.triggerReason
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to create project audit chat session';
		console.error('[ProjectAudits] create audit chat session failed:', message);
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queue_failed',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: message,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			decision: evaluated.evaluation.decision,
			reason: message
		};
	}

	const { data: runRow, error: runError } = await supabase
		.from('project_loop_runs')
		.insert({
			project_id: params.projectId,
			user_id: params.userId,
			trigger_reason: params.triggerReason,
			status: 'queued',
			chat_session_id: chatSessionId,
			summary: 'Complete project audit queued.'
		})
		.select('id')
		.single();

	if (runError || !runRow?.id) {
		const message = runError?.message ?? 'Failed to create audit loop run';
		console.error('[ProjectAudits] create audit loop run failed:', message);
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queue_failed',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: message,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			decision: evaluated.evaluation.decision,
			reason: message
		};
	}

	const triggerSnapshot: ProjectAuditTriggerSnapshot = buildProjectAuditTriggerSnapshot(
		evaluated.evaluation
	);

	const { data: auditRow, error: auditError } = await supabase
		.from('project_audits')
		.insert({
			project_id: params.projectId,
			user_id: params.userId,
			loop_run_id: runRow.id,
			chat_session_id: chatSessionId,
			status: 'queued',
			trigger_reason: params.triggerReason,
			audit_depth: auditDepth,
			delivery_confidence: 'unknown',
			project_size_class: auditSizeClassForInsert(evaluated.evaluation.project_size_class),
			summary: 'Complete project audit queued.',
			trigger_snapshot: triggerSnapshot as unknown as Json,
			project_snapshot_fingerprint: evaluated.snapshot.fingerprint
		})
		.select('id')
		.single();

	if (auditError || !auditRow?.id) {
		const message = auditError?.message ?? 'Failed to create project audit';
		console.error('[ProjectAudits] create project audit failed:', message);
		await supabase
			.from('project_loop_runs')
			.update({
				status: 'failed',
				error_message: message,
				finished_at: new Date().toISOString()
			})
			.eq('id', runRow.id);
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queue_failed',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: message,
			runId: runRow.id as string,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			runId: runRow.id as string,
			decision: evaluated.evaluation.decision,
			reason: message
		};
	}

	const evaluationId = await recordProjectAuditTriggerEvaluation({
		supabase,
		evaluation: evaluated.evaluation,
		createdAuditId: auditRow.id as string,
		createdLoopRunId: runRow.id as string
	});

	const { data: queueRecordId, error: queueError } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: 'buildos_project_loop',
		p_metadata: {
			mode: 'complete_audit',
			runId: runRow.id,
			auditId: auditRow.id,
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: params.triggerReason,
			auditDepth,
			triggerEvaluationId: evaluationId
		} as unknown as Json,
		p_priority: auditDepth === 'deep' ? 6 : 7,
		p_scheduled_for: new Date().toISOString(),
		// Stable per-project/day slot so concurrent audit triggers collapse onto
		// one job instead of double-auditing (audit Tier 1 #5).
		p_dedup_key: projectAuditDedupKey(params.projectId)
	});

	if (queueError || typeof queueRecordId !== 'string') {
		const message = queueError?.message ?? 'Queue RPC did not return a queue record id';
		console.error('[ProjectAudits] queue audit job failed:', message);
		const now = new Date().toISOString();
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', runRow.id),
			supabase
				.from('project_audits')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', auditRow.id)
		]);
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queue_failed',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: message,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId: evaluationId ?? undefined,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId: evaluationId ?? undefined,
			decision: evaluated.evaluation.decision,
			reason: message
		};
	}

	let queueJob: { queueJobId: string; metadata: unknown };
	try {
		queueJob = await resolveQueueJobDetails(queueRecordId);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to resolve queued project audit job';
		const now = new Date().toISOString();
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', runRow.id)
				.eq('status', 'queued'),
			supabase
				.from('project_audits')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', auditRow.id)
				.eq('status', 'queued')
		]);
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queue_failed',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: message,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId: evaluationId ?? undefined,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId: evaluationId ?? undefined,
			decision: evaluated.evaluation.decision,
			reason: message
		};
	}
	const queueMetadata = readProjectLoopQueueMetadata(queueJob.metadata);
	if (queueMetadata.runId !== runRow.id || queueMetadata.auditId !== auditRow.id) {
		const message =
			queueMetadata.runId || queueMetadata.auditId
				? `Deduplicated onto active complete audit job ${queueJob.queueJobId}`
				: `Queue job ${queueJob.queueJobId} metadata did not include the new audit run ${runRow.id}/${auditRow.id}`;
		const now = new Date().toISOString();
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', runRow.id)
				.eq('status', 'queued'),
			supabase
				.from('project_audits')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', auditRow.id)
				.eq('status', 'queued')
		]);
		captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_skipped',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: 'skipped_duplicate',
			reason: message,
			auditId: queueMetadata.auditId ?? (auditRow.id as string),
			runId: queueMetadata.runId ?? (runRow.id as string),
			evaluationId: evaluationId ?? undefined,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			auditId: queueMetadata.auditId ?? (auditRow.id as string),
			runId: queueMetadata.runId ?? (runRow.id as string),
			jobId: queueJob.queueJobId,
			evaluationId: evaluationId ?? undefined,
			decision: 'skipped_duplicate',
			reason:
				queueMetadata.runId || queueMetadata.auditId
					? 'already_running'
					: 'queue_metadata_mismatch'
		};
	}

	const queueJobId = queueJob.queueJobId;
	await supabase
		.from('project_loop_runs')
		.update({ queue_job_id: queueJobId })
		.eq('id', runRow.id);

	captureAuditTriggerMetric({
		userId: params.userId,
		event: 'project_audit_queued',
		projectId: params.projectId,
		triggerReason: params.triggerReason,
		auditDepth,
		decision: 'queued',
		reason: evaluated.evaluation.reason_summary,
		auditId: auditRow.id as string,
		runId: runRow.id as string,
		evaluationId: evaluationId ?? undefined,
		projectSizeClass: evaluated.evaluation.project_size_class
	});
	return {
		queued: true,
		auditId: auditRow.id as string,
		runId: runRow.id as string,
		jobId: queueJobId,
		evaluationId: evaluationId ?? undefined,
		decision: 'queued',
		reason: evaluated.evaluation.reason_summary
	};
}

export async function processProjectAuditTriggerEvaluationJob(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth?: ProjectAuditDepth;
}): Promise<QueueProjectAuditResult> {
	return queueProjectAuditFromWorker({
		projectId: params.projectId,
		userId: params.userId,
		triggerReason: params.triggerReason,
		auditDepth: params.auditDepth
	});
}

export async function enqueueScheduledProjectAudits(): Promise<ScheduledAuditEnqueueResult> {
	if (!PROJECT_LOOPS_ENABLED) {
		return {
			queued: 0,
			scanned: 0,
			skippedInvalidOwner: 0,
			skipped: 0,
			failed: 0,
			deferred: 0
		};
	}

	const { data: projects, error } = await supabase
		.from('onto_projects')
		.select('id, created_by')
		.in('state_key', ['active', 'planning'])
		.is('deleted_at', null)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(500);

	if (error) {
		console.error('[ProjectAudits] scheduled scan failed:', error.message);
		return {
			queued: 0,
			scanned: 0,
			skippedInvalidOwner: 0,
			skipped: 0,
			failed: 0,
			deferred: 0
		};
	}

	const ownerUserIdsByProjectId = await resolveProjectLoopOwnerUserIds(projects ?? []);
	let queued = 0;
	let skipped = 0;
	let failed = 0;
	let deferred = 0;
	let skippedInvalidOwner = 0;

	for (const project of projects ?? []) {
		if (!project.id) continue;
		const userId = ownerUserIdsByProjectId.get(project.id);
		if (!userId) {
			skippedInvalidOwner += 1;
			continue;
		}

		try {
			const result = await queueProjectAuditFromWorker({
				projectId: project.id,
				userId,
				triggerReason: 'scheduled'
			});
			if (result.queued) {
				queued += 1;
			} else if (result.decision === 'deferred_quiet_period') {
				deferred += 1;
			} else {
				skipped += 1;
			}
		} catch (error) {
			failed += 1;
			console.error(
				`[ProjectAudits] scheduled evaluation failed for project ${project.id}:`,
				error
			);
		}
	}

	return {
		queued,
		scanned: projects?.length ?? 0,
		skippedInvalidOwner,
		skipped,
		failed,
		deferred
	};
}
