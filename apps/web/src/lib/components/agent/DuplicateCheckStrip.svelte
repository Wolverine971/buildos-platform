<!-- apps/web/src/lib/components/agent/DuplicateCheckStrip.svelte -->
<!--
	The quick duplicate check a nest or combine card starts (tasker 122, WP3):
	"Checking for duplicates…" while the survey runs, then the headline, the top
	groups and "Review duplicates". Polls GET /api/consolidation/runs/[id] until
	the check finishes (3 s, then 10 s; up to ~15 minutes), pauses while the tab
	is hidden. A failed check stays quiet: it never blocks the card's choice.
	Inside the chat modal the review opens in the modal's side panel, so the
	person never leaves the conversation; elsewhere it falls back to a link.
	INKPRINT: inset sub-surface inside the card (no texture of its own).
-->
<script lang="ts">
	import { ArrowRight, Layers, LoaderCircle } from '$lib/icons/lucide';
	import {
		summarizeConsolidationCheck,
		type ConsolidationCheckSummary
	} from '@buildos/shared-agent-ops/consolidation';
	import type { ProposalDuplicateCheckRefV1 } from '@buildos/shared-agent-ops/chat-cards/proposal-card';
	import {
		DUPLICATE_CHECK_GROUP_LIMIT,
		DUPLICATE_CHECK_MAX_POLLS,
		duplicateCheckPollDelay
	} from './duplicate-check-strip';
	import { useChatReviewPanel } from './chat-review-panel';

	let { check }: { check: ProposalDuplicateCheckRefV1 } = $props();

	const panel = useChatReviewPanel();

	type Phase = 'loading' | 'running' | 'done' | 'failed' | 'slow';
	let phase = $state<Phase>('loading');
	let summary = $state.raw<ConsolidationCheckSummary | null>(null);

	const reviewPath = $derived(
		summary?.review_path ?? `/projects/${check.root_project_id}/consolidate/${check.run_id}`
	);

	function openReview() {
		panel?.open(check.run_id);
	}

	async function loadCheck(
		runId: string,
		signal: AbortSignal
	): Promise<ConsolidationCheckSummary | null> {
		try {
			const response = await fetch(`/api/consolidation/runs/${encodeURIComponent(runId)}`, {
				signal
			});
			if (!response.ok) return null;
			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				data?: { run?: Parameters<typeof summarizeConsolidationCheck>[0] };
			} | null;
			const run = payload?.success === true ? payload.data?.run : null;
			return run
				? summarizeConsolidationCheck(run, { limit: DUPLICATE_CHECK_GROUP_LIMIT })
				: null;
		} catch {
			return null;
		}
	}

	// Polling is a side effect tied to the run id: restart on a new id, and stop
	// (timer, request, visibility listener) when the strip unmounts.
	$effect(() => {
		const runId = check.run_id;
		let stopped = false;
		let polls = 0;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let controller: AbortController | null = null;
		let waitingForVisible = false;
		const hidden = () =>
			typeof document !== 'undefined' && document.visibilityState === 'hidden';

		async function tick() {
			timer = null;
			if (stopped) return;
			if (hidden()) {
				waitingForVisible = true;
				return;
			}
			polls += 1;
			controller = new AbortController();
			const result = await loadCheck(runId, controller.signal);
			controller = null;
			if (stopped) return;
			if (!result) {
				phase = 'failed';
				return;
			}
			summary = result;
			if (result.state === 'done') {
				phase = 'done';
				return;
			}
			if (result.state !== 'running') {
				phase = 'failed';
				return;
			}
			if (polls >= DUPLICATE_CHECK_MAX_POLLS) {
				phase = 'slow';
				return;
			}
			phase = 'running';
			if (hidden()) {
				waitingForVisible = true;
				return;
			}
			timer = setTimeout(tick, duplicateCheckPollDelay(polls));
		}

		function onVisibilityChange() {
			if (stopped || !waitingForVisible || hidden()) return;
			waitingForVisible = false;
			void tick();
		}

		document.addEventListener('visibilitychange', onVisibilityChange);
		void tick();
		return () => {
			stopped = true;
			if (timer) clearTimeout(timer);
			controller?.abort();
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});

	function itemCount(group: ConsolidationCheckSummary['groups'][number]): string {
		const parts: string[] = [];
		if (group.documents.length)
			parts.push(
				`${group.documents.length} ${group.documents.length === 1 ? 'doc' : 'docs'}`
			);
		if (group.tasks.length)
			parts.push(`${group.tasks.length} ${group.tasks.length === 1 ? 'task' : 'tasks'}`);
		return parts.join(', ');
	}

	const actionClass =
		'inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0';
</script>

{#snippet reviewAction(label: string, arrow: boolean)}
	{#if panel}
		<button type="button" class={actionClass} onclick={openReview}>
			{label}
			{#if arrow}<ArrowRight class="h-3 w-3" aria-hidden="true" />{/if}
		</button>
	{:else}
		<a href={reviewPath} class={actionClass}>
			{label}
			{#if arrow}<ArrowRight class="h-3 w-3" aria-hidden="true" />{/if}
		</a>
	{/if}
{/snippet}

<div
	class="mx-3 mt-2 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-ink-inner"
	data-testid="duplicate-check-strip"
	data-phase={phase}
>
	<div class="flex items-start gap-1.5" role="status" aria-live="polite">
		{#if phase === 'loading' || phase === 'running'}
			<LoaderCircle
				class="mt-px h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
				aria-hidden="true"
			/>
			<span class="min-w-0 text-muted-foreground">
				Checking for duplicates… (a few minutes)
				{#if panel && phase === 'running'}
					{@render reviewAction('See progress', false)}
				{/if}
			</span>
		{:else if phase === 'failed'}
			<Layers class="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="text-muted-foreground">Couldn’t check for duplicates.</span>
		{:else if phase === 'slow'}
			<Layers class="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="min-w-0 text-muted-foreground">
				Still checking for duplicates.
				{@render reviewAction('See progress', false)}
			</span>
		{:else if summary}
			<Layers class="mt-px h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
			<span class="min-w-0 font-semibold text-foreground [overflow-wrap:anywhere]"
				>{summary.headline}</span
			>
		{/if}
	</div>

	{#if phase === 'done' && summary && summary.total_groups > 0}
		<ul class="mt-1.5 space-y-1 pl-5 text-muted-foreground" aria-label="Top duplicate groups">
			{#each summary.groups as group (group.key)}
				<li class="[overflow-wrap:anywhere]">
					<span class="font-medium text-foreground">{group.kind_label}:</span>
					{group.title}
					{#if itemCount(group)}
						<span class="stamp text-2xs">({itemCount(group)})</span>
					{/if}
				</li>
			{/each}
			{#if summary.more_groups > 0}
				<li class="text-2xs">+{summary.more_groups} more</li>
			{/if}
		</ul>
		<div class="mt-1.5 ml-5">
			{@render reviewAction('Review duplicates', true)}
		</div>
	{/if}
</div>
