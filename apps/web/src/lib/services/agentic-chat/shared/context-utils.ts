// apps/web/src/lib/services/agentic-chat/shared/context-utils.ts
import type { ChatContextType } from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AgenticChatContextUtils');

export const VALID_CHAT_CONTEXT_TYPES = [
	'global',
	'project',
	'calendar',
	'daily_brief',
	'project_create',
	'daily_brief_update',
	'brain_dump',
	'ontology'
] as const;

export function normalizeContextType(contextType?: ChatContextType | string): ChatContextType {
	if (!contextType) {
		return 'global';
	}

	if (contextType === 'general') {
		return 'global';
	}

	if (contextType === 'project_audit' || contextType === 'project_forecast') {
		return 'project';
	}

	if ((VALID_CHAT_CONTEXT_TYPES as readonly string[]).includes(contextType)) {
		return contextType as ChatContextType;
	}

	logger.warn(`Invalid context type '${contextType}', defaulting to 'global'`, { contextType });
	return 'global';
}
