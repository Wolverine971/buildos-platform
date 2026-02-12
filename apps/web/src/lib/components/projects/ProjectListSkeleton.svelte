<!-- apps/web/src/lib/components/projects/ProjectListSkeleton.svelte -->
<!--
  Skeleton loading rows for projects list page.
  Matches the vertical dossier list layout used by dashboard/projects.
-->
<script lang="ts">
	type Props = {
		count?: number;
	};

	let { count = 3 }: Props = $props();
</script>

<div class="space-y-2 sm:space-y-3">
	{#each Array(Math.max(count, 3)) as _, i (i)}
		<div class="wt-paper p-3 sm:p-4 tx tx-frame tx-weak animate-pulse" aria-hidden="true">
			<div class="flex items-center justify-between gap-3">
				<div class="h-5 w-1/3 rounded-md bg-muted" />
				<div class="h-4 w-28 rounded-md bg-muted" />
			</div>
			<div class="mt-2 h-4 w-4/5 rounded-md bg-muted" />
			<div class="mt-2 h-3 w-full rounded-md bg-muted" />
		</div>
	{/each}
</div>
