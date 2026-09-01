// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-security-policy.ts
import type { ChatToolCall, ChatToolResult, JsonObject } from '@buildos/shared-types';
import { createHash, createHmac } from 'node:crypto';
import { requiredScopeModeForOp } from '@buildos/shared-agent-ops';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import type { FastChatHistoryMessage } from '../types';
import { isLikelyWriteToolName, resolveToolOperationName } from './tool-classification';
import { isAgenticChatWebEgressToolName } from '@buildos/agentic-chat-runtime/loop';
import { isAgenticChatSharedReadToolNameV1 } from '@buildos/agentic-chat-runtime/tools';

export type InteractiveChatToolSecurityPhase = 'execution' | 'materialization';
export type InteractiveChatToolSecurityReason =
	| 'external_content_review_required'
	| 'web_egress_provenance_required'
	| 'private_content_egress_review_required'
	| 'high_impact_confirmation_required'
	| 'write_review_scope_mismatch'
	| 'write_execution_scope_mismatch'
	| 'write_materialization_contract_required';

export type InteractiveChatToolSecurityDecision =
	| { allowed: true; isWrite: boolean; operationName: string }
	| {
			allowed: false;
			isWrite: boolean;
			operationName: string;
			reason: InteractiveChatToolSecurityReason;
			requiresUserAction: boolean;
	  };

const EXTERNALLY_AUTHORED_CONTENT_TOOLS = new Set([
	'web_search',
	'web_visit',
	'search_email_messages',
	'get_email_message',
	'list_calendar_events',
	'get_calendar_event_details',
	'get_onto_document_details',
	'get_document_outline',
	'read_document_section',
	'call_corsair_mcp_tool'
]);
const COLLABORATIVE_WORKSPACE_CONTENT_TOOLS = new Set([
	'get_project_overview',
	'get_workspace_overview',
	'get_onto_task_details',
	'get_onto_project_details',
	'get_onto_project_graph',
	'explore_project',
	'list_onto_projects',
	'list_onto_tasks',
	'search_all_projects',
	'search_project',
	'search_ontology',
	'list_task_documents',
	'list_onto_comments',
	'get_onto_comment_details'
]);
const PROVIDER_NEUTRAL_OR_CONTROL_TOOLS = new Set([
	'web_search',
	'web_visit',
	'list_email_accounts',
	'tool_search',
	'tool_schema',
	'skill_search',
	'skill_load',
	'domain_search',
	'domain_load',
	'skill_reference_load',
	'get_field_info',
	'declare_turn_contract',
	'cancel_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'approve_turn_contract_review',
	'approve_mutation_batch_review',
	'request_proposal_revision'
]);
const OUTBOUND_EGRESS_TOOLS = new Set(['web_search', 'web_visit', 'search_email_messages']);

const OPAQUE_OR_BULK_WRITE_TOOLS = new Set([
	'call_corsair_mcp_tool',
	'commit_change_set',
	'reorganize_onto_project_graph'
]);

const TRUSTED_WRITE_COMMISSION =
	/^(?:(?:yes|ok(?:ay)?|sure)[,!. ]+)?(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to\s+)?(?:create|add|make|mark|update|edit|change|rename|move|reschedule|schedule|assign|complete|archive|restore|link|unlink|delete|remove|reorganize|save|persist|record|set|tag)\b/i;
const WRITE_OBJECT =
	/\b(?:project|task|todo|goal|plan|milestone|risk|document|doc|page|event|appointment|calendar|relationship|edge|record|note|status|deadline|date|assignee|title|description|workspace|graph|change|update|it|this|that|them|those)\b/i;
const INFORMATION_QUESTION = /^(?:what|which|how|why|when|where|who|is|are|do|does|did|should)\b/i;
const NEGATED_WRITE =
	/\b(?:do\s+not|don'?t|never|avoid|without|shouldn'?t|should\s+not|no\s+need\s+to)\b[\s\S]{0,50}\b(?:create|update|change|delete|remove|write|save|persist|reorganize)\b/i;

