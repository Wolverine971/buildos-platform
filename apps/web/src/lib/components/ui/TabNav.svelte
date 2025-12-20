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
	/* CSS custom properties for consistent color management */
	:global(:root) {
		--tab-border: rgb(229 231 235);
		--tab-border-dark: rgb(55 65 81);
		--tab-active-color: rgb(37 99 235);
		--tab-active-color-dark: rgb(96 165 250);
		--tab-active-border: rgb(59 130 246);
		--tab-active-border-dark: rgb(96 165 250);
		--tab-inactive-color: rgb(107 114 128);
		--tab-inactive-color-dark: rgb(156 163 175);
		--tab-hover-color: rgb(55 65 81);
		--tab-hover-border: rgb(209 213 219);
		--tab-hover-color-dark: rgb(229 231 235);
		--tab-hover-border-dark: rgb(75 85 99);
		--tab-focus-color: rgb(59 130 246);
		--tab-focus-color-dark: rgb(96 165 250);
		--badge-active-bg: rgb(219 234 254);
		--badge-active-color: rgb(29 78 216);
		--badge-active-bg-dark: rgba(30, 64, 175, 0.3);
		--badge-active-color-dark: rgb(147 197 253);
		--badge-inactive-bg: rgb(243 244 246);
		--badge-inactive-color: rgb(107 114 128);
		--badge-inactive-bg-dark: rgb(55 65 81);
		--badge-inactive-color-dark: rgb(156 163 175);
		--badge-hover-bg: rgb(229 231 235);
		--badge-hover-color: rgb(75 85 99);
		--badge-hover-bg-dark: rgb(75 85 99);
		--badge-hover-color-dark: rgb(209 213 219);
	}

	/* Apple-quality tab container */
	.tab-container {
		border-bottom: 1px solid var(--tab-border);
		position: relative;
	}

	:global(.dark) .tab-container {
		border-bottom-color: var(--tab-border-dark);
	}

	/* Tab navigation with smooth scrolling */
	.tab-nav {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: smooth;
		scrollbar-width: none;
		-ms-overflow-style: none;
		padding: 0 0.5rem;
		margin-bottom: -1px;
	}

	.tab-nav::-webkit-scrollbar {
		display: none;
	}

	@media (min-width: 640px) {
		.tab-nav {
			padding: 0;
			gap: 0.5rem;
		}
	}

	/* Tab button - Apple-refined touch targets and spacing */
	.tab-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: none;
		border-bottom: 2px solid transparent;
		background: transparent;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25rem;
		white-space: nowrap;
		cursor: pointer;
		transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
		outline: none;
		min-height: 44px; /* Apple touch target minimum */
		flex-shrink: 0;
	}

	@media (min-width: 640px) {
		.tab-button {
			padding: 0.875rem 1.25rem;
			gap: 0.625rem;
		}
	}

	/* Active tab - refined Apple aesthetic */
	.tab-active {
		border-bottom-color: var(--tab-active-border);
		color: var(--tab-active-color);
		background: linear-gradient(to bottom, rgba(59, 130, 246, 0.05), rgba(59, 130, 246, 0.08));
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	:global(.dark) .tab-active {
		border-bottom-color: var(--tab-active-border-dark);
		color: var(--tab-active-color-dark);
		background: linear-gradient(to bottom, rgba(96, 165, 250, 0.08), rgba(96, 165, 250, 0.12));
	}

	/* Inactive tab - subtle and refined */
	.tab-inactive {
		border-bottom-color: transparent;
		color: var(--tab-inactive-color);
	}

	:global(.dark) .tab-inactive {
		color: var(--tab-inactive-color-dark);
	}

	/* Hover state - preview active state */
	.tab-inactive:hover {
		color: var(--tab-hover-color);
		border-bottom-color: var(--tab-hover-border);
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.03));
	}

	:global(.dark) .tab-inactive:hover {
		color: var(--tab-hover-color-dark);
		border-bottom-color: var(--tab-hover-border-dark);
		background: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.03),
			rgba(255, 255, 255, 0.05)
		);
	}

	/* Focus state for keyboard navigation */
	.tab-button:focus-visible {
		outline: 2px solid var(--tab-focus-color);
		outline-offset: -2px;
		border-radius: 0.375rem;
	}

	:global(.dark) .tab-button:focus-visible {
		outline-color: var(--tab-focus-color-dark);
	}

	/* Active state on press */
	.tab-button:active {
		transform: scale(0.98);
	}

	/* Tab icon - perfectly sized and aligned */
	.tab-icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	@media (min-width: 640px) {
		.tab-icon {
			width: 1.125rem;
			height: 1.125rem;
		}
	}

	.tab-active .tab-icon {
		transform: scale(1.05);
	}

	/* Tab label */
	.tab-label {
		font-variant-numeric: tabular-nums;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	/* Count badge - subtle and elegant */
	.tab-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1rem;
		border-radius: 9999px;
		transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
		min-width: 1.5rem;
		font-variant-numeric: tabular-nums;
	}

	.badge-active {
		background: var(--badge-active-bg);
		color: var(--badge-active-color);
	}

	:global(.dark) .badge-active {
		background: var(--badge-active-bg-dark);
		color: var(--badge-active-color-dark);
	}

	.badge-inactive {
		background: var(--badge-inactive-bg);
		color: var(--badge-inactive-color);
	}

	:global(.dark) .badge-inactive {
		background: var(--badge-inactive-bg-dark);
		color: var(--badge-inactive-color-dark);
	}

	.tab-inactive:hover .badge-inactive {
		background: var(--badge-hover-bg);
		color: var(--badge-hover-color);
	}

	:global(.dark) .tab-inactive:hover .badge-inactive {
		background: var(--badge-hover-bg-dark);
		color: var(--badge-hover-color-dark);
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

		.tab-active .tab-icon {
			transform: none;
		}
	}
</style>
