<!-- apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.svelte -->
<!-- A task's own page: the project reader at its deepest (see ProjectItemPage). -->
<script lang="ts">
	import ProjectItemPage from '$lib/components/projects/desktop/ProjectItemPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ProjectItemPage {data} />
