<!-- apps/web/src/lib/components/inbox/InboxAskCard.svelte -->
<!--
	One "Pick a path" card in the Project cleanup (tasker 149): the question, why it is asked,
	2–3 answers as large options (recommended marked, each saying what happens), the items it
	settles, and "Talk it through". The parent runs the answer; after it lands the options give
	way to a short receipt.
-->
<script module lang="ts">
	export type AskCardReceipt = {
		text: string;
		detail?: string | null;
		tone?: 'done' | 'warn';
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type {
		ProjectCleanupAnswer,
		ProjectCleanupAsk,
		ProjectCleanupItem
	} from '@buildos/shared-types';
	import { AlertTriangle, Check, LoaderCircle, MessageCircle } from '$lib/icons/lucide';

	let {
		ask,
		items = [],
		canDecide = false,
		disabled = false,
		loadingIndex = null,
		canApply = true,
		answered = null,
		error = null,
		meta = null,
		openingChat = false,
		onAnswer,
		onTalk,
		details,
		actions,
		footer
	}: {
		ask: ProjectCleanupAsk;
		/** The open items this question settles. */
		items?: ProjectCleanupItem[];
		canDecide?: boolean;
		/** Another save is running. */
		disabled?: boolean;
		/** The answer being saved. */
		loadingIndex?: number | null;
		/** False when none of the covered items has a verified change to apply. */
		canApply?: boolean;
		answered?: AskCardReceipt | null;
		error?: string | null;
		/** A quiet footer line, e.g. "Seen in 3 reviews since Oct 4". */
		meta?: string | null;
		openingChat?: boolean;
		onAnswer?: (answer: ProjectCleanupAnswer, index: number) => void;
		onTalk?: () => void;
		/** Extra detail under the context, e.g. "What changes". */
		details?: Snippet;
		/** Extra footer links beside "Talk it through", e.g. "Add a note". */
		actions?: Snippet;
		/** Content under the footer, e.g. an open note box. */
		footer?: Snippet;
	} = $props();

	const uid = $props.id();
	const questionId = `${uid}-question`;
	const settles = $derived(items.length > 1 ? items.map((item) => item.title) : []);
	const columns = $derived(ask.answers.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2');
</script>

<article
	aria-labelledby={questionId}
	class="min-w-0 rounded-md border border-border bg-background p-3 shadow-ink-inner"
>
	<p id={questionId} class="break-words text-sm font-semibold leading-snug text-foreground">
		{ask.question}
	</p>
	{#if ask.context}
		<p class="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
			{ask.context}
		</p>
	{/if}

	{@render details?.()}

	{#if answered}
		<div
			role="status"
			class="mt-2 flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-xs text-foreground {answered.tone ===
			'warn'
				? 'border-warning/40 bg-warning/10'
				: 'border-success/30 bg-success/10'}"
		>
			{#if answered.tone === 'warn'}
				<AlertTriangle
					class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
					aria-hidden="true"
				/>
			{:else}
				<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
			{/if}
			<div class="min-w-0">
				<p class="break-words font-medium">{answered.text}</p>
				{#if answered.detail}
					<p class="mt-0.5 break-words text-muted-foreground">{answered.detail}</p>
				{/if}
			</div>
		</div>
	{:else if canDecide}
		<div class="mt-2.5 grid gap-2 {columns}">
			{#each ask.answers as answer, index (`${index}:${answer.label}`)}
				{@const blocked = answer.action === 'apply' && !canApply}
				{@const loading = loadingIndex === index}
				<button
					type="button"
					onclick={() => onAnswer?.(answer, index)}
					disabled={disabled || blocked}
					aria-busy={loading}
					class="flex min-h-11 min-w-0 flex-col items-start gap-0.5 rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-info hover:bg-info/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border-strong disabled:hover:bg-card motion-reduce:transition-none {answer.recommended
						? 'border-info/50'
						: 'border-border-strong'}"
				>
					<span
						class="flex min-w-0 flex-wrap items-center gap-1.5 break-words text-sm font-semibold text-foreground"
					>
						{#if loading}
							<LoaderCircle
								class="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						{/if}
						{answer.label}
						{#if answer.recommended}
							<span
								class="rounded border border-info/40 px-1 py-px font-mono text-2xs font-semibold uppercase tracking-wide text-info"
							>
								Recommended
							</span>
						{/if}
					</span>
					{#if blocked}
						<span class="break-words text-2xs text-muted-foreground">
							Not ready to apply from here. Talk it through instead.
						</span>
					{:else if answer.effect}
						<span class="break-words text-xs text-muted-foreground"
							>{answer.effect}</span
						>
					{/if}
				</button>
			{/each}
		</div>
	{:else}
		<ul class="mt-2 space-y-1" aria-label="Options">
			{#each ask.answers as answer, index (`${index}:${answer.label}`)}
				<li class="break-words text-xs text-foreground">
					<span class="font-semibold">{answer.label}</span>
					{#if answer.recommended}
						<span class="text-info">(recommended)</span>
					{/if}
					{#if answer.effect}
						<span class="text-muted-foreground">— {answer.effect}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if error}
		<p role="alert" class="mt-2 break-words text-xs text-destructive">{error}</p>
	{/if}

	{#if settles.length}
		<div class="mt-2 flex min-w-0 flex-wrap items-start gap-1.5 text-2xs text-muted-foreground">
			<span class="py-0.5">Settles:</span>
			<ul class="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Settles">
				{#each settles as title, index (`${index}:${title}`)}
					<li
						class="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-foreground"
					>
						{title}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if meta || (canDecide && (onTalk || actions))}
		<div class="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-2">
			<span class="min-w-0 break-words text-2xs text-muted-foreground">{meta ?? ''}</span>
			<span class="flex flex-wrap items-center gap-x-2">
				{#if canDecide}
					{@render actions?.()}
				{/if}
				{#if onTalk && canDecide}
					<button
						type="button"
						onclick={() => onTalk?.()}
						disabled={openingChat}
						class="-mr-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
					>
						<MessageCircle class="h-3.5 w-3.5" aria-hidden="true" />
						Talk it through
					</button>
				{/if}
			</span>
		</div>
	{/if}

	{@render footer?.()}
</article>
