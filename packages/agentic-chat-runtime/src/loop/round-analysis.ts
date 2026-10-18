// packages/agentic-chat-runtime/src/loop/round-analysis.ts
import type { ChatToolCall } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '@buildos/shared-agent-ops/ops/gateway-op-aliases';
import type { GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';
import { parseRequiredParameterFailure } from './tool-failure';
import {
	isControlToolName,
	isDiscoveryToolName,
	isLikelyReadToolName,
	isLikelyWriteToolName,
	isWebResearchToolName,
	resolveToolOperationName
} from './tool-classification';
export type { GatewayExecResultData } from './tool-classification';
export {
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	extractGatewayExecResultData,
	getGatewayExecOp,
	isDuplicateWriteSkippedExecution,
	isReadLikeOperation,
	isWriteLikeOperation
} from './tool-classification';

export type RoundToolPattern = {
	readOps: string[];
	// Web research ops (web_search/web_visit) tracked separately from readOps:
	// they gather new external evidence each call, so they must not feed the
	// stuck-ontology-read escalation or the repeated-read-set guard.
	researchOps: string[];
	hasWriteOps: boolean;
};

export function extractGatewayRequiredFieldFailuresFromValidationIssues(
	issues: ToolValidationIssue[]
): GatewayRequiredFieldFailure[] {
	const failures = new Map<string, GatewayRequiredFieldFailure>();

	for (const issue of issues) {
		if (!issue.op) continue;
		for (const error of issue.errors) {
			addGatewayRequiredFieldFailure(failures, issue.op, error);
		}
	}

	return Array.from(failures.values());
}

export function buildRoundToolPattern(toolCalls: ChatToolCall[]): RoundToolPattern {
	const readOps = new Set<string>();
	const researchOps = new Set<string>();
	let hasWriteOps = false;

	for (const toolCall of toolCalls) {
		const toolName = toolCall.function?.name?.trim();
		if (!toolName) continue;

		// Harness controls (contract declarations, reviewer decisions,
		// clarification requests) are registered as reads on the worker so they
		// cross the durable tool-result fence, but they gather no evidence. A
		// round made only of them is a control round: neither read-only nor a
		// write, so it never advances the read-loop escalation ladder.
		if (isControlToolName(toolName)) {
			continue;
		}

		const operationName = resolveToolOperationName(toolName);

		if (isLikelyWriteToolName(toolName)) {
			hasWriteOps = true;
			continue;
		}

		// Pure gateway-discovery tools (tool_search/tool_schema/skill_load)
		// do not gather user-facing evidence — they only resolve which tools
		// exist. Counting them as read rounds caused the read-loop escalation
		// to fire on legitimate gateway flows that spent 1-2 rounds resolving
		// the right tool before doing any real reads. Filter them here so the
		// read-loop guard only escalates on actual evidence-gathering rounds.
		if (isDiscoveryToolName(toolName) || isDiscoveryToolName(operationName)) {
			continue;
		}

		// Web research calls fetch new external evidence every time, unlike
		// ontology reads which saturate. Rounds of only web research must not
		// advance the read-loop escalation (2026-07-18 research-capability
		// audit: the nudge→must_synthesize ladder was killing legitimate
		// multi-round research turns at 3/6/8 read-only rounds).
		if (isWebResearchToolName(toolName) || isWebResearchToolName(operationName)) {
			researchOps.add(operationName.toLowerCase());
			continue;
		}

		if (isLikelyReadToolName(toolName)) {
			readOps.add(operationName.toLowerCase());
		}
	}

	return {
		readOps: Array.from(readOps).sort(),
		researchOps: Array.from(researchOps).sort(),
		hasWriteOps
	};
}

function addGatewayRequiredFieldFailure(
	failures: Map<string, GatewayRequiredFieldFailure>,
	op: unknown,
	errorMessage: unknown
): void {
	const opName = typeof op === 'string' && op.trim().length > 0 ? normalizeGatewayOpName(op) : '';
	const errorText = typeof errorMessage === 'string' ? errorMessage : '';
	if (!opName || !errorText) return;
	const field = parseRequiredParameterFailure(errorText);
	if (!field) return;
	const key = `${opName}|${field}`;
	const existing = failures.get(key);
	if (existing) {
		existing.occurrences += 1;
		return;
	}
	failures.set(key, { op: opName, field, occurrences: 1 });
}
