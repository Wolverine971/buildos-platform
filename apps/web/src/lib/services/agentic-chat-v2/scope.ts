// apps/web/src/lib/services/agentic-chat-v2/scope.ts
// Shared implementation for web admission and worker context preparation.
export {
	type AgenticChatRpcContextType,
	type AgenticChatProjectFocusInput,
	type AgenticChatScopeInput,
	normalizeAgenticChatContextType,
	normalizeFastContextType,
	isAgenticChatContextType,
	isProjectScopedContext,
	resolveEffectiveEntityId,
	resolveEffectiveProjectId,
	resolveRpcContextType,
	buildProjectWideFocus,
	normalizeProjectFocus,
	buildAgenticChatContextCacheKeyInput
} from '@buildos/agentic-chat-runtime/context';
