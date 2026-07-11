<!-- apps/web/src/routes/skills/people/+page.svelte -->
<script lang="ts">
	import SkillExpertCard from '$lib/components/skills/SkillExpertCard.svelte';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_SITE,
		DEFAULT_WEBSITE_ID,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import { ArrowLeft, BookOpen, GitBranch } from '$lib/icons/lucide';
	import { getSkillExpertPath } from '$lib/skills/skill-experts';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const pagePath = '/skills/people';
	const pageTitle = 'People behind the Skill Gallery';
	const description =
		'Meet the people whose public work directly informs BuildOS skills, why we listen to them, and which reviewed sources connect their work to the gallery.';

	function generateJsonLd() {
		const pageUrl = `${SITE_URL}${pagePath}`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				'@id': pageUrl,
				url: pageUrl,
				name: pageTitle,
				description,
				isPartOf: { '@id': DEFAULT_WEBSITE_ID, name: `${SITE_NAME} Skill Gallery` },
				publisher: { '@id': DEFAULT_ORGANIZATION_ID },
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.experts.length,
					itemListElement: data.experts.map(({ expert }, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						url: `${SITE_URL}${getSkillExpertPath(expert)}`,
						name: expert.name
					}))
				}
			},
			null,
			2
		);
	}

	let jsonLdString = $derived(generateJsonLd());
	let jsonLdScriptHtml = $derived(
		'<' +
			'script type="application/ld+json">' +
			escapeSerializedJsonLd(jsonLdString) +
			'</' +
			'script>'
	);
</script>

<svelte:head>
	<title>{pageTitle} - BuildOS</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={`${SITE_URL}${pagePath}`} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${SITE_URL}${pagePath}`} />
	<meta property="og:title" content={`${pageTitle} - BuildOS`} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:title" content={`${pageTitle} - BuildOS`} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta name="robots" content="index, follow" />

	{@html jsonLdScriptHtml}
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
			<a
				href="/skills"
				class="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<ArrowLeft class="h-4 w-4 shrink-0" />
				Skill Gallery
			</a>

			<div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-end">
				<div class="max-w-4xl">
					<p class="micro-label">Trust and lineage directory</p>
					<h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{pageTitle}</h1>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						{description}
					</p>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="rounded-lg border border-border bg-background p-3 shadow-ink-inner">
						<p class="text-xs text-muted-foreground">Profiles</p>
						<p class="mt-1 text-2xl font-semibold">{data.experts.length}</p>
					</div>
					<div class="rounded-lg border border-border bg-background p-3 shadow-ink-inner">
						<p class="text-xs text-muted-foreground">Skills connected</p>
						<p class="mt-1 text-2xl font-semibold">{data.totalSkills}</p>
					</div>
				</div>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<section
			aria-labelledby="editorial-scope"
			class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-thread tx-weak sm:p-6"
		>
			<div
				class="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)] md:items-start"
			>
				<div>
					<div class="flex items-center gap-2">
						<GitBranch class="h-5 w-5 shrink-0 text-accent" />
						<h2 id="editorial-scope" class="text-2xl font-bold">Who gets a profile</h2>
					</div>
					<p class="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
						This directory prioritizes people whose public work is a direct reviewed
						source for a published skill. A profile explains the relationship; it does
						not imply that the person reviewed, approved, or endorses BuildOS or the
						resulting skill.
					</p>
				</div>
				<div class="rounded-md border border-border bg-background p-4">
					<div class="flex items-center gap-2">
						<BookOpen class="h-4 w-4 shrink-0 text-accent" />
						<p class="font-semibold">Evidence standard</p>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						Background claims link to public sources. Self-reported metrics are labeled,
						and hosted interviews distinguish the guest creator from the publishing
						channel.
					</p>
				</div>
			</div>
		</section>

		<section aria-labelledby="expert-profiles" class="mt-8">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p class="micro-label">Reviewed source creators and hosts</p>
					<h2 id="expert-profiles" class="mt-2 text-2xl font-bold sm:text-3xl">
						Expert profiles
					</h2>
				</div>
				<p class="text-sm text-muted-foreground">Last reviewed 2026-07-10</p>
			</div>

			<div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each data.experts as item}
					<div class="flex min-w-0 flex-col">
						<SkillExpertCard expert={item.expert} />
						<p class="px-1 pt-2 text-xs text-muted-foreground">
							{item.sourceCount} reviewed {item.sourceCount === 1
								? 'source'
								: 'sources'} ·
							{item.skillCount}
							{item.skillCount === 1 ? 'skill' : 'skills'}
						</p>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
