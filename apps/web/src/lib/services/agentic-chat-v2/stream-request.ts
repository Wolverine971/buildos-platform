// apps/web/src/lib/services/agentic-chat-v2/stream-request.ts
/**
 * Boundary validation for POST /api/agent/v2/stream request bodies.
 *
 * Deliberately permissive: every field is optional, unknown keys pass
 * through, and nested payloads (projectFocus, lastTurnContext,
 * prewarmedContext) are only shape-checked here — their deeper validation
 * already lives in dedicated normalizers (`normalizeFastChatContextCache`,
 * entity-resolution heuristics). The goal is a clear 400 on malformed
 * shapes instead of defensive `typeof` checks scattered downstream.
 */
import { z } from 'zod';
import type { FastAgentStreamRequestInput } from './types';

const looseRecord = z.record(z.unknown());

const fastAgentStreamRequestBodySchema = z
	.object({
		message: z.string().optional(),
		session_id: z.string().optional(),
		context_type: z.string().optional(),
		entity_id: z.string().optional(),
		ontologyEntityType: z.string().optional(),
		attachments: z.array(looseRecord).optional(),
		projectFocus: looseRecord.nullish(),
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
	.passthrough();

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
