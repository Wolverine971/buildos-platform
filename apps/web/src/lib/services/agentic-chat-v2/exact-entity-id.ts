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
	return ![
		'domain_search',
		'domain_load',
		'work_capability_search',
		'work_capability_load',
		'tool_schema',
		'tool_search',
		'skill_search',
		'resource_search',
		'resource_load',
		'skill_load',
		'skill_reference_load'
	].includes(toolName);
}
