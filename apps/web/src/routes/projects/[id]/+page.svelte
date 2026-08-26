<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
	import ProjectWorkspace from './ProjectWorkspace.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#key data.projectId}
	<ProjectWorkspace {data} />
{/key}
