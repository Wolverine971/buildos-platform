<!-- apps/web/src/lib/components/agent/WorkPanel.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	/**
	 * Work Panel (Agent Work UI-P2, 03 §4): a persistent slide-over inbox of the
	 * user's Agent Runs — Active + History — with a detail view (reuses the rich
	 * run modal). Complements the transient Run Stack cards.
	 */
	import {
		X,
		RefreshCw,
		Bot,
		LoaderCircle,
		Plus,
		CalendarClock,
		Pencil,
		Play,
		Trash2
	} from 'lucide-svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { toastService } from '$lib/stores/toast.store';
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
		agentOperativesLoading,
		agentOperativesStore,
		loadAgentOperatives,
		mergeAgentOperatives,
		removeAgentOperative,
		type AgentOperativeRow
	} from '$lib/stores/agentOperativesStore';
	import {
		synthesizeAgentRunNotification,
		toUiAgentRunStatus
	} from '$lib/services/agent-run-notification-data';
	import AgentRunModalContent from '$lib/components/notifications/types/agent-run/AgentRunModalContent.svelte';
	import AgentRunDispatchModal from '$lib/components/agent/AgentRunDispatchModal.svelte';
	import AgentOperativeEditorModal from '$lib/components/agent/AgentOperativeEditorModal.svelte';
	import type { AgentRunStatus } from '@buildos/shared-types';

	let { open, onClose }: { open: boolean; onClose: () => void } = $props();

	type PanelTab = 'runs' | 'operatives';

	let activeTab = $state<PanelTab>('runs');
	let selectedRunId = $state<string | null>(null);
	let dispatchOpen = $state(false);
	let operativeEditorOpen = $state(false);
	let editingOperative = $state<AgentOperativeRow | null>(null);
	let runningOperativeId = $state<string | null>(null);
	let deletingOperativeId = $state<string | null>(null);
	let loadedForOpen = false;

	// Load on open; keep merging live updates from the realtime store.
	$effect(() => {
		if (open && !loadedForOpen) {
			loadedForOpen = true;
			void loadWorkRuns();
			void loadAgentOperatives();
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
	let operatives = $derived(
		Array.from($agentOperativesStore.values()).sort((a, b) =>
			(a.updated_at ?? '') < (b.updated_at ?? '') ? 1 : -1
		)
	);

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
	function formatOperativeSchedule(operative: AgentOperativeRow): string {
		if (!operative.schedule_enabled) return 'Manual';
		const time = (operative.schedule_time_of_day ?? '').slice(0, 5);
		const base =
			operative.schedule_frequency === 'weekly'
				? `Weekly ${dayLabel(operative.schedule_day_of_week)} ${time}`
				: `Daily ${time}`;
		if (!operative.next_run_at) return base;
		try {
			return `${base} · ${formatDistanceToNow(new Date(operative.next_run_at), {
				addSuffix: true
			})}`;
		} catch {
			return base;
		}
	}
	function dayLabel(value: number | null): string {
		return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][value ?? 1] ?? 'Mon';
	}
	function refreshCurrentTab() {
		if (activeTab === 'operatives') void loadAgentOperatives();
		else void loadWorkRuns();
	}
	function openNewOperative() {
		editingOperative = null;
		operativeEditorOpen = true;
	}
	function openEditOperative(operative: AgentOperativeRow) {
		editingOperative = operative;
		operativeEditorOpen = true;
	}
	function handleRunDispatched(run: AgentRunRow) {
		mergeWorkRuns([run]);
		agentRunsStore.update((current) => {
			const next = new Map(current);
			next.set(run.id, run);
			return next;
		});
		selectedRunId = run.id;
		dispatchOpen = false;
		void loadWorkRuns();
	}
	function handleOperativeSaved(operative: AgentOperativeRow) {
		mergeAgentOperatives([operative]);
		operativeEditorOpen = false;
		editingOperative = null;
	}
	async function runOperative(operative: AgentOperativeRow) {
		if (runningOperativeId) return;
		runningOperativeId = operative.id;
		try {
			const response = await fetch(`/api/agent-operatives/${operative.id}/run`, {
				method: 'POST',
				headers: { accept: 'application/json' }
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				toastService.error(body?.message || body?.error || 'Could not run operative');
				return;
			}
			const run = body?.data?.run as AgentRunRow | undefined;
			if (run) {
				handleRunDispatched(run);
				activeTab = 'runs';
				toastService.success('Agent run queued');
			}
			void loadAgentOperatives();
		} catch (error) {
			console.warn('[WorkPanel] Failed to run operative', error);
			toastService.error('Could not run operative');
		} finally {
			runningOperativeId = null;
		}
	}
	async function deleteOperative(operative: AgentOperativeRow) {
		if (deletingOperativeId) return;
		if (!window.confirm(`Delete "${operative.label}"?`)) return;
		deletingOperativeId = operative.id;
		try {
			const response = await fetch(`/api/agent-operatives/${operative.id}`, {
				method: 'DELETE',
				headers: { accept: 'application/json' }
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				toastService.error(body?.message || body?.error || 'Could not delete operative');
				return;
			}
			removeAgentOperative(operative.id);
			toastService.success('Operative deleted');
		} catch (error) {
			console.warn('[WorkPanel] Failed to delete operative', error);
			toastService.error('Could not delete operative');
		} finally {
			deletingOperativeId = null;
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
					title={activeTab === 'runs' ? 'Run agent' : 'New operative'}
					aria-label={activeTab === 'runs' ? 'Run agent' : 'New operative'}
					onclick={() =>
						activeTab === 'runs' ? (dispatchOpen = true) : openNewOperative()}
				>
					<Plus class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					title="Refresh"
					onclick={refreshCurrentTab}
				>
					{#if $workRunsLoading || $agentOperativesLoading}
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

		<div class="border-b border-border px-3 py-2">
			<div class="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1">
				<button
					type="button"
					class="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors {activeTab ===
					'runs'
						? 'bg-card text-foreground shadow-ink'
						: 'text-muted-foreground hover:bg-background hover:text-foreground'}"
					aria-pressed={activeTab === 'runs'}
					onclick={() => (activeTab = 'runs')}
				>
					<Bot class="h-4 w-4" />
					<span>Runs</span>
				</button>
				<button
					type="button"
					class="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors {activeTab ===
					'operatives'
						? 'bg-card text-foreground shadow-ink'
						: 'text-muted-foreground hover:bg-background hover:text-foreground'}"
					aria-pressed={activeTab === 'operatives'}
					onclick={() => (activeTab = 'operatives')}
				>
					<CalendarClock class="h-4 w-4" />
					<span>Operatives</span>
				</button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-3 py-3">
			{#if activeTab === 'runs' && runs.length === 0}
				<div class="px-2 py-10 text-center text-sm text-muted-foreground">
					{$workRunsLoading ? 'Loading…' : 'No agent runs yet.'}
				</div>
			{:else if activeTab === 'runs'}
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
			{:else if operatives.length === 0}
				<div class="px-2 py-10 text-center text-sm text-muted-foreground">
					{$agentOperativesLoading ? 'Loading...' : 'No operatives yet.'}
				</div>
			{:else}
				<div class="space-y-1.5">
					{#each operatives as operative (operative.id)}
						<div
							class="rounded-lg border border-border bg-background px-3 py-2 transition-shadow hover:shadow-ink"
						>
							<div class="flex items-start gap-2">
								<button
									type="button"
									class="min-w-0 flex-1 text-left"
									onclick={() => openEditOperative(operative)}
								>
									<div class="flex min-w-0 items-center gap-2">
										<span
											class="h-2 w-2 flex-shrink-0 rounded-full {operative.schedule_enabled
												? 'bg-info'
												: 'bg-muted-foreground'}"
										></span>
										<span
											class="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
										>
											{operative.label}
										</span>
									</div>
									<div class="mt-0.5 truncate text-xs text-muted-foreground">
										{operative.goal}
									</div>
									<div
										class="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
									>
										<span class="capitalize"
											>{operative.scope_mode.replace('_', ' ')}</span
										>
										<span>·</span>
										<span class="truncate"
											>{formatOperativeSchedule(operative)}</span
										>
									</div>
									{#if operative.schedule_error}
										<div class="mt-1 truncate text-[11px] text-destructive">
											{operative.schedule_error}
										</div>
									{/if}
								</button>
								<div class="flex flex-shrink-0 items-center gap-0.5">
									<button
										type="button"
										class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
										title="Run"
										aria-label={`Run ${operative.label}`}
										disabled={Boolean(
											runningOperativeId || deletingOperativeId
										)}
										onclick={() => runOperative(operative)}
									>
										{#if runningOperativeId === operative.id}
											<LoaderCircle class="h-4 w-4 animate-spin" />
										{:else}
											<Play class="h-4 w-4" />
										{/if}
									</button>
									<button
										type="button"
										class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
										title="Edit"
										aria-label={`Edit ${operative.label}`}
										onclick={() => openEditOperative(operative)}
									>
										<Pencil class="h-4 w-4" />
									</button>
									<button
										type="button"
										class="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
										title="Delete"
										aria-label={`Delete ${operative.label}`}
										disabled={Boolean(
											runningOperativeId || deletingOperativeId
										)}
										onclick={() => deleteOperative(operative)}
									>
										{#if deletingOperativeId === operative.id}
											<LoaderCircle class="h-4 w-4 animate-spin" />
										{:else}
											<Trash2 class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
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

	<AgentRunDispatchModal
		isOpen={dispatchOpen}
		onClose={() => (dispatchOpen = false)}
		onDispatched={handleRunDispatched}
	/>

	<AgentOperativeEditorModal
		isOpen={operativeEditorOpen}
		operative={editingOperative}
		onClose={() => {
			operativeEditorOpen = false;
			editingOperative = null;
		}}
		onSaved={handleOperativeSaved}
	/>
{/if}
