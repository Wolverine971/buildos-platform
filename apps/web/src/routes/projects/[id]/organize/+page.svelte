<!-- apps/web/src/routes/projects/[id]/organize/+page.svelte -->
<script lang="ts">
	import OrganizeView from '$lib/components/organize/OrganizeView.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Organize · {data.project.name} · BuildOS</title></svelte:head>

{#key `${data.project.id}:${data.project.updated_at}:${data.secondaryProject?.id ?? ''}:${data.initialRef?.id ?? ''}`}
	<OrganizeView
		project={data.project}
		secondaryProject={data.secondaryProject}
		relatedProjects={data.relatedProjects}
		initialRef={data.initialRef}
	/>
{/key}
