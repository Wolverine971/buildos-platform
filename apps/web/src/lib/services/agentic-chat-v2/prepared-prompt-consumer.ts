// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, ChatToolDefinition, Database } from '@buildos/shared-types';
import type { GatewaySurfaceProfileName } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { resolveCacheAgeSeconds } from './context-cache-routing';
import {
	getPreparedPromptSurface,
	isPreparedPromptPrewarmEnabled,
	isPreparedPromptSurfaceCurrent,
	parsePreparedPromptKey,
	verifyPreparedPromptNonce,
	type PreparedPromptCacheMissReason,
	type PreparedPromptRow,
	type PreparedPromptSurface
} from './prepared-prompt-cache';

type FastChatSupabaseClient = SupabaseClient<Database>;

export type PreparedPromptConsumeResult =
	| {
			hit: true;
			row: PreparedPromptRow;
			surface: PreparedPromptSurface;
			ageSeconds: number;
	  }
	| {
			hit: false;
			reason: PreparedPromptCacheMissReason;
	  };

export async function consumePreparedPrompt(params: {
	supabase: FastChatSupabaseClient;
	key: string | null;
	userId: string;
	sessionId: string;
	cacheKey: string;
	surfaceProfile: GatewaySurfaceProfileName;
	contextType: ChatContextType;
	tools: ChatToolDefinition[];
}): Promise<PreparedPromptConsumeResult> {
	if (!params.key) {
		return { hit: false, reason: 'missing_key' };
	}
	if (!isPreparedPromptPrewarmEnabled()) {
		return { hit: false, reason: 'disabled' };
	}

	const parsed = parsePreparedPromptKey(params.key);
	if (!parsed) {
		return { hit: false, reason: 'bad_format' };
	}

	const { data, error } = await params.supabase
		.from('agentic_chat_prepared_prompts')
		.select('*')
		.eq('id', parsed.id)
		.maybeSingle();
	if (error || !data) {
		return { hit: false, reason: 'not_found' };
	}

	const row = data as PreparedPromptRow;
	if (row.user_id !== params.userId) {
		return { hit: false, reason: 'user_mismatch' };
	}
	if (!verifyPreparedPromptNonce({ nonce: parsed.nonce, nonceSha256: row.nonce_sha256 })) {
		return { hit: false, reason: 'nonce_mismatch' };
	}
	if (row.consumed_at) {
		return { hit: false, reason: 'consumed' };
	}
	if (Date.parse(row.expires_at) <= Date.now()) {
		return { hit: false, reason: 'expired' };
	}
	if (row.session_id && row.session_id !== params.sessionId) {
		return { hit: false, reason: 'session_mismatch' };
	}
	if (row.cache_key !== params.cacheKey) {
		return { hit: false, reason: 'scope_mismatch' };
	}

	const surface = getPreparedPromptSurface(row, params.surfaceProfile);
	if (!surface) {
		return { hit: false, reason: 'surface_missing' };
	}
	if (
		!isPreparedPromptSurfaceCurrent({
			surface,
			contextType: params.contextType,
			contextPayload: row.context_payload,
			conversationSummary: row.conversation_summary ?? null,
			tools: params.tools
		})
	) {
		return { hit: false, reason: 'stale_harness' };
	}

	const consumedAt = new Date().toISOString();
	const { data: updated, error: updateError } = await params.supabase
		.from('agentic_chat_prepared_prompts')
		.update({ consumed_at: consumedAt, updated_at: consumedAt })
		.eq('id', row.id)
		.eq('user_id', params.userId)
		.is('consumed_at', null)
		.select('id')
		.maybeSingle();
	if (updateError) {
		return { hit: false, reason: 'update_failed' };
	}
	if (!updated?.id) {
		return { hit: false, reason: 'consumed' };
	}

	return {
		hit: true,
		row: {
			...row,
			consumed_at: consumedAt
		},
		surface,
		ageSeconds: resolveCacheAgeSeconds(row.created_at)
	};
}
