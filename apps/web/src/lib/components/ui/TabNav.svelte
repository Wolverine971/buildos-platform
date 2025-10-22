<!-- apps/web/src/lib/components/ui/TabNav.svelte -->
<script lang="ts" context="module">
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
	import { createEventDispatcher } from 'svelte';

	export let tabs: Tab[] = [];
	export let activeTab: string;
	export let containerClass = '';
	export let navClass = '';
	export let ariaLabel = 'Tabs';

	const dispatch = createEventDispatcher<{
		change: string;
	}>();

	function handleTabClick(tabId: string) {
		if (tabId !== activeTab) {
			dispatch('change', tabId);
		}
	}
</script>

<div class="tab-container {containerClass}">
	<nav class="tab-nav {navClass}" role="tablist" aria-label={ariaLabel}>
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
					<svelte:component this={tab.icon} class="tab-icon" />
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
	</nav>
</div>

<style>
	/* Apple-quality tab container */
	.tab-container {
		border-bottom: 1px solid rgb(229 231 235);
		position: relative;
	}

	:global(.dark) .tab-container {
		border-bottom-color: rgb(55 65 81);
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
		position: relative;
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
		border-bottom-color: rgb(59 130 246);
		color: rgb(37 99 235);
		background: linear-gradient(to bottom, rgba(59, 130, 246, 0.05), rgba(59, 130, 246, 0.08));
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	:global(.dark) .tab-active {
		border-bottom-color: rgb(96 165 250);
		color: rgb(96 165 250);
		background: linear-gradient(to bottom, rgba(96, 165, 250, 0.08), rgba(96, 165, 250, 0.12));
	}

	/* Inactive tab - subtle and refined */
	.tab-inactive {
		border-bottom-color: transparent;
		color: rgb(107 114 128);
	}

	:global(.dark) .tab-inactive {
		color: rgb(156 163 175);
	}

	/* Hover state - preview active state */
	.tab-inactive:hover {
		color: rgb(55 65 81);
		border-bottom-color: rgb(209 213 219);
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.03));
	}

	:global(.dark) .tab-inactive:hover {
		color: rgb(229 231 235);
		border-bottom-color: rgb(75 85 99);
		background: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.03),
			rgba(255, 255, 255, 0.05)
		);
	}

	/* Focus state for keyboard navigation */
	.tab-button:focus-visible {
		outline: 2px solid rgb(59 130 246);
		outline-offset: -2px;
		border-radius: 0.375rem;
	}

	:global(.dark) .tab-button:focus-visible {
		outline-color: rgb(96 165 250);
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
		background: rgb(219 234 254);
		color: rgb(29 78 216);
	}

	:global(.dark) .badge-active {
		background: rgba(30, 64, 175, 0.3);
		color: rgb(147 197 253);
	}

	.badge-inactive {
		background: rgb(243 244 246);
		color: rgb(107 114 128);
	}

	:global(.dark) .badge-inactive {
		background: rgb(55 65 81);
		color: rgb(156 163 175);
	}

	.tab-inactive:hover .badge-inactive {
		background: rgb(229 231 235);
		color: rgb(75 85 99);
	}

	:global(.dark) .tab-inactive:hover .badge-inactive {
		background: rgb(75 85 99);
		color: rgb(209 213 219);
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
