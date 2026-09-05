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

<div class="space-y-1">
	{#each Array(Math.max(count, 3)) as _, i (i)}
		<div
			class="rounded-lg border border-border/70 bg-card px-3 py-2 animate-status-pulse motion-reduce:animate-none"
			aria-hidden="true"
		>
			<div class="flex items-center justify-between gap-3">
				<div class="h-5 w-1/3 rounded-md bg-muted"></div>
				<div class="h-3 w-14 rounded-md bg-muted"></div>
			</div>
			<div class="mt-0.5 h-4 w-4/5 rounded-md bg-muted"></div>
		</div>
	{/each}
</div>
