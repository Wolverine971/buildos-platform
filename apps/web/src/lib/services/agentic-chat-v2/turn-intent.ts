// apps/web/src/lib/services/agentic-chat-v2/turn-intent.ts
import type { ChatContextType } from '@buildos/shared-types';

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

const CREATE_VERB = /\b(?:create|make|write|draft|build|generate|produce|add|schedule)\b/i;
const UPDATE_VERB =
	/\b(?:set|update|edit|revise|append|capture|save|change|rename|mark|complete|archive|unarchive|reopen|close|reschedule|assign|unassign|postpone|defer|push|merge|split|label|tag|prioritize|deprioritize)\b/i;
const ORGANIZE_VERB = /\b(?:organize|reorganize|move|place|file|sort)\b/i;
const DELETE_VERB = /\b(?:delete|remove)\b/i;
const CANCEL_VERB = /\bcancel\b/i;
const LINK_VERB = /\blink\b/i;
const UNLINK_VERB = /\bunlink\b/i;
const ANY_MUTATION_VERB =
	/(?:create|make|write|draft|build|generate|produce|add|schedule|link|set|update|edit|revise|append|capture|save|change|rename|mark|complete|unarchive|reopen|close|reschedule|assign|unassign|postpone|defer|push|merge|split|label|tag|prioritize|deprioritize|organize|reorganize|move|place|file|sort|delete|remove|archive|cancel|unlink)/i;

const PROJECT_CREATE_TARGET_PATTERN =
	/\b(?:create|make|build|add|generate|produce)\s+(?:(?:a|an|the|new|another)\s+)?projects?\b/i;
const PROJECT_REPORT_PATTERN =
	/\b(?:project\s+)?(?:status\s+|progress\s+)?update\b|\b(?:write|draft|make|generate|produce)\s+(?:an?\s+|the\s+)?(?:status\s+|progress\s+)?update\s+(?:on|about|for)\s+(?:the\s+)?project\b/i;
