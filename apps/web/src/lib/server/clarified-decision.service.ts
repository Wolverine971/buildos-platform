// apps/web/src/lib/server/clarified-decision.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isProjectSuggestionFresh } from '$lib/server/project-loop-snapshot.service';
import { finalizeProjectLoopRunIfComplete } from '$lib/server/project-loop-run.service';
import {
	countActiveAgentRuns,
	dispatchAgentRun,
	MAX_CONCURRENT_AGENT_RUNS
} from '$lib/server/agent-runs/dispatch';
import {
	buildProjectSuggestionProposalContext,
	type ProposalContextLoopRun
} from '@buildos/shared-agent-ops/proposal-context';
import { syncInboxItemForProjectSuggestion } from '@buildos/shared-agent-ops';
import type {
	Json,
	ProjectSuggestion,
	ProjectSuggestionFeedback,
	ProjectSuggestionResult
} from '@buildos/shared-types';

type AnySupabase = any;

export type ClarifiedProjectSuggestionAction = 'approve' | 'dismiss';

export type ClarifiedProjectSuggestionDecisionOutcome =
	| {
			ok: true;
			suggestion: Record<string, unknown>;
			result?: ProjectSuggestionResult;
			agentRun?: Record<string, unknown>;
			agent_run_id?: string;
			delegated?: boolean;
			degraded?: boolean;
			alreadyDecided?: boolean;
			superseded?: boolean;
	  }
	| {
			ok: false;
			status: number;
			message: string;
	  };

const CLARIFIED_DECISION_ALLOWED_OPS = [
	'onto.task.list',
	'onto.task.search',
	'onto.task.get',
	'onto.task.update',
	'onto.task.create',
	'onto.task.docs.list',
	'onto.task.docs.create_or_attach',
	'onto.document.list',
	'onto.document.search',
	'onto.document.get',
	'onto.document.update',
	'onto.document.create',
	'onto.document.tree.get',
	'onto.document.tree.move',
	'onto.document.path.get'
];

const FEEDBACK_REASONS = new Set<ProjectSuggestionFeedback['reason']>([
	'not_relevant',
	'wrong_evidence',
	'intentional',
	'too_risky',
	'other'
]);

