// apps/web/src/lib/server/project-suggestion-integrity.service.ts
import type { LoopOperation, ProjectSuggestionPreview } from '@buildos/shared-types';
import {
	quarantineProjectSuggestionInboxItem,
	readProjectSuggestionStructuralFingerprint,
	verifyProjectSuggestionIntegrity,
	type ProjectSuggestionIntegrityDiagnostic,
	type VerifiedProjectSuggestionChangeSummary
} from '@buildos/shared-agent-ops';

type AnySupabase = any;

export type ProjectSuggestionReviewIntegrityResult =
	| {
			ok: true;
			summary: VerifiedProjectSuggestionChangeSummary | null;
			expectedStructuralFingerprint: string | null;
	  }
	| { ok: false; diagnostic: ProjectSuggestionIntegrityDiagnostic };

function readOperations(value: unknown): LoopOperation[] {
	return Array.isArray(value) ? (value as LoopOperation[]) : [];
}

async function loadVerifiedStructuralFingerprint(params: {
	supabase: AnySupabase;
	suggestionId: string;
}): Promise<string | null> {
	const { data, error } = await params.supabase
		.from('inbox_items')
		.select('source_status')
		.eq('source_type', 'project_suggestion')
		.eq('source_ref_id', params.suggestionId)
		.maybeSingle();
	if (error) throw error;
	return readProjectSuggestionStructuralFingerprint(data?.source_status);
}

/**
 * Resolves executable proposal IDs against current database state before the
 * proposal can be shown to a chat agent or delegated for clarified execution.
 * Findings with no operations remain discussable but have no change summary.
 */
export async function ensureProjectSuggestionReviewIntegrity(params: {
	supabase: AnySupabase;
	suggestion: Record<string, unknown>;
}): Promise<ProjectSuggestionReviewIntegrityResult> {
	const operations = readOperations(params.suggestion.operations);
	if (operations.length === 0) {
		return { ok: true, summary: null, expectedStructuralFingerprint: null };
	}

	const suggestionId =
		typeof params.suggestion.id === 'string' ? params.suggestion.id.trim() : '';
	const projectId =
		typeof params.suggestion.project_id === 'string' ? params.suggestion.project_id.trim() : '';
	const expectedStructuralFingerprint = suggestionId
		? await loadVerifiedStructuralFingerprint({
				supabase: params.supabase,
				suggestionId
			})
		: null;
	const preview =
		params.suggestion.preview &&
		typeof params.suggestion.preview === 'object' &&
		!Array.isArray(params.suggestion.preview)
			? (params.suggestion.preview as ProjectSuggestionPreview)
			: null;
	const integrity = await verifyProjectSuggestionIntegrity(params.supabase, {
		projectId,
		operations,
		title: typeof params.suggestion.title === 'string' ? params.suggestion.title : null,
		preview,
		checkModelAlignment: !expectedStructuralFingerprint,
		expectedStructuralFingerprint
	});

	if (!integrity.ok) {
		try {
			await quarantineProjectSuggestionInboxItem({
				supabase: params.supabase,
				suggestion: params.suggestion,
				diagnostic: integrity.diagnostic
			});
		} catch (error) {
			console.warn(
				`[ProjectSuggestions] Failed to quarantine invalid proposal ${suggestionId}:`,
				error instanceof Error ? error.message : error
			);
		}
		return integrity;
	}

	return {
		ok: true,
		summary: integrity.summary,
		expectedStructuralFingerprint
	};
}
