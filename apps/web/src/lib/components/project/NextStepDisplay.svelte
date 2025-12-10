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
		class="group rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak {className}"
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
			class="w-full text-left px-3 py-2 sm:py-2.5 {hasLongVersion
				? 'cursor-pointer hover:bg-accent/5 transition-colors'
				: 'cursor-default'}"
			aria-expanded={isExpanded}
		>
			<!-- Mobile: Column layout (header row + content row) | Desktop: Row layout -->
			<div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
				<!-- Header wrapper - becomes transparent on desktop via sm:contents -->
				<div class="flex items-center gap-2 sm:contents">
					<!-- Icon -->
					<div
						class="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-accent/15 flex items-center justify-center sm:mt-0.5"
					>
						<Zap class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
					</div>

					<!-- Mobile: Label in header row -->
					<span
						class="text-[10px] font-semibold uppercase tracking-wider text-accent sm:hidden"
					>
						Next Move
					</span>

					<!-- Desktop: Content column (hidden on mobile, direct flex child on desktop) -->
					<div class="hidden sm:block sm:flex-1 sm:min-w-0">
						<div class="flex items-center gap-2 mb-0.5">
							<span
								class="text-[10px] font-semibold uppercase tracking-wider text-accent"
							>
								Next Move
							</span>
							{#if updatedTimeAgo()}
								<span class="text-[10px] text-muted-foreground">
									{updatedTimeAgo()}
								</span>
							{/if}
							<!-- Desktop: Regenerate button (hover reveal) -->
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									handleGenerateNextStep();
								}}
								disabled={isGenerating}
								class="ml-auto p-1.5 -mr-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent/15 active:bg-accent/25 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring pressable"
								title="Regenerate next step"
								aria-label="Regenerate next step"
							>
								{#if isGenerating}
									<Loader2
										class="w-3.5 h-3.5 text-muted-foreground animate-spin"
									/>
								{:else}
									<RefreshCw class="w-3.5 h-3.5 text-muted-foreground" />
								{/if}
							</button>
						</div>
						<!-- Desktop: Next step text (indented under label) -->
						<p class="text-sm font-medium text-foreground leading-snug pr-6">
							{nextStepShort}
						</p>
					</div>

					<!-- Mobile: Regenerate button in header -->
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							handleGenerateNextStep();
						}}
						disabled={isGenerating}
						class="ml-auto p-1.5 rounded-md hover:bg-accent/15 active:bg-accent/25 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring pressable sm:hidden"
						title="Regenerate next step"
						aria-label="Regenerate next step"
					>
						{#if isGenerating}
							<Loader2 class="w-3.5 h-3.5 text-muted-foreground animate-spin" />
						{:else}
							<RefreshCw class="w-3.5 h-3.5 text-muted-foreground" />
						{/if}
					</button>

					<!-- Chevron (in header on mobile, direct flex child on desktop) -->
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

				<!-- Mobile: Next step text (full width, own row) -->
				<p class="text-sm font-medium text-foreground leading-snug sm:hidden">
					{nextStepShort}
				</p>
			</div>
		</div>

		<!-- Expanded content -->
		{#if isExpanded && hasLongVersion}
			<div class="px-3 pb-3 pt-0">
				<!-- No indent on mobile, indent on desktop to align under label -->
				<div class="sm:pl-10">
					<div class="h-px bg-border mb-2"></div>
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
		class="rounded-lg border border-dashed border-border bg-muted/30 tx tx-bloom tx-weak {className}"
		role="region"
		aria-label="Generate next step"
	>
		<button
			type="button"
			onclick={handleGenerateNextStep}
			disabled={isGenerating}
			class="w-full px-3 py-2.5 flex items-center gap-2.5 sm:gap-3 hover:bg-muted/50 active:bg-muted/70 transition-colors rounded-lg disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset pressable"
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
						<span class="hidden sm:inline"
							>Analyzing project and generating next step...</span
						>
						<span class="sm:hidden">Generating...</span>
					{:else}
						<span class="hidden sm:inline">Click to generate your next step</span>
						<span class="sm:hidden">Tap to generate</span>
					{/if}
				</p>
			</div>

			<!-- Arrow/indicator -->
			{#if !isGenerating}
				<div class="flex-shrink-0 text-accent">
					<Zap class="w-4 h-4" />
				</div>
			{/if}
		</button>
	</div>
{/if}
