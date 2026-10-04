<!-- apps/web/src/lib/components/consolidation/ConsolidationMerge.svelte -->
<!--
	One merge inside a consolidation run: progress while the worker reads and
	sorts, then the proof that nothing was lost (every fact and what happened to
	it), the draft itself, and what the sources flagged. The draft already
	reflects the owner's answers to this merge's questions; unanswered ones
	change no fact.
-->
<script lang="ts">
	import {
		applyEdits,
		fateCounts,
		questionEdits,
		type ConsolidationQuestion,
		type Fate,
		type MergeDraftView
	} from '@buildos/shared-agent-ops/consolidation';
	import Button from '$lib/components/ui/Button.svelte';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';
	import { LoaderCircle } from '$lib/icons/lucide';

	let {
		merge,
		questions,
		sourceTitle,
		projectName,
		busy = false,
		onRetry
	}: {
		/** `stalled`: unfinished and untouched for a while, so it can be started over. */
		merge: MergeDraftView & { stalled?: boolean };
		/** This merge's own question cards (piece `merge:<key>:<n>`). */
		questions: ConsolidationQuestion[];
		sourceTitle: (id: string) => string;
		projectName: (id: string) => string;
		busy?: boolean;
		onRetry: () => void;
	} = $props();

	let showDraft = $state(false);
	let showFacts = $state(false);
	let showUnverified = $state(false);

	const stage = $derived(
		{
			pending: 'Starting',
			extracting: `Reading ${merge.source_ids.length} docs`,
			reconciling: 'Sorting the facts',
			waiting: 'Waiting on your answers',
			writing: 'Writing the draft'
		}[merge.status as string] ?? 'Working'
	);

	// The draft is written from the ledger plus the answers so far.
	const ledger = $derived(
		merge.ledger ? applyEdits(merge.ledger, questions.flatMap(questionEdits)) : null
	);
	const counts = $derived(ledger ? fateCounts(ledger) : null);
	const factText = $derived(new Map((ledger?.facts ?? []).map((fact) => [fact.id, fact])));
	const fateOf = $derived(new Map((ledger?.fates ?? []).map((fate) => [fate.fact_id, fate])));
	const appended = $derived(merge.coverage?.appended_fact_ids.length ?? 0);
	const flags = $derived(merge.ledger?.flags ?? []);
	const unverified = $derived(merge.ledger?.unverified ?? []);
	const prose = getProseClasses('sm');

	const FATE_LABEL: Record<Fate, string> = {
		keep: 'In the doc',
		history: 'In the doc, as history',
		open: 'In the doc, as an open question',
		merged: 'Same as another fact',
		superseded: 'Replaced by a newer fact',
		conflict: 'Unsettled, listed for you',
		missing: 'Missing from its source, listed for you',
		dropped: 'Left out'
	};
	const FATE_ORDER: Fate[] = [
		'keep',
		'history',
		'open',
		'conflict',
		'missing',
		'merged',
		'superseded',
		'dropped'
	];
	const groups = $derived(
		ledger
			? FATE_ORDER.map((fate) => ({
					fate,
					facts: ledger.fates.filter((item) => item.fate === fate)
				})).filter((group) => group.facts.length)
			: []
	);

	function plural(count: number, word: string) {
		return `${count} ${word}${count === 1 ? '' : 's'}`;
	}
	function source(id: string) {
		return id === 'owner' ? 'you' : sourceTitle(id);
	}
</script>

