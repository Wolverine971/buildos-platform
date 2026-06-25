// apps/web/src/lib/server/project-suggestion-actions.service.ts
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type {
	Json,
	LoopOperation,
	ProjectSuggestion,
	ProjectSuggestionResult
} from '@buildos/shared-types';
import type { ChatToolCall } from '@buildos/shared-types';
import { syncInboxItemForProjectSuggestion } from '@buildos/shared-agent-ops';

type AnySupabase = any;

export type ProjectSuggestionDecisionAction = 'approve' | 'dismiss';

export type ProjectSuggestionDecisionOutcome =
	| {
			ok: true;
			suggestion: Record<string, unknown>;
			result?: ProjectSuggestionResult;
			alreadyDecided?: boolean;
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

export async function decideProjectSuggestion(params: {
	supabase: AnySupabase;
	userId: string;
	projectId: string;
	suggestionId: string;
	action: ProjectSuggestionDecisionAction;
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
		const { data: updated, error: updateError } = await supabase
			.from('project_suggestions')
			.update({ status: 'rejected', decided_at: nowIso })
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
	const executor = new ChatToolExecutor(supabase, userId);
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
