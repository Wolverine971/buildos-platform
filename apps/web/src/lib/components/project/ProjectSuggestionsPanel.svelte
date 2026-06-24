<!-- apps/web/src/lib/components/project/ProjectSuggestionsPanel.svelte -->
<!--
	Project Review panel for the project page. Surfaces pending project-loop
	review items (doc organization, outdated docs, etc.) as apply/dismiss cards.
	Approving replays the item's operations through the real tool layer on the
	server.

	Rendered only when PROJECT_LOOPS_ENABLED (gated at the mount site).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import { ClipboardCheck, RefreshCw, Check, X } from 'lucide-svelte';
	import type { ProjectLoopRun, ProjectSuggestion } from '@buildos/shared-types';

	let { projectId, canEdit = false }: { projectId: string; canEdit?: boolean } = $props();

	let suggestions = $state<ProjectSuggestion[]>([]);
	let latestRun = $state<ProjectLoopRun | null>(null);
	let loading = $state(true);
	let triggering = $state(false);
	let pendingIds = $state<Set<string>>(new Set());
	let pollingRunId = $state<string | null>(null);

	const POLL_INTERVAL_MS = 2500;
	const MAX_POLL_MS = 2 * 60 * 1000;
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	const notifiedRunIds = new Set<string>();

	type TierMeta = { label: string; cls: string };
	const tierMeta: Record<number, TierMeta> = {
		1: { label: 'Low risk', cls: 'border-accent/30 bg-accent/10 text-accent' },
		2: { label: 'Review', cls: 'border-warning/30 bg-warning/10 text-warning' },
		3: { label: 'High risk', cls: 'border-destructive/30 bg-destructive/10 text-destructive' }
	};
	const fallbackTier: TierMeta = {
		label: 'Review',
		cls: 'border-border bg-muted text-muted-foreground'
	};
	const tierFor = (t: number): TierMeta => tierMeta[t] ?? fallbackTier;

	const kindLabel: Record<string, string> = {
		doc_org: 'Organize',
		doc_outdated: 'Outdated',
		drift: 'Drift',
		task_conflict: 'Conflict'
	};

	const runActive = $derived(isRunActive(latestRun));

	const evidenceTypeLabel: Record<string, string> = {
		project: 'Project',
		goal: 'Goal',
		document: 'Doc',
		task: 'Task',
		calendar_event: 'Event',
		external: 'Source',
		unknown: 'Source'
	};

	const evidenceLabel = (suggestion: ProjectSuggestion) =>
		suggestion.evidence_refs
			?.slice(0, 3)
			.map((ref) => `${evidenceTypeLabel[ref.entity_type] ?? 'Source'}: ${ref.title}`) ?? [];

	const reviewItemSummary = (count: number) =>
		`${count} review item${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your call`;

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

	function completionMessage(run: ProjectLoopRun, suggestionCount: number): string {
		if (run.status === 'waiting_review') {
			return `Project review finished — ${reviewItemSummary(suggestionCount)}.`;
		}
		if (run.status === 'completed') {
			return run.summary ?? 'Project review finished — no review items found.';
		}
		if (run.status === 'failed') {
			return run.error_message ?? 'Project review failed.';
		}
		return run.summary ?? 'Project review updated.';
	}

	function notifyRunFinished(run: ProjectLoopRun, suggestionCount: number) {
		if (notifiedRunIds.has(run.id)) return;
		notifiedRunIds.add(run.id);
		if (run.status === 'failed') {
			toastService.error(completionMessage(run, suggestionCount));
		} else {
			toastService.success(completionMessage(run, suggestionCount));
		}
	}

	type LoopPayload = {
		runs: ProjectLoopRun[];
		latestRun: ProjectLoopRun | null;
		suggestions: ProjectSuggestion[];
	};

	async function load(options: { silent?: boolean } = {}): Promise<LoopPayload | null> {
		if (!options.silent) loading = true;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/loops`);
			if (!res.ok) throw new Error(`Failed to load (${res.status})`);
			const json = await res.json();
			const data = {
				runs: json.data?.runs ?? [],
				latestRun: json.data?.latestRun ?? null,
				suggestions: json.data?.suggestions ?? []
			} satisfies LoopPayload;
			suggestions = data.suggestions;
			latestRun = data.latestRun;
			return data;
		} catch (error) {
			console.error('[ProjectSuggestionsPanel] load failed', error);
			return null;
		} finally {
			if (!options.silent) loading = false;
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
				notifyRunFinished(run, data.suggestions.length);
				clearPoll();
				return;
			}

			if (Date.now() - startedAt >= MAX_POLL_MS) {
				clearPoll();
				toastService.info(
					'Project review is still running. The panel will update on refresh.'
				);
				return;
			}

			pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
		};

		pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
	}

	async function runLoop() {
		if (triggering) return;
		triggering = true;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/loops`, { method: 'POST' });
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to start loop');
			if (json.data?.reason === 'already_running') {
				toastService.info('A project review is already running.');
			} else {
				toastService.success('Project review started.');
			}
			const data = await load({ silent: true });
			const runId = json.data?.runId ?? data?.latestRun?.id;
			if (runId) {
				const run = data ? findRun(data, runId) : null;
				if (run && !isRunActive(run)) {
					notifyRunFinished(run, data?.suggestions.length ?? 0);
				} else {
					startPolling(runId);
				}
			}
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to start loop');
		} finally {
			triggering = false;
		}
	}

	async function act(suggestion: ProjectSuggestion, action: 'approve' | 'dismiss') {
		if (pendingIds.has(suggestion.id)) return;
		pendingIds = new Set(pendingIds).add(suggestion.id);
		try {
			const res = await fetch(
				`/api/onto/projects/${projectId}/suggestions/${suggestion.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action })
				}
			);
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error?.message ?? 'Action failed');

			if (action === 'approve' && json.data?.result && json.data.result.ok === false) {
				toastService.error('Some changes could not be applied.');
			} else if (action === 'approve') {
				toastService.success('Review item applied.');
			}
			suggestions = suggestions.filter((s) => s.id !== suggestion.id);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Action failed');
		} finally {
			const next = new Set(pendingIds);
			next.delete(suggestion.id);
			pendingIds = next;
		}
	}

	onMount(() => {
		void load().then((data) => {
			if (data?.latestRun && isRunActive(data.latestRun)) {
				startPolling(data.latestRun.id);
			}
		});
		return clearPoll;
	});
</script>

<section class="rounded-lg border border-border bg-card shadow-ink wt-card overflow-hidden">
	<div class="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
		<div class="flex items-center gap-2">
			<span
				class="tx-bloom tx-weak flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent"
			>
				<ClipboardCheck class="h-4 w-4" />
			</span>
			<div>
				<p class="text-sm font-semibold text-foreground">Project Review</p>
				<p class="text-[11px] text-muted-foreground">
					{#if loading}
						Loading…
					{:else if suggestions.length}
						{reviewItemSummary(suggestions.length)}
					{:else if runActive || pollingRunId}
						Review running…
					{:else if latestRun?.status === 'failed'}
						{latestRun.error_message ?? 'Review failed'}
					{:else if latestRun?.summary}
						{latestRun.summary}
					{:else}
						No review items yet
					{/if}
				</p>
			</div>
		</div>
		{#if canEdit}
			<Button
				variant="secondary"
				size="sm"
				onclick={runLoop}
				disabled={triggering || runActive || Boolean(pollingRunId)}
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

	{#if suggestions.length}
		<div class="border-t border-border">
			{#each suggestions as suggestion (suggestion.id)}
				{@const tier = tierFor(suggestion.risk_tier)}
				{@const evidence = evidenceLabel(suggestion)}
				<div class="border-b border-border px-3 py-3 last:border-b-0">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="rounded border px-1.5 py-0.5 text-[10px] font-semibold {tier.cls}"
								>
									{tier.label}
								</span>
								<span
									class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
								>
									{kindLabel[suggestion.kind] ?? suggestion.kind}
								</span>
							</div>
							<p class="mt-1.5 text-sm font-semibold text-foreground">
								{suggestion.title}
							</p>
							{#if suggestion.why_now}
								<p class="mt-1 text-[12px] text-foreground/80">
									<span class="font-semibold">Why now:</span>
									{suggestion.why_now}
								</p>
							{/if}
							{#if suggestion.rationale}
								<p class="mt-1 text-[12px] text-muted-foreground">
									{suggestion.rationale}
								</p>
							{/if}
							{#if suggestion.preview?.summary}
								<p
									class="mt-1.5 border-l-2 border-accent/30 pl-2 text-[12px] text-muted-foreground"
								>
									<span class="font-semibold text-foreground/80">Preview:</span>
									{suggestion.preview.summary}
								</p>
							{/if}
							{#if evidence.length}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each evidence as item}
										<span
											class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
										>
											{item}
										</span>
									{/each}
								</div>
							{/if}
							{#if suggestion.operations?.length}
								<p class="mt-1 text-[11px] text-muted-foreground">
									{suggestion.operations.length} proposed change{suggestion
										.operations.length === 1
										? ''
										: 's'}
								</p>
							{/if}
						</div>
						{#if canEdit}
							<div class="flex shrink-0 items-center gap-2">
								<button
									class="pressable flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-[12px] font-semibold text-success hover:bg-success/15 disabled:opacity-50"
									onclick={() => act(suggestion, 'approve')}
									disabled={pendingIds.has(suggestion.id)}
								>
									<Check class="h-3.5 w-3.5" /> Apply
								</button>
								<button
									class="pressable flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
									onclick={() => act(suggestion, 'dismiss')}
									disabled={pendingIds.has(suggestion.id)}
								>
									<X class="h-3.5 w-3.5" /> Dismiss
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
