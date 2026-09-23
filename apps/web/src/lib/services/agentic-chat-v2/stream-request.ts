// apps/web/src/lib/services/agentic-chat-v2/stream-request.ts
/**
 * Boundary schema for a client-supplied project focus (used by the prewarm
 * route). Project identifiers cross an authorization boundary, so the shape is
 * strict and every database identifier must be a UUID.
 */
import { z } from 'zod';

const uuidString = z
	.string()
	.uuid()
	.transform((value) => value.toLowerCase());

export const agenticChatProjectFocusSchema = z
	.object({
		focusType: z.enum([
			'project-wide',
			'task',
			'goal',
			'plan',
			'document',
			'milestone',
			'risk',
			'requirement'
		]),
		focusEntityId: uuidString.nullable(),
		focusEntityName: z.string().max(1000).nullable(),
		projectId: uuidString,
		projectName: z.string().min(1).max(1000)
	})
	.strict();
