// apps/web/src/lib/services/agentic-chat/shared/context-shift.ts
import { validate as uuidValidate } from 'uuid';
import type { ChatContextType } from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ContextShift');
import type { ServiceContext, ToolExecutionResult } from './types';
import { normalizeContextType } from '../../../../routes/api/agent/stream/utils/context-utils';

export interface ContextShiftData {
	new_context?: ChatContextType | string;
	entity_id?: string;
	entity_name?: string;
	entity_type?: 'project' | 'task' | 'plan' | 'goal' | 'document' | 'output';
	message?: string;
}

/**
 * Extract a context_shift payload from a tool execution result.
 */
export function extractContextShift(result: ToolExecutionResult): ContextShiftData | undefined {
	const data = result.data;

	if (data && typeof data === 'object' && 'context_shift' in data) {
		return data.context_shift as ContextShiftData;
	}

	if (data && typeof data === 'object' && 'result' in data) {
		const nestedResult = (data as Record<string, any>).result;
		if (nestedResult && typeof nestedResult === 'object' && 'context_shift' in nestedResult) {
			return nestedResult.context_shift as ContextShiftData;
		}
	}

	if (
		result.metadata &&
		typeof result.metadata === 'object' &&
		'context_shift' in result.metadata
	) {
		return result.metadata.context_shift as ContextShiftData;
	}

	return undefined;
}

export function normalizeContextShiftEntityId(entityId?: string): string | undefined {
	if (!entityId || typeof entityId !== 'string') {
		return undefined;
	}

	const trimmed = entityId.trim();
	if (!trimmed) {
		return undefined;
	}

	if (!uuidValidate(trimmed)) {
		logger.warn('Invalid context_shift entity_id', { entityId: trimmed });
		return undefined;
	}

	return trimmed;
}

/**
 * Apply a context shift to the shared service context.
 */
export function applyContextShiftToContext(
	context: ServiceContext,
	contextShift: ContextShiftData
): {
	normalizedContext: ChatContextType;
	normalizedEntityId?: string;
	changed: boolean;
} {
	const previousContextType = context.contextType;
	const previousEntityId = context.entityId;

	const normalizedContext = normalizeContextType(
		(contextShift.new_context as ChatContextType) ?? context.contextType
	);
	const normalizedEntityId = normalizeContextShiftEntityId(contextShift.entity_id);

	context.contextType = normalizedContext;
	if (normalizedEntityId) {
		context.entityId = normalizedEntityId;

		const isProjectShift =
			contextShift.entity_type === 'project' || normalizedContext === 'project';
		if (isProjectShift) {
			context.contextScope = {
				...(context.contextScope ?? {}),
				projectId: normalizedEntityId
			};
		}
	}

	const changed =
		previousContextType !== context.contextType ||
		(previousEntityId ?? undefined) !== (normalizedEntityId ?? previousEntityId);

	return {
		normalizedContext,
		normalizedEntityId,
		changed
	};
}
