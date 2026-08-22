// packages/agentic-chat-runtime/src/loop/turn-intent.ts
import type { ChatContextType } from '@buildos/shared-types';

/**
 * Legacy transport compatibility only.
 *
 * Natural-language mutation classification was retired in favor of semantic
 * turn contracts. Keep these shapes temporarily so older stored metadata and
 * frozen worker artifacts can still be read during rollout, but never infer a
 * write commission from message text here.
 */
export const FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY = 'fastchat_pending_turn_intent';

export type FastChatMutationAction =
	| 'create'
	| 'update'
	| 'delete'
	| 'organize'
	| 'link'
	| 'unlink';
export type FastChatMutationEntityKind =
	| 'document'
	| 'task'
	| 'project'
	| 'event'
	| 'goal'
	| 'plan'
	| 'milestone'
	| 'risk'
	| 'unknown';
export type FastChatTurnIntentSource = 'current_message' | 'pending_continuation' | 'none';

export type FastChatMutationOperation = {
	action: FastChatMutationAction;
	entityKind: FastChatMutationEntityKind;
};

export type FastChatTurnIntent = {
	version: 1;
	requiresWrite: boolean;
	action: FastChatMutationAction | null;
	entityKind: FastChatMutationEntityKind;
	operations: FastChatMutationOperation[];
	source: FastChatTurnIntentSource;
	originalRequestText: string | null;
	originatingTurnRunId: string | null;
	clearPending: boolean;
};

export type FastChatPendingTurnIntent = Omit<
	FastChatTurnIntent,
	'source' | 'clearPending' | 'requiresWrite'
> & {
	requiresWrite: true;
	status: 'pending';
	contextType: ChatContextType;
	projectId: string | null;
	updatedAt: string;
	expiresAt: string;
	lastFinishedReason?: string | null;
};

/**
 * The semantic disposition gate now owns read/write/clarification decisions.
 * This compatibility snapshot is intentionally empty and does not retain any
 * portion of the user's message.
 */
export function resolveFastChatTurnIntent(_params: {
	contextType: ChatContextType;
	projectId?: string | null;
	latestUserMessage?: string | null;
	pendingIntent?: FastChatPendingTurnIntent | null;
}): FastChatTurnIntent {
	return emptyIntent();
}

/** Read legacy pending-intent metadata so callers can observe and clear it. */
export function readFastChatPendingTurnIntent(
	value: unknown,
	options: { now?: Date } = {}
): FastChatPendingTurnIntent | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.version !== 1 || record.requiresWrite !== true || record.status !== 'pending') {
		return null;
	}
	const action = readAction(record.action);
	const entityKind = readEntityKind(record.entityKind);
	const contextType = typeof record.contextType === 'string' ? record.contextType : null;
	const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : null;
	if (!action || !contextType || !expiresAt) return null;
	const expiresAtMs = Date.parse(expiresAt);
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= (options.now ?? new Date()).getTime()) {
		return null;
	}

	return {
		version: 1,
		requiresWrite: true,
		action,
		entityKind,
		operations: readOperations(record.operations, action, entityKind),
		status: 'pending',
		contextType: contextType as ChatContextType,
		projectId: readNullableString(record.projectId),
		originalRequestText: readNullableString(record.originalRequestText),
		originatingTurnRunId: readNullableString(record.originatingTurnRunId),
		updatedAt: readNullableString(record.updatedAt) ?? new Date(0).toISOString(),
		expiresAt,
		lastFinishedReason: readNullableString(record.lastFinishedReason)
	};
}

/** New turns never create lexical pending-intent state. */
export function buildFastChatPendingTurnIntent(_params: {
	intent: FastChatTurnIntent;
	contextType: ChatContextType;
	projectId?: string | null;
	turnRunId?: string | null;
	finishedReason?: string | null;
	now?: Date;
}): FastChatPendingTurnIntent | null {
	return null;
}

/** Legacy structured snapshots may still need tool-name projection while draining. */
export function getWriteToolNamesForTurnIntent(intent: FastChatTurnIntent): string[] {
	if (!intent.requiresWrite || !intent.action) return [];
	return unique(
		(intent.operations.length > 0
			? intent.operations
			: [{ action: intent.action, entityKind: intent.entityKind }]
		).flatMap(getWriteToolNamesForOperation)
	);
}

