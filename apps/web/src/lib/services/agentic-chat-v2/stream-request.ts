// apps/web/src/lib/services/agentic-chat-v2/stream-request.ts
/**
 * Boundary validation for POST /api/agent/v2/stream request bodies.
 *
 * Deliberately forward-compatible: every field is optional and unknown
 * top-level keys pass through. Project identifiers are the exception: they
 * cross an authorization boundary, so project focus is validated strictly and
 * database entity identifiers must be UUIDs. `prewarmedContext` remains in the
 * schema as a legacy compatibility field, but the stream route does not trust
 * unsigned client-carried prompt context.
 */
import { z } from 'zod';
import type { FastAgentStreamRequestInput } from './types';
import { isProjectScopedContext, normalizeAgenticChatContextType } from './scope';

const looseRecord = z.record(z.unknown());
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

function requiresUuidEntityId(contextType: unknown): boolean {
	const normalized = normalizeAgenticChatContextType(
		typeof contextType === 'string' ? contextType : undefined
	);
	return (
		isProjectScopedContext(normalized) ||
		normalized === 'ontology' ||
		normalized === 'daily_brief'
	);
}

const fastAgentStreamRequestBodySchema = z
	.object({
		message: z.string().optional(),
		session_id: z.string().optional(),
		context_type: z.string().optional(),
		entity_id: z.string().optional(),
		attachments: z.array(looseRecord).optional(),
		projectFocus: agenticChatProjectFocusSchema.nullish(),
		lastTurnContext: looseRecord.nullish(),
		stream_run_id: z.union([z.string(), z.number()]).optional(),
		client_turn_id: z.string().optional(),
		voiceNoteGroupId: z.string().nullish(),
		prewarmedContext: looseRecord.nullish(),
		preparedPromptKey: z.string().nullish(),
		// Deprecated snake_case wire aliases — resolved by
		// normalizeFastAgentStreamRequest, never read past the boundary.
		last_turn_context: looseRecord.nullish(),
		voice_note_group_id: z.string().nullish(),
		prewarmed_context: looseRecord.nullish(),
		prepared_prompt_key: z.string().nullish()
	})
	.passthrough()
	.superRefine((value, context) => {
		const entityId = value.entity_id?.trim();
		if (
			entityId &&
			requiresUuidEntityId(value.context_type) &&
			!uuidString.safeParse(entityId).success
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['entity_id'],
				message: 'Project and focus entity identifiers must be UUIDs'
			});
		}
	});

export type ParseFastAgentStreamRequestBodyResult =
	| { ok: true; input: FastAgentStreamRequestInput }
	| { ok: false; issues: string[] };

export function parseFastAgentStreamRequestBody(
	raw: unknown
): ParseFastAgentStreamRequestBodyResult {
	const result = fastAgentStreamRequestBodySchema.safeParse(raw);
	if (!result.success) {
		return {
			ok: false,
			issues: result.error.issues
				.slice(0, 5)
				.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
		};
	}
	return { ok: true, input: result.data as FastAgentStreamRequestInput };
}
