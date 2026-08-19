<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
	import ProjectWorkspacePrototype from './ProjectWorkspacePrototype.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#key data.projectId}
	<ProjectWorkspacePrototype {data} />
{/key}
