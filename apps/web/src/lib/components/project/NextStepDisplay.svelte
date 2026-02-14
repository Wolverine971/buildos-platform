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
	import { slide } from 'svelte/transition';
	import { ChevronDown, Zap, RefreshCw, LoaderCircle } from 'lucide-svelte';
	import { parseEntityReferences } from '$lib/utils/entity-reference-parser';
	import type { EntityReference } from '@buildos/shared-types';
	import { toastService } from '$lib/stores/toast.store';

	// Helper to escape HTML special characters
	function escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

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

	const parsedLong = $derived.by(() => {
		if (!nextStepLong) return null;
		return parseEntityReferences(nextStepLong);
	});

	const updatedTimeAgo = $derived.by(() => {
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

		const parsed = parsedLong;
		if (!parsed) return nextStepLong;

		// Replace entity references with styled spans
		// Pattern: [[type:id|displayText]] where id can be UUID or slug (alphanumeric + hyphens)
		let html = nextStepLong;
		const regex = /\[\[(\w+):([\w-]+)\|([^\]]+)\]\]/gi;

		html = html.replace(regex, (_match, type, id, displayText) => {
			// Properly escape all dynamic content for safe HTML injection
			const safeType = escapeHtml(type);
			const safeId = escapeHtml(id);
			const safeText = escapeHtml(displayText);

			return `<button
				class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium cursor-pointer"
				data-entity-type="${safeType}"
				data-entity-id="${safeId}"
			>${safeText}</button>`;
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
		class="group border-t border-border/60 pt-2 {className}"
		role="region"
		aria-label="Suggested next move"
	>
		<!-- Label row -->
		<div class="flex items-center gap-1.5 mb-1">
			<Zap class="w-3 h-3 text-accent shrink-0" />
			<span class="text-[10px] font-semibold uppercase tracking-wider text-accent">
				Suggested Next Move
			</span>
			{#if updatedTimeAgo}
				<span class="text-[10px] text-muted-foreground hidden sm:inline">
					· {updatedTimeAgo}
				</span>
			{/if}
			<!-- Regenerate button -->
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					handleGenerateNextStep();
				}}
				disabled={isGenerating}
				class="ml-auto p-1 rounded-md sm:opacity-0 sm:group-hover:opacity-100 hover:bg-accent/15 active:bg-accent/25 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring pressable"
				title="Regenerate next step"
				aria-label="Regenerate next step"
			>
				{#if isGenerating}
					<LoaderCircle class="w-3 h-3 text-muted-foreground animate-spin" />
				{:else}
					<RefreshCw class="w-3 h-3 text-muted-foreground" />
				{/if}
			</button>
		</div>

		<!-- Next step text (clickable to expand if long version exists) -->
		<div
			role={hasLongVersion ? 'button' : undefined}
			tabindex={hasLongVersion ? 0 : -1}
			onclick={toggleExpand}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleExpand();
				}
			}}
			class="flex items-start gap-1.5 {hasLongVersion
				? 'cursor-pointer'
				: 'cursor-default'}"
			aria-expanded={hasLongVersion ? isExpanded : undefined}
		>
			<p class="text-sm font-medium text-foreground leading-snug flex-1 min-w-0">
				{nextStepShort}
			</p>
			{#if hasLongVersion}
				<div
					class="shrink-0 mt-0.5 text-muted-foreground transition-transform duration-[120ms]"
					class:rotate-180={isExpanded}
				>
					<ChevronDown class="w-3.5 h-3.5" />
				</div>
			{/if}
		</div>

		<!-- Expanded content -->
		{#if isExpanded && hasLongVersion}
			<div class="pt-1.5" transition:slide={{ duration: 120 }}>
				<div class="h-px bg-border/50 mb-1.5"></div>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div
					class="text-xs text-muted-foreground leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none"
					onclick={handleLongContentClick}
					role="presentation"
				>
					{@html renderLongContent()}
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Empty state with generate button -->
	<div
		class="border-t border-border/60 pt-2 {className}"
		role="region"
		aria-label="Generate next step"
	>
		<button
			type="button"
			onclick={handleGenerateNextStep}
			disabled={isGenerating}
			class="w-full flex items-center gap-1.5 hover:bg-muted/30 active:bg-muted/50 -mx-1 px-1 py-1 rounded transition-colors disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-ring pressable"
		>
			<Zap class="w-3 h-3 text-muted-foreground shrink-0" />
			<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				Suggested Next Move
			</span>
			<span class="text-xs text-muted-foreground">
				{#if isGenerating}
					<span class="inline-flex items-center gap-1">
						<LoaderCircle class="w-3 h-3 animate-spin" />
						Generating…
					</span>
				{:else}
					— Tap to generate
				{/if}
			</span>
		</button>
	</div>
{/if}
