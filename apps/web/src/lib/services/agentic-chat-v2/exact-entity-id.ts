// apps/web/src/lib/services/agentic-chat-v2/exact-entity-id.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const PLACEHOLDER_ID_PATTERNS = [/^<[^>]+>$/, /^__.*__$/, /^(?:none|null|undefined|tbd)$/i];

export function normalizeExactEntityId(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (PLACEHOLDER_ID_PATTERNS.some((pattern) => pattern.test(trimmed))) {
		return undefined;
	}
	return isValidUUID(trimmed) ? trimmed : undefined;
}

export function shouldCollectExactEntityReferencesFromToolName(
	toolName: string | undefined
): boolean {
	if (!toolName) return false;
	return !['tool_schema', 'tool_search', 'skill_load'].includes(toolName);
}
