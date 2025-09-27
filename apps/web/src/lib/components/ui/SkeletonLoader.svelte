<!-- src/lib/components/ui/SkeletonLoader.svelte -->
<script lang="ts">
	export let variant: 'card' | 'text' | 'avatar' | 'button' | 'list' | 'table' = 'card';
	export let count: number = 1;
	export let height: string = 'auto';
	export let width: string = 'auto';
	export let className: string = '';
</script>

{#if variant === 'card'}
	{#each Array(count) as _, i}
		<div
			class="skeleton-loader card-skeleton {className}"
			style="height: {height}; width: {width};"
		>
			<div class="skeleton-header">
				<div class="skeleton-avatar"></div>
				<div class="skeleton-lines">
					<div class="skeleton-line skeleton-line-lg"></div>
					<div class="skeleton-line skeleton-line-md"></div>
				</div>
			</div>
			<div class="skeleton-content">
				<div class="skeleton-line skeleton-line-full"></div>
				<div class="skeleton-line skeleton-line-lg"></div>
				<div class="skeleton-line skeleton-line-sm"></div>
			</div>
			<div class="skeleton-footer">
				<div class="skeleton-button"></div>
				<div class="skeleton-button skeleton-button-sm"></div>
			</div>
		</div>
	{/each}
{:else if variant === 'text'}
	{#each Array(count) as _, i}
		<div
			class="skeleton-loader text-skeleton {className}"
			style="height: {height}; width: {width};"
		>
			<div class="skeleton-line skeleton-line-full"></div>
			<div class="skeleton-line skeleton-line-lg"></div>
			<div class="skeleton-line skeleton-line-md"></div>
		</div>
	{/each}
{:else if variant === 'avatar'}
	{#each Array(count) as _, i}
		<div
			class="skeleton-loader avatar-skeleton {className}"
			style="height: {height || '40px'}; width: {width || '40px'};"
		></div>
	{/each}
{:else if variant === 'button'}
	{#each Array(count) as _, i}
		<div
			class="skeleton-loader button-skeleton {className}"
			style="height: {height || '40px'}; width: {width || '100px'};"
		></div>
	{/each}
{:else if variant === 'list'}
	{#each Array(count) as _, i}
		<div
			class="skeleton-loader list-skeleton {className}"
			style="height: {height}; width: {width};"
		>
			<div class="skeleton-list-item">
				<div class="skeleton-avatar skeleton-avatar-sm"></div>
				<div class="skeleton-lines">
					<div class="skeleton-line skeleton-line-md"></div>
					<div class="skeleton-line skeleton-line-sm"></div>
				</div>
			</div>
		</div>
	{/each}
{:else if variant === 'table'}
	<div
		class="skeleton-loader table-skeleton {className}"
		style="height: {height}; width: {width};"
	>
		<div class="skeleton-table-header">
			{#each Array(4) as _, col}
				<div class="skeleton-line skeleton-line-sm"></div>
			{/each}
		</div>
		{#each Array(count) as _, row}
			<div class="skeleton-table-row">
				{#each Array(4) as _, col}
					<div class="skeleton-line skeleton-line-xs"></div>
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style>
	.skeleton-loader {
		contain: layout style paint;
		background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
		background-size: 200% 100%;
		animation: skeleton-loading 1.5s infinite;
		border-radius: 8px;
		overflow: hidden;
	}

	.dark .skeleton-loader {
		background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%);
		background-size: 200% 100%;
	}

	@keyframes skeleton-loading {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* Card Skeleton */
	.card-skeleton {
		padding: 1rem;
		min-height: 200px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.skeleton-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.skeleton-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		flex-shrink: 0;
	}

	.skeleton-avatar-sm {
		width: 32px;
		height: 32px;
	}

	.dark .skeleton-avatar {
		background: rgba(255, 255, 255, 0.1);
	}

	.skeleton-lines {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.skeleton-line {
		height: 12px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.4);
	}

	.dark .skeleton-line {
		background: rgba(255, 255, 255, 0.2);
	}

	.skeleton-line-xs {
		width: 60%;
	}
	.skeleton-line-sm {
		width: 70%;
	}
	.skeleton-line-md {
		width: 80%;
	}
	.skeleton-line-lg {
		width: 90%;
	}
	.skeleton-line-full {
		width: 100%;
	}

	.skeleton-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.skeleton-footer {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.skeleton-button {
		height: 32px;
		width: 80px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.3);
	}

	.skeleton-button-sm {
		width: 60px;
	}

	.dark .skeleton-button {
		background: rgba(255, 255, 255, 0.1);
	}

	/* Text Skeleton */
	.text-skeleton {
		padding: 0.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Avatar Skeleton */
	.avatar-skeleton {
		border-radius: 50%;
	}

	/* Button Skeleton */
	.button-skeleton {
		border-radius: 6px;
	}

	/* List Skeleton */
	.list-skeleton {
		padding: 0.5rem 0;
	}

	.skeleton-list-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	/* Table Skeleton */
	.table-skeleton {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
	}

	.skeleton-table-header {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.skeleton-table-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		padding: 0.5rem 0;
	}

	/* Accessibility */
	@media (prefers-reduced-motion: reduce) {
		.skeleton-loader {
			animation: none !important;
		}
	}

	/* Mobile optimizations */
	@media (max-width: 768px) {
		.card-skeleton {
			padding: 0.75rem;
			min-height: 150px;
		}

		.skeleton-avatar {
			width: 32px;
			height: 32px;
		}

		.skeleton-table-header,
		.skeleton-table-row {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
