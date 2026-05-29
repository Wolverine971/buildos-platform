// apps/web/src/lib/services/agentic-chat-v2/agent-state-sanitization.ts
/**
 * Agent-state sanitization helpers for the FastChat v2 stream route.
 *
 * Pure functions — no logging, no IO. Extracted from the route file so the
 * orchestration spine stays focused on flow rather than data hygiene.
 *
 * `sanitizeAgentStateForPrompt` strips any entity/dependency/relation IDs that
 * are not valid UUIDs (the summarizer occasionally emits placeholder or
 * truncated ids like "abc...") before the state is shown to the model or
 * persisted, so downstream lookups never chase malformed references.
 */

import { isValidUUID } from '$lib/utils/operations/validation-utils';
import type { AgentState } from '$lib/types/agent-chat-enhancement';

export function buildEmptyAgentState(sessionId: string): AgentState {
	return {
		sessionId,
		current_understanding: {
			entities: [],
			dependencies: []
		},
		assumptions: [],
		expectations: [],
		tentative_hypotheses: [],
		items: []
	};
}

export function isValidAgentStateEntityId(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const trimmed = value.trim();
	return trimmed.length > 0 && !trimmed.includes('...') && isValidUUID(trimmed);
}

export function sanitizeUuidStringArray(values: unknown): string[] | undefined {
	if (!Array.isArray(values)) return undefined;
	const unique = new Set<string>();
	for (const value of values) {
		if (!isValidAgentStateEntityId(value)) continue;
		unique.add(value.trim());
	}
	return unique.size > 0 ? Array.from(unique) : undefined;
}

export function sanitizeAgentStateForPrompt(agentState: AgentState): AgentState {
	const entities = (agentState.current_understanding?.entities ?? [])
		.filter((entity) => isValidAgentStateEntityId(entity?.id))
		.map((entity) => ({
			...entity,
			id: entity.id.trim()
		}));

	const dependencies = (agentState.current_understanding?.dependencies ?? [])
		.filter((dep) => isValidAgentStateEntityId(dep?.from) && isValidAgentStateEntityId(dep?.to))
		.map((dep) => ({
			...dep,
			from: dep.from.trim(),
			to: dep.to.trim()
		}));

	const items = (agentState.items ?? []).map((item) => {
		const relatedEntityIds = sanitizeUuidStringArray(item.relatedEntityIds);
		return relatedEntityIds
			? { ...item, relatedEntityIds }
			: { ...item, relatedEntityIds: undefined };
	});

	const expectations = (agentState.expectations ?? []).map((expectation) => {
		const expectedIds = sanitizeUuidStringArray(expectation.expected_ids);
		return expectedIds
			? { ...expectation, expected_ids: expectedIds }
			: { ...expectation, expected_ids: undefined };
	});

	return {
		...agentState,
		current_understanding: {
			entities,
			dependencies
		},
		items,
		expectations
	};
}