const STANDALONE_AFFIRMATIVE_CONFIRMATION =
	/^(?:yes|yep|yeah|confirm(?:ed)?|approve(?:d)?|proceed|go\s+ahead|do\s+it)[,!.\s]*(?:please)?[.!\s]*$/i;
const CONFIRMED_WRITE_ACTION =
	/^(?:(?:yes|yep|yeah|confirm(?:ed)?|approve(?:d)?)[,!.\s]+)?(?:please[,!.\s]+)?(?:proceed|go\s+ahead|do\s+it|apply\s+(?:it|that|those|the\s+changes?)|make\s+(?:it|that|those|the\s+changes?)|delete\s+(?:it|that|those|them))[.!\s]*$/i;
const PRIOR_REVIEW_REQUEST =
	/\b(?:confirm|approval|approve|proceed|go\s+ahead|do\s+you\s+want\s+me|would\s+you\s+like\s+me)\b/i;
const PRIOR_WRITE_LANGUAGE =
	/\b(?:change|write|update|delete|remove|reorganize|move|create|apply|execute|action|save|persist)\w*\b/i;

export function isTrustedUserWriteCommission(message: string | null | undefined): boolean {
	const normalized = typeof message === 'string' ? message.trim().replace(/\s+/g, ' ') : '';
	if (!normalized || NEGATED_WRITE.test(normalized)) return false;
	if (
		INFORMATION_QUESTION.test(normalized) &&
		!/^(?:can|could|would|will)\s+you\b/i.test(normalized)
	) {
		return false;
	}
	return TRUSTED_WRITE_COMMISSION.test(normalized) && WRITE_OBJECT.test(normalized);
}

const WRITE_TOOL_ENTITY_TERMS: ReadonlyArray<{
	needle: string;
	messagePattern: RegExp;
}> = [
	{ needle: 'milestone', messagePattern: /\bmilestones?\b/i },
	{ needle: 'document', messagePattern: /\b(?:documents?|docs?|pages?|notes?)\b/i },
	{ needle: 'project', messagePattern: /\b(?:projects?|workspaces?)\b/i },
	{ needle: 'task', messagePattern: /\b(?:tasks?|todos?)\b/i },
	{ needle: 'goal', messagePattern: /\bgoals?\b/i },
	{ needle: 'plan', messagePattern: /\bplans?\b/i },
	{ needle: 'risk', messagePattern: /\brisks?\b/i },
	{ needle: 'event', messagePattern: /\b(?:events?|appointments?|calendar)\b/i },
	{ needle: 'relationship', messagePattern: /\b(?:relationships?|edges?|links?)\b/i }
];

type WriteCommissionMatch = {
	toolName: string;
	entity: (typeof WRITE_TOOL_ENTITY_TERMS)[number];
	message: string;
};

const WRITE_IDENTITY_KEYS = new Set([
	'id',
	'user_id',
	'project_id',
	'task_id',
	'document_id',
	'goal_id',
	'plan_id',
	'milestone_id',
	'risk_id',
	'event_id',
	'onto_event_id',
	'calendar_source_id'
]);
const WRITE_CONTROL_KEYS = new Set(['update_strategy', 'merge_instructions', 'return_mode']);

