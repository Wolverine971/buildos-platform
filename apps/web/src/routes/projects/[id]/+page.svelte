<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
	import ProjectWorkspace from './ProjectWorkspace.svelte';
	import ProjectJoinArrival from '$lib/components/people/ProjectJoinArrival.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#key data.projectId}
	<ProjectJoinArrival
		projectId={data.projectId}
		projectName={data.project.name}
		isAuthenticated={data.access.isAuthenticated}
	/>
	<ProjectWorkspace {data} />
{/key}
