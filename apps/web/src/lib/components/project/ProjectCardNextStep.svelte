<!-- apps/web/src/lib/components/project/ProjectCardNextStep.svelte -->
<!--
	ProjectCardNextStep.svelte

	Compact next step display for project cards.
	Shows short version by default, expandable to long version.

	Features:
	- Ultra-compact design for card context
	- Click to expand/collapse
	- Stops propagation so card link isn't triggered
	- Parses entity references [[type:id|text]] and displays them as styled inline elements
-->
<script lang="ts">
	import { ChevronDown, Zap } from 'lucide-svelte';

	interface Props {
		nextStepShort: string | null | undefined;
		nextStepLong: string | null | undefined;
		class?: string;
	}

	let { nextStepShort, nextStepLong, class: className = '' }: Props = $props();

	let isExpanded = $state(false);

	const hasNextStep = $derived(!!nextStepShort);
	const hasLongVersion = $derived(!!nextStepLong && nextStepLong !== nextStepShort);

	/**
	 * Format text with entity references as styled inline elements.
	 * Pattern: [[type:id|displayText]] where id can be UUID or slug
	 * Example: [[task:abc123|Write the proposal]] becomes a styled span
	 */
	function formatWithEntityRefs(text: string | null | undefined): string {
		if (!text) return '';

		// Replace entity references with styled spans
		const regex = /\[\[(\w+):([\w-]+)\|([^\]]+)\]\]/gi;

		return text.replace(regex, (match, type, id, displayText) => {
			return `<span class="inline-flex items-center px-1 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-medium">${displayText}</span>`;
		});
	}

	const formattedShort = $derived(formatWithEntityRefs(nextStepShort));
	const formattedLong = $derived(formatWithEntityRefs(nextStepLong));

	function toggleExpand(event: MouseEvent | KeyboardEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (hasLongVersion) {
			isExpanded = !isExpanded;
		}
	}
</script>

{#if hasNextStep}
	<div
		class="rounded-md border border-accent/20 bg-accent/5 {className}"
		role="region"
		aria-label="Next step"
	>
		<!-- Header/Short version - always visible -->
		<button
			type="button"
			onclick={toggleExpand}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					toggleExpand(e);
				}
			}}
			class="w-full text-left px-2 py-1.5 flex items-start gap-1.5 {hasLongVersion
				? 'cursor-pointer hover:bg-accent/10 transition-colors rounded-md'
				: 'cursor-default'}"
			aria-expanded={hasLongVersion ? isExpanded : undefined}
			disabled={!hasLongVersion}
		>
			<!-- Icon -->
			<Zap class="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />

			<!-- Content -->
			<div class="flex-1 min-w-0">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<p
					class="text-xs text-foreground leading-snug next-step-text {isExpanded
						? ''
						: 'line-clamp-2'}"
				>
					{@html formattedShort}
				</p>
			</div>

			<!-- Expand chevron -->
			{#if hasLongVersion}
				<ChevronDown
					class="w-3 h-3 text-muted-foreground flex-shrink-0 transition-transform duration-200 {isExpanded
						? 'rotate-180'
						: ''}"
				/>
			{/if}
		</button>

		<!-- Expanded long version -->
		{#if isExpanded && hasLongVersion}
			<div class="px-2 pb-2 pt-0">
				<div class="pl-4.5 border-t border-accent/10 pt-1.5 mt-0.5">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<p class="text-xs text-muted-foreground leading-relaxed next-step-text">
						{@html formattedLong}
					</p>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Custom spacing for the left padding to align with icon */
	.pl-4\.5 {
		padding-left: 1.125rem;
	}

	/* Ensure entity reference spans flow nicely with text */
	:global(.next-step-text span) {
		vertical-align: baseline;
		margin: 0 1px;
	}
</style>