<div class="merge grid gap-2" aria-live="polite">
	<p class="text-sm text-foreground">
		Merging {plural(merge.source_ids.length, 'doc')} into <b>{merge.title}</b> in {projectName(
			merge.target_project_id
		)}
	</p>

	{#if merge.status === 'failed'}
		<p class="text-sm text-destructive" role="alert">
			{merge.error ?? 'The merge did not finish.'} Nothing changed.
		</p>
		<div>
			<Button variant="secondary" size="sm" loading={busy} onclick={onRetry}>Try again</Button
			>
		</div>
	{:else if merge.stalled}
		<p class="text-sm text-destructive" role="alert">
			This merge stopped partway ({stage.toLowerCase()}). Nothing changed.
		</p>
		<div>
			<Button variant="secondary" size="sm" loading={busy} onclick={onRetry}
				>Start over</Button
			>
		</div>
	{:else if merge.status !== 'ready'}
		<p class="flex items-center gap-2 text-sm text-muted-foreground">
			<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{stage}…
		</p>
	{/if}

	{#if ledger && counts && merge.status === 'ready'}
		<p class="text-sm text-muted-foreground">
			{plural(ledger.facts.length, 'fact')} found. {counts.keep +
				counts.history +
				counts.open} in the doc{#if appended}, {appended} of them added word for word at the
				end{/if}{#if counts.merged}; {counts.merged}
				said twice, folded in{/if}{#if counts.superseded}; {counts.superseded} replaced by newer
				notes{/if}{#if counts.conflict}; {counts.conflict} unsettled{/if}{#if counts.missing};
				{counts.missing}
				missing from their source{/if}{#if counts.dropped}; {counts.dropped} left out{/if}.
		</p>
	{/if}

	{#if flags.length || unverified.length}
		<ul class="grid gap-1 text-sm text-muted-foreground">
			{#each flags as flag, index (index)}
				<li>
					<span class="font-medium text-foreground"
						>{flag.kind === 'hollow' ? 'Hollow' : 'Junk'}:</span
					>
					{source(flag.source_id)}: {flag.note}{#if flag.quote}
						(“{flag.quote}”){/if}
				</li>
			{/each}
			{#if unverified.length}
				<li>
					{plural(unverified.length, 'note')} the reader could not find word for word in its
					source {unverified.length === 1 ? 'is' : 'are'} kept apart at the end of the draft,
					under “Couldn’t find word for word”, for you to check.
					<button
						type="button"
						class="toggle"
						aria-expanded={showUnverified}
						onclick={() => (showUnverified = !showUnverified)}
					>
						{showUnverified ? 'Hide them' : 'Show them'}
					</button>
					{#if showUnverified}
						<ul class="facts mt-1 grid gap-1">
							{#each unverified as note, index (index)}
								<li>
									<span class="text-foreground">{note.text}</span> · {source(
										note.source_id
									)}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/if}
		</ul>
	{/if}

	{#if merge.status === 'ready' && merge.markdown}
		<div class="flex flex-wrap gap-3">
			<button
				type="button"
				class="toggle"
				aria-expanded={showDraft}
				onclick={() => (showDraft = !showDraft)}
			>
				{showDraft ? 'Hide the draft' : 'Read the draft'}
			</button>
			{#if ledger}
				<button
					type="button"
					class="toggle"
					aria-expanded={showFacts}
					onclick={() => (showFacts = !showFacts)}
				>
					{showFacts ? 'Hide every fact' : 'See every fact'}
				</button>
			{/if}
		</div>
		{#if showDraft}
			<div class="draft {prose} text-foreground">
				<h3>{merge.title}</h3>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown sanitizes -->
				{@html renderMarkdown(merge.markdown)}
			</div>
		{/if}
		{#if showFacts}
			<div class="grid gap-3">
				{#each groups as group (group.fate)}
					<section class="grid gap-1">
						<h3
							class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							{FATE_LABEL[group.fate]} · {group.facts.length}
						</h3>
						<ul class="facts grid gap-1 text-sm">
							{#each group.facts as fate (fate.fact_id)}
								{@const fact = factText.get(fate.fact_id)}
								{#if fact}
									<li>
										<span class="text-foreground">{fact.text}</span>
										<span class="text-muted-foreground">
											· {source(
												fact.source_id
											)}{#if fate.section && group.fate !== 'dropped'}
												· under “{fate.section}”{/if}{#if fate.with && fateOf.get(fate.with)}
												· see “{factText.get(fate.with)
													?.text}”{/if}{#if fate.reason}
												· {fate.reason}{/if}
										</span>
									</li>
								{/if}
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.merge {
		border-left: 2px solid hsl(var(--border));
		padding-left: 0.75rem;
	}
	.toggle {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.toggle:hover {
		color: hsl(var(--foreground));
	}
	.draft {
		max-height: 28rem;
		overflow-y: auto;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--card));
	}
	.facts li {
		line-height: 1.4;
	}
</style>
