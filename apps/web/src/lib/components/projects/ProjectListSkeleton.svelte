<!-- apps/web/src/lib/components/projects/ProjectListSkeleton.svelte -->
<!--
  Skeleton loading card for projects list page.
  Matches exact dimensions and structure of real project cards to prevent layout shift.
  Uses CSS animations instead of JS for smooth, performant animations.

  PERFORMANCE (Dec 2024):
  - Matches exact card structure from /projects page
  - count prop allows rendering exact number of skeletons
-->
<script lang="ts">
	type Props = {
		count?: number;
	};

	let { count = 3 }: Props = $props();
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
	{#each Array(count) as _, i (i)}
		<div
			class="group relative flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak animate-pulse"
			aria-hidden="true"
		>
			<!-- Header: Title + Badge -->
			<div class="mb-4 flex items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<!-- Title skeleton -->
					<div class="h-6 bg-muted rounded w-3/4"></div>
				</div>
				<!-- Status badge skeleton -->
				<div class="h-6 w-16 bg-muted rounded-lg flex-shrink-0"></div>
			</div>

			<!-- Description skeleton -->
			<div class="mb-4 space-y-2">
				<div class="h-4 bg-muted rounded w-full"></div>
				<div class="h-4 bg-muted rounded w-4/5"></div>
			</div>

			<!-- Next Step skeleton -->
			<div class="mb-4 p-2.5 rounded-lg border border-border bg-muted/30">
				<div class="h-3.5 bg-muted rounded w-4/5"></div>
			</div>

			<!-- Footer Stats skeleton -->
			<div class="mt-auto flex flex-col gap-2 border-t border-border pt-3">
				<!-- Stats row -->
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
					<div class="h-4 w-10 bg-muted rounded"></div>
					<div class="h-4 w-10 bg-muted rounded"></div>
					<div class="h-4 w-10 bg-muted rounded"></div>
					<div class="h-4 w-10 bg-muted rounded"></div>
					<div class="h-4 w-10 bg-muted rounded"></div>
				</div>
				<!-- Updated date skeleton -->
				<div class="h-3 w-28 bg-muted rounded"></div>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Smooth pulse animation for skeleton loading */
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