function matchWriteCommissionActionAndEntity(params: {
	toolName: string;
	message: string | null | undefined;
}): WriteCommissionMatch | null {
	if (!isTrustedUserWriteCommission(params.message)) return null;
	const toolName = params.toolName.trim().toLowerCase();
	const entity = WRITE_TOOL_ENTITY_TERMS.find(({ needle }) => toolName.includes(needle));
	const message = params.message ?? '';
	if (!entity || !entity.messagePattern.test(message)) return null;

	const actionPattern = toolName.startsWith('create_')
		? /\b(?:create|add|make|start|set\s+up|record|save|schedule|book)\b/i
		: toolName.startsWith('update_')
			? /\b(?:update|edit|change|rename|move|reschedule|schedule|assign|complete|mark|archive|restore|set|tag)\b/i
			: toolName.startsWith('delete_')
				? /\b(?:delete|remove)\b/i
				: toolName.startsWith('move_') || toolName.startsWith('reorganize_')
					? /\b(?:move|reorganize)\b/i
					: toolName.startsWith('link_')
						? /\b(?:link|connect)\b/i
						: toolName.startsWith('unlink_')
							? /\b(?:unlink|disconnect|remove)\b/i
							: null;
	const actionMatch = actionPattern?.exec(message);
	if (!actionMatch) return null;
	const entityMatch = entity.messagePattern.exec(message);
	if (!entityMatch || Math.abs(entityMatch.index - actionMatch.index) > 48) return null;
	const textAfterAction = message.slice(actionMatch.index + actionMatch[0].length);
	const firstEntityAfterAction = WRITE_TOOL_ENTITY_TERMS.map((candidate) => ({
		candidate,
		match: candidate.messagePattern.exec(textAfterAction)
	}))
		.filter(
			(
				entry
			): entry is {
				candidate: (typeof WRITE_TOOL_ENTITY_TERMS)[number];
				match: RegExpExecArray;
			} => entry.match !== null
		)
		.sort((left, right) => left.match.index - right.match.index)[0]?.candidate;
	if (firstEntityAfterAction !== entity) return null;
	return { toolName, entity, message };
}

function isWriteTargetExplicitlyCommissioned(params: {
	match: WriteCommissionMatch;
	arguments?: JsonObject;
	focusedEntityId?: string | null;
	knownEntities?: ReadonlyArray<{ id: string; kind: string; label?: string | null }>;
}): boolean {
	if (!params.arguments) return false;
	const preferredTargetKeys = [
		`${params.match.entity.needle}_id`,
		`onto_${params.match.entity.needle}_id`,
		'id'
	];
	const targetEntry =
		preferredTargetKeys
			.map((key) => [key, params.arguments?.[key]] as const)
			.find(([, value]) => typeof value === 'string') ??
		Object.entries(params.arguments).find(
			([key, value]) => WRITE_IDENTITY_KEYS.has(key) && typeof value === 'string'
		);
	const targetId = targetEntry?.[1];
	const knownTargetNamed =
		typeof targetId === 'string' &&
		(params.knownEntities?.some(
			(candidate) =>
				candidate.id === targetId &&
				candidate.kind.toLowerCase().includes(params.match.entity.needle) &&
				typeof candidate.label === 'string' &&
				candidate.label.trim().length >= 3 &&
				params.match.message
					.toLocaleLowerCase('en-US')
					.includes(candidate.label.trim().toLocaleLowerCase('en-US'))
		) ??
			false);
	return (
		typeof targetId === 'string' &&
		(params.match.message.includes(targetId) ||
			targetId === params.focusedEntityId ||
			knownTargetNamed)
	);
}

/**
 * Recognize a bounded write intent even when model-normalized arguments (for
 * example an ISO timestamp) cannot be proven byte-for-byte from user text.
 * This never authorizes execution; it only permits presenting exact arguments
 * for a signed, later-turn confirmation.
 */
export function isWriteToolReviewCommissionedByUserMessage(params: {
	toolName: string;
	message: string | null | undefined;
	arguments?: JsonObject;
	focusedEntityId?: string | null;
	focusedProjectId?: string | null;
	knownEntities?: ReadonlyArray<{ id: string; kind: string; label?: string | null }>;
}): boolean {
	const match = matchWriteCommissionActionAndEntity(params);
	if (!match) return false;
	if (match.toolName.startsWith('create_')) return true;
	return isWriteTargetExplicitlyCommissioned({ match, ...params });
}

/**
 * Derive an exact entity-class write commission from trusted user text. This
 * prevents a task request from authorizing an unrelated mounted document or
 * project write while retaining direct, ordinary mutation requests.
 */
