// apps/web/src/lib/services/agentic-chat-v2/email-surface-mount.server.ts
//
// A8 (2026-09-04): the Gmail read group is the one part of the launch surface
// that depends on the user rather than on the chat context. It used to be
// mounted by a regex over the message ("check my inbox"), which both missed
// real requests and mounted ~3.3 KB of schema for users with no mailbox at
// all. It is now mounted when — and only when — the user has a connected,
// readable Gmail account.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatToolDefinition, Database } from '@buildos/shared-types';
import {
	GATEWAY_EMAIL_SURFACE_TOOL_NAMES,
	materializeGatewayTools
} from '@buildos/agentic-chat-runtime/catalog';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AgenticChat:EmailSurfaceMount');

const GMAIL_PROVIDER = 'google_gmail';

/**
 * Prewarm and admission run in separate serverless functions, so this memo
 * cannot make them agree — it only stops a warm function from re-querying on
 * every turn. Keep the window short: a disagreement across the two functions
 * costs a prepared-prompt miss (the tool lists differ, so the harness sha
 * differs), never a wrong surface. There is no invalidation hook on the Gmail
 * connect/disconnect routes; a connection change is visible to chat within
 * this TTL, and prepared prompts themselves live only 90s.
 */
export const EMAIL_CONNECTION_MEMO_TTL_MS = 30_000;

const memo = new Map<string, { value: boolean; expiresAtMs: number }>();

export function resetEmailConnectionMemo(): void {
	memo.clear();
}

/**
 * True when the user has at least one Gmail connection that the read stack
 * would accept (`GmailAccountReadPort.requireOwnedReadableConnections`:
 * undeleted, status active, read enabled).
 */
export async function hasActiveEmailConnection(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	nowMs?: number;
}): Promise<boolean> {
	const nowMs = params.nowMs ?? Date.now();
	const cached = memo.get(params.userId);
	if (cached && cached.expiresAtMs > nowMs) return cached.value;

	let value = false;
	try {
		const { data, error } = await params.supabase
			.from('user_email_connections')
			.select('id')
			.eq('user_id', params.userId)
			.eq('provider', GMAIL_PROVIDER)
			.eq('status', 'active')
			.eq('read_enabled', true)
			.is('deleted_at', null)
			.limit(1);
		if (error) throw error;
		value = Array.isArray(data) && data.length > 0;
	} catch (error) {
		// Fail closed: a turn without email tools is a normal turn, while a
		// mounted-but-unusable Gmail group is a trap on an immutable surface.
		logger.warn('Email connection lookup failed; leaving the email group unmounted', {
			error,
			userId: params.userId
		});
		value = false;
	}

	memo.set(params.userId, { value, expiresAtMs: nowMs + EMAIL_CONNECTION_MEMO_TTL_MS });
	return value;
}

/** Appends the Gmail read group to an already-resolved launch surface. */
export function applyEmailSurfaceMount(
	tools: ChatToolDefinition[],
	hasConnection: boolean
): ChatToolDefinition[] {
	if (!hasConnection) return tools;
	return materializeGatewayTools(tools, [...GATEWAY_EMAIL_SURFACE_TOOL_NAMES]).tools;
}
