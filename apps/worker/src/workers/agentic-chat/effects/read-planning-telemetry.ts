// apps/worker/src/workers/agentic-chat/effects/read-planning-telemetry.ts
import {
	AGENTIC_CHAT_CONTROL_TOOL_NAMES,
	AGENTIC_CHAT_REVIEWER_CONTROL_TOOL_NAMES
} from '@buildos/agentic-chat-runtime/catalog';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import { sha256Hex } from '../shared/identity-hash';
import { stripSchedulingSidecar } from '../shared/tool-scheduling';
import type { AgenticChatControlDecisionAuthorV1 } from '../provider/contracts';

const EXACT_READ_IDENTITY_VERSION = 'agentic_chat_exact_read_identity_v1';
const RESOURCE_IDENTITY_VERSION = 'agentic_chat_read_resource_identity_v1';

const REVIEW_TOOL_NAMES = new Set<string>(AGENTIC_CHAT_REVIEWER_CONTROL_TOOL_NAMES);
const CONTROL_TOOL_NAMES = new Set<string>(AGENTIC_CHAT_CONTROL_TOOL_NAMES);
const REVIEW_DECISION_AUTHORS = new Set<AgenticChatControlDecisionAuthorV1>([
	'contract_reviewer',
	'mutation_batch_reviewer',
	'harness_review_fallback'
]);
const RESOURCE_SCOPE_ID_KEYS = new Set([
	'project_id',
	'workspace_id',
	'user_id',
	'account_id',
	'session_id'
]);

export type AgenticChatReadExecutionClassV1 = 'evidence_read' | 'control' | 'review';

export type AgenticChatReadPlanningIdentityV1 = {
	executionClass: AgenticChatReadExecutionClassV1;
	exactReadKey: string | null;
	resourceKey: string | null;
};

export function deriveAgenticChatReadPlanningIdentityV1(input: {
	toolName: string;
	arguments: JsonObject;
	decidedBy?: AgenticChatControlDecisionAuthorV1;
}): AgenticChatReadPlanningIdentityV1 {
	const toolName = input.toolName.trim().toLowerCase();
	const executionClass = classifyReadExecution(toolName, input.decidedBy);
	if (executionClass !== 'evidence_read') {
		return { executionClass, exactReadKey: null, resourceKey: null };
	}

	const domainArguments = stripSchedulingSidecar(input.arguments);
	return {
		executionClass,
		exactReadKey: sha256Hex(
			`${EXACT_READ_IDENTITY_VERSION}:${toolName}:${canonicalizeAgenticChatJson(domainArguments as JsonValue)}`
		),
		resourceKey: deriveResourceKey(toolName, domainArguments)
	};
}

function classifyReadExecution(
	toolName: string,
	decidedBy: AgenticChatControlDecisionAuthorV1 | undefined
): AgenticChatReadExecutionClassV1 {
	if ((decidedBy && REVIEW_DECISION_AUTHORS.has(decidedBy)) || REVIEW_TOOL_NAMES.has(toolName)) {
		return 'review';
	}
	return CONTROL_TOOL_NAMES.has(toolName) ? 'control' : 'evidence_read';
}

function deriveResourceKey(toolName: string, arguments_: JsonObject): string | null {
	if (isSearchOperation(toolName)) return null;

	const identifierEntries = Object.entries(arguments_)
		.filter(
			(entry): entry is [string, string] =>
				typeof entry[1] === 'string' &&
				entry[1].length > 0 &&
				(entry[0] === 'id' || entry[0].endsWith('_id'))
		)
		.sort(([left], [right]) => left.localeCompare(right));
	const targetIdentifiers = identifierEntries.filter(([key]) => !RESOURCE_SCOPE_ID_KEYS.has(key));
	if (targetIdentifiers.length > 0) {
		return hashResourceDescriptor({ kind: 'entity', identifiers: targetIdentifiers });
	}

	const scopeIdentifiers = identifierEntries.filter(([key]) => RESOURCE_SCOPE_ID_KEYS.has(key));
	if (scopeIdentifiers.length > 0) {
		return hashResourceDescriptor({
			kind: toolName.startsWith('list_') ? `collection:${toolName}` : 'scope',
			identifiers: scopeIdentifiers
		});
	}

	if (
		toolName === 'web_visit' &&
		typeof arguments_.url === 'string' &&
		arguments_.url.length > 0
	) {
		return hashResourceDescriptor({ kind: 'url', value: arguments_.url });
	}
	return null;
}

function isSearchOperation(toolName: string): boolean {
	return (
		toolName.startsWith('search_') ||
		toolName.endsWith('.search') ||
		toolName === 'web_search' ||
		toolName === 'explore_project'
	);
}

function hashResourceDescriptor(descriptor: JsonObject): string {
	return sha256Hex(
		`${RESOURCE_IDENTITY_VERSION}:${canonicalizeAgenticChatJson(descriptor as JsonValue)}`
	);
}
