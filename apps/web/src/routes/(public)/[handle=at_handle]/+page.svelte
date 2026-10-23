<!-- apps/web/src/routes/(public)/[handle=at_handle]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import BuilderProfilePage from '$lib/components/builder-profile/BuilderProfilePage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const view = $derived(data.view);
	const name = $derived(view.profile.name || `@${view.profile.handle}`);
	const canonical = $derived(`${data.origin}/@${view.profile.handle}`);
	const description = $derived(
		[view.profile.headline, view.profile.now_text, view.profile.bio]
			.filter(Boolean)
			.join(' · ')
			.slice(0, 300) || `What ${name} is building, on BuildOS.`
	);
	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'ProfilePage',
		url: canonical,
		mainEntity: {
			'@type': 'Person',
			name,
			alternateName: `@${view.profile.handle}`,
			description: view.profile.headline ?? undefined,
			image: view.profile.avatar_url ?? undefined,
			sameAs: view.links.filter((l) => l.kind === 'social').map((l) => l.url)
		}
	});
</script>

<SEOHead
	title="{name} (@{view.profile.handle}) · BuildOS"
	{description}
	{canonical}
	ogType="profile"
	twitterCardType="summary"
	author={name}
	{jsonLd}
	noindex={view.status !== 'published'}
/>

<BuilderProfilePage
	{view}
	origin={data.origin}
	askProjectId={$page.url.searchParams.get('ask')}
	intent={$page.url.searchParams.get('intent')}
/>
