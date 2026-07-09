// apps/web/src/lib/services/agentic-chat-v2/turn-intent.ts
import type { ChatContextType } from '@buildos/shared-types';

export const FASTCHAT_PENDING_TURN_INTENT_METADATA_KEY = 'fastchat_pending_turn_intent';

export type FastChatMutationAction = 'create' | 'update' | 'delete' | 'organize';
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

export type FastChatTurnIntent = {
	version: 1;
	requiresWrite: boolean;
	action: FastChatMutationAction | null;
	entityKind: FastChatMutationEntityKind;
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

const PENDING_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REQUEST_TEXT_CHARS = 1200;

const ABANDON_PATTERN =
	/^(?:okay[,.]?\s*)?(?:please\s+)?(?:(?:never\s*mind|nevermind)(?:,\s*(?:drop it|cancel that))?|forget it|cancel that|drop it|stop(?: that| this| now)?)\s*[.!]?$/i;
const CONTINUATION_PATTERN =
	/^(?:okay|ok|yes|yep|yeah|sure|please)?[\s,.]*(?:keep going|continue|go ahead|do it|finish(?: it| that)?|make (?:it|that|the thing|the document)|write it|create it|apply it|try again)\b/i;
const READ_ONLY_STATUS_PATTERNS = [
	/^(?:please\s+)?update\s+(?:me|us)\s+(?:on|about)\b/i,
	/^(?:please\s+)?catch\s+(?:me|us)\s+up\s+(?:on|about)\b/i,
	/^(?:please\s+)?(?:give|send)\s+(?:me|us)\s+(?:an?\s+)?(?:update|status|summary)\s+(?:on|about)\b/i,
	/^(?:what(?:'s| is)|where\s+(?:are\s+we|am\s+i))\b.*\b(?:status|progress|standing|at|on)\b/i,
	/^(?:is|are|was|were)\b.*\b(?:still|currently)\b/i
];

const CREATE_VERB = /\b(?:create|make|write|draft|build|generate|produce|add|schedule|link)\b/i;
const UPDATE_VERB =
	/\b(?:set|update|edit|revise|append|capture|save|change|rename|mark|complete|unarchive|reopen|close|reschedule|assign|unassign|postpone|defer|push|merge|split|label|tag|prioritize|deprioritize)\b/i;
const ORGANIZE_VERB = /\b(?:organize|reorganize|move|place|file|sort)\b/i;
const DELETE_VERB = /\b(?:delete|remove|archive|cancel|unlink)\b/i;
const ANY_MUTATION_VERB =
	/(?:create|make|write|draft|build|generate|produce|add|schedule|link|set|update|edit|revise|append|capture|save|change|rename|mark|complete|unarchive|reopen|close|reschedule|assign|unassign|postpone|defer|push|merge|split|label|tag|prioritize|deprioritize|organize|reorganize|move|place|file|sort|delete|remove|archive|cancel|unlink)/i;

const DOCUMENT_NOUN =
	/\b(?:documents?|docs?|notes?|briefs?|outlines?|summaries?|logs?|chapters?)\b/i;
const TASK_NOUN = /\b(?:tasks?|todos?|to-dos?)\b/i;
const PROJECT_NOUN = /\b(?:projects?|initiatives?)\b/i;
const EVENT_NOUN = /\b(?:events?|meetings?|calendar(?: event)?)\b/i;
const GOAL_NOUN = /\bgoals?\b/i;
const PLAN_NOUN = /\bplans?\b/i;
const MILESTONE_NOUN = /\bmilestones?\b/i;
const RISK_NOUN = /\brisks?\b/i;
const OTHER_MUTATION_NOUN = /\b(?:title|name|status|state|priority|labels?|tags?)\b/i;
const MUTATION_PRONOUN = /\b(?:this|that|it|them|these|those|the thing)\b/i;

export function resolveFastChatTurnIntent(params: {
	contextType: ChatContextType;
	projectId?: string | null;
	latestUserMessage?: string | null;
	pendingIntent?: FastChatPendingTurnIntent | null;
}): FastChatTurnIntent {
	const text = normalizeText(params.latestUserMessage);
	const pendingIntent = isPendingIntentInScope(
		params.pendingIntent,
		params.contextType,
		params.projectId ?? null
	)
		? params.pendingIntent
		: null;

	if (text && ABANDON_PATTERN.test(text) && pendingIntent) {
		return emptyIntent({ clearPending: true });
	}

	if (
		pendingIntent &&
		text &&
		!READ_ONLY_STATUS_PATTERNS.some((pattern) => pattern.test(text)) &&
		(CONTINUATION_PATTERN.test(text) || (CREATE_VERB.test(text) && MUTATION_PRONOUN.test(text)))
	) {
		return {
			version: 1,
			requiresWrite: true,
			action: pendingIntent.action,
			entityKind: pendingIntent.entityKind,
			source: 'pending_continuation',
			originalRequestText: pendingIntent.originalRequestText,
			originatingTurnRunId: pendingIntent.originatingTurnRunId,
			clearPending: false
		};
	}

	const explicit = classifyExplicitMutation(text);
	if (explicit) {
		return {
			version: 1,
			requiresWrite: true,
			action: explicit.action,
			entityKind: explicit.entityKind,
			source: 'current_message',
			originalRequestText: clipRequestText(text),
			originatingTurnRunId: null,
			clearPending: false
		};
	}

	return emptyIntent();
}

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

export function buildFastChatPendingTurnIntent(params: {
	intent: FastChatTurnIntent;
	contextType: ChatContextType;
	projectId?: string | null;
	turnRunId?: string | null;
	finishedReason?: string | null;
	now?: Date;
}): FastChatPendingTurnIntent | null {
	if (!params.intent.requiresWrite || !params.intent.action) return null;
	const now = params.now ?? new Date();
	return {
		version: 1,
		requiresWrite: true,
		action: params.intent.action,
		entityKind: params.intent.entityKind,
		status: 'pending',
		contextType: params.contextType,
		projectId: params.projectId ?? null,
		originalRequestText: params.intent.originalRequestText,
		originatingTurnRunId: params.intent.originatingTurnRunId ?? params.turnRunId ?? null,
		updatedAt: now.toISOString(),
		expiresAt: new Date(now.getTime() + PENDING_INTENT_TTL_MS).toISOString(),
		lastFinishedReason: params.finishedReason ?? null
	};
}

export function getWriteToolNamesForTurnIntent(intent: FastChatTurnIntent): string[] {
	if (!intent.requiresWrite || !intent.action) return [];
	if (intent.entityKind === 'document') {
		if (intent.action === 'create') return ['create_onto_document'];
		if (intent.action === 'organize') return ['move_document_in_tree'];
		if (intent.action === 'delete') return ['delete_onto_document'];
		return ['update_onto_document'];
	}
	if (intent.entityKind === 'task') {
		if (intent.action === 'create') return ['create_onto_task'];
		if (intent.action === 'delete') return ['delete_onto_task'];
		return ['update_onto_task'];
	}
	if (intent.entityKind === 'project') {
		if (intent.action === 'create') return ['create_onto_project'];
		if (intent.action === 'delete') return ['delete_onto_project'];
		return ['update_onto_project'];
	}
	if (intent.entityKind === 'event') {
		if (intent.action === 'create') return ['create_calendar_event'];
		if (intent.action === 'delete') return ['delete_calendar_event'];
		return ['update_calendar_event'];
	}
	if (
		intent.entityKind === 'goal' ||
		intent.entityKind === 'plan' ||
		intent.entityKind === 'milestone' ||
		intent.entityKind === 'risk'
	) {
		const prefix =
			intent.action === 'create'
				? 'create'
				: intent.action === 'delete'
					? 'delete'
					: 'update';
		return [`${prefix}_onto_${intent.entityKind}`];
	}
	return [];
}

export function looksLikeFastChatMutationRequest(text: string): boolean {
	return classifyExplicitMutation(normalizeText(text)) !== null;
}

export function buildPendingTurnIntentSystemMessage(intent: FastChatTurnIntent): string | null {
	if (intent.source !== 'pending_continuation' || !intent.requiresWrite) return null;
	return [
		'Pending mutation continuation (server-owned state):',
		`The previous turn did not fulfill this ${intent.action ?? 'write'} ${intent.entityKind} request: ${intent.originalRequestText ?? 'the prior user request'}`,
		'Continue that operation now. Reuse valid context already in history, avoid repeating completed reads, and do not ask for permission again.'
	].join('\n');
}

function classifyExplicitMutation(
	text: string
): { action: FastChatMutationAction; entityKind: FastChatMutationEntityKind } | null {
	if (!text || READ_ONLY_STATUS_PATTERNS.some((pattern) => pattern.test(text))) return null;
	const commandish =
		new RegExp(`^(?:please\\s+)?${ANY_MUTATION_VERB.source}\\b`, 'i').test(text) ||
		new RegExp(
			`\\b(?:can you|could you|please|i need you to|i want you to|i want to)\\s+${ANY_MUTATION_VERB.source}\\b`,
			'i'
		).test(text) ||
		new RegExp(`(?:^|[.!?]\\s+|\\b(?:and|then)\\s+)${ANY_MUTATION_VERB.source}\\b`, 'i').test(
			text
		);
	if (!commandish) return null;
	const action = DELETE_VERB.test(text)
		? 'delete'
		: ORGANIZE_VERB.test(text)
			? 'organize'
			: CREATE_VERB.test(text)
				? 'create'
				: UPDATE_VERB.test(text)
					? 'update'
					: null;
	if (!action) return null;
	const entityKind = DOCUMENT_NOUN.test(text)
		? 'document'
		: TASK_NOUN.test(text)
			? 'task'
			: PROJECT_NOUN.test(text)
				? 'project'
				: EVENT_NOUN.test(text)
					? 'event'
					: GOAL_NOUN.test(text)
						? 'goal'
						: PLAN_NOUN.test(text)
							? 'plan'
							: MILESTONE_NOUN.test(text)
								? 'milestone'
								: RISK_NOUN.test(text)
									? 'risk'
									: 'unknown';
	if (
		entityKind === 'unknown' &&
		!MUTATION_PRONOUN.test(text) &&
		!OTHER_MUTATION_NOUN.test(text)
	) {
		return null;
	}
	return { action, entityKind };
}

function emptyIntent(options: { clearPending?: boolean } = {}): FastChatTurnIntent {
	return {
		version: 1,
		requiresWrite: false,
		action: null,
		entityKind: 'unknown',
		source: 'none',
		originalRequestText: null,
		originatingTurnRunId: null,
		clearPending: options.clearPending === true
	};
}

function isPendingIntentInScope(
	intent: FastChatPendingTurnIntent | null | undefined,
	contextType: ChatContextType,
	projectId: string | null
): intent is FastChatPendingTurnIntent {
	return Boolean(
		intent &&
			intent.status === 'pending' &&
			intent.contextType === contextType &&
			intent.projectId === projectId
	);
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

function clipRequestText(value: string): string {
	return value.slice(0, MAX_REQUEST_TEXT_CHARS);
}

function readNullableString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readAction(value: unknown): FastChatMutationAction | null {
	return value === 'create' || value === 'update' || value === 'delete' || value === 'organize'
		? value
		: null;
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
