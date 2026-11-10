<!-- apps/web/src/lib/components/inbox/InboxAutoCheck.svelte -->
<!--
	The check that decides whether a tidy-up is applied without asking (tasker 156): one plain
	verdict line, then its four answers against their bars. Shown on tidy-ups that were asked
	about and on "Done for you" changes.
-->
<script lang="ts">
	import type { TrailCheck } from './inbox-item-trail';

	let { check }: { check: TrailCheck } = $props();

	const percent = (value: number) => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
</script>

<div class="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
	<p class="break-words text-2xs text-foreground/90">{check.verdict}</p>
	<dl class="mt-1 grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-x-2 gap-y-0.5">
		{#each check.rows as row (row.key)}
			<dt class="min-w-0 truncate text-2xs text-muted-foreground">{row.label}</dt>
			<dd class="relative h-1.5 rounded-full bg-muted" aria-hidden="true">
				<span
					class="absolute inset-y-0 left-0 rounded-full {row.pass === false
						? 'bg-warning'
						: 'bg-success'}"
					style:width={percent(row.score)}
				></span>
				{#if row.bar !== null}
					<span
						class="absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground"
						style:left={percent(row.bar)}
					></span>
				{/if}
			</dd>
			<dd
				class="whitespace-nowrap text-right font-mono text-2xs tabular-nums {row.pass ===
				false
					? 'font-semibold text-foreground'
					: 'text-muted-foreground'}"
			>
				{row.score.toFixed(2)}
				{#if row.bar !== null}
					<span aria-hidden="true">{row.direction === 'min' ? '≥' : '≤'}</span>
					<span class="sr-only"
						>{row.direction === 'min' ? 'needs at least' : 'needs at most'}</span
					>
					{row.bar.toFixed(2)}
				{/if}
			</dd>
		{/each}
	</dl>
</div>
