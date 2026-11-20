<!-- apps/web/src/routes/projects/__fixtures__/TodayRowStub.svelte -->
<!-- The Today row, reduced to what the page hands it: the overdue count and the refresh it
     asks for after one of its windows changed something. -->
<script lang="ts">
	let {
		overdueTasks = null,
		onrefresh
	}: { overdueTasks?: number | null; onrefresh?: () => Promise<void> | void } = $props();
</script>

<output data-testid="overdue-count">{overdueTasks ?? 'none'}</output>
<button type="button" onclick={() => void onrefresh?.()}>Something changed in Today</button>
