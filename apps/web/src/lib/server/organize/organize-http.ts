// apps/web/src/lib/server/organize/organize-http.ts
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { MAX_ORGANIZE_PROJECTS, OrganizeError, OrganizeSnapshotError } from './organize-service';
const uuid = z.string().uuid();
export const organizeRequest = z
	.object({
		moves: z
			.array(
				z
					.object({
						kind: z.enum(['document', 'task']),
						id: uuid,
						project_id: uuid,
						destination_project_id: uuid,
						parent_id: uuid.nullable(),
						position: z.number().int().min(0).max(10000)
					})
					.strict()
			)
			.min(1)
			.max(200)
			// Checked before any project is read (SQL enforces the same cap under lock).
			.refine(
				(moves) =>
					new Set(moves.flatMap((m) => [m.project_id, m.destination_project_id])).size <=
					MAX_ORGANIZE_PROJECTS,
				`A batch can touch at most ${MAX_ORGANIZE_PROJECTS} projects.`
			),
		project_versions: z.record(uuid, z.string().min(1).max(64))
	})
	.strict();
export const organizeApplyRequest = organizeRequest.extend({
	confirmation_token: z.string().regex(/^[a-f0-9]{32}$/),
	batch_id: uuid
});
export const organizeUndoRequest = z
	.object({
		source_batch_id: uuid,
		batch_id: uuid.optional(),
		confirmation_token: z
			.string()
			.regex(/^[a-f0-9]{32}$/)
			.optional()
	})
	.strict()
	.refine(
		(body) => !body.confirmation_token || !!body.batch_id,
		'Applying an undo requires a batch ID.'
	);
export function organizeFailure(error: unknown) {
	if (error instanceof OrganizeError || error instanceof OrganizeSnapshotError)
		return ApiResponse.error(error.message, error.status);
	return ApiResponse.internalError(error, 'Could not complete Organize.');
}
