// apps/web/src/lib/services/agentRunsRealtime.service.ts
//
// Realtime source for Agent Work "Run Stack" cards (03 Monitoring UI, UI-P1).
//
// Maintains a store of the user's recent Agent Runs and keeps it fresh from two
// sources:
//   1. postgres_changes on `agent_runs` (user-filtered) — instant, best-effort.
//      The `supabase_realtime` publication is dashboard-managed, so this may be
//      absent until `agent_runs` is added to it (see the migration shipped with
//      this feature). The polling fallback below makes that non-fatal.
//   2. A lightweight polling fallback against GET /api/agent-runs — the reliable
//      backbone. Captures terminal transitions even when postgres_changes is off.
//
// The store is consumed by `agent-run-notification.bridge.ts`, which owns the
// surfacing logic (which runs become Run Stack cards and when).
//
// Per-run narration (agent_run_events) is streamed on demand by the detail modal
// via the migration-wired broadcast topic `agent-run:<run_id>` — see
// AgentRunModalContent.svelte. This service only tracks the run rows.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { AgentRunStatus } from '@buildos/shared-types';

type AgentRunProjectSummary = {
	id: string;
	name: string | null;
};

/**
 * The list endpoint enriches run rows with their owning project so compact
 * notification cards can identify the work at a glance. Realtime payloads are
 * raw table rows, so `project` remains optional and is preserved while those
 * payloads merge into the polled row.
 */
export type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'] & {
	project?: AgentRunProjectSummary | AgentRunProjectSummary[] | null;
};

const ACTIVE_STATUSES: ReadonlySet<AgentRunStatus> = new Set<AgentRunStatus>([
	'queued',
	'running',
	'paused',
	'needs_input',
	'proposal_ready'
]);

export function isActiveAgentRunStatus(status: AgentRunStatus): boolean {
	return ACTIVE_STATUSES.has(status);
}

const WORKING_STATUSES: ReadonlySet<AgentRunStatus> = new Set<AgentRunStatus>([
	'queued',
	'running',
	'paused'
]);

/** Map of runId → latest run row, for runs the client is currently tracking. */
export const agentRunsStore = writable<Map<string, AgentRunRow>>(new Map());

/** All non-terminal runs, including runs waiting for input or proposal review. */
export const activeAgentRunCount = derived(agentRunsStore, ($runs) => {
	let count = 0;
	for (const run of $runs.values()) {
		if (isActiveAgentRunStatus(run.status)) count += 1;
	}
	return count;
});

/** Runs that are genuinely executing or paused mid-execution. */
export const workingAgentRunCount = derived(agentRunsStore, ($runs) => {
	let count = 0;
	for (const run of $runs.values()) {
		if (WORKING_STATUSES.has(run.status)) count += 1;
	}
	return count;
});

/** Runs blocked on an answer; proposal review belongs to AI Inbox instead. */
export const agentRunNeedsInputCount = derived(agentRunsStore, ($runs) => {
	let count = 0;
	for (const run of $runs.values()) {
		if (run.status === 'needs_input') count += 1;
	}
	return count;
});

/** Work-panel attention count, deliberately excluding proposal-ready reviews. */
export const agentWorkAttentionCount = derived(
	[workingAgentRunCount, agentRunNeedsInputCount],
	([$working, $needsInput]) => $working + $needsInput
);

const POLL_INTERVAL_MS = 6000;
// Drop terminal rows the bridge has had time to render, so the store does not
// grow unbounded with history. The bridge auto-minimizes/dismisses on its own
// timeline; this is just memory hygiene.
const TERMINAL_RETENTION_MS = 60_000;

interface ServiceState {
	channel: RealtimeChannel | null;
	userId: string | null;
	supabaseClient: SupabaseClient | null;
	isSubscribed: boolean;
	realtimeHealthy: boolean;
	pollTimer: ReturnType<typeof setInterval> | null;
	/** Counts poll ticks skipped while idle (adaptive cadence). */
	idleSkips: number;
	/** runId → epoch ms when it was first observed in a terminal status. */
	terminalSince: Map<string, number>;
}

export class AgentRunsRealtimeService {
	private static state: ServiceState = {
		channel: null,
		userId: null,
		supabaseClient: null,
		isSubscribed: false,
		realtimeHealthy: false,
		pollTimer: null,
		idleSkips: 0,
		terminalSince: new Map()
	};

	static isInitialized(): boolean {
		return this.state.userId !== null;
	}

	static async initialize(userId: string, supabaseClient: SupabaseClient): Promise<void> {
		if (!browser || !userId || !supabaseClient) return;

		// Already tracking this user — nothing to do.
		if (this.state.userId === userId && this.state.supabaseClient) return;

		await this.cleanup();

		this.state.userId = userId;
		this.state.supabaseClient = supabaseClient;

		// Seed immediately so existing in-flight runs surface on load, then set up
		// the realtime channel + polling fallback.
		await this.refresh();
		await this.setupSubscription();
		this.startPolling();
	}

	private static async setupSubscription(): Promise<void> {
		const { supabaseClient, userId } = this.state;
		if (!supabaseClient || !userId) return;

		try {
			const channel = supabaseClient.channel(`agent-runs:${userId}`);
			channel.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'agent_runs',
					filter: `user_id=eq.${userId}`
				},
				(payload) => this.handleRowChange(payload)
			);

