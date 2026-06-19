<!-- apps/web/src/lib/components/agent/WorkPanel.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	/**
	 * Work Panel (Agent Work UI-P2, 03 §4): a persistent slide-over inbox of the
	 * user's Agent Runs — Active + History — with a detail view (reuses the rich
	 * run modal). Complements the transient Run Stack cards.
	 */
	import { X, RefreshCw, Bot, LoaderCircle } from 'lucide-svelte';
	import { formatDistanceToNow } from 'date-fns';
	import {
		agentRunsStore,
		isActiveAgentRunStatus,
		type AgentRunRow
	} from '$lib/services/agentRunsRealtime.service';
	import {
		workRunsStore,
		workRunsLoading,
		loadWorkRuns,
		mergeWorkRuns
	} from '$lib/stores/workRunsStore';
	import {
		synthesizeAgentRunNotification,
		toUiAgentRunStatus
	} from '$lib/services/agent-run-notification-data';
	import AgentRunModalContent from '$lib/components/notifications/types/agent-run/AgentRunModalContent.svelte';
	import type { AgentRunStatus } from '@buildos/shared-types';

	let { open, onClose }: { open: boolean; onClose: () => void } = $props();

	let selectedRunId = $state<string | null>(null);
	let loadedForOpen = false;

	// Load on open; keep merging live updates from the realtime store.
	$effect(() => {
		if (open && !loadedForOpen) {
			loadedForOpen = true;
			void loadWorkRuns();
		}
		if (!open) loadedForOpen = false;
	});
	$effect(() => {
		const live = $agentRunsStore;
		if (live.size) mergeWorkRuns(live.values());
	});

	let runs = $derived(
		Array.from($workRunsStore.values()).sort((a, b) =>
			(a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1
		)
	);
	let activeRuns = $derived(runs.filter((r) => isActiveAgentRunStatus(r.status)));
	let historyRuns = $derived(runs.filter((r) => !isActiveAgentRunStatus(r.status)));

	let selectedRun = $derived(selectedRunId ? ($workRunsStore.get(selectedRunId) ?? null) : null);
	let selectedNotification = $derived(
		selectedRun ? synthesizeAgentRunNotification(selectedRun) : null
	);

	const DOT: Record<string, string> = {
		success: 'bg-success',
		warning: 'bg-warning',
		error: 'bg-destructive',
		cancelled: 'bg-muted-foreground',
		processing: 'bg-info'
	};
	function dotClass(status: AgentRunStatus): string {
		return DOT[toUiAgentRunStatus(status)] ?? 'bg-muted-foreground';
	}
	function needsYou(status: AgentRunStatus): boolean {
		return status === 'needs_input' || status === 'proposal_ready';
	}
	function entityCount(run: AgentRunRow): number {
		const r = run.result as { entities_touched?: unknown[] } | null;
		return Array.isArray(r?.entities_touched) ? r.entities_touched.length : 0;
	}
	function relTime(run: AgentRunRow): string {
		const t = run.completed_at ?? run.started_at ?? run.created_at;
		try {
			return t ? formatDistanceToNow(new Date(t), { addSuffix: true }) : '';
		} catch {
			return '';
		}
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
		role="button"
		tabindex="-1"
		aria-label="Close work panel"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
	></div>

	<!-- Slide-over -->
	<aside
		class="fixed right-0 top-0 z-[61] flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-ink-strong sm:w-[28rem]"
		aria-label="Work panel"
	>
		<header class="flex items-center justify-between border-b border-border px-4 py-3">
			<div class="flex items-center gap-2">
				<Bot class="h-5 w-5 text-foreground" />
				<span class="text-sm font-semibold text-foreground">Work</span>
				{#if activeRuns.length}
					<span
						class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
					>
						{activeRuns.length} active
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Refresh"
					onclick={() => loadWorkRuns()}
				>
					{#if $workRunsLoading}
						<LoaderCircle class="h-4 w-4 animate-spin" />
					{:else}
						<RefreshCw class="h-4 w-4" />
					{/if}
				</button>
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Close"
					onclick={onClose}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</header>

		<div class="flex-1 overflow-y-auto px-3 py-3">
			{#if runs.length === 0}
				<div class="px-2 py-10 text-center text-sm text-muted-foreground">
					{$workRunsLoading ? 'Loading…' : 'No agent runs yet.'}
				</div>
			{:else}
				{#snippet runRow(run: AgentRunRow)}
					<button
						type="button"
						class="w-full rounded-lg border border-border bg-background px-3 py-2 text-left transition-shadow hover:shadow-ink"
						onclick={() => (selectedRunId = run.id)}
					>
						<div class="flex items-center gap-2">
							<span class="h-2 w-2 flex-shrink-0 rounded-full {dotClass(run.status)}"
							></span>
							<span
								class="flex-1 min-w-0 truncate text-sm font-medium text-foreground"
								>{run.label}</span
							>
							{#if needsYou(run.status)}
								<span
									class="flex-shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
									>needs you</span
								>
							{/if}
						</div>
						<div class="mt-0.5 truncate text-xs text-muted-foreground">{run.goal}</div>
						<div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
							<span class="capitalize">{run.trigger}</span>
							<span>·</span>
							<span>{relTime(run)}</span>
							{#if entityCount(run) > 0}
								<span>·</span>
								<span
									>{entityCount(run)} change{entityCount(run) === 1
										? ''
										: 's'}</span
								>
							{/if}
						</div>
					</button>
				{/snippet}

				{#if activeRuns.length}
					<div
						class="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						Active
					</div>
					<div class="mb-4 space-y-1.5">
						{#each activeRuns as run (run.id)}
							{@render runRow(run)}
						{/each}
					</div>
				{/if}

				{#if historyRuns.length}
					<div
						class="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						History
					</div>
					<div class="space-y-1.5">
						{#each historyRuns as run (run.id)}
							{@render runRow(run)}
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</aside>

	<!-- Detail (reuses the rich run modal, rendered above the panel) -->
	{#if selectedNotification}
		<AgentRunModalContent
			notification={selectedNotification}
			onMinimize={() => (selectedRunId = null)}
			onClose={() => (selectedRunId = null)}
			onCancel={() => (selectedRunId = null)}
		/>
	{/if}
{/if}
