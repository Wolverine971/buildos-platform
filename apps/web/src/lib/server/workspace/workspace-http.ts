// apps/web/src/lib/server/workspace/workspace-http.ts
// Request shapes for /api/workspace/*.
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { CAPTURE_TEXT_MAX } from '$lib/components/workspace/workspace-model';
import { GRADUATE_MAX_ITEMS, errorStatus } from './workspace.service';

const uuid = z.string().uuid();

export const itemRefSchema = z.object({ entity: z.enum(['document', 'task']), id: uuid }).strict();

export const captureRequest = z
	.object({
		kind: z.enum(['note', 'task']),
		text: z.string().min(1).max(CAPTURE_TEXT_MAX),
		source: z.string().max(40).optional(),
		idempotency_key: z.string().min(8).max(120).optional()
	})
	.strict();

export const graduateRequest = z
	.object({
		name: z.string().min(1).max(120),
		description: z.string().max(600).nullish(),
		items: z.array(itemRefSchema).min(1).max(GRADUATE_MAX_ITEMS),
		suggestion_id: uuid.nullish()
	})
	.strict();

export const graduateUndoRequest = z.object({ project_id: uuid, batch_id: uuid }).strict();

export const suggestionActionRequest = z.object({ action: z.enum(['accept', 'dismiss']) }).strict();

export function workspaceFailure(error: unknown) {
	const { status, message } = errorStatus(error);
	return ApiResponse.error(message, status);
}
