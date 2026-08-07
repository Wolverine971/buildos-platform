// packages/agentic-chat-runtime/src/loop/context-shift.ts
import type { ChatContextType, ChatToolResult, ContextShiftPayload } from '@buildos/shared-types';

const CONTEXT_SHIFT_ENTITY_TYPES: ContextShiftPayload['entity_type'][] = [
	'workspace',
	'project',
	'task',
	'plan',
	'goal',
	'document',
	'milestone',
	'risk'
];

const CONTEXT_SHIFT_NESTED_KEYS = ['result', 'data', 'payload'];

function normalizeContextType(input: ChatContextType | string): ChatContextType {
	if (input === 'general') return 'global';
	if (input === 'project_audit' || input === 'project_forecast') return 'project';
	return input as ChatContextType;
}

function isContextShiftEntityType(
	value: string | null | undefined
): value is ContextShiftPayload['entity_type'] {
	if (!value) return false;
	return CONTEXT_SHIFT_ENTITY_TYPES.includes(value as ContextShiftPayload['entity_type']);
}

function extractContextShiftObject(value: unknown, depth = 0): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || depth > 4) return null;

	const record = value as Record<string, unknown>;
	if (record.context_shift && typeof record.context_shift === 'object') {
		return record.context_shift as Record<string, unknown>;
	}

	for (const key of CONTEXT_SHIFT_NESTED_KEYS) {
		const extracted = extractContextShiftObject(record[key], depth + 1);
		if (extracted) return extracted;
	}

	return null;
}

/**
 * Extract the legacy context-shift envelope from a successful tool result.
 * Tool payloads may wrap it below result/data/payload, so both adapters use
 * this one bounded traversal instead of drifting on wrapper depth or defaults.
 */
export function extractContextShiftPayload(result: ChatToolResult): ContextShiftPayload | null {
	const contextShift = extractContextShiftObject(result);
	if (!contextShift) return null;

	const rawContext =
		typeof contextShift.new_context === 'string' ? contextShift.new_context.trim() : '';
	const rawEntityId =
		typeof contextShift.entity_id === 'string' ? contextShift.entity_id.trim() : '';
	if (!rawContext) return null;

	const normalizedContext = normalizeContextType(rawContext);
	const isGlobalContext = normalizedContext === 'global' || normalizedContext === 'general';
	if (!isGlobalContext && !rawEntityId) return null;
	const entityName =
		typeof contextShift.entity_name === 'string' && contextShift.entity_name.trim()
			? contextShift.entity_name.trim()
			: isGlobalContext
				? 'Workspace'
				: 'Project';
	const entityType =
		typeof contextShift.entity_type === 'string' &&
		isContextShiftEntityType(contextShift.entity_type)
			? contextShift.entity_type
			: isGlobalContext
				? 'workspace'
				: 'project';
	const message =
		typeof contextShift.message === 'string' && contextShift.message.trim()
			? contextShift.message.trim()
			: isGlobalContext
				? 'Zoomed out to workspace context.'
				: `Context updated to ${entityName}`;

	return {
		new_context: normalizedContext,
		entity_id: rawEntityId || null,
		entity_name: entityName,
		entity_type: entityType,
		message
	};
}