export function isWriteToolCommissionedByUserMessage(params: {
	toolName: string;
	message: string | null | undefined;
	arguments?: JsonObject;
	focusedEntityId?: string | null;
	focusedProjectId?: string | null;
	knownEntities?: ReadonlyArray<{ id: string; kind: string; label?: string | null }>;
}): boolean {
	const match = matchWriteCommissionActionAndEntity(params);
	if (!match) return false;
	const { toolName, message } = match;

	if (!toolName.startsWith('create_') && !toolName.startsWith('update_')) return false;
	if (!params.arguments) return false;
	const mutableKeys = Object.keys(params.arguments).filter(
		(key) => !WRITE_IDENTITY_KEYS.has(key) && !WRITE_CONTROL_KEYS.has(key)
	);
	if (mutableKeys.length === 0) return false;
	if (toolName.startsWith('create_')) {
		const mutableValuesBound = mutableKeys.every(
			(key) =>
				fieldExplicitlyCommissioned(key, message) &&
				valueExplicitlyCommissioned(key, params.arguments?.[key], message)
		);
		if (!mutableValuesBound) return false;
		const destinationProjectId = params.arguments.project_id;
		if (match.entity.needle === 'project' || typeof destinationProjectId !== 'string') {
			return true;
		}
		const normalizedMessage = message.toLocaleLowerCase('en-US');
		return (
			destinationProjectId === params.focusedProjectId ||
			message.includes(destinationProjectId) ||
			(params.knownEntities?.some(
				(candidate) =>
					candidate.id === destinationProjectId &&
					candidate.kind.toLowerCase().includes('project') &&
					typeof candidate.label === 'string' &&
					candidate.label.trim().length >= 3 &&
					normalizedMessage.includes(candidate.label.trim().toLocaleLowerCase('en-US'))
			) ??
				false)
		);
	}
	if (!isWriteTargetExplicitlyCommissioned({ match, ...params })) return false;
	return mutableKeys.every(
		(key) =>
			fieldExplicitlyCommissioned(key, message) &&
			valueExplicitlyCommissioned(key, params.arguments?.[key], message)
	);
}

function canonicalizeReviewValue(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonicalizeReviewValue).join(',')}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalizeReviewValue(record[key])}`)
		.join(',')}}`;
}

function reviewProposalFingerprint(toolName: string, args: JsonObject): string {
	const input = `${toolName.trim().toLowerCase()}\n${canonicalizeReviewValue(args)}`;
	return createHash('sha256').update(input, 'utf8').digest('base64url');
}

export function buildWriteReviewProposal(params: {
	toolName: string;
	arguments: JsonObject;
	signingSecret?: string | null;
	userId?: string | null;
	sessionId?: string | null;
}): { fingerprint: string; canonicalArguments: string; authorization: string | null } {
	const canonicalArguments = canonicalizeReviewValue(params.arguments);
	const fingerprint = reviewProposalFingerprint(params.toolName, params.arguments);
	const signingSecret = params.signingSecret?.trim();
	const userId = params.userId?.trim();
	const sessionId = params.sessionId?.trim();
	return {
		fingerprint,
		canonicalArguments,
		authorization:
			signingSecret && userId && sessionId
				? createHmac('sha256', signingSecret)
						.update(
							`${userId}\n${sessionId}\n${params.toolName.trim().toLowerCase()}\n${fingerprint}`,
							'utf8'
						)
						.digest('base64url')
				: null
	};
}

function fieldExplicitlyCommissioned(field: string, message: string): boolean {
	if (/^(?:title|name)$/.test(field)) return /\b(?:title|name|rename)\b/i.test(message);
	if (/^(?:description|details|content)$/.test(field)) {
		return /\b(?:description|details|content|text|notes?|write)\b/i.test(message);
	}
	if (/^(?:state_key|status)$/.test(field)) {
		return /\b(?:state|status|done|complete|completed|archive|archived|restore)\b/i.test(
			message
		);
	}
	if (
		/^(?:start|end|start_at|end_at|due_at|start_time|end_time|due_date|timezone)$/.test(field)
	) {
		return /\b(?:start|end|due|deadline|date|time|schedule|reschedule|timezone)\b/i.test(
			message
		);
	}
	if (/^(?:assignee|assignee_id|assignee_actor_id|owner)$/.test(field)) {
		return /\b(?:assign|assignee|owner)\b/i.test(message);
	}
	return false;
}

