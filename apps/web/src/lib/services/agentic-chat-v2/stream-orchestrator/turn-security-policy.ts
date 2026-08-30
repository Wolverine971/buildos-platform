// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-security-policy.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { requiredScopeModeForOp } from '@buildos/shared-agent-ops';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import type { FastChatHistoryMessage } from '../types';
import { isLikelyWriteToolName, resolveToolOperationName } from './tool-classification';

export type InteractiveChatToolSecurityPhase = 'execution' | 'materialization';
export type InteractiveChatToolSecurityReason =
	| 'external_content_review_required'
	| 'high_impact_confirmation_required'
	| 'write_review_scope_mismatch'
	| 'write_materialization_contract_required';

export type InteractiveChatToolSecurityDecision =
	| { allowed: true; isWrite: boolean; operationName: string }
	| {
			allowed: false;
			isWrite: true;
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

export function hasExplicitWriteReviewConfirmation(params: {
	history: FastChatHistoryMessage[];
	message: string | null | undefined;
	toolName?: string;
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
	return priorAssistant.content.includes(`Proposed operation: \`${params.toolName}\``);
}

/**
 * A successful externally-authored content read taints the remainder of the
 * synchronous turn. Ordinary ontology metadata reads stay fast; web/email/
 * calendar bodies, document bodies, and opaque MCP payloads require review.
 */
export function isPotentiallyUntrustedContentToolName(toolName: string): boolean {
	const normalized = toolName.trim().toLowerCase();
	return EXTERNALLY_AUTHORED_CONTENT_TOOLS.has(normalized);
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
	roundContainsExternalContent: boolean;
	isCurrentExternalContentSource: boolean;
	reviewConfirmationTurn: boolean;
	writeReviewConfirmed: boolean;
	trustedUserWriteCommission: boolean;
	turnContractDeclared: boolean;
}): InteractiveChatToolSecurityDecision {
	const operationName = normalizeGatewayOpName(resolveToolOperationName(params.toolName).trim());
	const requiredMode = requiredScopeModeForOp(operationName);
	const isWrite =
		requiredMode === 'read_write' ||
		isLikelyWriteToolName(params.toolName) ||
		OPAQUE_OR_BULK_WRITE_TOOLS.has(params.toolName.trim().toLowerCase());
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

	if (isHighImpactWriteToolName(params.toolName, operationName) && !params.writeReviewConfirmed) {
		return {
			allowed: false,
			isWrite: true,
			operationName,
			reason: 'high_impact_confirmation_required',
			requiresUserAction: true
		};
	}

	if (
		params.phase === 'materialization' &&
		!params.turnContractDeclared &&
		!params.trustedUserWriteCommission &&
		!params.writeReviewConfirmed
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
			case 'external_content_review_required':
				return `Security review required before ${toolCall.function.name}: this turn loaded workspace or third-party content. No write executed. Explain the exact proposed change and ask the user to confirm it in a later turn.`;
			case 'high_impact_confirmation_required':
				return `Explicit confirmation required before ${toolCall.function.name}. No write executed. Explain the exact target and impact, then ask the user to confirm in a later turn.`;
			case 'write_review_scope_mismatch':
				return `The confirmed review did not authorize ${toolCall.function.name}. No write executed. Keep the confirmation bound to the exact proposed operation, or present this different write for a new review.`;
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
