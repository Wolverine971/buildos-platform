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
	import InboxChangeDetails from '$lib/components/inbox/InboxChangeDetails.svelte';
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
	let selectedIds = $state<Set<string>>(new Set());
	let dismissReasonById = $state<Record<string, string>>({});
	let dismissNoteById = $state<Record<string, string>>({});

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

	const dismissReasons = [
		{ value: 'not_relevant', label: 'Not relevant' },
		{ value: 'wrong_evidence', label: 'Wrong evidence' },
		{ value: 'intentional', label: 'Intentional' },
		{ value: 'too_risky', label: 'Too risky' },
		{ value: 'other', label: 'Other' }
	];

	const groupedItems = $derived.by(() => {
		const safe = { key: 'safe', label: 'Safe cleanup', items: [] as InboxItem[] };
		const decision = {
			key: 'decision',
			label: 'Needs your call',
			items: [] as InboxItem[]
		};
		const drift = { key: 'drift', label: 'Project drift', items: [] as InboxItem[] };
		const other = { key: 'other', label: 'Other proposals', items: [] as InboxItem[] };
		const groups = [safe, decision, drift, other];
		for (const item of items) {
			const payload = projectSuggestion(item);
			if (payload?.kind === 'drift') drift.items.push(item);
			else if (
				item.source_type === 'project_suggestion' &&
				(payload?.risk_tier ?? item.risk_tier ?? 2) <= 1
			)
				safe.items.push(item);
			else if (item.source_type === 'project_suggestion') decision.items.push(item);
			else other.items.push(item);
		}
		return groups.filter((group) => group.items.length > 0);
	});

	const selectedBatchIds = $derived.by(() =>
		items
			.filter((item) => selectedIds.has(item.id) && canBatchApprove(item))
			.map((item) => item.id)
	);

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

	function canBatchApprove(item: InboxItem): boolean {
		if (!canDecide(item) || item.source_type !== 'project_suggestion') return false;
		const payload = projectSuggestion(item);
		const riskTier = payload?.risk_tier ?? item.risk_tier ?? 3;
		const operations = arrayValue<{ tool?: string }>(payload?.operations);
		return (
			riskTier <= 2 &&
			payload?.reversible !== false &&
			operations.length > 0 &&
			!operations.some((operation) => operation.tool === 'move_document_in_tree')
		);
	}

	function updateSelected(item: InboxItem, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) next.add(item.id);
		else next.delete(item.id);
		selectedIds = next;
	}

	function setDismissReason(itemId: string, reason: string) {
		dismissReasonById = { ...dismissReasonById, [itemId]: reason };
	}

	function setDismissNote(itemId: string, note: string) {
		dismissNoteById = { ...dismissNoteById, [itemId]: note };
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
		return action === 'approve' ? (changeCount(item) ? 'Apply' : 'Acknowledge') : 'Dismiss';
	}

	async function decide(item: InboxItem, action: 'approve' | 'reject') {
		if (pendingIds.has(item.id)) return;
		pendingIds = new Set(pendingIds).add(item.id);
		try {
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					item_id: item.id,
					action,
					...(action === 'reject' && item.source_type === 'project_suggestion'
						? {
								reason: dismissReasonById[item.id] || 'other',
								note: dismissNoteById[item.id] || undefined
							}
						: {})
				})
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Action failed');

			const result = json.data?.result as ProjectSuggestionResult | undefined;
			if (json.data?.superseded) {
				toastService.error('Review item changed. Rerun Project Review.');
			} else if (action === 'approve' && result && result.ok === false) {
				toastService.error('Some changes could not be applied.');
			} else if (action === 'approve') {
				toastService.success(
					changeCount(item) ? 'Review item applied.' : 'Review item acknowledged.'
				);
			} else {
				toastService.success('Review item dismissed.');
			}

			items = items.filter((candidate) => candidate.id !== item.id);
			const nextSelected = new Set(selectedIds);
			nextSelected.delete(item.id);
			selectedIds = nextSelected;
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

	async function batchApproveSelected() {
		const ids = selectedBatchIds;
		if (ids.length === 0) return;
		for (const id of ids) pendingIds = new Set(pendingIds).add(id);
		try {
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_ids: ids, action: 'approve' })
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Batch apply failed');
			const results = Array.isArray(json.data?.results) ? json.data.results : [];
			const appliedIds = new Set(
				results
					.map((result: { item_id?: unknown }) => result.item_id)
					.filter((id: unknown): id is string => typeof id === 'string')
			);
			const superseded = results.filter(
				(result: { superseded?: unknown }) => result.superseded === true
			).length;
			const appliedCount = appliedIds.size - superseded;
			items = items.filter((item) => !appliedIds.has(item.id));
			selectedIds = new Set([...selectedIds].filter((id) => !appliedIds.has(id)));
			onCountChange?.(items.length);
			const failed = Number(json.data?.failed ?? 0);
			if (failed > 0) {
				toastService.error(
					`${appliedCount} applied, ${superseded} changed, ${failed} failed.`
				);
			} else if (superseded > 0) {
				toastService.error(
					`${appliedCount} applied, ${superseded} changed. Rerun Project Review.`
				);
			} else {
				toastService.success(`${appliedCount} review items applied.`);
			}
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Batch apply failed');
		} finally {
			const next = new Set(pendingIds);
			for (const id of ids) next.delete(id);
			pendingIds = next;
		}
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
			{#if selectedBatchIds.length}
				<Button
					variant="secondary"
					size="sm"
					onclick={batchApproveSelected}
					disabled={selectedBatchIds.some((id) => pendingIds.has(id))}
					class="min-h-8 px-2.5 py-1 text-xs"
				>
					<Check class="mr-1.5 h-3.5 w-3.5" />
					Apply {selectedBatchIds.length}
				</Button>
			{/if}
		</div>
	</div>

	{#if latestRun?.brief}
		<div class="border-t border-border bg-muted/20 px-3 py-3">
			<p class="text-[10px] font-semibold uppercase text-muted-foreground">Project brief</p>
			{#if latestRun.brief.current_goal}
				<p class="mt-1 text-xs font-semibold text-foreground">
					{latestRun.brief.current_goal}
				</p>
			{/if}
			<div class="mt-2 grid gap-2 sm:grid-cols-2">
				{#if latestRun.brief.next_best_action}
					<div>
						<p class="text-[10px] font-semibold uppercase text-muted-foreground">
							Next
						</p>
						<p class="mt-0.5 text-[11px] text-foreground/80">
							{latestRun.brief.next_best_action}
						</p>
					</div>
				{/if}
				{#if latestRun.brief.open_decisions?.length}
					<div>
						<p class="text-[10px] font-semibold uppercase text-muted-foreground">
							Open decisions
						</p>
						<p class="mt-0.5 line-clamp-2 text-[11px] text-foreground/80">
							{latestRun.brief.open_decisions.slice(0, 3).join(' · ')}
						</p>
					</div>
				{/if}
			</div>
			{#if latestRun.brief.stale_assumptions?.length || latestRun.brief.contradictions_or_drift?.length}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each latestRun.brief.stale_assumptions.slice(0, 3) as item}
						<span
							class="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
						>
							{item}
						</span>
					{/each}
					{#each latestRun.brief.contradictions_or_drift.slice(0, 3) as item}
						<span
							class="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
						>
							{item}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

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
			{#each groupedItems as group (group.key)}
				<div
					class="bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
				>
					{group.label} ({group.items.length})
				</div>
				{#each group.items as item (item.id)}
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
						<div
							class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									{#if canBatchApprove(item)}
										<input
											type="checkbox"
											class="h-3.5 w-3.5 rounded border-border"
											checked={selectedIds.has(item.id)}
											onchange={(event) =>
												updateSelected(
													item,
													(event.currentTarget as HTMLInputElement)
														.checked
												)}
											aria-label="Select review item"
										/>
									{/if}
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
										<span class="font-semibold text-foreground/80"
											>Preview:</span
										>
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
								{#if item.source_type === 'project_suggestion' && (changes || payload?.preview)}
									<InboxChangeDetails
										operations={payload?.operations ?? []}
										preview={payload?.preview ?? null}
									/>
								{:else if changes}
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
								<div class="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
									<div class="flex items-center gap-2">
										<button
											type="button"
											class="pressable inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-[12px] font-semibold text-success hover:bg-success/15 disabled:opacity-50"
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
											class="pressable inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
											onclick={() => decide(item, 'reject')}
											disabled={pendingIds.has(item.id)}
										>
											<X class="h-3.5 w-3.5" />
											{actionLabel(item, 'reject')}
										</button>
									</div>
									{#if item.source_type === 'project_suggestion'}
										<select
											class="h-8 rounded-md border border-border bg-card px-2 text-[11px] text-foreground"
											value={dismissReasonById[item.id] || 'other'}
											onchange={(event) =>
												setDismissReason(
													item.id,
													(event.currentTarget as HTMLSelectElement).value
												)}
											aria-label="Dismiss reason"
										>
											{#each dismissReasons as reason}
												<option value={reason.value}>{reason.label}</option>
											{/each}
										</select>
										<input
											class="h-8 rounded-md border border-border bg-card px-2 text-[11px] text-foreground placeholder:text-muted-foreground"
											value={dismissNoteById[item.id] ?? ''}
											oninput={(event) =>
												setDismissNote(
													item.id,
													(event.currentTarget as HTMLInputElement).value
												)}
											placeholder="Optional note"
											aria-label="Dismiss note"
										/>
									{/if}
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
			{/each}
		</div>
	{/if}
</div>
