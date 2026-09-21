// packages/agentic-chat-runtime/src/context/prompt-context.ts
// Shared loaded-context contract. Prompt rendering stays in its host.
import type { ChatContextType } from '@buildos/shared-types';

export type MasterPromptContext = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	contextLoadSource?:
		| 'rpc'
		| 'rpc_null_fallback'
		| 'rpc_error_fallback'
		| 'fallback'
		| 'none'
		| 'unknown_cached';
	/**
	 * IANA zone the prompt clock renders in (from `users.timezone`). Loaders
	 * always set it; absent/invalid values fall back to UTC at render time.
	 */
	timezone?: string | null;
	/**
	 * The signed-in user's display name (from `users.name`, trimmed), rendered
	 * on the prompt's identity line. Loaded alongside the timezone in the same
	 * query; null when the profile has no name or the lookup failed.
	 */
	userDisplayName?: string | null;
	conversationSummary?: string | null;
	entityResolutionHint?: string | null;
	data?: Record<string, unknown> | string | null;
};