const PROPERTY_REMOVAL_TARGET_PATTERN =
	/^(?:\s*(?:the\s+)?)?(?:(?:labels?|tags?|priority|name|title|status|state|description|content)\b|(?:documents?|docs?|tasks?|todos?|to-dos?|projects?|initiatives?|events?|meetings?|goals?|plans?|milestones?|risks?)(?:'s)?\s+(?:labels?|tags?|priority|name|title|status|state|description|content)\b)/i;
const RELATIONSHIP_REMOVAL_PATTERN =
	/\b(?:links?|relationships?|connections?|edges?)\b|\bfrom\s+(?:the\s+)?(?:projects?|plans?|goals?|tasks?|documents?|docs?|folders?|trees?|milestones?)\b/i;

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
		(CONTINUATION_PATTERN.test(text) ||
			(CREATE_VERB.test(text) && MUTATION_PRONOUN.test(text) && !hasConcreteEntityNoun(text)))
	) {
		return {
			version: 1,
			requiresWrite: true,
			action: pendingIntent.action,
			entityKind: pendingIntent.entityKind,
			operations: pendingIntent.operations,
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
			operations: explicit.operations,
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
	const operations = readOperations(record.operations, action, entityKind);
	const expiresAtMs = Date.parse(expiresAt);
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= (options.now ?? new Date()).getTime()) {
		return null;
	}

	return {
		version: 1,
		requiresWrite: true,
		action,
		entityKind,
		operations,
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
		operations: params.intent.operations,
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
	return unique(
		(intent.operations.length > 0
			? intent.operations
			: [{ action: intent.action, entityKind: intent.entityKind }]
		).flatMap(getWriteToolNamesForOperation)
	);
}

export function getAutonomousWriteToolNamesForTurnIntent(intent: FastChatTurnIntent): string[] {
	if (!intent.requiresWrite) return [];
	const safeOperations = intent.operations.filter(
		(operation) => operation.action !== 'delete' && operation.action !== 'unlink'
	);
	return unique(safeOperations.flatMap(getWriteToolNamesForOperation));
}

export function shouldBypassDomainSensingForTurnIntent(intent: FastChatTurnIntent): boolean {
	if (!intent.requiresWrite || intent.operations.length === 0) return false;
	return intent.operations.every(
		(operation) =>
			operation.action !== 'create' ||
			(operation.entityKind !== 'document' && operation.entityKind !== 'plan')
	);
}

export function looksLikeFastChatMutationRequest(text: string): boolean {
	return classifyExplicitMutation(normalizeText(text)) !== null;
}

export function buildPendingTurnIntentSystemMessage(intent: FastChatTurnIntent): string | null {
	if (intent.source !== 'pending_continuation' || !intent.requiresWrite) return null;
	const operationSummary = intent.operations
		.map((operation) => `${operation.action} ${operation.entityKind}`)
		.join(', ');
	return [
		'Pending mutation continuation (server-owned state):',
		`The previous turn did not fulfill this ${operationSummary || `${intent.action ?? 'write'} ${intent.entityKind}`} request: ${intent.originalRequestText ?? 'the prior user request'}`,
		'Continue that operation now. Reuse valid context already in history, avoid repeating completed reads, and do not ask for permission again.'
	].join('\n');
}

function classifyExplicitMutation(text: string): {
	action: FastChatMutationAction;
	entityKind: FastChatMutationEntityKind;
	operations: FastChatMutationOperation[];
} | null {
	if (!text || READ_ONLY_STATUS_PATTERNS.some((pattern) => pattern.test(text))) return null;

	const operations: FastChatMutationOperation[] = [];
	for (const clause of splitMutationClauses(text)) {
		const command = findMutationCommand(clause);
		if (!command) continue;
		const targetText = clause.slice(command.verbIndex + command.verb.length);
		if (
			DELETE_VERB.test(command.verb) &&
			RELATIONSHIP_REMOVAL_PATTERN.test(targetText) &&
			!isPropertyRemovalTarget(targetText)
		) {
			operations.push({ action: 'unlink', entityKind: 'unknown' });
			continue;
		}
		const entityKinds = collectTargetEntityKinds(targetText);
		const targets =
			entityKinds.length > 0
				? entityKinds
				: MUTATION_PRONOUN.test(targetText) || OTHER_MUTATION_NOUN.test(targetText)
					? (['unknown'] as const)
					: [];
		for (const entityKind of targets) {
			const action = resolveActionForVerb(command.verb, entityKind, targetText);
			if (!action) continue;
			if (
				entityKind === 'project' &&
				action === 'create' &&
				(!PROJECT_CREATE_TARGET_PATTERN.test(clause) || PROJECT_REPORT_PATTERN.test(clause))
			) {
				continue;
			}
			operations.push({ action, entityKind });
		}
	}

	const dedupedOperations = uniqueOperations(operations);
	const primary = dedupedOperations[0];
	if (!primary) return null;
	return {
		action: primary.action,
		entityKind: primary.entityKind,
		operations: dedupedOperations
	};
}

function splitMutationClauses(text: string): string[] {
	const verb = ANY_MUTATION_VERB.source;
	return text
		.split(
			new RegExp(
				`[.!?]\\s+|;\\s*|,\\s*(?:and\\s+)?then\\s+|\\bthen\\s+(?=(?:please\\s+)?${verb}\\b)|\\band\\s+(?=(?:please\\s+)?${verb}\\b)`,
				'i'
			)
		)
		.map((clause) => clause.trim())
		.filter(Boolean);
}

function findMutationCommand(clause: string): { verb: string; verbIndex: number } | null {
	const verb = ANY_MUTATION_VERB.source;
	const patterns = [
		new RegExp(`^(?:please\\s+)?(${verb})\\b`, 'i'),
		new RegExp(`^(?:okay|ok|sure)[,\\s]+(?:please\\s+)?(${verb})\\b`, 'i'),
		new RegExp(`\\b(?:can|could|would|will)\\s+you(?:\\s+please)?\\s+(${verb})\\b`, 'i'),
		new RegExp(`\\b(?:i need you to|i want you to|i want to)\\s+(${verb})\\b`, 'i'),
		new RegExp(`\\bplease\\s+(${verb})\\b`, 'i')
	];
	let best: { verb: string; verbIndex: number } | null = null;
	for (const pattern of patterns) {
		const match = pattern.exec(clause);
		const matchedVerb = match?.[1];
		if (!match || !matchedVerb) continue;
		const relativeVerbIndex = match[0].toLowerCase().lastIndexOf(matchedVerb.toLowerCase());
		const candidate = {
			verb: matchedVerb,
			verbIndex: match.index + Math.max(0, relativeVerbIndex)
		};
		if (!best || candidate.verbIndex < best.verbIndex) best = candidate;
	}
	return best;
}

function collectTargetEntityKinds(text: string): FastChatMutationEntityKind[] {
	const candidates: Array<{
		kind: Exclude<FastChatMutationEntityKind, 'unknown'>;
		pattern: RegExp;
	}> = [
		{ kind: 'document', pattern: DOCUMENT_NOUN },
		{ kind: 'task', pattern: TASK_NOUN },
		{ kind: 'event', pattern: EVENT_NOUN },
		{ kind: 'goal', pattern: GOAL_NOUN },
		{ kind: 'plan', pattern: PLAN_NOUN },
		{ kind: 'milestone', pattern: MILESTONE_NOUN },
		{ kind: 'risk', pattern: RISK_NOUN },
		{ kind: 'project', pattern: PROJECT_NOUN }
	];
	const matches = candidates
		.map(({ kind, pattern }) => ({ kind, index: text.search(pattern) }))
		.filter((match) => match.index >= 0)
		.sort((left, right) => left.index - right.index);
	const specificMatches = matches.filter((match) => match.kind !== 'project');
	return (specificMatches.length > 0 ? specificMatches : matches).map((match) => match.kind);
}

function hasConcreteEntityNoun(text: string): boolean {
	return collectTargetEntityKinds(text).length > 0;
}

function resolveActionForVerb(
	verb: string,
	entityKind: FastChatMutationEntityKind,
	targetText: string
): FastChatMutationAction | null {
	if (UNLINK_VERB.test(verb)) return 'unlink';
	if (LINK_VERB.test(verb)) return 'link';
	if (DELETE_VERB.test(verb)) {
		return isPropertyRemovalTarget(targetText) ? 'update' : 'delete';
	}
	if (CANCEL_VERB.test(verb)) return entityKind === 'event' ? 'delete' : 'update';
	if (ORGANIZE_VERB.test(verb)) return 'organize';
	if (CREATE_VERB.test(verb)) return 'create';
	if (UPDATE_VERB.test(verb)) return 'update';
	return null;
}

function isPropertyRemovalTarget(targetText: string): boolean {
	const normalized = targetText.trim().replace(/^(?:the|a|an)\s+/i, '');
	if (
		/^(?:labels?|tags?|priority|name|title|status|state|description|content)\s+(?:documents?|docs?|tasks?|todos?|to-dos?|projects?|initiatives?|events?|meetings?|goals?|plans?|milestones?|risks?)\b/i.test(
			normalized
		)
	) {
		return false;
	}
	return PROPERTY_REMOVAL_TARGET_PATTERN.test(targetText);
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

function emptyIntent(options: { clearPending?: boolean } = {}): FastChatTurnIntent {
	return {
		version: 1,
		requiresWrite: false,
		action: null,
		entityKind: 'unknown',
		operations: [],
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
