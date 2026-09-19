<!-- apps/web/src/lib/components/agent/WorkflowProgressCard.svelte -->
<script lang="ts">
	import {
		AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
		type AgenticChatWorkflowProjectionV1,
		type ChatWorkflowProgress
	} from '@buildos/shared-types';
	import type { ThinkingBlockMessage } from './agent-chat.types';

	type DisplayStep = {
		id: string;
		label: string;
		state: string;
		objective?: string;
		result?: string;
		evidence?: string[];
	};

	let {
		progress,
		status
	}: {
		progress: ChatWorkflowProgress | AgenticChatWorkflowProjectionV1;
		status: ThinkingBlockMessage['status'];
	} = $props();

	const display = $derived.by(() => {
		if (progress.version !== AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION) {
			const stopped =
				status === 'cancelled' || status === 'interrupted' || status === 'error';
			const complete = progress.steps.at(-1)?.status === 'completed';
			const partial = progress.steps.some((step) => step.status === 'failed');
			return {
				title: stopped
					? 'Review stopped'
					: complete
						? partial
							? 'Partial review ready'
							: 'Project review ready'
						: 'Reviewing your project',
				steps: progress.steps.map(
					(step): DisplayStep => ({
						...step,
						state:
							stopped && (step.status === 'running' || step.status === 'pending')
								? 'stopped'
								: step.status
					})
				),
				notice: null,
				coverageGap: null
			};
		}

		// Finalization can preserve a claimed editor or unfinished specialist. Only the
		// durable terminal outcome says whether the saved review is complete or partial.
		const workflow = progress;
		const outcome = workflow.terminalOutcome;
		const recovering = !outcome && progress.transport.executionState === 'recovering';
		const ended =
			!!outcome ||
			progress.phase === 'finished' ||
			progress.transport.executionState === 'terminal' ||
			(status !== 'active' && !recovering);
		const stopped = outcome === 'cancelled' || (!outcome && status === 'cancelled');
		const phaseTitles = {
			preparing: 'Preparing your project review',
			assessing: 'Planning the project review',
			executing: 'Reviewing your project',
			synthesizing: 'Combining recommendations',
			finished: 'Review incomplete'
		};
		const terminalTitles = {
			complete: 'Project review ready',
			partial: 'Partial review ready',
			cancelled: 'Review stopped',
			failed: 'Review failed'
		};
		const title = outcome
			? terminalTitles[outcome]
			: stopped
				? 'Review stopped'
				: recovering
					? 'Resuming project review'
					: status === 'error'
						? 'Review failed'
						: status === 'interrupted'
							? 'Review interrupted'
							: ended
								? 'Review incomplete'
								: phaseTitles[progress.phase];

		return {
			title,
			steps: progress.steps.map((step): DisplayStep => {
				let state: string = step.status;
				if (step.status === 'accepted') {
					state = step.quality === 'partial' ? 'partial' : 'completed';
				} else if (step.key === 'editor' && workflow.answer.status === 'accepted') {
					state = 'completed';
				} else if (step.status === 'claimed' || step.status === 'pending') {
					state = ended
						? stopped
							? 'stopped'
							: 'not completed'
						: step.status === 'claimed'
							? recovering
								? 'resuming'
								: 'running'
							: 'pending';
				}
				return {
					id: step.key,
					label: step.label,
					state,
					result: step.acceptedFinding?.summary,
					evidence: step.acceptedFinding?.evidence.map((ref) => ref.label)
				};
			}),
			notice: ended
				? null
				: recovering
					? 'Resuming from saved progress.'
					: progress.transport.executionState === 'queued'
						? 'Your review is queued.'
						: progress.transport.delivery.state !== 'connected'
							? 'Reconnecting to review progress.'
							: null,
			coverageGap: progress.coverageGap
		};
	});
</script>

<section class="rounded-lg border border-border bg-card p-4" aria-label="Workflow progress">
	<div class="flex items-center justify-between gap-3">
		<p class="text-sm font-semibold text-foreground" role="status">{display.title}</p>
		<span class="text-xs text-muted-foreground">Read only</span>
	</div>
	{#if display.notice}
		<p class="mt-1 text-xs text-muted-foreground">{display.notice}</p>
	{/if}
	<ol class="mt-3 space-y-2">
		{#each display.steps as step, i (step.id)}
			<li>
				<div class="flex items-center gap-2 text-sm">
					<span
						class="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs"
						class:bg-accent={step.state === 'completed'}
						aria-hidden="true">{step.state === 'completed' ? '✓' : i + 1}</span
					>
					<span class="flex-1 text-foreground">{step.label}</span>
					<span class="text-xs capitalize text-muted-foreground">{step.state}</span>
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
						{#if step.evidence?.length}
							<p class="mt-2">Sources: {step.evidence.join(', ')}</p>
						{/if}
					</details>
				{/if}
			</li>
		{/each}
	</ol>
	{#if display.coverageGap}
		<p class="mt-3 text-xs text-muted-foreground">{display.coverageGap}</p>
	{/if}
	<p class="mt-3 text-xs text-muted-foreground">
		Based on saved project context. No web research or project changes.
	</p>
</section>
