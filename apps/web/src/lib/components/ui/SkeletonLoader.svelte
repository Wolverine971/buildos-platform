<!-- apps/web/src/lib/components/ui/SkeletonLoader.svelte -->
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
		background: linear-gradient(
			90deg,
			rgb(243, 244, 246) 25%,
			rgb(229, 231, 235) 50%,
			rgb(243, 244, 246) 75%
		);
		background-size: 200% 100%;
		animation: skeleton-loading 1.5s infinite;
		border-radius: 8px;
		overflow: hidden;
	}

	.dark .skeleton-loader {
		background: linear-gradient(
			90deg,
			rgb(55, 65, 81) 25%,
			rgb(75, 85, 99) 50%,
			rgb(55, 65, 81) 75%
		);
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
		@apply p-4 min-h-[200px] flex flex-col gap-4;
	}

	.skeleton-header {
		@apply flex items-center gap-3;
	}

	.skeleton-avatar {
		@apply w-10 h-10 rounded-full bg-white/30 flex-shrink-0;
	}

	.skeleton-avatar-sm {
		@apply w-8 h-8;
	}

	.dark .skeleton-avatar {
		@apply bg-white/10;
	}

	.skeleton-lines {
		@apply flex-1 flex flex-col gap-2;
	}

	.skeleton-line {
		@apply h-3 rounded-md bg-white/40;
	}

	.dark .skeleton-line {
		@apply bg-white/20;
	}

	.skeleton-line-xs {
		@apply w-3/5;
	}
	.skeleton-line-sm {
		@apply w-[70%];
	}
	.skeleton-line-md {
		@apply w-4/5;
	}
	.skeleton-line-lg {
		@apply w-[90%];
	}
	.skeleton-line-full {
		@apply w-full;
	}

	.skeleton-content {
		@apply flex-1 flex flex-col gap-2;
	}

	.skeleton-footer {
		@apply flex gap-2 justify-end;
	}

	.skeleton-button {
		@apply h-8 w-20 rounded-md bg-white/30;
	}

	.skeleton-button-sm {
		@apply w-16;
	}

	.dark .skeleton-button {
		@apply bg-white/10;
	}

	/* Text Skeleton */
	.text-skeleton {
		@apply py-2 flex flex-col gap-2;
	}

	/* Avatar Skeleton */
	.avatar-skeleton {
		@apply rounded-full;
	}

	/* Button Skeleton */
	.button-skeleton {
		@apply rounded-md;
	}

	/* List Skeleton */
	.list-skeleton {
		@apply py-2;
	}

	.skeleton-list-item {
		@apply flex items-center gap-3 py-2;
	}

	/* Table Skeleton */
	.table-skeleton {
		@apply flex flex-col gap-2 p-4;
	}

	.skeleton-table-header {
		@apply grid grid-cols-4 gap-4 pb-2 border-b border-white/20;
	}

	.skeleton-table-row {
		@apply grid grid-cols-4 gap-4 py-2;
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
			@apply p-3 min-h-[150px];
		}

		.skeleton-avatar {
			@apply w-8 h-8;
		}

		.skeleton-table-header,
		.skeleton-table-row {
			@apply grid-cols-2;
		}
	}
</style>
