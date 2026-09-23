// apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.ts
/**
 * Base Executor - shared infrastructure for CalendarExecutor, the one executor
 * left in this folder (the external tool gateway's CalendarPort):
 * - actor id resolution and caching
 * - admin Supabase client for explicit privileged calendar operations
 * - project access assertions
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { AgenticChatToolAccessPortV1 } from '@buildos/agentic-chat-runtime/tools';
import { createWebAgenticChatToolAccessAdapter } from './web-access-adapter';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { ExecutorContext } from './types';
import type { ActivityLogActorContext } from '$lib/services/async-activity-logger';

export class BaseExecutor {
	protected readonly supabase: SupabaseClient;
	protected readonly userId: string;
	protected readonly sessionId?: string;
	protected readonly activityLogActorContext?: ActivityLogActorContext;

	private readonly actorIdProvider?: ExecutorContext['getActorId'];
	private readonly adminSupabaseProvider?: ExecutorContext['getAdminSupabase'];
	private _actorId?: string;
	private _adminSupabase?: TypedSupabaseClient;
	/** Shared tools access port (S3-T3); preserves the legacy RLS semantics. */
	protected readonly accessAdapter: AgenticChatToolAccessPortV1;

	constructor(context: ExecutorContext) {
		this.supabase = context.supabase;
		this.userId = context.userId;
		this.sessionId = context.sessionId;
		this.activityLogActorContext = context.activityLogActorContext;
		this.actorIdProvider = context.getActorId;
		this.adminSupabaseProvider = context.getAdminSupabase;
		this.accessAdapter = createWebAgenticChatToolAccessAdapter({
			supabase: this.supabase as never,
			getActorId: () => this.getActorId()
		});
	}

	/**
	 * Get or resolve the actor ID for the current user.
	 * Cached after first resolution.
	 */
	protected async getActorId(): Promise<string> {
		const providedActorId = await this.actorIdProvider?.();
		if (providedActorId) {
			return providedActorId;
		}

		if (!this._actorId) {
			this._actorId = await ensureActorId(this.supabase as any, this.userId);
		}
		return this._actorId;
	}

	/**
	 * Get or create the admin Supabase client.
	 * Used for privileged operations.
	 */
	protected getAdminSupabase(): TypedSupabaseClient {
		const providedAdmin = this.adminSupabaseProvider?.();
		if (providedAdmin) {
			return providedAdmin;
		}

		if (!this._adminSupabase) {
			this._adminSupabase = createAdminSupabaseClient();
		}
		return this._adminSupabase;
	}

	/**
	 * Assert that the current user has project access at the required level.
	 *
	 * @param projectId - Project ID to check
	 * @param requiredAccess - Access level required for the operation
	 * @throws Error if project access is denied
	 */
	protected async assertProjectAccess(
		projectId: string,
		requiredAccess: 'read' | 'write' | 'admin' = 'write'
	): Promise<void> {
		await this.accessAdapter.assertProjectAccess(projectId, requiredAccess);
	}
}
