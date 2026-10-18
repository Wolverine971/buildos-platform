// apps/web/src/lib/server/chat-pending-change.ts
//
// Server side of the "didn't finish from earlier" strip: read the session's
// pending commission the way admission does (same parse, same scope rule, so
// the strip shows exactly when the next turn would be told about it), and name
// its targets with the caller's user-scoped client.
import {
	FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY,
	isPendingTurnContractInScope,
	readFastChatPendingTurnContract,
	type FastChatPendingTurnContract
} from '@buildos/agentic-chat-runtime/loop';
import type { ProjectFocus } from '@buildos/shared-types';
import {
	normalizeProjectFocus,
	resolveEffectiveProjectId
} from '$lib/services/agentic-chat-v2/scope';
import {
	buildPendingChangeView,
	pendingChangeLookupIds,
	type PendingChangeViewV1
} from '$lib/services/agentic-chat-v2/pending-change';
import { entityLookupKey, fetchEntityLookups } from './chat-entity-lookups';

export type PendingChangeSessionRow = {
	context_type: string | null;
	entity_id: string | null;
	agent_metadata: unknown;
};

function metadataOf(session: PendingChangeSessionRow): Record<string, unknown> {
	const value = session.agent_metadata;
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** The session's pending commission, only when the next turn would carry it. */
export function readInScopePendingTurnContract(
	session: PendingChangeSessionRow
): FastChatPendingTurnContract | null {
	const metadata = metadataOf(session);
	const pending = readFastChatPendingTurnContract(
		metadata[FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY]
	);
	if (!pending) return null;
	// Sessions keep the context type their turns run under (verified in
	// production), so the session's own type is the next turn's type.
	const contextType = session.context_type ?? 'global';
	const projectId = resolveEffectiveProjectId({
		contextType,
		entityId: session.entity_id,
		projectFocus: normalizeProjectFocus((metadata.focus as ProjectFocus | null) ?? null)
	});
	return isPendingTurnContractInScope(pending, contextType, projectId ?? null) ? pending : null;
}

export async function loadPendingChangeView(
	supabase: unknown,
	session: PendingChangeSessionRow
): Promise<PendingChangeViewV1 | null> {
	const pending = readInScopePendingTurnContract(session);
	if (!pending) return null;
	const idsByKind = pendingChangeLookupIds(pending);
	const lookups =
		idsByKind.size > 0 ? await fetchEntityLookups({ supabase, idsByKind }) : new Map();
	return buildPendingChangeView(
		pending,
		(kind, id) => lookups.get(entityLookupKey(kind, id))?.title ?? null
	);
}
