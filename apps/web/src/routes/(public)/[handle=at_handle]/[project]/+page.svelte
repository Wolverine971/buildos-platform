<!-- apps/web/src/routes/(public)/[handle=at_handle]/[project]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import BuilderProjectPage from '$lib/components/builder-profile/BuilderProjectPage.svelte';
	import { projectPaths } from '$lib/builder-profile/project-pages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const view = $derived(data.view);
	const project = $derived(view.project);
	const profile = $derived(view.page.profile);
	const owner = $derived(profile.name || `@${profile.handle}`);
	const path = $derived(
		projectPaths(profile.handle, view.page.projects).get(project.id) ??
			`/@${profile.handle}/${project.id}`
	);
	const canonical = $derived(`${data.origin}${path}`);
	const description = $derived(
		[
			project.pitch,
			project.looking_for ? `Looking for: ${project.looking_for}` : null,
			project.this_week
		]
			.filter(Boolean)
			.join(' · ')
			.slice(0, 300) || `${project.name}, a project ${owner} is building on BuildOS.`
	);
	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'CreativeWork',
		name: project.name,
		description: project.pitch ?? undefined,
		url: canonical,
		sameAs: project.link_url ? [project.link_url] : undefined,
		creator: {
			'@type': 'Person',
			name: owner,
			alternateName: `@${profile.handle}`,
			url: `${data.origin}/@${profile.handle}`
		}
	});
</script>

<SEOHead
	title="{project.name} · by {owner} · BuildOS"
	{description}
	{canonical}
	ogType="website"
	twitterCardType="summary"
	author={owner}
	{jsonLd}
	noindex={view.page.status !== 'published' || project.audience !== 'anyone'}
/>

<BuilderProjectPage
	data={view}
	origin={data.origin}
	askProjectId={$page.url.searchParams.get('ask')}
	intent={$page.url.searchParams.get('intent')}
	followProjectId={$page.url.searchParams.get('project')}
/>
