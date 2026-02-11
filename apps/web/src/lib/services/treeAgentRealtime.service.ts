// apps/web/src/lib/services/treeAgentRealtime.service.ts
import { browser } from '$app/environment';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { normalizeTreeAgentEvent, type TreeAgentEventRow } from '@buildos/shared-types';
import { treeAgentGraphStore } from '$lib/stores/treeAgentGraph.store';

interface TreeAgentRealtimeState {
	channel: RealtimeChannel | null;
	runId: string | null;
	isSubscribed: boolean;
	supabaseClient: SupabaseClient | null;
}

export class TreeAgentRealtimeService {
	private static state: TreeAgentRealtimeState = {
		channel: null,
		runId: null,
		isSubscribed: false,
		supabaseClient: null
	};

	static async initialize(runId: string, supabaseClient: SupabaseClient): Promise<void> {
		if (!browser || !runId || !supabaseClient) return;

		if (this.state.isSubscribed && this.state.runId === runId) {
			return;
		}

		await this.cleanup();

		this.state.runId = runId;
		this.state.supabaseClient = supabaseClient;

		await this.setupSubscription();
	}

	static async cleanup(): Promise<void> {
		if (this.state.channel) {
			try {
				await this.state.channel.unsubscribe();
			} catch (error) {
				console.warn('[TreeAgentRealtime] Failed to unsubscribe channel', error);
			}
		}

		this.state = {
			channel: null,
			runId: null,
			isSubscribed: false,
			supabaseClient: null
		};
	}

	private static async setupSubscription(): Promise<void> {
		const { supabaseClient, runId } = this.state;
		if (!supabaseClient || !runId) return;

		try {
			// Private channels require an access token when Realtime Authorization is enabled.
			const {
				data: { session }
			} = await supabaseClient.auth.getSession();
			if (session?.access_token) {
				supabaseClient.realtime.setAuth(session.access_token);
			}

			const topic = `tree-agent:run:${runId}`;
			const channel = supabaseClient.channel(topic, {
				config: { private: true }
			});

			channel.on('broadcast', { event: 'tree-event' }, (payload) => {
				this.handleBroadcastPayload(payload);
			});

			const subscription = await channel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					this.state.isSubscribed = true;
					console.log(`[TreeAgentRealtime] Subscribed to ${topic}`);
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					this.state.isSubscribed = false;
					console.error(`[TreeAgentRealtime] Subscription error: ${status}`);
				}
			});

			if ((subscription as any) === 'error' || (subscription as any) === 'timed_out') {
				throw new Error(`Tree Agent realtime subscription failed: ${subscription}`);
			}

			this.state.channel = channel;
		} catch (error) {
			console.error('[TreeAgentRealtime] Error setting up subscription', error);
		}
	}

	private static handleBroadcastPayload(payload: unknown): void {
		// broadcast_changes payload shape nests the record under payload.record.
		const record =
			(payload as any)?.payload?.record ??
			(payload as any)?.record ??
			(payload as any)?.payload?.new ??
			null;
		if (!record) return;

		const normalized = normalizeTreeAgentEvent(record as TreeAgentEventRow);
		if (!normalized) return;

		treeAgentGraphStore.applyEvent(normalized);
	}
}
