<!-- apps/web/src/lib/components/ui/TabNav.svelte -->
<script lang="ts" module>
	import type { ComponentType } from 'svelte';

	export interface Tab {
		id: string;
		label: string;
		icon?: ComponentType;
		count?: number;
		hideCount?: boolean;
	}
</script>

<script lang="ts">
	interface Props {
		tabs?: Tab[];
		activeTab: string;
		containerClass?: string;
		navClass?: string;
		ariaLabel?: string;
		onchange?: (event: { detail: string }) => void;
	}

	let {
		tabs = [],
		activeTab,
		containerClass = '',
		navClass = '',
		ariaLabel = 'Tabs',
		onchange
	}: Props = $props();

	function handleTabClick(tabId: string) {
		if (tabId !== activeTab) {
			onchange?.({ detail: tabId });
		}
	}
</script>

<div class="tab-container {containerClass}">
	<div class="tab-nav {navClass}" role="tablist" aria-label={ariaLabel}>
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === tab.id}
				aria-controls="{tab.id}-panel"
				onclick={() => handleTabClick(tab.id)}
				class="tab-button {activeTab === tab.id ? 'tab-active' : 'tab-inactive'}"
			>
				{#if tab.icon}
					{@const TabIcon = tab.icon}
					<TabIcon class="tab-icon" />
				{/if}
				<span class="tab-label">{tab.label}</span>
				{#if !tab.hideCount && tab.count !== undefined}
					<span
						class="tab-badge {activeTab === tab.id ? 'badge-active' : 'badge-inactive'}"
					>
						{tab.count}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	/*
	 * Inkprint Tab Navigation
	 * Uses semantic tokens instead of hardcoded colors
	 * Flat design (no gradients) per Inkprint "Printed, Not Plastic" principle
	 */

	/* Tab container - Inkprint border token */
	.tab-container {
		@apply border-b border-border relative;
	}

	/* Tab navigation with smooth scrolling */
	.tab-nav {
		@apply flex gap-2 overflow-x-auto overflow-y-hidden px-2 sm:px-0;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: smooth;
		scrollbar-width: none;
		-ms-overflow-style: none;
		margin-bottom: -1px;
	}

	.tab-nav::-webkit-scrollbar {
		display: none;
	}

	/* Tab button - consistent spacing on 8px grid */
	.tab-button {
		@apply inline-flex items-center justify-center;
		@apply gap-2;
		@apply px-4 py-3;
		@apply border-none border-b-2 border-transparent;
		@apply bg-transparent;
		@apply text-sm font-medium leading-5;
		@apply whitespace-nowrap cursor-pointer;
		@apply transition-colors duration-200;
		@apply outline-none;
		@apply min-h-[44px] flex-shrink-0; /* WCAG touch target */
	}

	/* Active tab - Inkprint accent, flat background */
	.tab-active {
		@apply border-b-accent text-accent bg-accent/5;
		@apply font-semibold;
		letter-spacing: -0.01em;
	}

	/* Inactive tab - muted foreground */
	.tab-inactive {
		@apply border-b-transparent text-muted-foreground;
	}

	/* Hover state - subtle preview */
	.tab-inactive:hover {
		@apply text-foreground border-b-border bg-muted/50;
	}

	/* Focus state for keyboard navigation - Inkprint ring */
	.tab-button:focus-visible {
		@apply outline-2 outline-ring outline-offset-[-2px] rounded-md;
	}

	/* Active state on press - Inkprint pressable feel */
	.tab-button:active {
		transform: scale(0.98);
	}

	/* Tab icon - consistent sizing */
	.tab-icon {
		@apply w-4 h-4 flex-shrink-0;
		@apply transition-transform duration-200;
	}

	/* Tab label */
	.tab-label {
		font-variant-numeric: tabular-nums;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	/* Count badge - Inkprint styling */
	.tab-badge {
		@apply inline-flex items-center justify-center;
		@apply px-2 py-0.5 text-xs font-semibold leading-4;
		@apply rounded-full;
		@apply transition-colors duration-200;
		@apply min-w-[1.5rem];
		font-variant-numeric: tabular-nums;
	}

	/* Active badge - accent variant */
	.badge-active {
		@apply bg-accent/15 text-accent;
	}

	/* Inactive badge - muted variant */
	.badge-inactive {
		@apply bg-muted text-muted-foreground;
	}

	/* Hover state for inactive badge */
	.tab-inactive:hover .badge-inactive {
		@apply bg-muted text-foreground;
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.tab-button,
		.tab-icon,
		.tab-badge {
			transition: none;
		}

		.tab-button:active {
			transform: none;
		}
	}
</style>
