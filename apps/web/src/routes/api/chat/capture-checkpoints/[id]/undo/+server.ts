// apps/web/src/routes/api/chat/capture-checkpoints/[id]/undo/+server.ts
//
// POST /api/chat/capture-checkpoints/[id]/undo  (tasker/95)
//
// Undo one chat checkpoint capture from its receipt chip: restore START HERE to
// its content before the capture and take the capture's entry out of the
// thinking log. Each document is restored only when nobody edited it since the
// capture wrote it; otherwise that part reports `changed_since` and the version
// history is the way back. A START HERE proposal staged by the capture was
// built on the undone content, so it is withdrawn.
import type { RequestHandler } from './$types';
import { syncInboxItemForAgentRun } from '@buildos/shared-agent-ops';
import { writeDocumentHeadAndVersion } from '@buildos/shared-agent-ops/ontology/document-write.service';
import { ensureActorId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import { preserveCurrentStartHereManagedRegions } from '@buildos/shared-agent-ops/ontology/start-here';
import { removeThinkingLogEntry } from '@buildos/shared-agent-ops/ontology/thinking-log';
import { toDocumentSnapshot } from '@buildos/shared-agent-ops/ontology/versioning.service';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

type PartOutcome = 'restored' | 'changed_since' | 'none';

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid checkpoint ID');

	const admin = createAdminSupabaseClient();
	const { data: checkpoint, error } = await admin
		.from('chat_capture_checkpoints')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();
	if (error) return ApiResponse.internalError(error, 'Failed to load checkpoint');
	if (!checkpoint || !checkpoint.project_id) return ApiResponse.notFound('Checkpoint');
	if (checkpoint.status !== 'captured') {
		return ApiResponse.badRequest(
			checkpoint.status === 'undone' ? 'Already undone' : 'Nothing to undo'
		);
	}

	const access = await requireProjectMemberAccess({
		locals,
		projectId: checkpoint.project_id,
		requiredAccess: 'write',
		user
	});
	if (!access.ok) return access.response;

	try {
		const actorId = await ensureActorId(admin, user.id);
		const restore = async (
			documentId: string | null,
			next: (current: string, updatedAt: string | null) => string | null
		): Promise<PartOutcome> => {
			if (!documentId) return 'none';
			const { data: document } = await admin
				.from('onto_documents')
				.select('*')
				.eq('id', documentId)
				.eq('project_id', checkpoint.project_id!)
				.is('deleted_at', null)
				.maybeSingle();
			if (!document) return 'changed_since';
			const content = next(document.content ?? '', document.updated_at);
			if (content === null) return 'changed_since';
			const props =
				document.props &&
				typeof document.props === 'object' &&
				!Array.isArray(document.props)
					? (document.props as Record<string, unknown>)
					: {};
			const written = await writeDocumentHeadAndVersion({
				supabase: admin,
				documentId,
				projectId: checkpoint.project_id!,
				update: {
					content,
					props: { ...props, body_markdown: content } as never,
					updated_at: new Date().toISOString()
				},
				expectedUpdatedAt: document.updated_at,
				actorId,
				previousSnapshot: toDocumentSnapshot(document),
				changeSource: 'capture_undo'
			});
			if (written.status === 'conflict') return 'changed_since';
			if (written.status === 'error') throw written.error;
			return 'restored';
		};

		const startHere = await restore(
			checkpoint.start_here_before !== null ? checkpoint.start_here_document_id : null,
			(current, updatedAt) =>
				updatedAt === checkpoint.start_here_after_updated_at
					? // Keep today's machine-owned status/map regions; restore only the authored text.
						preserveCurrentStartHereManagedRegions(
							current,
							checkpoint.start_here_before!
						)
					: null
		);
		const thinkingLog = await restore(
			checkpoint.thinking_log_entry ? checkpoint.thinking_log_document_id : null,
			(current) => removeThinkingLogEntry(current, checkpoint.thinking_log_entry!)
		);

		let review: 'withdrawn' | 'none' = 'none';
		if (checkpoint.review_run_id) {
			const { data: run } = await admin
				.from('agent_runs')
				.update({
					status: 'cancelled',
					error: 'superseded: the capture that staged this proposal was undone',
					completed_at: new Date().toISOString()
				})
				.eq('id', checkpoint.review_run_id)
				.eq('user_id', user.id)
				.eq('status', 'proposal_ready')
				.select('*')
				.maybeSingle();
			if (run) {
				review = 'withdrawn';
				await syncInboxItemForAgentRun({
					supabase: admin,
					run: run as unknown as Record<string, unknown>
				}).catch(() => undefined);
			}
		}

		// A part edited since the capture stays as the user left it; anything that could be
		// restored was, so the receipt reads as undone either way.
		const undone =
			startHere === 'restored' || thinkingLog === 'restored' || review === 'withdrawn';
		if (undone) {
			await admin
				.from('chat_capture_checkpoints')
				.update({ status: 'undone', undone_at: new Date().toISOString() })
				.eq('id', checkpoint.id);
		}
		return ApiResponse.success({ undone, startHere, thinkingLog, review });
	} catch (undoError) {
		return ApiResponse.internalError(undoError, 'Failed to undo capture');
	}
};