function valueExplicitlyCommissioned(field: string, value: unknown, message: string): boolean {
	if (Array.isArray(value)) {
		return (
			value.length > 0 &&
			value.every((entry) => valueExplicitlyCommissioned(field, entry, message))
		);
	}
	if (value === null || typeof value === 'object' || value === undefined) return false;
	const normalizedMessage = message.normalize('NFKC').toLocaleLowerCase('en-US');
	const normalizedValue = String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US');
	if (!normalizedValue) return false;
	if (normalizedMessage.includes(normalizedValue)) return true;
	if (/^(?:state_key|status)$/.test(field)) {
		const semanticStateCues: Record<string, RegExp> = {
			done: /\b(?:done|complete|completed|finish|finished)\b/i,
			in_progress: /\b(?:in progress|start|started|working on)\b/i,
			todo: /\b(?:todo|to do|not started|backlog)\b/i,
			archived: /\barchive(?:d)?\b/i
		};
		return semanticStateCues[normalizedValue]?.test(message) ?? false;
	}
	return false;
}

export function hasExplicitWriteReviewConfirmation(params: {
	history: FastChatHistoryMessage[];
	message: string | null | undefined;
	toolName?: string;
	arguments?: JsonObject;
	signingSecret?: string | null;
	userId?: string | null;
	sessionId?: string | null;
}): boolean {
	const message = typeof params.message === 'string' ? params.message.trim() : '';
	if (
		!STANDALONE_AFFIRMATIVE_CONFIRMATION.test(message) &&
		!CONFIRMED_WRITE_ACTION.test(message)
	) {
		return false;
	}
	const priorAssistant = [...params.history]
		.reverse()
		.find((entry) => entry.role === 'assistant' && entry.content.trim());
	if (!priorAssistant) return false;
	const isReviewRequest =
		PRIOR_REVIEW_REQUEST.test(priorAssistant.content) &&
		PRIOR_WRITE_LANGUAGE.test(priorAssistant.content);
	if (!isReviewRequest) return false;
	if (!params.toolName) return true;
	if (!params.arguments) return false;
	const proposal = buildWriteReviewProposal({
		toolName: params.toolName,
		arguments: params.arguments,
		signingSecret: params.signingSecret,
		userId: params.userId,
		sessionId: params.sessionId
	});
	if (!proposal.authorization) return false;
	return (
		priorAssistant.content.includes(`Proposed operation: \`${params.toolName}\``) &&
		priorAssistant.content.includes(`Proposal fingerprint: \`${proposal.fingerprint}\``) &&
		priorAssistant.content.includes(`Proposed arguments: \`${proposal.canonicalArguments}\``) &&
		priorAssistant.content.includes(`Proposal authorization: \`${proposal.authorization}\``)
	);
}

export function hasSignedWriteReviewMaterializationConfirmation(params: {
	history: FastChatHistoryMessage[];
	message: string | null | undefined;
	toolName: string;
	signingSecret?: string | null;
	userId?: string | null;
	sessionId?: string | null;
}): boolean {
	const message = typeof params.message === 'string' ? params.message.trim() : '';
	if (
		!STANDALONE_AFFIRMATIVE_CONFIRMATION.test(message) &&
		!CONFIRMED_WRITE_ACTION.test(message)
	) {
		return false;
	}
	const priorAssistant = [...params.history]
		.reverse()
		.find((entry) => entry.role === 'assistant' && entry.content.trim());
	const signingSecret = params.signingSecret?.trim();
	const userId = params.userId?.trim();
	const sessionId = params.sessionId?.trim();
	if (!priorAssistant || !signingSecret || !userId || !sessionId) return false;
	if (!priorAssistant.content.includes(`Proposed operation: \`${params.toolName}\``))
		return false;
	const fingerprint = priorAssistant.content.match(
		/Proposal fingerprint: `([A-Za-z0-9_-]{43})`/
	)?.[1];
	const authorization = priorAssistant.content.match(
		/Proposal authorization: `([A-Za-z0-9_-]{43})`/
	)?.[1];
	if (!fingerprint || !authorization) return false;
	const expected = createHmac('sha256', signingSecret)
		.update(
			`${userId}\n${sessionId}\n${params.toolName.trim().toLowerCase()}\n${fingerprint}`,
			'utf8'
		)
		.digest('base64url');
	return authorization === expected;
}

