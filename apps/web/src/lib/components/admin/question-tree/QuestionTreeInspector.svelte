<!-- apps/web/src/lib/components/admin/question-tree/QuestionTreeInspector.svelte -->
<script lang="ts">
	import { Loader2, RotateCcw, X } from '$lib/icons/lucide';
	import type { QuestionTreeNode, QuestionTreeProposal } from '$lib/services/question-tree/types';

	let {
		node,
		proposals,
		retrying = false,
		onRetry,
		onClose
	}: {
		node: QuestionTreeNode;
		proposals: QuestionTreeProposal[];
		retrying?: boolean;
		onRetry?: (nodeId: string) => void;
		onClose: () => void;
	} = $props();

	const nodeProposals = $derived(
		proposals.filter((proposal) => proposal.source_node_id === node.id)
	);

	function purposeLabel(value: QuestionTreeProposal['purpose']): string {
		return value.replace('_', ' ');
	}
</script>

<aside
	class="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-t border-border bg-card xl:border-l xl:border-t-0"
	aria-label="Node inspector"
>
	<header class="flex items-start justify-between gap-3 border-b border-border p-4">
		<div class="min-w-0">
			<p class="text-2xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
				{node.node_kind === 'root'
					? 'Original question'
					: `Node ${node.node_number} · depth ${node.depth}`}
			</p>
			<h2 class="mt-1 break-words text-sm font-bold leading-snug text-foreground">
				{node.question}
			</h2>
		</div>
		<button
			type="button"
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={onClose}
			aria-label="Close node inspector"
		>
			<X class="h-4 w-4" />
		</button>
	</header>

	<div class="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-4">
		<section>
			<div class="mb-2 flex items-center justify-between gap-2">
				<h3 class="text-xs font-bold uppercase tracking-wide text-muted-foreground">
					Answer
				</h3>
				<span
					class="rounded-md bg-muted px-2 py-1 text-2xs font-semibold text-muted-foreground"
				>
					{node.status}
				</span>
			</div>
			{#if node.answer}
				<p class="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
					{node.answer}
				</p>
			{:else if node.status === 'failed'}
				<div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
					<p class="break-words text-sm text-destructive">
						{node.error_message ?? 'This node failed before returning an answer.'}
					</p>
					{#if node.node_kind === 'question' && onRetry}
						<button
							type="button"
							class="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-accent-foreground shadow-ink disabled:opacity-50"
							onclick={() => onRetry?.(node.id)}
							disabled={retrying}
						>
							{#if retrying}
								<Loader2
									class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
								/>
								Queueing retry
							{:else}
								<RotateCcw class="h-3.5 w-3.5" /> Retry this node
							{/if}
						</button>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No answer yet.</p>
			{/if}
		</section>

		{#if node.thesis}
			<section class="rounded-lg border border-border bg-muted/35 p-3">
				<h3 class="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
					Thesis
				</h3>
				<p class="break-words text-sm leading-relaxed text-foreground">{node.thesis}</p>
				{#if node.confidence !== null}
					<p class="mt-2 text-xs font-semibold text-muted-foreground">
						Confidence: {Math.round(node.confidence * 100)}%
					</p>
				{/if}
			</section>
		{/if}

		{#if node.epistemic_assessment?.length}
			<section>
				<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
					Epistemic assessment
				</h3>
				<div class="space-y-2">
					{#each node.epistemic_assessment as claim, index (`${claim.status}:${index}`)}
						<div class="min-w-0 overflow-hidden rounded-lg border border-border p-3">
							<span
								class={[
									'inline-flex rounded-md px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide',
									claim.status === 'probably_right' &&
										'bg-success/15 text-success',
									claim.status === 'probably_wrong' &&
										'bg-destructive/15 text-destructive',
									claim.status === 'unsure' && 'bg-warning/15 text-warning'
								]}
							>
								{claim.status.replace('_', ' ')}
							</span>
							<p class="mt-2 break-words text-sm font-medium text-foreground">
								{claim.statement}
							</p>
							<p
								class="mt-1 break-words text-xs leading-relaxed text-muted-foreground"
							>
								{claim.basis}
							</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
				Produced questions ({nodeProposals.length})
			</h3>
			{#if nodeProposals.length}
				<div class="space-y-2">
					{#each nodeProposals as proposal (proposal.id)}
						<div class="min-w-0 overflow-hidden rounded-lg border border-border p-3">
							<div class="mb-1.5 flex flex-wrap items-center gap-1.5">
								<span
									class="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-bold text-muted-foreground"
								>
									{purposeLabel(proposal.purpose)}
								</span>
								<span
									class="rounded-md bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
								>
									{proposal.expected_information_gain} gain
								</span>
								<span class="ml-auto text-2xs font-semibold text-muted-foreground"
									>{proposal.status}</span
								>
							</div>
							<p
								class="break-words text-sm font-semibold leading-snug text-foreground"
							>
								{proposal.question}
							</p>
							<p
								class="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground"
							>
								{proposal.why_it_matters}
							</p>
							{#if proposal.target_claim}
								<p class="mt-1.5 break-words text-xs text-muted-foreground">
									<span class="font-semibold">Targets:</span>
									{proposal.target_claim}
								</p>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">
					This node produced no follow-up questions.
				</p>
			{/if}
		</section>

		<footer class="min-w-0 border-t border-border pt-3 text-2xs text-muted-foreground">
			<p class="break-all">Model: {node.model_used ?? node.model_requested ?? 'pending'}</p>
			<p class="mt-1">
				{node.prompt_tokens + node.completion_tokens} tokens · ${node.cost_usd.toFixed(6)} ·
				{node.latency_ms} ms
			</p>
		</footer>
	</div>
</aside>
