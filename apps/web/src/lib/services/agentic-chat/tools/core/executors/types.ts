// apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts
/**
 * Context for the calendar executor, the one executor left in this folder. The
 * external tool gateway builds it as the gateway's CalendarPort.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { ActivityLogActorContext } from '$lib/services/async-activity-logger';

export interface ExecutorContext {
	supabase: SupabaseClient;
	userId: string;
	sessionId?: string;
	/** Optional providers; BaseExecutor resolves these from the session when omitted. */
	getActorId?: () => Promise<string>;
	getAdminSupabase?: () => TypedSupabaseClient;
	activityLogActorContext?: ActivityLogActorContext;
	/**
	 * Accepted for the callers that still pass them; the calendar executor makes
	 * no HTTP self-calls, so none of these are read.
	 */
	fetchFn?: typeof fetch;
	getAuthHeaders?: () => Promise<HeadersInit>;
	llmService?: SmartLLMService;
	abortSignal?: AbortSignal;
}
