// apps/web/src/lib/server/project-audit-trigger.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import { captureServerEvent } from '$lib/server/posthog';
import { createLogger } from '$lib/utils/logger';
import { projectAuditDedupKey, readProjectLoopQueueMetadata } from '@buildos/shared-agent-ops';
import type {
	Json,
	ProjectAuditDepth,
	ProjectAuditTriggerDecision,
	ProjectAuditTriggerReason
} from '@buildos/shared-types';
import {
	auditSizeClassForInsert,
	buildProjectAuditTriggerSnapshot,
	evaluateProjectAuditTrigger,
	recordProjectAuditTriggerEvaluation,
	type ProjectAuditTriggerEvaluationDraft,
	type ProjectAuditTriggerEvaluationResult
} from '@buildos/shared-agent-ops/project-audits';

export { evaluateProjectAuditTrigger, recordProjectAuditTriggerEvaluation };
export type { ProjectAuditTriggerEvaluationDraft, ProjectAuditTriggerEvaluationResult };

type AnySupabase = any;

const logger = createLogger('ProjectAuditTrigger');

async function captureAuditTriggerMetric(params: {
	userId: string;
	event: 'project_audit_queued' | 'project_audit_skipped' | 'project_audit_queue_failed';
	projectId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth: ProjectAuditDepth;
	decision: ProjectAuditTriggerDecision;
	reason?: string | null;
	auditId?: string | null;
	runId?: string | null;
	evaluationId?: string | null;
	projectSizeClass?: string | null;
}): Promise<void> {
	await captureServerEvent(params.userId, params.event, {
		project_id: params.projectId,
		trigger_reason: params.triggerReason,
		audit_depth: params.auditDepth,
		decision: params.decision,
		reason: params.reason ?? null,
		audit_id: params.auditId ?? null,
		run_id: params.runId ?? null,
		evaluation_id: params.evaluationId ?? null,
		project_size_class: params.projectSizeClass ?? null
	});
}

export type QueueProjectAuditResult = {
	queued: boolean;
	auditId?: string;
	runId?: string;
	jobId?: string;
	evaluationId?: string;
	decision: ProjectAuditTriggerDecision;
	reason: string;
	evaluation: ProjectAuditTriggerEvaluationDraft;
};

async function createAuditChatSession(params: {
	supabase: AnySupabase;
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
}): Promise<string> {
	const title =
		params.triggerReason === 'manual'
			? 'Manual Complete Project Audit'
			: 'Complete Project Audit';
	const { data: session, error: sessionError } = await params.supabase
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

	await params.supabase
		.from('chat_sessions_projects')
		.insert({
			chat_session_id: session.id,
			project_id: params.projectId
		})
		.throwOnError();

	return session.id as string;
}

async function archiveChatSession(params: {
	supabase: AnySupabase;
	chatSessionId: string;
}): Promise<void> {
	const { error } = await params.supabase
		.from('chat_sessions')
		.update({ status: 'archived' })
		.eq('id', params.chatSessionId)
		.eq('status', 'active');
	if (error) {
		logger.warn('Archive duplicate audit chat session failed', {
			chatSessionId: params.chatSessionId,
			error: error.message
		});
	}
}