/**
 * A successful externally-authored content read taints the remainder of the
 * synchronous turn. Every shared workspace read except server-authored field
 * metadata is tainted by default so new read tools cannot silently bypass the
 * prompt-injection boundary as the registry evolves.
 */
export function isPotentiallyUntrustedContentToolName(toolName: string): boolean {
	const normalized = toolName.trim().toLowerCase();
	return (
		EXTERNALLY_AUTHORED_CONTENT_TOOLS.has(normalized) ||
		COLLABORATIVE_WORKSPACE_CONTENT_TOOLS.has(normalized) ||
		(isAgenticChatSharedReadToolNameV1(normalized) && normalized !== 'get_field_info')
	);
}

export function isPotentiallyUntrustedContentToolCall(toolCall: ChatToolCall): boolean {
	if (isPotentiallyUntrustedContentToolName(toolCall.function.name)) return true;
	if (toolCall.function.name.trim().toLowerCase() !== 'get_document_tree') return false;
	try {
		const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
		return args.include_content === true;
	} catch {
		// Invalid arguments will fail validation and produce no content.
		return false;
	}
}

export function isPrivateOrStoredContentToolCall(toolCall: ChatToolCall): boolean {
	return !PROVIDER_NEUTRAL_OR_CONTROL_TOOLS.has(toolCall.function.name.trim().toLowerCase());
}

export function isHighImpactWriteToolName(toolName: string, operationName?: string): boolean {
	const normalizedName = toolName.trim().toLowerCase();
	const normalizedOp = (operationName ?? '').trim().toLowerCase();
	return (
		OPAQUE_OR_BULK_WRITE_TOOLS.has(normalizedName) ||
		normalizedName.startsWith('delete_') ||
		normalizedName.startsWith('unlink_') ||
		normalizedOp.endsWith('.delete') ||
		normalizedOp.endsWith('.unlink') ||
		normalizedOp.endsWith('.reorganize')
	);
}

/**
 * Apply the shared Agent Ops read/write classification to synchronous chat,
 * then layer the chat-specific review and materialization rules on top.
 */
