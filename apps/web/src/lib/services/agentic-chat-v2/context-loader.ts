// apps/web/src/lib/services/agentic-chat-v2/context-loader.ts
import { createFastChatContextLoader } from '@buildos/agentic-chat-runtime/context/loader';
import { createLogger } from '$lib/utils/logger';

export type { FastChatContextLoadSource } from '@buildos/agentic-chat-runtime/context';

// Keep logging host-specific; data loading and its access/fallback rules are shared.
export const { loadFastChatPromptContext } = createFastChatContextLoader({
	logger: createLogger('FastChatContext')
});
