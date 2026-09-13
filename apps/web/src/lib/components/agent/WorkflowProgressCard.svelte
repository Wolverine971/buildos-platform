<!-- apps/web/src/lib/components/agent/WorkflowProgressCard.svelte -->
<script lang="ts">
	import type { ChatWorkflowProgress } from '@buildos/shared-types';
	import type { ThinkingBlockMessage } from './agent-chat.types';
	let {
		progress,
		status
	}: { progress: ChatWorkflowProgress; status: ThinkingBlockMessage['status'] } = $props();
	const stopped = $derived(
		status === 'cancelled' || status === 'interrupted' || status === 'error'
	);
	const complete = $derived(progress.steps.at(-1)?.status === 'completed');
	const partial = $derived(progress.steps.some((step) => step.status === 'failed'));
	const title = $derived(
		stopped
			? 'Review stopped'
			: complete
				? partial
					? 'Partial review ready'
					: 'Project review ready'
				: 'Reviewing your project'
	);
</script>

<section class="rounded-lg border border-border bg-card p-4" aria-label="Workflow progress">
	<div class="flex items-center justify-between gap-3">
		<p class="text-sm font-semibold text-foreground" role="status">{title}</p>
		<span class="text-xs text-muted-foreground">Read only</span>
	</div>
	<ol class="mt-3 space-y-2">
		{#each progress.steps as step, i (step.id)}
			{@const state =
				stopped && (step.status === 'running' || step.status === 'pending')
					? 'stopped'
					: step.status}
			<li>
				<div class="flex items-center gap-2 text-sm">
					<span
						class="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs"
						class:bg-accent={state === 'completed'}
						aria-hidden="true">{state === 'completed' ? '✓' : i + 1}</span
					>
					<span class="flex-1 text-foreground">{step.label}</span>
					<span class="text-xs capitalize text-muted-foreground">{state}</span>
				</div>
				{#if step.objective || step.result}
					<details class="ml-7 mt-1 text-xs text-muted-foreground">
						<summary class="cursor-pointer py-1"
							>{step.result ? 'View findings' : 'View assignment'}</summary
						>
						{#if step.objective}<p class="mt-1 whitespace-pre-wrap">
								{step.objective}
							</p>{/if}
						{#if step.result}<p
								class="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed text-foreground"
							>
								{step.result}
							</p>{/if}
					</details>
				{/if}
			</li>
		{/each}
	</ol>
	<p class="mt-3 text-xs text-muted-foreground">
		Uses a bounded snapshot of saved project context. No web research or project changes.
	</p>
</section>
