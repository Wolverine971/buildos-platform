<script lang="ts">
	import { ArrowRight, FileText, LoaderCircle } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ActivationPacket } from '$lib/utils/onboarding-state';
	let {
		packet,
		sourceText = '',
		loading = false,
		error = null,
		onRetry,
		showNextMove = true
	}: {
		packet: ActivationPacket | null;
		sourceText?: string;
		loading?: boolean;
		error?: string | null;
		onRetry: () => void;
		showNextMove?: boolean;
	} = $props();
</script>

{#if loading && !packet}
	<div
		class="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground"
		role="status"
	>
		<LoaderCircle
			class="h-5 w-5 shrink-0 animate-spin text-accent motion-reduce:animate-none"
		/>
		Your project is saved. Bringing its summary together…
	</div>
{:else if error && !packet}
	<div class="rounded-lg border border-warning/30 bg-warning/10 p-4" role="alert">
		<p class="text-sm font-medium text-foreground">
			Your project is saved; its summary couldn’t be loaded.
		</p>
		<p class="mt-1 text-sm text-muted-foreground">{error}</p>
		<Button class="mt-3" variant="outline" size="sm" onclick={onRetry}>Retry summary</Button>
	</div>
{:else if packet}
	<article
		class="overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak"
		aria-label="Your project receipt"
	>
		<div class="space-y-4 p-4 sm:p-5">
			{#if sourceText.trim()}
				<div>
					<p class="micro-label mb-2 text-muted-foreground">Your words</p>
					<blockquote
						class="border-l-2 border-accent/40 pl-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]"
					>
						{sourceText.trim().slice(0, 420)}{sourceText.trim().length > 420 ? '…' : ''}
					</blockquote>
				</div>
			{/if}
			<div>
				<p class="micro-label mb-2 text-muted-foreground">What BuildOS understood</p>
				<h3 class="text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
					{packet.project.name}
				</h3>
				{#if packet.project.description}<p
						class="mt-1 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
					>
						{packet.project.description}
					</p>{/if}
			</div>
			<div>
				<p class="micro-label mb-2 text-muted-foreground">What it created</p>
				<p class="text-sm text-foreground">
					{packet.counts.tasks}
					{packet.counts.tasks === 1 ? 'task' : 'tasks'} · {packet.counts.goals}
					{packet.counts.goals === 1 ? 'goal' : 'goals'} · {packet.counts.documents}
					{packet.counts.documents === 1 ? 'document' : 'documents'}
				</p>
				{#if packet.sample_entities.length}
					<ul class="mt-2 space-y-1.5">
						{#each packet.sample_entities.slice(0, 3) as entity (entity.id)}
							<li class="flex items-baseline justify-between gap-3 text-sm">
								<span class="min-w-0 text-foreground [overflow-wrap:anywhere]"
									>{entity.name}</span
								>
								<span class="shrink-0 text-2xs text-muted-foreground"
									>{entity.kind}</span
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
		<div class="border-t border-border p-4 sm:p-5">
			<p class="micro-label mb-2 flex items-center gap-2 text-muted-foreground">
				<FileText class="h-4 w-4" /> What it will remember
			</p>
			{#if packet.start_here?.excerpt}
				<p
					class="text-sm leading-relaxed text-foreground whitespace-pre-wrap [overflow-wrap:anywhere]"
				>
					{packet.start_here.excerpt}
				</p>
				<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
					Saved in Start Here. BuildOS reads this when you return, so you can pick up
					where you left off.
				</p>
			{:else}
				<p class="text-sm leading-relaxed text-muted-foreground">
					Your project is saved. The Start Here memory preview isn’t available yet.
				</p>
				<Button
					class="mt-2"
					variant="ghost"
					size="sm"
					onclick={onRetry}
					{loading}
					disabled={loading}>Refresh memory preview</Button
				>
			{/if}
			{#if error}<p class="mt-2 text-sm text-destructive" role="alert">
					The saved preview is shown. Refresh failed; please try again.
				</p>{/if}
		</div>
		{#if showNextMove && packet.project.next_step_short}
			<div class="flex items-start gap-3 border-t border-accent/20 bg-accent/5 p-4 sm:p-5">
				<ArrowRight class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
				<div class="min-w-0">
					<p class="micro-label mb-1 text-muted-foreground">Next move</p>
					<p
						class="text-sm font-medium leading-relaxed text-foreground [overflow-wrap:anywhere]"
					>
						{packet.project.next_step_short}
					</p>
				</div>
			</div>
		{/if}
	</article>
{/if}