export function getAutonomousWriteToolNamesForTurnIntent(intent: FastChatTurnIntent): string[] {
	if (!intent.requiresWrite) return [];
	return unique(
		intent.operations
			.filter((operation) => operation.action !== 'delete' && operation.action !== 'unlink')
			.flatMap(getWriteToolNamesForOperation)
	);
}

/** Lexical intent no longer changes domain sensing. */
export function shouldBypassDomainSensingForTurnIntent(_intent: FastChatTurnIntent): boolean {
	return false;
}

/** Lexical pending-intent prompts are retired; pending semantic contracts replace them. */
export function buildPendingTurnIntentSystemMessage(_intent: FastChatTurnIntent): null {
	return null;
}

function getWriteToolNamesForOperation(operation: FastChatMutationOperation): string[] {
	if (operation.action === 'link') return ['link_onto_entities'];
	if (operation.action === 'unlink') return ['unlink_onto_edge'];
	if (operation.entityKind === 'document') {
		if (operation.action === 'create') return ['create_onto_document'];
		if (operation.action === 'organize') return ['move_document_in_tree'];
		if (operation.action === 'delete') return ['delete_onto_document'];
		return ['update_onto_document'];
	}
	if (operation.entityKind === 'task') {
		if (operation.action === 'create') return ['create_onto_task'];
		if (operation.action === 'delete') return ['delete_onto_task'];
		return ['update_onto_task'];
	}
	if (operation.entityKind === 'project') {
		if (operation.action === 'create') return ['create_onto_project'];
		if (operation.action === 'delete') return ['delete_onto_project'];
		return ['update_onto_project'];
	}
	if (operation.entityKind === 'event') {
		if (operation.action === 'create') return ['create_calendar_event'];
		if (operation.action === 'delete') return ['delete_calendar_event'];
		return ['update_calendar_event'];
	}
	if (
		operation.entityKind === 'goal' ||
		operation.entityKind === 'plan' ||
		operation.entityKind === 'milestone' ||
		operation.entityKind === 'risk'
	) {
		const prefix =
			operation.action === 'create'
				? 'create'
				: operation.action === 'delete'
					? 'delete'
					: 'update';
		return [`${prefix}_onto_${operation.entityKind}`];
	}
	return [];
}

function emptyIntent(): FastChatTurnIntent {
	return {
		version: 1,
		requiresWrite: false,
		action: null,
		entityKind: 'unknown',
		operations: [],
		source: 'none',
		originalRequestText: null,
		originatingTurnRunId: null,
		clearPending: false
	};
}

function readNullableString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readAction(value: unknown): FastChatMutationAction | null {
	return value === 'create' ||
		value === 'update' ||
		value === 'delete' ||
		value === 'organize' ||
		value === 'link' ||
		value === 'unlink'
		? value
		: null;
}

function readOperations(
	value: unknown,
	fallbackAction: FastChatMutationAction,
	fallbackEntityKind: FastChatMutationEntityKind
): FastChatMutationOperation[] {
	if (Array.isArray(value)) {
		const operations = value.flatMap((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
			const record = item as Record<string, unknown>;
			const action = readAction(record.action);
			const entityKind = readEntityKind(record.entityKind);
			return action ? [{ action, entityKind }] : [];
		});
		if (operations.length > 0) return uniqueOperations(operations);
	}
	return [{ action: fallbackAction, entityKind: fallbackEntityKind }];
}

function readEntityKind(value: unknown): FastChatMutationEntityKind {
	return value === 'document' ||
		value === 'task' ||
		value === 'project' ||
		value === 'event' ||
		value === 'goal' ||
		value === 'plan' ||
		value === 'milestone' ||
		value === 'risk' ||
		value === 'unknown'
		? value
		: 'unknown';
}

function uniqueOperations(operations: FastChatMutationOperation[]): FastChatMutationOperation[] {
	const seen = new Set<string>();
	return operations.filter((operation) => {
		const key = `${operation.action}:${operation.entityKind}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function unique(items: string[]): string[] {
	return Array.from(new Set(items));
}
