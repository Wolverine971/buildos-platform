<!-- apps/web/src/lib/components/project/NextStepDisplay.svelte -->
<!--
	NextStepDisplay.svelte

	Displays the project's "next move" - a clear, actionable next step
	that helps users know what to do next.

	Features:
	- Always visible short summary (one line)
	- Expandable to show detailed description
	- Parses entity references [[type:id|text]] as clickable links
	- Generate button when no next step exists
	- Clean, minimal design following Inkprint system

	@see /apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md
-->
<script lang="ts">
	import { ChevronDown, Sparkles, User, Zap, RefreshCw, Loader2 } from 'lucide-svelte';
	import {
		parseEntityReferences,
		type EntityReference
	} from '$lib/utils/entity-reference-parser';
	import { toastService } from '$lib/stores/toast.store';

	// Props
	interface Props {
		projectId: string;
		nextStepShort: string | null | undefined;
		nextStepLong: string | null | undefined;
		nextStepSource?: 'ai' | 'user' | null;
		nextStepUpdatedAt?: string | null;
		onEntityClick?: (ref: EntityReference) => void;
		onNextStepGenerated?: (nextStep: { short: string; long: string }) => void;
		class?: string;
	}

	let {
		projectId,
		nextStepShort,
		nextStepLong,
		nextStepSource,
		nextStepUpdatedAt,
		onEntityClick,
		onNextStepGenerated,
		class: className = ''
	}: Props = $props();

	// State
	let isExpanded = $state(false);
	let isGenerating = $state(false);

	// Derived
	const hasNextStep = $derived(!!nextStepShort);
	const hasLongVersion = $derived(!!nextStepLong && nextStepLong !== nextStepShort);

	const parsedLong = $derived(() => {
		if (!nextStepLong) return null;
		return parseEntityReferences(nextStepLong);
	});

	const sourceLabel = $derived(() => {
		if (nextStepSource === 'ai') return 'AI suggested';
		if (nextStepSource === 'user') return 'Set by you';
		return null;
	});

	const updatedTimeAgo = $derived(() => {
		if (!nextStepUpdatedAt) return null;
		const date = new Date(nextStepUpdatedAt);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	});

	// Handlers
	function toggleExpand() {
		if (hasLongVersion) {
			isExpanded = !isExpanded;
		}
	}

	function handleEntityClick(ref: EntityReference) {
		if (onEntityClick) {
			onEntityClick(ref);
		}
	}

	async function handleGenerateNextStep() {
		if (isGenerating) return;

		isGenerating = true;
		try {
			const response = await fetch(`/api/onto/projects/${projectId}/next-step/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to generate next step');
			}

			toastService.success('Next step generated!');

			// Notify parent component of the new next step
			if (onNextStepGenerated && result.data) {
				onNextStepGenerated({
					short: result.data.next_step_short,
					long: result.data.next_step_long
				});
			}
		} catch (error) {
			console.error('Failed to generate next step:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to generate next step'
			);
		} finally {
			isGenerating = false;
		}
	}

	/**
	 * Render the long description with entity references as clickable spans
	 */
	function renderLongContent(): string {
		if (!nextStepLong) return '';

		const parsed = parsedLong();
		if (!parsed) return nextStepLong;

		// Replace entity references with styled spans
		// Pattern: [[type:id|displayText]] where id can be UUID or slug (alphanumeric + hyphens)
		let html = nextStepLong;
		const regex = /\[\[(\w+):([\w-]+)\|([^\]]+)\]\]/gi;

		html = html.replace(regex, (match, type, id, displayText) => {
			return `<button
				class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium cursor-pointer"
				data-entity-type="${type}"
				data-entity-id="${id}"
			>${displayText}</button>`;
		});

		return html;
	}

	function handleLongContentClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		// Use closest() to find the button even if click was on child element
		const button = target.closest('button[data-entity-type]') as HTMLElement | null;
		if (button && button.dataset.entityType) {
			event.preventDefault();
			event.stopPropagation();
			const ref: EntityReference = {
				type: button.dataset.entityType as EntityReference['type'],
				id: button.dataset.entityId || '',
				displayText: button.textContent || ''
			};
			handleEntityClick(ref);
		}
	}
</script>

{#if hasNextStep}
	<div
		class="group rounded-lg border border-accent/20 bg-accent/5 {className}"
		role="region"
		aria-label="Next step"
	>
		<!-- Main clickable area -->
		<div
			role="button"
			tabindex={hasLongVersion ? 0 : -1}
			onclick={toggleExpand}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleExpand();
				}
			}}
			class="w-full text-left px-3 py-2.5 flex items-start gap-3 {hasLongVersion
				? 'cursor-pointer'
				: 'cursor-default'}"
			aria-expanded={isExpanded}
		>
			<!-- Icon -->
			<div
				class="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center mt-0.5"
			>
				<Zap class="w-4 h-4 text-accent" />
			</div>

			<!-- Content -->
			<div class="flex-1 min-w-0">
				<!-- Label row -->
				<div class="flex items-center gap-2 mb-0.5">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-accent">
						Next Move
					</span>
					<!-- {#if sourceLabel()}
						<span
							class="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
						>
							{#if nextStepSource === 'ai'}
								<Sparkles class="w-3 h-3" />
							{:else}
								<User class="w-3 h-3" />
							{/if}
							{sourceLabel()}
						</span>
					{/if} -->
					{#if updatedTimeAgo()}
						<span class="text-[10px] text-muted-foreground/60">
							{updatedTimeAgo()}
						</span>
					{/if}

					<!-- Regenerate button (shown on hover, in the label row) -->
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							handleGenerateNextStep();
						}}
						disabled={isGenerating}
						class="ml-auto p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent/20 transition-all disabled:opacity-50"
						title="Regenerate next step"
						aria-label="Regenerate next step"
					>
						{#if isGenerating}
							<Loader2 class="w-3 h-3 text-muted-foreground animate-spin" />
						{:else}
							<RefreshCw class="w-3 h-3 text-muted-foreground" />
						{/if}
					</button>
				</div>

				<!-- Short description - always visible -->
				<p class="text-sm font-medium text-foreground leading-snug pr-6">
					{nextStepShort}
				</p>
			</div>

			<!-- Expand indicator -->
			{#if hasLongVersion}
				<div
					class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground transition-transform duration-200 {isExpanded
						? 'rotate-180'
						: ''}"
				>
					<ChevronDown class="w-4 h-4" />
				</div>
			{/if}
		</div>

		<!-- Expanded content -->
		{#if isExpanded && hasLongVersion}
			<div class="px-3 pb-3 pt-0">
				<div class="pl-10">
					<div class="h-px bg-border/50 mb-2.5"></div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div
						class="text-sm text-muted-foreground leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none"
						onclick={handleLongContentClick}
						role="presentation"
					>
						{@html renderLongContent()}
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Empty state with generate button -->
	<div
		class="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 {className}"
		role="region"
		aria-label="Generate next step"
	>
		<button
			type="button"
			onclick={handleGenerateNextStep}
			disabled={isGenerating}
			class="w-full px-3 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors rounded-lg disabled:opacity-70"
		>
			<!-- Icon -->
			<div
				class="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
			>
				{#if isGenerating}
					<Loader2 class="w-4 h-4 text-muted-foreground animate-spin" />
				{:else}
					<Sparkles class="w-4 h-4 text-muted-foreground" />
				{/if}
			</div>

			<!-- Content -->
			<div class="flex-1 min-w-0 text-left">
				<span
					class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					Next Move
				</span>
				<p class="text-sm text-muted-foreground">
					{#if isGenerating}
						Analyzing project and generating next step...
					{:else}
						Click to generate your next step
					{/if}
				</p>
			</div>

			<!-- Arrow/indicator -->
			{#if !isGenerating}
				<div class="flex-shrink-0 text-muted-foreground">
					<Zap class="w-4 h-4" />
				</div>
			{/if}
		</button>
	</div>
{/if}
