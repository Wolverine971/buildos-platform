// apps/web/src/lib/services/realtimeProject.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

/**
 * Legacy realtime project compatibility shim.
 *
 * The ontology project experience no longer relies on the old project store
 * or legacy projects/tasks/phases realtime channels.
 * This shim keeps the old API surface used by brain-dump navigation while
 * intentionally no-oping legacy subscription behavior.
 */
export class RealtimeProjectService {
	private static initialized = false;

	static async initialize(projectId: string, supabaseClient: SupabaseClient): Promise<void> {
		if (!browser || !projectId || !supabaseClient) {
			this.initialized = false;
			return;
		}

		this.initialized = true;
	}

	static trackLocalUpdate(_entityId: string): void {
		// No-op: retained for backward compatibility with old callers.
	}

	static async cleanup(): Promise<void> {
		this.initialized = false;
	}

	static isInitialized(): boolean {
		return this.initialized;
	}
}