function nowIso(): string {
	return new Date().toISOString();
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeClarification(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text.slice(0, 2000) : null;
}

function sanitizeReason(value: unknown): ProjectSuggestionFeedback['reason'] | undefined {
	return FEEDBACK_REASONS.has(value as ProjectSuggestionFeedback['reason'])
		? (value as ProjectSuggestionFeedback['reason'])
		: undefined;
}

function buildFeedback(params: {
	action: ClarifiedProjectSuggestionAction;
	clarification: string;
	reason?: unknown;
}): ProjectSuggestionFeedback {
	return {
		...(params.action === 'dismiss'
			? { reason: sanitizeReason(params.reason) ?? 'other' }
			: {}),
		note: params.clarification,
		created_at: nowIso()
	};
}

async function syncProjectSuggestionInboxItem(
	admin: AnySupabase,
	suggestion: Record<string, unknown>
): Promise<void> {
	try {
		await syncInboxItemForProjectSuggestion({
			supabase: admin,
			suggestion
		});
	} catch (error) {
		console.warn(
			`[AI Inbox] Failed to sync project suggestion ${suggestion.id}:`,
			error instanceof Error ? error.message : error
		);
	}
}

async function loadSuggestion(params: {
	supabase: AnySupabase;
	projectId: string;
	suggestionId: string;
}): Promise<Record<string, unknown> | null> {
	const { data, error } = await params.supabase
		.from('project_suggestions')
		.select('*')
		.eq('id', params.suggestionId)
		.eq('project_id', params.projectId)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

async function loadProjectName(params: {
	supabase: AnySupabase;
	projectId: string;
}): Promise<string | null> {
	const { data, error } = await params.supabase
		.from('onto_projects')
		.select('name')
		.eq('id', params.projectId)
		.maybeSingle();
	if (error) throw error;
	return stringValue(data?.name);
}

async function loadLoopRun(params: {
	supabase: AnySupabase;
	projectId: string;
	runId: string;
}): Promise<ProposalContextLoopRun | null> {
	const { data, error } = await params.supabase
		.from('project_loop_runs')
		.select('id, trigger_reason, summary, created_at, finished_at, chat_session_id')
		.eq('id', params.runId)
		.eq('project_id', params.projectId)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

function buildClarifiedInstructions(params: {
	action: ClarifiedProjectSuggestionAction;
	clarification: string;
	proposalLlmText: string;
	projectId: string;
	suggestionId: string;
}): string {
	const actionGuidance =
		params.action === 'approve'
			? [
					'The user approved this project review item with clarification.',
					'Apply the intent of the proposal, but adjust details to honor the user clarification.',
					'Use gateway operation names such as onto.task.update and onto.document.update. Do not use ChatToolExecutor names from the original operations array.',
					'Do not delete entities and do not use calendar operations.',
					'When done, submit_result with status "completed", a concise summary, and any remaining caveats.'
				]
			: [
					'The user dismissed this project review item with clarification.',
					'Do NOT apply the proposed change.',
					'Durably encode the reason so future project reviews do not re-raise the same suggestion unless materially new evidence appears.',
					'Prefer reading the relevant task/document first, then append a short "Project review decision" note to a relevant task or document description/content. Keep it factual and brief.',
					'Do not delete entities and do not use calendar operations.',
					'When done, submit_result with status "completed" and summarize where the reasoning was recorded.'
				];

	return [
		'You are handling a clarified AI Inbox decision for a BuildOS project suggestion.',
		`Project id: ${params.projectId}`,
		`Suggestion id: ${params.suggestionId}`,
		'',
		...actionGuidance,
		'',
		'USER CLARIFICATION:',
		params.clarification,
		'',
		'PROPOSAL CONTEXT:',
		params.proposalLlmText
	].join('\n');
}

async function markSuggestionFailed(params: {
	supabase: AnySupabase;
	admin: AnySupabase;
	projectId: string;
	suggestionId: string;
	message: string;
}): Promise<Record<string, unknown> | null> {
	const result: ProjectSuggestionResult = {
		ok: false,
		applied_operations: 0,
		errors: [{ tool: 'clarified_decision_dispatch', error: params.message }]
	};
	const { data, error } = await params.supabase
		.from('project_suggestions')
		.update({
			status: 'failed',
			result: result as unknown as Json,
			updated_at: nowIso()
		})
		.eq('id', params.suggestionId)
		.eq('project_id', params.projectId)
		.select('*')
		.maybeSingle();
	if (error) throw error;
	if (data) await syncProjectSuggestionInboxItem(params.admin, data);
	return data ?? null;
}

function queueFullClarifiedDecisionResponse(): ClarifiedProjectSuggestionDecisionOutcome {
	return {
		ok: false,
		status: 429,
		message:
			'Clarified decisions require agent-run capacity right now. Try again after active agent runs finish.'
	};
}

export async function decideProjectSuggestionWithClarification(params: {
	supabase: AnySupabase;
	userId: string;
	projectId: string;
	suggestionId: string;
	action: ClarifiedProjectSuggestionAction;
	clarification: unknown;
	reason?: unknown;
}): Promise<ClarifiedProjectSuggestionDecisionOutcome> {
	const clarification = sanitizeClarification(params.clarification);
	if (!clarification) {
		return {
			ok: false,
			status: 400,
			message: 'clarification must be a non-empty string'
		};
	}

	const admin = createAdminSupabaseClient() as AnySupabase;
	let current: Record<string, unknown> | null;
	try {
		current = await loadSuggestion({
			supabase: params.supabase,
			projectId: params.projectId,
			suggestionId: params.suggestionId
		});
	} catch (error) {
		return {
			ok: false,
			status: 500,
			message: error instanceof Error ? error.message : 'Failed to load suggestion'
		};
	}

	if (!current) return { ok: false, status: 404, message: 'Suggestion not found' };
	if (current.status !== 'pending') {
		await syncProjectSuggestionInboxItem(admin, current);
		return { ok: true, suggestion: current, alreadyDecided: true };
	}

	const feedback = buildFeedback({
		action: params.action,
		clarification,
		reason: params.reason
	});

	if (params.action === 'approve') {
		const suggestionBeforeClaim = current as unknown as ProjectSuggestion;
		if (suggestionBeforeClaim.source_fingerprint) {
			let fresh: boolean;
			try {
				fresh = await isProjectSuggestionFresh(
					params.supabase,
					params.projectId,
					suggestionBeforeClaim
				);
			} catch (error) {
				return {
					ok: false,
					status: 500,
					message:
						error instanceof Error
							? `Failed to check suggestion freshness: ${error.message}`
							: 'Failed to check suggestion freshness'
				};
			}

			if (!fresh) {
				const result: ProjectSuggestionResult = {
					ok: false,
					applied_operations: 0,
					errors: [
						{
							tool: 'freshness_guard',
							error: 'Project changed since this review item was generated. Rerun Project Review.'
						}
					]
				};
				const { data: updated, error: updateError } = await params.supabase
					.from('project_suggestions')
					.update({
						status: 'superseded',
						freshness_state: 'changed',
						decided_at: nowIso(),
						user_feedback: feedback as unknown as Json,
						result: result as unknown as Json
					})
					.eq('id', params.suggestionId)
					.eq('project_id', params.projectId)
					.eq('status', 'pending')
					.select('*')
					.maybeSingle();
				if (updateError) return { ok: false, status: 500, message: updateError.message };
				if (updated) {
					await syncProjectSuggestionInboxItem(admin, updated);
					await finalizeProjectLoopRunIfComplete(
						params.supabase,
						(updated as { run_id?: string }).run_id
					);
					return { ok: true, suggestion: updated, result, superseded: true };
				}
				const latest = await loadSuggestion({
					supabase: params.supabase,
					projectId: params.projectId,
					suggestionId: params.suggestionId
				});
				if (latest) await syncProjectSuggestionInboxItem(admin, latest);
				return latest
					? { ok: true, suggestion: latest, alreadyDecided: true }
					: { ok: false, status: 404, message: 'Suggestion not found' };
			}
		}
	}

	const active = await countActiveAgentRuns({ admin, userId: params.userId });
	if (!active.ok) return active;
	if (active.count >= MAX_CONCURRENT_AGENT_RUNS) {
		return queueFullClarifiedDecisionResponse();
	}

	const { data: claimed, error: claimError } = await params.supabase
		.from('project_suggestions')
		.update({
			status: 'delegated',
			decided_at: nowIso(),
			user_feedback: feedback as unknown as Json
		})
		.eq('id', params.suggestionId)
		.eq('project_id', params.projectId)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();
	if (claimError) return { ok: false, status: 500, message: claimError.message };
	if (!claimed) {
		const latest = await loadSuggestion({
			supabase: params.supabase,
			projectId: params.projectId,
			suggestionId: params.suggestionId
		});
		if (latest) await syncProjectSuggestionInboxItem(admin, latest);
		return latest
			? { ok: true, suggestion: latest, alreadyDecided: true }
			: { ok: false, status: 404, message: 'Suggestion not found' };
	}
	await syncProjectSuggestionInboxItem(admin, claimed);

	let projectName: string | null = null;
	let loopRun: ProposalContextLoopRun | null = null;
	try {
		projectName = await loadProjectName({
			supabase: params.supabase,
			projectId: params.projectId
		});
		if (typeof claimed.run_id === 'string') {
			loopRun = await loadLoopRun({
				supabase: params.supabase,
				projectId: params.projectId,
				runId: claimed.run_id
			});
		}
	} catch (error) {
		console.warn(
			'[ClarifiedDecision] Failed to load project/loop context:',
			error instanceof Error ? error.message : error
		);
	}

	const proposalContext = buildProjectSuggestionProposalContext({
		suggestion: claimed as ProjectSuggestion,
		projectName,
		loopRun
	});
	const goal =
		params.action === 'approve'
			? `Apply clarified project review item: ${String(claimed.title ?? 'Review item')}`
			: `Record dismissal rationale for project review item: ${String(claimed.title ?? 'Review item')}`;

	const dispatch = await dispatchAgentRun({
		admin,
		userId: params.userId,
		goal,
		label: `${params.action === 'approve' ? 'Clarified approve' : 'Clarified dismiss'}: ${String(claimed.title ?? 'Review item').slice(0, 80)}`,
		instructions: buildClarifiedInstructions({
			action: params.action,
			clarification,
			proposalLlmText: proposalContext.llmText,
			projectId: params.projectId,
			suggestionId: params.suggestionId
		}),
		expectedOutput:
			params.action === 'approve'
				? 'Apply or adjust the reviewed project change, then summarize what changed.'
				: 'Record the dismissal rationale in project context, then summarize where it was recorded.',
		contextType: 'project',
		projectId: params.projectId,
		scopeMode: 'read_write',
		reviewRequired: false,
		allowedOps: CLARIFIED_DECISION_ALLOWED_OPS,
		budgets: { max_tool_calls: 10, wall_clock_ms: 180000 },
		trigger: 'event',
		parentSessionId:
			loopRun && typeof (loopRun as Record<string, unknown>).chat_session_id === 'string'
				? ((loopRun as Record<string, unknown>).chat_session_id as string)
				: null,
		depth: 0,
		sourceSuggestionId: params.suggestionId,
		sourceDecision: params.action,
		validateProjectAccess: false
	});

	if (!dispatch.ok) {
		if (dispatch.status === 429) {
			await params.supabase
				.from('project_suggestions')
				.update({ status: 'pending' })
				.eq('id', params.suggestionId)
				.eq('project_id', params.projectId)
				.eq('status', 'delegated');
			return queueFullClarifiedDecisionResponse();
		}

		try {
			const failed = await markSuggestionFailed({
				supabase: params.supabase,
				admin,
				projectId: params.projectId,
				suggestionId: params.suggestionId,
				message: dispatch.message
			});
			return {
				ok: false,
				status: dispatch.status,
				message:
					dispatch.message ||
					(failed ? 'Clarified decision failed' : 'Failed to dispatch run')
			};
		} catch {
			return { ok: false, status: dispatch.status, message: dispatch.message };
		}
	}

	const { data: linked, error: linkError } = await params.supabase
		.from('project_suggestions')
		.update({
			agent_run_id: dispatch.run.id,
			updated_at: nowIso()
		})
		.eq('id', params.suggestionId)
		.eq('project_id', params.projectId)
		.eq('status', 'delegated')
		.select('*')
		.maybeSingle();
	if (linkError) {
		console.warn(
			'[ClarifiedDecision] Failed to link agent run to suggestion:',
			linkError.message
		);
	}

	const suggestion = linked ?? claimed;
	await syncProjectSuggestionInboxItem(admin, suggestion);
	await finalizeProjectLoopRunIfComplete(
		params.supabase,
		(suggestion as { run_id?: string }).run_id
	);
	return {
		ok: true,
		suggestion,
		agentRun: dispatch.run,
		agent_run_id: String(dispatch.run.id),
		delegated: true
	};
}
