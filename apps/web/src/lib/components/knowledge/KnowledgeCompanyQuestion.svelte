<!-- apps/web/src/lib/components/knowledge/KnowledgeCompanyQuestion.svelte -->
<!--
	One "Which one?" question (tasker 170): several companies share an organization's name, and
	the free lookup will not guess between them. Shows who the user knows there (their own
	clue), then each company with its town, website and what it does. One tap answers; "None
	of these" leaves the organization for a web search. Used in the review stack and on the
	organization's own card.
-->
<script lang="ts">
	import { ExternalLink, Loader2 } from '$lib/icons/lucide';
	import {
		optionAbout,
		optionLine,
		peopleLine,
		type CompanyOption,
		type CompanyQuestionChoice,
		type KnowledgeCompanyQuestion
	} from './company-locate-client';

	interface Props {
		question: KnowledgeCompanyQuestion;
		onAnswer: (choice: CompanyQuestionChoice) => Promise<void> | void;
		/** The review stack offers "Skip": look at this one later. */
		onSkip?: () => void;
		/** On a card: no heading (the card already names the organization). */
		compact?: boolean;
	}

	let { question, onAnswer, onSkip, compact = false }: Props = $props();

	/** The option (or "none") being saved, so the row shows it and nothing is tapped twice. */
	let saving = $state<string | null>(null);

	const people = $derived(peopleLine(question.people));
	const more = $derived(question.options_total - question.options.length);

	async function answer(choice: CompanyQuestionChoice, marker: string) {
		if (saving) return;
		saving = marker;
		try {
			await onAnswer(choice);
		} finally {
			saving = null;
		}
	}

	const sourcesOf = (option: CompanyOption) =>
		option.sources.map((source) => source.label.replace(/ \(CC BY 4\.0\)$/, '')).join(' + ');
</script>

<div class="flex min-w-0 flex-col gap-3">
	<div class="flex min-w-0 flex-col gap-0.5">
		{#if compact}
			<p class="text-sm font-medium text-foreground">
				{question.options_total} companies have this name. Which one?
			</p>
		{:else}
			<h3 class="text-base font-semibold text-foreground">Which {question.name}?</h3>
		{/if}
		{#if people && !compact}
			<p class="text-sm text-muted-foreground">{people}</p>
		{/if}
	</div>

	<ul class="flex min-w-0 flex-col gap-2">
		{#each question.options as option (option.key)}
			{@const about = optionAbout(option)}
			{@const line = optionLine(option)}
			<li class="flex min-w-0 items-stretch gap-1">
				<button
					type="button"
					class="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left pressable hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
					disabled={saving !== null}
					onclick={() => void answer({ choice: 'option', key: option.key }, option.key)}
				>
					<span class="flex w-full min-w-0 items-center gap-2">
						<span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
							>{option.name}</span
						>
						{#if saving === option.key}
							<Loader2
								class="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
								aria-hidden="true"
							/>
						{/if}
					</span>
					{#if line}
						<span class="w-full truncate text-sm text-foreground">{line}</span>
					{/if}
					{#if about}
						<span class="w-full truncate text-xs text-muted-foreground">{about}</span>
					{/if}
					<span class="w-full truncate text-xs text-muted-foreground"
						>From {sourcesOf(option)}</span
					>
				</button>
				{#if option.domain}
					<a
						href="https://{option.domain}"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-grid w-10 shrink-0 place-items-center rounded-md border border-border text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Open {option.domain} in a new tab"
						title="Open {option.domain}"
					>
						<ExternalLink class="h-4 w-4" aria-hidden="true" />
					</a>
				{/if}
			</li>
		{/each}
	</ul>

	{#if more > 0}
		<p class="text-xs text-muted-foreground">
			Showing the {question.options.length} best known of {question.options_total} with this name.
		</p>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
			disabled={saving !== null}
			onclick={() => void answer({ choice: 'none_of_these' }, 'none')}
		>
			{#if saving === 'none'}
				<Loader2
					class="h-4 w-4 animate-spin motion-reduce:animate-none"
					aria-hidden="true"
				/>
			{/if}
			None of these
		</button>
		{#if onSkip}
			<button
				type="button"
				class="ml-auto inline-flex min-h-9 items-center rounded-md px-3 text-sm text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				disabled={saving !== null}
				onclick={onSkip}
			>
				Skip for now
			</button>
		{/if}
	</div>
</div>
