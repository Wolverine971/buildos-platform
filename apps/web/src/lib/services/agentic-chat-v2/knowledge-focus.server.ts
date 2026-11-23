// apps/web/src/lib/services/agentic-chat-v2/knowledge-focus.server.ts
//
// A chat turn about one knowledge entry (a person, an organization…): load everything BuildOS
// holds on it and hand it to the worker as one prompt section of the turn artifact.
//
// The entry id is a structured field of the request (the user picked the entry on its card or
// in the chat's picker). It is read with the user's own client, so an entry they cannot see
// loads nothing and the turn runs as a plain Workspace chat.

import type { JsonObject } from '@buildos/shared-types';
import {
	KnowledgeStore,
	buildKnowledgeFocusSection,
	buildKnowledgeSelectionSection,
	knowledgeFocusRef,
	knowledgeSelectionRefs,
	loadKnowledgeFocusBrief,
	loadKnowledgeSelection,
	type KnowledgeDataClient,
	type KnowledgeFocusRef,
	type KnowledgeSelectionRef
} from '@buildos/shared-agent-ops/knowledge';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AgenticChatKnowledgeFocus');

export type KnowledgeFocusForTurn = {
	/** Appended to the artifact's prompt sections; the worker places it after the message. */
	section: JsonObject;
	/** Kept on a new session so the chat reopens about the same entry. */
	ref: KnowledgeFocusRef;
};

/**
 * The focus brief for this turn, rebuilt every turn so it reflects what the last turn saved.
 * Never throws: a brief that cannot be loaded leaves the turn a plain chat.
 */
export async function loadKnowledgeFocusForTurn(input: {
	userClient: unknown;
	userId: string;
	entityId: string | null | undefined;
}): Promise<KnowledgeFocusForTurn | null> {
	if (!input.entityId) return null;
	try {
		const db = input.userClient as KnowledgeDataClient;
		const brief = await loadKnowledgeFocusBrief(
			new KnowledgeStore(db, input.userId),
			db,
			input.userId,
			input.entityId,
			// The user's own client: RLS limits the text search to records they can open.
			{ textSearch: true }
		);
		if (!brief) return null;
		return {
			section: JSON.parse(JSON.stringify(buildKnowledgeFocusSection(brief))) as JsonObject,
			ref: knowledgeFocusRef(brief)
		};
	} catch (error) {
		logger.warn('Knowledge focus brief failed to load', { error, entityId: input.entityId });
		return null;
	}
}

export type KnowledgeSelectionForTurn = {
	/** Appended to the artifact's prompt sections; the worker places it after the message. */
	section: JsonObject;
	/** Stored on the user's message, so the bubble shows what it was sent about. */
	refs: KnowledgeSelectionRef[];
};

/**
 * Guided search: the entries the user ticked in the Entities tray before sending this message.
 * Only ids arrive from the browser; each entry is read with the user's own client, so one they
 * cannot see is dropped. Never throws: a selection that cannot be loaded leaves a plain turn.
 */
export async function loadKnowledgeSelectionForTurn(input: {
	userClient: unknown;
	userId: string;
	entityIds: readonly string[] | null | undefined;
}): Promise<KnowledgeSelectionForTurn | null> {
	if (!input.entityIds?.length) return null;
	try {
		const db = input.userClient as KnowledgeDataClient;
		const entries = await loadKnowledgeSelection(
			new KnowledgeStore(db, input.userId),
			input.entityIds
		);
		if (!entries.length) return null;
		return {
			section: JSON.parse(
				JSON.stringify(buildKnowledgeSelectionSection(entries))
			) as JsonObject,
			refs: knowledgeSelectionRefs(entries)
		};
	} catch (error) {
		logger.warn('Knowledge selection failed to load', {
			error,
			count: input.entityIds.length
		});
		return null;
	}
}
