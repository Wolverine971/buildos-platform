<!-- apps/web/src/routes/(public)/[handle=at_handle]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import BuilderProfilePage from '$lib/components/builder-profile/BuilderProfilePage.svelte';
	import { buildLogGrid, shareCardVersion } from '$lib/builder-profile/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const view = $derived(data.view);
	const name = $derived(view.profile.name || `@${view.profile.handle}`);
	const canonical = $derived(`${data.origin}/@${view.profile.handle}`);
	// About the person: who they are, what they're building, how active they've been.
	const description = $derived.by(() => {
		const building = view.projects
			.filter((p) => p.audience === 'anyone')
			.slice(0, 3)
			.map((p) => p.name);
		const days = view.activity ? buildLogGrid(view.activity).activeDays : 0;
		return (
			[
				view.profile.headline,
				view.profile.bio,
				building.length ? `Building ${building.join(', ')}.` : null,
				days > 0 ? `${days} active days in the last year.` : null
			]
				.filter((part): part is string => !!part)
				// Each part reads as its own sentence ("Founder, BuildOS. Building …").
				.map((part) => (/[.!?…]$/.test(part.trim()) ? part.trim() : `${part.trim()}.`))
				.join(' ')
				.slice(0, 300) || `What ${name} is building, on BuildOS.`
		);
	});
	// A card drawn for this person (photo, name, projects, build log); drafts keep the default.
	const shareImage = $derived(
		view.status === 'published'
			? `${data.origin}/api/public/builders/${view.profile.handle}/card?v=${shareCardVersion(view)}`
			: undefined
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
	ogImage={shareImage}
	ogImageAlt={shareImage ? `${name}'s page on BuildOS` : undefined}
	ogImageType={shareImage ? 'image/png' : undefined}
	ogImageHeight={shareImage ? 630 : undefined}
	twitterCardType={shareImage ? 'summary_large_image' : 'summary'}
	author={name}
	{jsonLd}
	noindex={view.status !== 'published'}
/>

<BuilderProfilePage
	{view}
	origin={data.origin}
	askProjectId={page.url.searchParams.get('ask')}
	intent={page.url.searchParams.get('intent')}
	followProjectId={page.url.searchParams.get('project')}
/>
