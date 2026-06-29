// apps/web/src/lib/server/project-suggestion-actions.service.ts
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type {
	Json,
	LoopOperation,
	ProjectSuggestion,
	ProjectSuggestionFeedback,
	ProjectSuggestionResult
} from '@buildos/shared-types';
import type { ChatToolCall } from '@buildos/shared-types';
import { syncInboxItemForProjectSuggestion } from '@buildos/shared-agent-ops';
import { loadProjectLoopSourceFingerprint } from '$lib/server/project-loop-snapshot.service';

type AnySupabase = any;

export type ProjectSuggestionDecisionAction = 'approve' | 'dismiss';

export type ProjectSuggestionDecisionOutcome =
	| {
			ok: true;
			suggestion: Record<string, unknown>;
			result?: ProjectSuggestionResult;
			alreadyDecided?: boolean;
			superseded?: boolean;
	  }
	| {
			ok: false;
			status: number;
			message: string;
	  };

async function syncProjectSuggestionInboxItem(suggestion: Record<string, unknown>): Promise<void> {
	try {
		const admin = createAdminSupabaseClient();
		await syncInboxItemForProjectSuggestion({
			supabase: admin as any,
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

async function loadRunChatSessionId(params: {
	supabase: AnySupabase;
	runId: string;
}): Promise<string | null> {
	const { data, error } = await params.supabase
		.from('project_loop_runs')
		.select('chat_session_id')
		.eq('id', params.runId)
		.maybeSingle();
	if (error) throw error;
	return typeof data?.chat_session_id === 'string' ? data.chat_session_id : null;
}

const FEEDBACK_REASONS = new Set<ProjectSuggestionFeedback['reason']>([
	'not_relevant',
	'wrong_evidence',
	'intentional',
	'too_risky',
	'other'
]);

function sanitizeFeedback(value: unknown): ProjectSuggestionFeedback | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const reason = FEEDBACK_REASONS.has(record.reason as ProjectSuggestionFeedback['reason'])
		? (record.reason as ProjectSuggestionFeedback['reason'])
		: undefined;
	const note =
		typeof record.note === 'string' && record.note.trim()
			? record.note.trim().slice(0, 1000)
			: undefined;
	if (!reason && !note) return null;
	return {
		...(reason ? { reason } : {}),
		...(note ? { note } : {}),
		created_at: new Date().toISOString()
	};
}

export async function decideProjectSuggestion(params: {
	supabase: AnySupabase;
	userId: string;
	projectId: string;
	suggestionId: string;
	action: ProjectSuggestionDecisionAction;
	feedback?: unknown;
	fetchFn?: typeof fetch;
}): Promise<ProjectSuggestionDecisionOutcome> {
	const { supabase, userId, projectId, suggestionId, action } = params;
	const nowIso = new Date().toISOString();

	let current: Record<string, unknown> | null;
	try {
		current = await loadSuggestion({ supabase, projectId, suggestionId });
	} catch (error) {
		return {
			ok: false,
			status: 500,
			message: error instanceof Error ? error.message : 'Failed to load suggestion'
		};
	}

	if (!current) {
		return { ok: false, status: 404, message: 'Suggestion not found' };
	}
	if (current.status !== 'pending') {
		await syncProjectSuggestionInboxItem(current);
		return { ok: true, suggestion: current, alreadyDecided: true };
	}

	if (action === 'dismiss') {
		const feedback = sanitizeFeedback(params.feedback);
		const { data: updated, error: updateError } = await supabase
			.from('project_suggestions')
			.update({
				status: 'rejected',
				decided_at: nowIso,
				...(feedback ? { user_feedback: feedback as unknown as Json } : {})
			})
			.eq('id', suggestionId)
			.eq('project_id', projectId)
			.eq('status', 'pending')
			.select('*')
			.maybeSingle();
		if (updateError) return { ok: false, status: 500, message: updateError.message };
		if (!updated) {
			const latest = await loadSuggestion({ supabase, projectId, suggestionId });
			if (latest) await syncProjectSuggestionInboxItem(latest);
			return latest
				? { ok: true, suggestion: latest, alreadyDecided: true }
				: { ok: false, status: 404, message: 'Suggestion not found' };
		}
		await syncProjectSuggestionInboxItem(updated);
		return { ok: true, suggestion: updated };
	}

	const suggestionBeforeClaim = current as unknown as ProjectSuggestion;
	if (suggestionBeforeClaim.source_fingerprint) {
		let currentFingerprint: string | null = null;
		try {
			currentFingerprint = await loadProjectLoopSourceFingerprint(supabase, projectId);
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

		if (currentFingerprint !== suggestionBeforeClaim.source_fingerprint) {
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
			const { data: updated, error: updateError } = await supabase
				.from('project_suggestions')
				.update({
					status: 'superseded',
					freshness_state: 'changed',
					decided_at: nowIso,
					result: result as unknown as Json
				})
				.eq('id', suggestionId)
				.eq('project_id', projectId)
				.eq('status', 'pending')
				.select('*')
				.maybeSingle();
			if (updateError) return { ok: false, status: 500, message: updateError.message };
			if (updated) {
				await syncProjectSuggestionInboxItem(updated);
				return { ok: true, suggestion: updated, result, superseded: true };
			}
			const latest = await loadSuggestion({ supabase, projectId, suggestionId });
			if (latest) await syncProjectSuggestionInboxItem(latest);
			return latest
				? { ok: true, suggestion: latest, alreadyDecided: true }
				: { ok: false, status: 404, message: 'Suggestion not found' };
		}
	}

	const { data: claimed, error: claimError } = await supabase
		.from('project_suggestions')
		.update({ status: 'approved', decided_at: nowIso })
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();
	if (claimError) return { ok: false, status: 500, message: claimError.message };
	if (!claimed) {
		const latest = await loadSuggestion({ supabase, projectId, suggestionId });
		if (latest) await syncProjectSuggestionInboxItem(latest);
		return latest
			? { ok: true, suggestion: latest, alreadyDecided: true }
			: { ok: false, status: 404, message: 'Suggestion not found' };
	}
	await syncProjectSuggestionInboxItem(claimed);

	const suggestion = claimed as unknown as ProjectSuggestion;
	let chatSessionId: string | null = null;
	try {
		chatSessionId = await loadRunChatSessionId({ supabase, runId: suggestion.run_id });
	} catch (error) {
		console.warn(
			`[ProjectSuggestions] Failed to load loop chat session ${suggestion.run_id}:`,
			error instanceof Error ? error.message : error
		);
	}
	const baseFetch = params.fetchFn ?? fetch;
	const projectLoopFetch: typeof fetch = (input, init = {}) => {
		const headers = new Headers(init.headers);
		headers.set('X-Skip-Project-Loop-Burst', 'true');
		return baseFetch(input, {
			...init,
			headers
		});
	};
	const executor = new ChatToolExecutor(
		supabase,
		userId,
		chatSessionId ?? undefined,
		projectLoopFetch
	);
	const operations: LoopOperation[] = Array.isArray(suggestion.operations)
		? suggestion.operations
		: [];

	const errors: Array<{ tool: string; error: string }> = [];
	let appliedCount = 0;

	for (const op of operations) {
		const toolCall: ChatToolCall = {
			id: globalThis.crypto.randomUUID(),
			type: 'function',
			function: { name: op.tool, arguments: JSON.stringify(op.args ?? {}) }
		};
		try {
			const result = await executor.execute(toolCall);
			if (result.success) {
				appliedCount += 1;
			} else {
				errors.push({ tool: op.tool, error: result.error ?? 'Tool execution failed' });
			}
		} catch (error) {
			errors.push({
				tool: op.tool,
				error: error instanceof Error ? error.message : 'Tool execution threw'
			});
		}
	}

	const result: ProjectSuggestionResult = {
		ok: errors.length === 0,
		applied_operations: appliedCount,
		...(errors.length ? { errors } : {})
	};

	const { data: updated, error: updateError } = await supabase
		.from('project_suggestions')
		.update({
			status: result.ok ? 'applied' : 'failed',
			applied_at: result.ok ? nowIso : null,
			result: result as unknown as Json
		})
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.select('*')
		.single();

	if (updateError || !updated) {
		return {
			ok: false,
			status: 500,
			message: updateError?.message ?? 'Failed to update suggestion result'
		};
	}

	await syncProjectSuggestionInboxItem(updated);
	return { ok: true, suggestion: updated, result };
}
