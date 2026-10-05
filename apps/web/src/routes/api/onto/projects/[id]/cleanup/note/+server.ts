// apps/web/src/routes/api/onto/projects/[id]/cleanup/note/+server.ts
//
// POST /api/onto/projects/[id]/cleanup/note
//   body: { cleanup_item_id, note, expected_fingerprints? }
//   -> { decision, reply, agent_run_id, outcomes, view }
//
// A quick note on one Project cleanup item from the AI Inbox. Jev reads the note in one
// model call into apply / not_needed / done / agent, then that decision runs: the first
// three through the card's own decision path, "agent" as a clarified approval that hands
// the item to a background agent run with the owner's words.
//
// Gated by PROJECT_LOOPS_ENABLED.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { loadProjectCleanupView } from '@buildos/shared-agent-ops/project-cleanup';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { isCleanupItemSelectable } from '$lib/components/inbox/project-cleanup-presentation';
import { runAfterResponse } from '$lib/server/background';
import {
	CLEANUP_NOTE_MAX_LENGTH,
	CLEANUP_NOTE_SYSTEM_PROMPT,
	actOnCleanupNote,
	buildCleanupNotePrompt,
	parseCleanupNoteReading
} from '$lib/server/cleanup-note.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { captureServerEvent } from '$lib/server/posthog';
import { refreshCleanupCard } from '$lib/server/project-cleanup-decisions.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

// An "apply" reading replays verified operations inline, after the model call.
export const config = { maxDuration: 120 };

const noteSchema = z
	.object({
		cleanup_item_id: z.string().trim().min(1).max(128),
		note: z.string().trim().min(1).max(CLEANUP_NOTE_MAX_LENGTH),
		expected_fingerprints: z
			.record(z.string().max(128), z.string().max(256).nullable())
			.optional()
	})
	.strict();

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	const parsed = await parseJsonRequest(request, noteSchema);
	if (!parsed.ok) return parsed.response;
	const { cleanup_item_id: itemId, note, expected_fingerprints } = parsed.data;

	const admin = createAdminSupabaseClient();
	let item;
	let projectName: string | null = null;
	try {
		const [view, project] = await Promise.all([
			loadProjectCleanupView(admin, access.projectId, { verify: true }),
			admin.from('onto_projects').select('name').eq('id', access.projectId).maybeSingle()
		]);
		item = view.items.find((candidate) => candidate.id === itemId) ?? null;
		projectName = typeof project.data?.name === 'string' ? project.data.name : null;
	} catch (error) {
		return ApiResponse.databaseError(error);
	}
	if (!item) return ApiResponse.error('This item is no longer in the cleanup list.', 404);

	let raw: unknown = null;
	try {
		raw = await new SmartLLMService({
			supabase: admin,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS AI Inbox'
		}).getJSONResponse<Record<string, unknown>>({
			systemPrompt: CLEANUP_NOTE_SYSTEM_PROMPT,
			userPrompt: buildCleanupNotePrompt({ projectName, item, note }),
			userId: access.userId,
			projectId: access.projectId,
			profile: 'balanced',
			temperature: 0.1,
			maxTokens: 500,
			timeoutMs: 30_000,
			validation: { retryOnParseError: true, maxRetries: 1 },
			operationType: 'project_cleanup_note',
			metadata: { cleanup_item_id: item.id }
		});
	} catch (error) {
		console.warn(
			'[Project cleanup] Note reading failed:',
			error instanceof Error ? error.message : error
		);
	}
	const reading = parseCleanupNoteReading(raw, isCleanupItemSelectable(item));
	if (!reading) {
		return ApiResponse.error("Jev couldn't read that note. Try again, or open the chat.", 502);
	}

	const result = await actOnCleanupNote({
		supabase: locals.supabase,
		userId: access.userId,
		projectId: access.projectId,
		item,
		note,
		reading,
		expectedFingerprints: expected_fingerprints
	});
	if (!result.ok) return ApiResponse.error(result.message, result.status);

	const view = await refreshCleanupCard(access.projectId);
	runAfterResponse(
		captureServerEvent(access.userId, 'project_cleanup_note_handled', {
			project_id: access.projectId,
			decision: result.decision,
			note_length: note.length,
			agent_run_id: result.agentRunId,
			failed: result.outcomes.filter((outcome) => !outcome.ok).length
		}),
		'project_cleanup_note_handled'
	);

	return ApiResponse.success({
		decision: result.decision,
		reply: result.reply,
		agent_run_id: result.agentRunId,
		outcomes: result.outcomes,
		view
	});
};
