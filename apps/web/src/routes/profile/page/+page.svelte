<!-- apps/web/src/routes/profile/page/+page.svelte -->
<script lang="ts">
	import BuilderPageEditor from '$lib/components/builder-profile/editor/BuilderPageEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Your page · BuildOS</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key data.editor.handle}
	<BuilderPageEditor
		data={data.editor}
		preview={data.preview}
		origin={data.origin}
		initialSection={data.section}
		initialProjectId={data.projectId}
	/>
{/key}