async function scheduleProjectAuditTriggerEvaluation(params: {
	supabase: AnySupabase;
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

	try {
		await addQueueJobWithPublicId(params.supabase, {
			p_user_id: params.userId,
			p_job_type: 'buildos_project_loop',
			p_metadata: {
				mode: 'complete_audit_trigger_evaluation',
				projectId: params.projectId,
				userId: params.userId,
				triggerReason: params.triggerReason,
				auditDepth: params.auditDepth,
				triggerEvaluationId: params.triggerEvaluationId ?? undefined
			},
			p_priority: 8,
			p_scheduled_for: params.scheduledFor,
			p_dedup_key: `project-audit-trigger:${params.projectId}:${params.triggerReason}:${params.scheduledFor.slice(0, 16)}`
		});
	} catch (error) {
		logger.warn('Schedule audit trigger re-evaluation failed', {
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			error: error instanceof Error ? error.message : String(error)
		});
	}
}

export async function queueProjectAudit(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth?: ProjectAuditDepth;
	now?: Date;
}): Promise<QueueProjectAuditResult> {
	const supabase = createAdminSupabaseClient();
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
				supabase,
				projectId: params.projectId,
				userId: params.userId,
				triggerReason: params.triggerReason,
				auditDepth,
				scheduledFor: evaluated.evaluation.quiet_until,
				triggerEvaluationId: evaluationId
			});
		}
		await captureAuditTriggerMetric({
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
			reason: evaluated.evaluation.reason_summary,
			evaluation: evaluated.evaluation
		};
	}

	let chatSessionId: string;
	try {
		chatSessionId = await createAuditChatSession({
			supabase,
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: params.triggerReason
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to create project audit chat session';
		logger.warn('Create audit chat session failed', {
			projectId: params.projectId,
			error: message
		});
		await captureAuditTriggerMetric({
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
			reason: message,
			evaluation: evaluated.evaluation
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
		logger.warn('Create audit loop run failed', {
			projectId: params.projectId,
			error: message
		});
		await archiveChatSession({ supabase, chatSessionId });
		await captureAuditTriggerMetric({
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
			reason: message,
			evaluation: evaluated.evaluation
		};
	}

	const triggerSnapshot = buildProjectAuditTriggerSnapshot(evaluated.evaluation);
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
		logger.warn('Create project audit failed', { projectId: params.projectId, error: message });
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({
					status: 'failed',
					error_message: message,
					finished_at: new Date().toISOString()
				})
				.eq('id', runRow.id),
			archiveChatSession({ supabase, chatSessionId })
		]);
		await captureAuditTriggerMetric({
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
			reason: message,
			evaluation: evaluated.evaluation
		};
	}

	const evaluationId = await recordProjectAuditTriggerEvaluation({
		supabase,
		evaluation: evaluated.evaluation,
		createdAuditId: auditRow.id as string,
		createdLoopRunId: runRow.id as string
	});

	try {
		const { queueJobId, metadata } = await addQueueJobWithPublicId(supabase, {
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
			},
			p_priority: auditDepth === 'deep' ? 6 : 7,
			p_scheduled_for: new Date().toISOString(),
			// Stable per-project/day slot so concurrent audit triggers collapse
			// onto one job instead of double-auditing (audit Tier 1 #5).
			p_dedup_key: projectAuditDedupKey(params.projectId)
		});

		const queueMetadata = readProjectLoopQueueMetadata(metadata);
		if (queueMetadata.runId !== runRow.id || queueMetadata.auditId !== auditRow.id) {
			const message =
				queueMetadata.runId || queueMetadata.auditId
					? `Deduplicated onto active complete audit job ${queueJobId}`
					: `Queue job ${queueJobId} metadata did not include the new audit run ${runRow.id}/${auditRow.id}`;
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
					.eq('status', 'queued'),
				archiveChatSession({ supabase, chatSessionId })
			]);
			await captureAuditTriggerMetric({
				userId: params.userId,
				event: 'project_audit_skipped',
				projectId: params.projectId,
				triggerReason: params.triggerReason,
				auditDepth,
				decision: 'skipped_duplicate',
				reason: message,
				auditId: queueMetadata.auditId ?? (auditRow.id as string),
				runId: queueMetadata.runId ?? (runRow.id as string),
				evaluationId,
				projectSizeClass: evaluated.evaluation.project_size_class
			});
			return {
				queued: false,
				auditId: queueMetadata.auditId ?? (auditRow.id as string),
				runId: queueMetadata.runId ?? (runRow.id as string),
				jobId: queueJobId,
				evaluationId: evaluationId ?? undefined,
				decision: 'skipped_duplicate',
				reason:
					queueMetadata.runId || queueMetadata.auditId
						? 'already_running'
						: 'queue_metadata_mismatch',
				evaluation: {
					...evaluated.evaluation,
					created_audit_id: queueMetadata.auditId ?? (auditRow.id as string),
					created_loop_run_id: queueMetadata.runId ?? (runRow.id as string)
				}
			};
		}

		await supabase
			.from('project_loop_runs')
			.update({ queue_job_id: queueJobId })
			.eq('id', runRow.id);

		await captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queued',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: 'queued',
			reason: evaluated.evaluation.reason_summary,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: true,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			jobId: queueJobId,
			evaluationId: evaluationId ?? undefined,
			decision: 'queued',
			reason: evaluated.evaluation.reason_summary,
			evaluation: {
				...evaluated.evaluation,
				created_audit_id: auditRow.id as string,
				created_loop_run_id: runRow.id as string
			}
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Queue failed';
		logger.warn('Queue audit job failed', { projectId: params.projectId, error: message });
		const now = new Date().toISOString();
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', runRow.id),
			supabase
				.from('project_audits')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', auditRow.id),
			archiveChatSession({ supabase, chatSessionId })
		]);
		await captureAuditTriggerMetric({
			userId: params.userId,
			event: 'project_audit_queue_failed',
			projectId: params.projectId,
			triggerReason: params.triggerReason,
			auditDepth,
			decision: evaluated.evaluation.decision,
			reason: message,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId,
			projectSizeClass: evaluated.evaluation.project_size_class
		});
		return {
			queued: false,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId: evaluationId ?? undefined,
			decision: 'queued',
			reason: message,
			evaluation: evaluated.evaluation
		};
	}
}