export function evaluateInteractiveChatToolSecurity(params: {
	toolName: string;
	phase: InteractiveChatToolSecurityPhase;
	externalContentIngested: boolean;
	privateContentIngested?: boolean;
	egressProvenanceAllowed?: boolean;
	roundContainsExternalContent: boolean;
	isCurrentExternalContentSource: boolean;
	reviewConfirmationTurn: boolean;
	writeReviewConfirmed: boolean;
	writeExecutionAuthorized?: boolean;
	writeReviewCommissioned?: boolean;
	trustedUserWriteCommission: boolean;
	turnContractDeclared: boolean;
}): InteractiveChatToolSecurityDecision {
	const normalizedToolName = params.toolName.trim().toLowerCase();
	const operationName = normalizeGatewayOpName(resolveToolOperationName(params.toolName).trim());
	const requiredMode = requiredScopeModeForOp(operationName);
	const isWrite =
		requiredMode === 'read_write' ||
		isLikelyWriteToolName(params.toolName) ||
		OPAQUE_OR_BULK_WRITE_TOOLS.has(params.toolName.trim().toLowerCase());
	if (
		isAgenticChatWebEgressToolName(normalizedToolName) &&
		params.egressProvenanceAllowed === false
	) {
		return {
			allowed: false,
			isWrite: false,
			operationName,
			reason: 'web_egress_provenance_required',
			requiresUserAction: true
		};
	}
	if (params.privateContentIngested && OUTBOUND_EGRESS_TOOLS.has(normalizedToolName)) {
		return {
			allowed: false,
			isWrite: false,
			operationName,
			reason: 'private_content_egress_review_required',
			requiresUserAction: true
		};
	}
	if (!isWrite) return { allowed: true, isWrite: false, operationName };
	const externalReviewRequired =
		params.externalContentIngested ||
		(params.roundContainsExternalContent && !params.isCurrentExternalContentSource);
	if (externalReviewRequired) {
		return {
			allowed: false,
			isWrite: true,
			operationName,
			reason: 'external_content_review_required',
			requiresUserAction: true
		};
	}

	if (params.reviewConfirmationTurn && !params.writeReviewConfirmed) {
		return {
			allowed: false,
			isWrite: true,
			operationName,
			reason: 'write_review_scope_mismatch',
			requiresUserAction: true
		};
	}

	if (
		params.phase === 'execution' &&
		isHighImpactWriteToolName(params.toolName, operationName) &&
		!params.writeReviewConfirmed
	) {
		return {
			allowed: false,
			isWrite: true,
			operationName,
			reason: 'high_impact_confirmation_required',
			requiresUserAction: true
		};
	}

	if (params.phase === 'execution' && params.writeExecutionAuthorized === false) {
		return {
			allowed: false,
			isWrite: true,
			operationName,
			reason: 'write_execution_scope_mismatch',
			requiresUserAction: params.writeReviewCommissioned === true
		};
	}

	if (
		params.phase === 'materialization' &&
		!params.turnContractDeclared &&
		!params.trustedUserWriteCommission &&
		!params.writeReviewConfirmed &&
		params.writeExecutionAuthorized === false
	) {
		return {
			allowed: false,
			isWrite: true,
			operationName,
			reason: 'write_materialization_contract_required',
			requiresUserAction: false
		};
	}

	return { allowed: true, isWrite: true, operationName };
}

export function buildInteractiveChatToolSecurityResult(params: {
	toolCall: ChatToolCall;
	decision: Extract<InteractiveChatToolSecurityDecision, { allowed: false }>;
}): ChatToolResult {
	const { toolCall, decision } = params;
	const message = (() => {
		switch (decision.reason) {
			case 'web_egress_provenance_required':
				return `Security review required before ${toolCall.function.name}: the outbound query or URL was not explicitly supplied in the current user message or returned by this turn's web search. No outbound request was sent. Ask the user to provide the exact public query or URL in a new message.`;
			case 'private_content_egress_review_required':
				return `Security review required before ${toolCall.function.name}: this turn loaded private workspace or third-party content. No outbound request was sent. Ask the user to provide the exact public query or URL in a new message without copying private content.`;
			case 'external_content_review_required':
				return `Security review required before ${toolCall.function.name}: this turn loaded workspace or third-party content. No write executed. Explain the exact proposed change and ask the user to confirm it in a later turn.`;
			case 'high_impact_confirmation_required':
				return `Explicit confirmation required before ${toolCall.function.name}. No write executed. Explain the exact target and impact, then ask the user to confirm in a later turn.`;
			case 'write_review_scope_mismatch':
				return `The confirmed review did not authorize ${toolCall.function.name}. No write executed. Keep the confirmation bound to the exact proposed operation, or present this different write for a new review.`;
			case 'write_execution_scope_mismatch':
				return `Write tool ${toolCall.function.name} was not authorized for execution. No write executed. Declare a bounded turn contract that names this exact operation, use a server-commissioned tool, or present the operation for user review.`;
			case 'write_materialization_contract_required':
				return `Write tool ${toolCall.function.name} was not materialized. The trusted user turn did not directly commission this write. Declare a bounded turn contract first, or ask a clarifying question if the intended change is unresolved.`;
		}
	})();

	return {
		tool_call_id: toolCall.id,
		result: {
			type: decision.requiresUserAction
				? 'security_review_required'
				: 'write_materialization_blocked',
			reason: decision.reason,
			tool_name: toolCall.function.name,
			operation: decision.operationName || null,
			write_executed: false
		},
		success: false,
		error: message,
		...(decision.requiresUserAction ? { requires_user_action: true } : {})
	};
}
