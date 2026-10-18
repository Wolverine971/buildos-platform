<!-- apps/web/src/lib/components/agent/ChatConsolidationPanel.svelte -->
<!--
	A duplicate check or full consolidation review, inside the chat modal
	(tasker 122). Opened from a nest/combine card's duplicate strip so the person
	never leaves the conversation: beside the messages on wide screens, over them
	(chat stays mounted underneath) on narrow ones. "Review and merge" starts the
	full run and shows it here too. Loads GET /api/consolidation/runs/[id]; the
	run component polls while the worker is busy.
	INKPRINT: bg-background side surface, border-l, header row like the modal's.
-->
<script lang="ts">
	import { ArrowLeft, LoaderCircle, X } from '$lib/icons/lucide';
	import ConsolidationRun from '$lib/components/consolidation/ConsolidationRun.svelte';
	import type { ConsolidationRunView } from '$lib/components/consolidation/consolidation-types';

	let {
		runId,
		onClose,
		onOpenRun
	}: {
		runId: string;
		onClose: () => void;
		/** Shows another run here (the full review a check starts). */
		onOpenRun: (runId: string) => void;
	} = $props();

	let view = $state.raw<ConsolidationRunView | null>(null);
	let loadError = $state<string | null>(null);

	$effect(() => {
		const id = runId;
		const controller = new AbortController();
		view = null;
		loadError = null;
		void (async () => {
			try {
				const response = await fetch(`/api/consolidation/runs/${encodeURIComponent(id)}`, {
					signal: controller.signal
				});
				const body = (await response.json().catch(() => null)) as {
					success?: boolean;
					data?: ConsolidationRunView;
					error?: string;
				} | null;
				if (controller.signal.aborted) return;
				if (!response.ok || body?.success !== true || !body.data) {
					loadError = body?.error ?? 'Couldn’t load this review.';
					return;
				}
				view = body.data;
			} catch {
				if (!controller.signal.aborted) loadError = 'Couldn’t load this review.';
			}
		})();
		return () => controller.abort();
	});

	const title = $derived(view?.run.mode === 'full' ? 'Review duplicates' : 'Duplicate check');
	const projectName = $derived(
		view ? (view.run.plan?.projects[view.run.root_project_id]?.name ?? 'Project') : ''
	);
</script>

<aside
	class="absolute inset-0 z-20 flex min-h-0 flex-col bg-background lg:static lg:inset-auto lg:z-auto lg:w-[min(36rem,46%)] lg:shrink-0 lg:border-l lg:border-border"
	aria-label={title}
	data-testid="chat-consolidation-panel"
>
	<div class="flex items-center gap-2 border-b border-border px-4 py-2.5">
		<button
			type="button"
			class="inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
			onclick={onClose}
		>
			<ArrowLeft class="h-4 w-4" aria-hidden="true" />
			Back to chat
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold text-foreground">{title}</p>
			{#if projectName}
				<p class="truncate text-xs text-muted-foreground">{projectName}</p>
			{/if}
		</div>
		<button
			type="button"
			class="ml-auto hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
			aria-label="Close review"
			onclick={onClose}
		>
			<X class="h-4 w-4" aria-hidden="true" />
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
		{#if view}
			{#key view.run.id}
				<ConsolidationRun
					initial={view}
					{projectName}
					scopeIsFamily={false}
					embedded
					{onOpenRun}
				/>
			{/key}
		{:else if loadError}
			<p class="text-sm text-destructive" role="alert">{loadError}</p>
		{:else}
			<div class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
				<LoaderCircle
					class="h-4 w-4 animate-spin motion-reduce:animate-none"
					aria-hidden="true"
				/>
				Loading…
			</div>
		{/if}
	</div>
</aside>
