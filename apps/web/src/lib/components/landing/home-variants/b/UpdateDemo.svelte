<!-- apps/web/src/lib/components/landing/home-variants/b/UpdateDemo.svelte -->
<!--
  Homepage B "Then tell it what changed": press Send on a real Fading Crown update and watch the
  task change. Scripted locally; nothing is sent anywhere.
-->
<script lang="ts">
	import { ArrowRight, Check, CircleDot, RotateCcw, Send } from '$lib/icons/lucide';
	import { UPDATE_DEMOS } from './examples';

	let applied = $state<boolean[]>(UPDATE_DEMOS.map(() => false));
	const anyApplied = $derived(applied.some(Boolean));

	function apply(index: number) {
		applied[index] = true;
	}

	function reset() {
		applied = UPDATE_DEMOS.map(() => false);
	}
</script>

<div class="space-y-3">
	{#each UPDATE_DEMOS as demo, index (demo.task)}
		{@const done = applied[index]}
		<div
			class="grid gap-2 rounded-lg border border-border bg-card p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-4"
		>
			<!-- what you say -->
			<div class="flex items-start gap-2">
				<div
					class="min-w-0 flex-1 rounded-lg rounded-tl-sm border border-border bg-background px-3 py-2 text-sm leading-snug text-foreground"
				>
					{demo.say}
				</div>
				<button
					type="button"
					onclick={() => apply(index)}
					disabled={done}
					aria-label={done ? 'Sent' : `Send: ${demo.say}`}
					class="tx-button tx-button-accent inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:bg-muted disabled:text-muted-foreground"
				>
					{#if done}
						<Check class="h-4 w-4" />
					{:else}
						<Send class="h-4 w-4" />
					{/if}
				</button>
			</div>

			<ArrowRight class="hidden h-4 w-4 text-muted-foreground md:block" aria-hidden="true" />

			<!-- what changes -->
			<div
				class="flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2 transition-colors duration-200 motion-reduce:transition-none {done
					? 'border-success/40 bg-success/10'
					: 'border-border bg-background'}"
				aria-live="polite"
			>
				<CircleDot class="h-4 w-4 shrink-0 text-accent" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-foreground">{demo.task}</p>
					<p class="stamp text-2xs text-muted-foreground">
						{#if done}
							<span class="text-muted-foreground line-through">{demo.before}</span>
							<span class="font-medium text-foreground"> → {demo.after}</span>
						{:else}
							{demo.before}
						{/if}
					</p>
				</div>
				{#if done}
					<span
						class="update-flag shrink-0 rounded border border-success/30 bg-background px-1.5 py-0.5 text-2xs font-medium text-success"
						>Updated</span
					>
				{/if}
			</div>
		</div>
	{/each}

	<div class="flex min-h-11 items-center justify-between gap-3">
		<p class="text-xs text-muted-foreground">
			Real tasks from the example novel project. Press Send to see the change.
		</p>
		{#if anyApplied}
			<button
				type="button"
				onclick={reset}
				class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<RotateCcw class="h-3.5 w-3.5" />
				Reset
			</button>
		{/if}
	</div>
</div>

<style>
	.update-flag {
		animation: flag-in 180ms cubic-bezier(0.4, 0, 0.2, 1) both;
	}

	@keyframes flag-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.update-flag {
			animation: none;
		}
	}
</style>
