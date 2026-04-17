<!-- apps/web/src/routes/docs/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import DocsIndex from '$lib/components/docs/DocsIndex.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEOHead
	title="Documentation — BuildOS"
	description="Everything you need to work in BuildOS: the ontology, brain dump, agentic chat, calendar, daily briefs, and connecting external agents like Claude Code."
	canonical="https://build-os.com/docs"
	keywords="BuildOS documentation, agentic chat, ontology, project memory, daily briefs, calendar integration, Claude Code integration, OpenClaw"
/>

<DocsIndex sections={data.sections} />
