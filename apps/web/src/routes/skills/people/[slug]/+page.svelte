<!-- apps/web/src/routes/skills/people/[slug]/+page.svelte -->
<script lang="ts">
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_TWITTER_SITE,
		DEFAULT_WEBSITE_ID,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		BriefcaseBusiness,
		ExternalLink,
		GitBranch,
		Quote,
		Sparkles
	} from '$lib/icons/lucide';
	import { getSkillExpertPath } from '$lib/skills/skill-experts';
	import { getSkillPath } from '$lib/skills/skill-gallery';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let expert = $derived(data.expert);
	let profilePath = $derived(getSkillExpertPath(expert));
	let description = $derived(
		`${expert.name} is included in the BuildOS Skill Gallery for ${expert.specialties
			.slice(0, 3)
			.join(', ')}. See why we listen and which skills use this work.`
	);

	function generateJsonLd() {
		const profileUrl = `${SITE_URL}${profilePath}`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'ProfilePage',
				'@id': profileUrl,
				url: profileUrl,
				name: `${expert.name} - Skill Gallery Expert Profile`,
				description,
				isPartOf: { '@id': DEFAULT_WEBSITE_ID, name: `${SITE_NAME} Skill Gallery` },
				publisher: { '@id': DEFAULT_ORGANIZATION_ID },
				dateModified: expert.lastReviewed,
				mainEntity: {
					'@type': 'Person',
					'@id': `${profileUrl}#person`,
					name: expert.name,
					description: expert.shortBio,
					image: `${SITE_URL}${expert.portrait.src}`,
					knowsAbout: expert.specialties,
					sameAs: expert.sources.map((source) => source.url)
				},
				about: { '@id': `${profileUrl}#person` }
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
	<title>{expert.name} - Skill Gallery Expert Profile</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={`${SITE_URL}${profilePath}`} />

	<meta property="og:type" content="profile" />
	<meta property="og:url" content={`${SITE_URL}${profilePath}`} />
	<meta property="og:title" content={`${expert.name} - Skill Gallery Expert Profile`} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={`${SITE_URL}${expert.portrait.src}`} />
	<meta property="og:image:width" content={String(expert.portrait.width)} />
	<meta property="og:image:height" content={String(expert.portrait.height)} />
	<meta property="og:image:alt" content={expert.portrait.alt} />
	<meta property="og:site_name" content="BuildOS" />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:title" content={`${expert.name} - Skill Gallery Expert Profile`} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={`${SITE_URL}${expert.portrait.src}`} />
	<meta name="twitter:image:alt" content={expert.portrait.alt} />
	<meta name="robots" content="index, follow" />

	{@html jsonLdScriptHtml}
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
			<nav aria-label="Expert profile navigation" class="flex flex-wrap gap-2">
				<a
					href="/skills/people"
					class="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ArrowLeft class="h-4 w-4 shrink-0" />
					All experts
				</a>
				<a
					href="/skills"
					class="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Skill Gallery
				</a>
			</nav>

			<div
				class="mt-8 grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center lg:gap-10"
			>
				<figure class="m-0 max-w-48">
					<img
						src={expert.portrait.src}
						alt={expert.portrait.alt}
						width={expert.portrait.width}
						height={expert.portrait.height}
						fetchpriority="high"
						class="aspect-square w-full rounded-lg border border-border object-cover shadow-ink"
					/>
					<figcaption class="mt-2 text-xs text-muted-foreground">
						Portrait:
						<a
							href={expert.portrait.sourceUrl}
							target="_blank"
							rel="noreferrer"
							class="underline decoration-border underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{expert.portrait.sourceLabel}
						</a>
					</figcaption>
				</figure>

				<div class="min-w-0 max-w-4xl">
					<p class="micro-label">Independent editorial profile</p>
					<h1 class="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
						{expert.name}
					</h1>
					<p class="mt-3 text-lg font-semibold text-accent">{expert.headline}</p>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						{expert.shortBio}
					</p>
					<div class="mt-5 flex flex-wrap gap-2">
						{#each expert.specialties as specialty}
							<span
								class="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground"
							>
								{specialty}
							</span>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<div class="space-y-6">
				<section
					aria-labelledby="why-listen"
					class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-thread tx-weak sm:p-6"
				>
					<div class="flex items-center gap-2">
						<Quote class="h-5 w-5 shrink-0 text-accent" />
						<h2 id="why-listen" class="text-2xl font-bold">Why BuildOS listens</h2>
					</div>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
						{expert.whyWeListen}
					</p>
					<div class="mt-5 rounded-md border border-border bg-background p-4">
						<p class="micro-label">Editorial standard</p>
						<p class="mt-2 text-sm leading-6 text-muted-foreground">
							Inclusion means BuildOS reviewed useful public material and can trace
							specific processes back to it. It does not mean the person reviewed,
							approved, or endorses the resulting skill.
						</p>
					</div>
				</section>

				<section
					aria-labelledby="skills-informed"
					class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak sm:p-6"
				>
					<div class="flex items-center gap-2">
						<GitBranch class="h-5 w-5 shrink-0 text-accent" />
						<h2 id="skills-informed" class="text-2xl font-bold">
							Skills informed by this work
						</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						BuildOS currently traces {data.reviewedSources.length} reviewed source{data
							.reviewedSources.length === 1
							? ''
							: 's'}
						across {data.relatedSkills.length} published skill{data.relatedSkills
							.length === 1
							? ''
							: 's'}.
					</p>

					<div class="mt-5 grid gap-3 sm:grid-cols-2">
						{#each data.relatedSkills as skill}
							<a
								href={getSkillPath(skill)}
								class="group rounded-md border border-border bg-background p-4 transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<div class="flex min-w-0 items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="micro-label">
											{skill.sourceCount} reviewed {skill.sourceCount === 1
												? 'source'
												: 'sources'}
										</p>
										<h3
											class="mt-1 text-lg font-semibold text-foreground group-hover:text-accent"
										>
											{skill.title}
										</h3>
									</div>
									<ArrowRight
										class="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent"
									/>
								</div>
								<p
									class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground"
								>
									{skill.description}
								</p>
							</a>
						{/each}
					</div>
				</section>

				<section
					aria-labelledby="reviewed-material"
					class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-grain tx-weak sm:p-6"
				>
					<div class="flex items-center gap-2">
						<BookOpen class="h-5 w-5 shrink-0 text-accent" />
						<h2 id="reviewed-material" class="text-2xl font-bold">
							Material BuildOS reviewed
						</h2>
					</div>
					<div
						class="mt-5 divide-y divide-border overflow-hidden rounded-md border border-border bg-background"
					>
						{#each data.reviewedSources as source}
							<div class="p-4">
								<div class="flex min-w-0 items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="micro-label">Used in {source.skillTitle}</p>
										<p class="mt-1 font-semibold leading-6 text-foreground">
											{source.title}
										</p>
										{#if source.relationship === 'channel'}
											<p class="mt-1 text-xs leading-5 text-muted-foreground">
												Hosted by {expert.name}{source.creator
													? ` · Guest: ${source.creator}`
													: ''}
											</p>
										{:else if source.creator}
											<p class="mt-1 text-xs leading-5 text-muted-foreground">
												By {source.creator}
											</p>
										{/if}
									</div>
									{#if source.url}
										<a
											href={source.url}
											target="_blank"
											rel="noreferrer"
											aria-label={`Open ${source.title}`}
											class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<ExternalLink class="h-4 w-4" />
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			</div>

			<aside class="space-y-4 lg:sticky lg:top-20">
				<section class="rounded-lg border border-border bg-card p-4 shadow-ink">
					<div class="flex items-center gap-2">
						<BriefcaseBusiness class="h-4 w-4 shrink-0 text-accent" />
						<h2 class="text-lg font-semibold">Work and background</h2>
					</div>
					<div class="mt-4 space-y-4">
						{#each expert.work as item}
							<div class="border-l-2 border-border pl-3">
								<p class="font-semibold text-foreground">{item.title}</p>
								{#if item.organization}
									<p class="mt-0.5 text-xs font-medium text-accent">
										{item.organization}
									</p>
								{/if}
								<p class="mt-1 text-sm leading-6 text-muted-foreground">
									{item.summary}
								</p>
								<a
									href={item.sourceUrl}
									target="_blank"
									rel="noreferrer"
									class="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-foreground hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									Verify source
									<ExternalLink class="h-3.5 w-3.5 shrink-0" />
								</a>
							</div>
						{/each}
					</div>
				</section>

				<section class="rounded-lg border border-border bg-card p-4 shadow-ink">
					<div class="flex items-center gap-2">
						<Sparkles class="h-4 w-4 shrink-0 text-accent" />
						<h2 class="text-lg font-semibold">Profile sources</h2>
					</div>
					<div class="mt-3 space-y-2">
						{#each expert.sources as source}
							<a
								href={source.url}
								target="_blank"
								rel="noreferrer"
								class="group flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<span class="min-w-0">
									<span
										class="block text-sm font-semibold text-foreground group-hover:text-accent"
									>
										{source.label}
									</span>
									<span
										class="mt-0.5 block text-xs leading-5 text-muted-foreground"
									>
										{source.description}
									</span>
								</span>
								<ExternalLink
									class="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent"
								/>
							</a>
						{/each}
					</div>
					<p
						class="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground"
					>
						Last reviewed {expert.lastReviewed}. Self-reported audience metrics are
						labeled in context.
					</p>
				</section>
			</aside>
		</div>
	</div>
</div>