			await channel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					this.state.isSubscribed = true;
					this.state.realtimeHealthy = true;
				} else if (
					status === 'CHANNEL_ERROR' ||
					status === 'TIMED_OUT' ||
					status === 'CLOSED'
				) {
					this.state.isSubscribed = false;
					this.state.realtimeHealthy = false;
				}
			});

			this.state.channel = channel;
		} catch (error) {
			console.error('[AgentRunsRealtime] Failed to subscribe to agent_runs changes', error);
			this.state.realtimeHealthy = false;
		}
	}

	private static handleRowChange(payload: {
		eventType?: string;
		new?: Partial<AgentRunRow> | null;
		old?: Partial<AgentRunRow> | null;
	}): void {
		const { eventType } = payload;
		if (eventType === 'DELETE') {
			const oldId = payload.old?.id;
			if (oldId) this.removeRun(oldId);
			return;
		}
		const row = payload.new as AgentRunRow | undefined;
		if (row?.id) {
			const current = get(agentRunsStore).get(row.id);
			this.upsertRun(row);
			// A brand-new realtime row does not carry its project relationship.
			// Refresh immediately instead of waiting for the next poll so the
			// incoming card gains its project name almost at once.
			if (row.project_id && !current) void this.refresh();
		}
	}

	private static startPolling(): void {
		this.stopPolling();
		this.state.pollTimer = setInterval(() => {
			void this.poll();
		}, POLL_INTERVAL_MS);
	}

	private static stopPolling(): void {
		if (this.state.pollTimer) {
			clearInterval(this.state.pollTimer);
			this.state.pollTimer = null;
		}
	}

	/**
	 * Periodic safety net — the reliable backbone. We poll unconditionally
	 * (never gated on realtime "health"): a SUBSCRIBED postgres_changes channel
	 * does NOT guarantee `agent_runs` is actually in the realtime publication, so
	 * new runs could otherwise never surface. Cadence is adaptive: every tick
	 * while runs are in flight, every 3rd tick (~18s) when idle to stay cheap
	 * while still catching newly dispatched runs.
	 */
	private static async poll(): Promise<void> {
		const hasActive = get(activeAgentRunCount) > 0;
		if (hasActive) {
			this.state.idleSkips = 0;
		} else {
			this.state.idleSkips = (this.state.idleSkips + 1) % 3;
			if (this.state.idleSkips !== 0) {
				this.pruneTerminal();
				return;
			}
		}
		await this.refresh();
	}

	/** Fetch the recent run window and merge it into the store. */
	private static async refresh(): Promise<void> {
		try {
			const response = await fetch('/api/agent-runs?limit=25', {
				headers: { accept: 'application/json' }
			});
			if (!response.ok) return;
			const result = await response.json().catch(() => null);
			const runs: AgentRunRow[] = result?.data?.runs ?? [];
			this.mergeRuns(runs);
		} catch (error) {
			console.warn('[AgentRunsRealtime] Poll refresh failed', error);
		}
	}

	private static mergeRuns(runs: AgentRunRow[]): void {
		if (!runs.length) {
			this.pruneTerminal();
			return;
		}
		agentRunsStore.update((current) => {
			const next = new Map(current);
			for (const run of runs) {
				if (!run?.id) continue;
				next.set(run.id, this.mergeRunRow(next.get(run.id), run));
				this.trackTerminal(run);
			}
			return next;
		});
		this.pruneTerminal();
	}

	private static upsertRun(run: AgentRunRow): void {
		agentRunsStore.update((current) => {
			const next = new Map(current);
			next.set(run.id, this.mergeRunRow(next.get(run.id), run));
			return next;
		});
		this.trackTerminal(run);
		this.pruneTerminal();
	}

	private static mergeRunRow(
		current: AgentRunRow | undefined,
		incoming: AgentRunRow
	): AgentRunRow {
		if (!current) return incoming;
		return {
			...current,
			...incoming,
			project: Object.prototype.hasOwnProperty.call(incoming, 'project')
				? incoming.project
				: current.project
		};
	}

	private static removeRun(id: string): void {
		agentRunsStore.update((current) => {
			if (!current.has(id)) return current;
			const next = new Map(current);
			next.delete(id);
			return next;
		});
		this.state.terminalSince.delete(id);
	}

	private static trackTerminal(run: AgentRunRow): void {
		if (isActiveAgentRunStatus(run.status)) {
			this.state.terminalSince.delete(run.id);
		} else if (!this.state.terminalSince.has(run.id)) {
			this.state.terminalSince.set(run.id, Date.now());
		}
	}

	/** Evict terminal rows older than the retention window from the store. */
	private static pruneTerminal(): void {
		if (this.state.terminalSince.size === 0) return;
		const now = Date.now();
		const expired: string[] = [];
		for (const [id, since] of this.state.terminalSince) {
			if (now - since >= TERMINAL_RETENTION_MS) expired.push(id);
		}
		if (expired.length === 0) return;

		agentRunsStore.update((current) => {
			let mutated = false;
			const next = new Map(current);
			for (const id of expired) {
				if (next.delete(id)) mutated = true;
				this.state.terminalSince.delete(id);
			}
			return mutated ? next : current;
		});
	}

	static async cleanup(): Promise<void> {
		this.stopPolling();
		if (this.state.channel && this.state.supabaseClient) {
			try {
				await this.state.supabaseClient.removeChannel(this.state.channel);
			} catch (error) {
				console.warn('[AgentRunsRealtime] Failed to remove channel', error);
			}
		}
		this.state = {
			channel: null,
			userId: null,
			supabaseClient: null,
			isSubscribed: false,
			realtimeHealthy: false,
			pollTimer: null,
			idleSkips: 0,
			terminalSince: new Map()
		};
		agentRunsStore.set(new Map());
	}
}
