<!-- apps/web/src/lib/components/project/ProjectInboxPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Check,
		ClipboardCheck,
		FileText,
		Inbox,
		LoaderCircle,
		RefreshCw,
		Sparkles,
		X
	} from 'lucide-svelte';
	import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import ChangeSetReview from '$lib/components/notifications/types/agent-run/ChangeSetReview.svelte';
	import type {
		ChangeSet,
		ProjectLoopRun,
		ProjectSuggestion,
		ProjectSuggestionEvidenceRef,
		ProjectSuggestionResult
	} from '@buildos/shared-types';

	type InboxSourceType = 'agent_run' | 'project_suggestion' | 'calendar_suggestion';
	type InboxItemStatus = 'pending' | 'deciding' | 'decided' | 'blocked' | 'expired' | 'snoozed';

	type InboxItem = {
		id: string;
		source_type: InboxSourceType;
		source_ref_id: string;
		source_status: string | null;
		status: InboxItemStatus;
		title: string;
		summary: string | null;
		risk_tier: number | null;
		created_at: string;
		can_decide?: boolean;
		decision_disabled_reason?: string | null;
		source_payload?: Record<string, unknown> | null;
	};

	type InboxPayload = {
		items?: InboxItem[];
		repairedCount?: number;
		backfilledCount?: number;
	};

	type LoopPayload = {
		runs: ProjectLoopRun[];
		latestRun: ProjectLoopRun | null;
	};

	type AgentRunPayload = {
		goal?: string | null;
		label?: string | null;
		change_set?: ChangeSet | null;
	};

	let {
		projectId,
		canEdit = false,
		onCountChange
	}: {
		projectId: string;
		canEdit?: boolean;
		onCountChange?: (count: number) => void;
	} = $props();

	let items = $state<InboxItem[]>([]);
	let latestRun = $state<ProjectLoopRun | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let triggering = $state(false);
	let pendingIds = $state<Set<string>>(new Set());
	let pollingRunId = $state<string | null>(null);

	const POLL_INTERVAL_MS = 2500;
	const MAX_POLL_MS = 2 * 60 * 1000;
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	const notifiedRunIds = new Set<string>();

	const runActive = $derived(isRunActive(latestRun));

	type TierMeta = { label: string; cls: string };
	const tierMeta: Record<number, TierMeta> = {
		1: { label: 'Low risk', cls: 'border-accent/30 bg-accent/10 text-accent' },
		2: { label: 'Review', cls: 'border-warning/30 bg-warning/10 text-warning' },
		3: {
			label: 'High risk',
			cls: 'border-destructive/30 bg-destructive/10 text-destructive'
		}
	};
	const fallbackTier: TierMeta = {
		label: 'Review',
		cls: 'border-border bg-muted text-muted-foreground'
	};

	const kindLabel: Record<string, string> = {
		doc_org: 'Organize',
		doc_outdated: 'Outdated',
		drift: 'Drift',
		task_conflict: 'Conflict'
	};

	const evidenceTypeLabel: Record<string, string> = {
		project: 'Project',
		goal: 'Goal',
		document: 'Doc',
		task: 'Task',
		calendar_event: 'Event',
		external: 'Source',
		unknown: 'Source'
	};

	function isRunActive(run: ProjectLoopRun | null | undefined): boolean {
		return run?.status === 'queued' || run?.status === 'running';
	}

	function clearPoll() {
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
		pollingRunId = null;
	}

	function tierFor(value: number | null | undefined): TierMeta {
		if (!value) return fallbackTier;
		return tierMeta[value] ?? fallbackTier;
	}

	function asRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	}

	function sourcePayload<T extends Record<string, unknown>>(item: InboxItem): T | null {
		return asRecord(item.source_payload) as T | null;
	}

	function arrayValue<T>(value: unknown): T[] {
		return Array.isArray(value) ? (value as T[]) : [];
	}

	function projectSuggestion(item: InboxItem): ProjectSuggestion | null {
		return sourcePayload<ProjectSuggestion & Record<string, unknown>>(item);
	}

	function agentRun(item: InboxItem): AgentRunPayload | null {
		return sourcePayload<AgentRunPayload & Record<string, unknown>>(item);
	}

	function agentChangeSet(item: InboxItem): ChangeSet | null {
		if (item.source_type !== 'agent_run') return null;
		const changeSet = agentRun(item)?.change_set;
		if (!changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0) {
			return null;
		}
		return changeSet;
	}

	function evidenceLabel(ref: ProjectSuggestionEvidenceRef): string {
		return `${evidenceTypeLabel[ref.entity_type] ?? 'Source'}: ${ref.title}`;
	}

	function sourceLabel(item: InboxItem): string {
		if (item.source_type === 'agent_run') return 'Agent proposal';
		if (item.source_type === 'calendar_suggestion') return 'Calendar suggestion';
		return 'Project review';
	}

	function sourceIcon(item: InboxItem): typeof Inbox {
		if (item.source_type === 'agent_run') return Sparkles;
		if (item.source_type === 'project_suggestion') return ClipboardCheck;
		return FileText;
	}

	function changeCount(item: InboxItem): number {
		if (item.source_type === 'project_suggestion') {
			return arrayValue(projectSuggestion(item)?.operations).length;
		}
		if (item.source_type === 'agent_run') {
			return arrayValue(agentRun(item)?.change_set?.changes).length;
		}
		return 0;
	}

	function canDecide(item: InboxItem): boolean {
		return canEdit && item.status === 'pending' && item.can_decide !== false;
	}

	function completionMessage(run: ProjectLoopRun, itemCount: number): string {
		if (run.status === 'waiting_review') {
			return `Project review finished - ${itemCount} item${itemCount === 1 ? '' : 's'} ready.`;
		}
		if (run.status === 'completed') return run.summary ?? 'Project review finished.';
		if (run.status === 'failed') return run.error_message ?? 'Project review failed.';
		return run.summary ?? 'Project review updated.';
	}

	function notifyRunFinished(run: ProjectLoopRun, itemCount: number) {
		if (notifiedRunIds.has(run.id)) return;
		notifiedRunIds.add(run.id);
		if (run.status === 'failed') toastService.error(completionMessage(run, itemCount));
		else toastService.success(completionMessage(run, itemCount));
	}

	async function loadLoopState(): Promise<LoopPayload | null> {
		if (!PROJECT_LOOPS_ENABLED) return null;
		const res = await fetch(`/api/onto/projects/${projectId}/loops`);
		if (!res.ok) throw new Error(`Failed to load project review (${res.status})`);
		const json = await res.json();
		return {
			runs: json.data?.runs ?? [],
			latestRun: json.data?.latestRun ?? null
		};
	}

	async function load(options: { silent?: boolean } = {}): Promise<LoopPayload | null> {
		if (!options.silent) loading = true;
		else refreshing = true;
		try {
			const inboxUrl = new URL('/api/inbox', window.location.origin);
			inboxUrl.searchParams.set('project_id', projectId);
			inboxUrl.searchParams.set('status', 'pending');
			inboxUrl.searchParams.set('include_payload', '1');
			inboxUrl.searchParams.set('limit', '50');

			const [inboxRes, loopResult] = await Promise.all([
				fetch(inboxUrl),
				PROJECT_LOOPS_ENABLED ? loadLoopState().catch(() => null) : Promise.resolve(null)
			]);

			const inboxJson = await inboxRes.json();
			if (!inboxRes.ok) throw new Error(inboxJson?.error ?? 'Failed to load inbox');

			const data = (inboxJson.data ?? {}) as InboxPayload;
			items = data.items ?? [];
			onCountChange?.(items.length);
			latestRun = loopResult?.latestRun ?? null;
			return loopResult;
		} catch (error) {
			console.error('[ProjectInboxPanel] load failed', error);
			if (!options.silent) {
				toastService.error(error instanceof Error ? error.message : 'Failed to load inbox');
			}
			return null;
		} finally {
			if (!options.silent) loading = false;
			refreshing = false;
		}
	}

	function findRun(data: LoopPayload, runId: string): ProjectLoopRun | null {
		return data.runs.find((run) => run.id === runId) ?? null;
	}

	function startPolling(runId: string) {
		clearPoll();
		pollingRunId = runId;
		const startedAt = Date.now();

		const tick = async () => {
			const data = await load({ silent: true });
			if (!data) {
				if (Date.now() - startedAt < MAX_POLL_MS) {
					pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
				} else {
					clearPoll();
				}
				return;
			}

			const run = findRun(data, runId);
			if (run && !isRunActive(run)) {
				notifyRunFinished(run, items.length);
				clearPoll();
				return;
			}

			if (Date.now() - startedAt >= MAX_POLL_MS) {
				clearPoll();
				toastService.info('Project review is still running. Refresh to check later.');
				return;
			}

			pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
		};

		pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
	}

	async function runLoop() {
		if (triggering || !PROJECT_LOOPS_ENABLED) return;
		triggering = true;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/loops`, { method: 'POST' });
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Failed to start review');
			if (json.data?.reason === 'already_running')
				toastService.info('Project review is already running.');
			else toastService.success('Project review started.');

			const data = await load({ silent: true });
			const runId = json.data?.runId ?? data?.latestRun?.id;
			if (!runId) return;

			const run = data ? findRun(data, runId) : null;
			if (run && !isRunActive(run)) notifyRunFinished(run, items.length);
			else startPolling(runId);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to start review');
		} finally {
			triggering = false;
		}
	}

	function actionLabel(item: InboxItem, action: 'approve' | 'reject'): string {
		if (item.source_type === 'agent_run')
			return action === 'approve' ? 'Apply all' : 'Reject all';
		if (item.source_type === 'calendar_suggestion')
			return action === 'approve' ? 'Accept' : 'Reject';
		return action === 'approve' ? 'Apply' : 'Dismiss';
	}

	async function decide(item: InboxItem, action: 'approve' | 'reject') {
		if (pendingIds.has(item.id)) return;
		pendingIds = new Set(pendingIds).add(item.id);
		try {
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_id: item.id, action })
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Action failed');

			const result = json.data?.result as ProjectSuggestionResult | undefined;
			if (action === 'approve' && result && result.ok === false) {
				toastService.error('Some changes could not be applied.');
			} else if (action === 'approve') {
				toastService.success('Review item applied.');
			} else {
				toastService.success('Review item dismissed.');
			}

			items = items.filter((candidate) => candidate.id !== item.id);
			onCountChange?.(items.length);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Action failed');
		} finally {
			const next = new Set(pendingIds);
			next.delete(item.id);
			pendingIds = next;
		}
	}

	function handleAgentRunApplied(item: InboxItem) {
		items = items.filter((candidate) => candidate.id !== item.id);
		onCountChange?.(items.length);
	}

	onMount(() => {
		void load().then((data) => {
			if (data?.latestRun && isRunActive(data.latestRun)) startPolling(data.latestRun.id);
		});
		return clearPoll;
	});
</script>

<div class="space-y-0">
	<div class="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-3">
		<div class="min-w-0">
			<p class="text-xs font-semibold text-foreground">
				{#if loading}
					Loading inbox
				{:else if items.length}
					{items.length} pending item{items.length === 1 ? '' : 's'}
				{:else if runActive || pollingRunId}
					Review running
				{:else if latestRun?.status === 'failed'}
					{latestRun.error_message ?? 'Review failed'}
				{:else}
					No pending review items
				{/if}
			</p>
			{#if latestRun?.summary && !items.length && !runActive && !pollingRunId}
				<p class="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
					{latestRun.summary}
				</p>
			{/if}
		</div>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => load({ silent: true })}
				disabled={loading || refreshing}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
				title="Refresh inbox"
			>
				<RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
			</button>
			{#if PROJECT_LOOPS_ENABLED && canEdit}
				<Button
					variant="secondary"
					size="sm"
					onclick={runLoop}
					disabled={triggering || runActive || Boolean(pollingRunId)}
					class="min-h-8 px-2.5 py-1 text-xs"
				>
					<RefreshCw
						class="mr-1.5 h-3.5 w-3.5 {triggering || runActive || pollingRunId
							? 'animate-spin'
							: ''}"
					/>
					{runActive || pollingRunId ? 'Reviewing' : 'Run review'}
				</Button>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="space-y-2 border-t border-border p-2 sm:p-3">
			{#each Array(3) as _, index (index)}
				<div class="h-20 rounded-md border border-border bg-muted/30 animate-pulse"></div>
			{/each}
		</div>
	{:else if items.length === 0}
		<div class="border-t border-border px-3 py-6 text-center">
			<Inbox class="mx-auto h-5 w-5 text-muted-foreground" />
			<p class="mt-2 text-xs font-medium text-foreground">Inbox is clear</p>
			<p class="mt-1 text-[11px] text-muted-foreground">
				New review items will appear here when an agent proposes project changes.
			</p>
		</div>
	{:else}
		<div class="border-t border-border">
			{#each items as item (item.id)}
				{@const payload = projectSuggestion(item)}
				{@const agent = agentRun(item)}
				{@const changeSet = agentChangeSet(item)}
				{@const tier = tierFor(item.risk_tier ?? payload?.risk_tier)}
				{@const Icon = sourceIcon(item)}
				{@const evidence = arrayValue<ProjectSuggestionEvidenceRef>(
					payload?.evidence_refs
				).slice(0, 3)}
				{@const changes = changeCount(item)}
				<div class="border-b border-border px-3 py-3 last:border-b-0">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold {tier.cls}"
								>
									<Icon class="h-3 w-3" />
									{tier.label}
								</span>
								<span
									class="text-[10px] font-medium uppercase text-muted-foreground"
								>
									{sourceLabel(item)}
								</span>
								{#if payload?.kind}
									<span
										class="text-[10px] font-medium uppercase text-muted-foreground"
									>
										{kindLabel[payload.kind] ?? payload.kind}
									</span>
								{/if}
							</div>
							<p class="mt-1.5 text-sm font-semibold text-foreground">
								{item.title || payload?.title || agent?.label || 'Review item'}
							</p>
							{#if payload?.why_now}
								<p class="mt-1 text-[12px] text-foreground/80">
									<span class="font-semibold">Why now:</span>
									{payload.why_now}
								</p>
							{:else if item.summary || payload?.rationale || agent?.goal}
								<p class="mt-1 text-[12px] text-muted-foreground">
									{item.summary ?? payload?.rationale ?? agent?.goal}
								</p>
							{/if}
							{#if payload?.preview?.summary}
								<p
									class="mt-1.5 border-l-2 border-accent/30 pl-2 text-[12px] text-muted-foreground"
								>
									<span class="font-semibold text-foreground/80">Preview:</span>
									{payload.preview.summary}
								</p>
							{/if}
							{#if evidence.length}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each evidence as ref}
										<span
											class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
										>
											{evidenceLabel(ref)}
										</span>
									{/each}
								</div>
							{/if}
							{#if changes}
								<p class="mt-1.5 text-[11px] text-muted-foreground">
									{changes} proposed change{changes === 1 ? '' : 's'}
								</p>
							{/if}
							{#if changeSet && canDecide(item)}
								<div class="mt-3">
									<ChangeSetReview
										runId={item.source_ref_id}
										{changeSet}
										onApplied={() => handleAgentRunApplied(item)}
									/>
								</div>
							{/if}
						</div>
						{#if canDecide(item) && !changeSet}
							<div class="flex shrink-0 items-center gap-2">
								<button
									type="button"
									class="pressable inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-[12px] font-semibold text-success hover:bg-success/15 disabled:opacity-50"
									onclick={() => decide(item, 'approve')}
									disabled={pendingIds.has(item.id)}
								>
									{#if pendingIds.has(item.id)}
										<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
									{:else}
										<Check class="h-3.5 w-3.5" />
									{/if}
									{actionLabel(item, 'approve')}
								</button>
								<button
									type="button"
									class="pressable inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
									onclick={() => decide(item, 'reject')}
									disabled={pendingIds.has(item.id)}
								>
									<X class="h-3.5 w-3.5" />
									{actionLabel(item, 'reject')}
								</button>
							</div>
						{:else if item.decision_disabled_reason}
							<div
								class="shrink-0 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
							>
								{item.decision_disabled_reason}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
