// apps/web/src/lib/services/agentic-chat-v2/scope.ts
import type { ChatContextType, ProjectFocus } from '@buildos/shared-types';

export type AgenticChatRpcContextType = 'global' | 'project';

export type AgenticChatProjectFocusInput = {
	focusType?: ProjectFocus['focusType'] | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	projectId?: string | null;
	projectName?: string | null;
};

export type AgenticChatScopeInput = {
	contextType?: ChatContextType | string | null;
	entityId?: string | null;
	projectFocus?: AgenticChatProjectFocusInput | null;
};

const KNOWN_CONTEXT_TYPES = new Set<string>([
	'global',
	'project',
	'calendar',
	'daily_brief',
	'general',
	'project_create',
	'daily_brief_update',
	'ontology'
]);

function trimOptionalString(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function normalizeAgenticChatContextType(
	input?: ChatContextType | string | null
): ChatContextType {
	if (!input) return 'global';
	if (input === 'general') return 'global';
	if (input === 'project_audit' || input === 'project_forecast') return 'project';
	return input as ChatContextType;
}

export const normalizeFastContextType = normalizeAgenticChatContextType;

export function isAgenticChatContextType(input: unknown): input is ChatContextType {
	return typeof input === 'string' && KNOWN_CONTEXT_TYPES.has(input);
}

export function isProjectScopedContext(
	contextType: ChatContextType | string | null | undefined
): boolean {
	return normalizeAgenticChatContextType(contextType) === 'project';
}

export function resolveEffectiveEntityId(params: AgenticChatScopeInput): string | null {
	const focusProjectId = trimOptionalString(params.projectFocus?.projectId);
	if (isProjectScopedContext(params.contextType) && focusProjectId) {
		return focusProjectId;
	}
	return trimOptionalString(params.entityId) ?? focusProjectId;
}

export function resolveEffectiveProjectId(params: AgenticChatScopeInput): string | null {
	const focusProjectId = trimOptionalString(params.projectFocus?.projectId);
	if (focusProjectId) return focusProjectId;
	return isProjectScopedContext(params.contextType) ? trimOptionalString(params.entityId) : null;
}

export function resolveRpcContextType(
	params: AgenticChatScopeInput
): AgenticChatRpcContextType | null {
	const contextType = normalizeAgenticChatContextType(params.contextType);
	if (contextType === 'global') return 'global';
	if (isProjectScopedContext(contextType)) return 'project';
	if (contextType === 'ontology' && trimOptionalString(params.projectFocus?.projectId)) {
		return 'project';
	}
	return null;
}

export function buildProjectWideFocus(
	projectId: string,
	projectName?: string | null
): ProjectFocus {
	return {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
		projectId,
		projectName: projectName ?? 'Project'
	};
}

export function normalizeProjectFocus(
	focus?: AgenticChatProjectFocusInput | null
): ProjectFocus | null {
	const projectId = trimOptionalString(focus?.projectId);
	if (!focus || !projectId) return null;
	return {
		focusType: focus.focusType ?? 'project-wide',
		focusEntityId: focus.focusEntityId ?? null,
		focusEntityName: focus.focusEntityName ?? null,
		projectId,
		projectName: focus.projectName ?? 'Project'
	};
}

export function buildAgenticChatContextCacheKeyInput(params: AgenticChatScopeInput): {
	contextType: ChatContextType;
	entityId: string | null;
	projectFocus: AgenticChatProjectFocusInput | null;
} {
	return {
		contextType: normalizeAgenticChatContextType(params.contextType),
		entityId: params.entityId ?? null,
		projectFocus: params.projectFocus ?? null
	};
}
