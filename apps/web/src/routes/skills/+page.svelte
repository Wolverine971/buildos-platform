<!-- apps/web/src/routes/skills/+page.svelte -->
<script lang="ts">
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_CREATOR,
		DEFAULT_TWITTER_SITE,
		DEFAULT_WEBSITE_ID,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import { escapeSerializedJsonLd } from '$lib/utils/json-ld';
	import {
		ArrowRight,
		BookOpen,
		Brain,
		Code2,
		Compass,
		FileText,
		Filter,
		FolderTree,
		GitBranch,
		Layers3,
		ListTree,
		Package,
		PlayCircle,
		Search,
		Sparkles,
		Target,
		Workflow,
		X
	} from '$lib/icons/lucide';
	import {
		buildDomainCards,
		buildPackCards,
		buildPostBySlug,
		buildSkillBySlug,
		getAgentFilePath,
		getDisplayTitle,
		getDomainPath,
		getNumericStat,
		getOutputShapes,
		getPackPath,
		getSearchText,
		getSelectedPackSlugSet,
		getSkillFamily,
		getSkillPath,
		getSkillPromise,
		getTryInBuildOsPath,
		groupSkillsByFamily,
		humanize,
		normalizeSearchText
	} from '$lib/skills/skill-gallery';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Skill = PageData['catalog']['skills'][number];

	let query = $state('');
	let activeDomain = $state('all');
	let activePack = $state('all');

	let skills = $derived(data.catalog.skills);
	let postBySlug = $derived(buildPostBySlug(data.posts));
	let normalizedQuery = $derived(normalizeSearchText(query));
	let skillBySlug = $derived(buildSkillBySlug(skills));
	let domainCards = $derived(buildDomainCards(skills));
	let allDomainOptions = $derived(domainCards);
	let packCards = $derived(buildPackCards(skills));
	let selectedPackSlugs = $derived(getSelectedPackSlugSet(packCards, activePack));
	let selectedDomain = $derived(allDomainOptions.find((domain) => domain.id === activeDomain));
	let totalReferences = $derived(
		skills.reduce((total, skill) => total + skill.references.length, 0)
	);
	let totalSources = $derived(
		skills.reduce((total, skill) => total + getNumericStat(skill, 'sources'), 0)
	);
	let filteredSkills = $derived.by(() => {
		return skills.filter((skill) => {
			const post = postBySlug.get(skill.slug);
			const matchesDomain = activeDomain === 'all' || skill.skill_category === activeDomain;
			const matchesPack = activePack === 'all' || selectedPackSlugs.has(skill.slug);
			if (!matchesDomain || !matchesPack) return false;
			if (!normalizedQuery) return true;

			return normalizeSearchText(getSearchText(skill, post)).includes(normalizedQuery);
		});
	});
	let filteredFamilies = $derived(groupSkillsByFamily(filteredSkills));
	let featuredSkills = $derived(
		['cold-email-engagement-first-outreach', 'ui-ux-quality-review', 'hook-craft-short-form']
			.map((slug) => skillBySlug.get(slug))
			.filter((skill): skill is Skill => Boolean(skill))
	);
	let activeFilterCount = $derived(
		(activeDomain !== 'all' ? 1 : 0) + (activePack !== 'all' ? 1 : 0) + (query.trim() ? 1 : 0)
	);

	function setDomain(domainId: string) {
		activeDomain = domainId;
	}

	function setPack(packId: string) {
		activePack = packId;
	}

	function clearFilters() {
		query = '';
		activeDomain = 'all';
		activePack = 'all';
	}

	function generateJsonLd() {
		const collectionUrl = `${SITE_URL}/skills`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				'@id': collectionUrl,
				name: `${SITE_NAME} Skill Gallery`,
				description:
					'Browse BuildOS skills by domain, pack, stack, and user job before opening agent-readable files.',
				url: collectionUrl,
				isPartOf: {
					'@id': DEFAULT_WEBSITE_ID
				},
				publisher: {
					'@id': DEFAULT_ORGANIZATION_ID
				},
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: skills.length,
					itemListElement: skills.map((skill, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						item: {
							'@type': 'CreativeWork',
							name: getDisplayTitle(skill),
							description: skill.description,
							url: `${SITE_URL}${getSkillPath(skill)}`,
							genre: skill.skill_category ? humanize(skill.skill_category) : undefined
						}
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
	<title>Skill Gallery - BuildOS</title>
	<meta
		name="description"
		content="Browse BuildOS skills by domain, pack, stack, and user job. Open practical playbooks for humans and portable SKILL.md files for agents."
	/>
	<meta
		name="keywords"
		content="BuildOS skills, AI agent skills, skill gallery, agent stacks, skill packs, SKILL.md"
	/>
	<link rel="canonical" href={`${SITE_URL}/skills`} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${SITE_URL}/skills`} />
	<meta property="og:title" content="BuildOS Skill Gallery" />
	<meta
		property="og:description"
		content="Browse practical BuildOS skills by domain, pack, stack, and user job before opening the agent files."
	/>
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:secure_url" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<link rel="image_src" href={DEFAULT_SOCIAL_IMAGE_URL} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={`${SITE_URL}/skills`} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content="BuildOS Skill Gallery" />
	<meta
		name="twitter:description"
		content="A user-first gallery for BuildOS skills, packs, stacks, and agent-readable files."
	/>
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta name="robots" content="index, follow" />

	{@html jsonLdScriptHtml}
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
			<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
				<div class="max-w-4xl">
					<div class="mb-4 inline-flex items-center gap-2 text-accent">
						<Brain class="h-4 w-4 shrink-0" />
						<span class="micro-label">BuildOS Skill Gallery</span>
					</div>
					<h1
						class="max-w-3xl text-3xl font-semibold leading-tight text-foreground sm:text-5xl"
					>
						Browse skills by job, domain, pack, and stack.
					</h1>
					<p class="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
						Start with the user problem, follow the domain map, then open the same
						agent-readable files when it is time to automate the workflow.
					</p>
				</div>

				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Skills</p>
						<p class="mt-1 text-2xl font-semibold">{skills.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Domains</p>
						<p class="mt-1 text-2xl font-semibold">{allDomainOptions.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Packs</p>
						<p class="mt-1 text-2xl font-semibold">{packCards.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Sources</p>
						<p class="mt-1 text-2xl font-semibold">{totalSources}</p>
					</div>
				</div>
			</div>

			<div
				class="mt-8 rounded-lg border border-border bg-background p-3 shadow-ink tx tx-grid tx-weak"
			>
				<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
					<label class="relative block min-w-0">
						<span class="sr-only">Search skills</span>
						<Search
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							bind:value={query}
							type="search"
							placeholder="Search cold email, hooks, UI review, calendar safety..."
							class="h-12 w-full rounded-md border border-border-strong bg-card pl-10 pr-3 text-base text-foreground shadow-ink-inner outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring sm:text-sm"
						/>
					</label>

					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class={`inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
								activeDomain === 'all'
									? 'border-accent bg-accent text-accent-foreground'
									: 'border-border bg-card text-foreground hover:border-accent hover:text-accent'
							}`}
							onclick={() => setDomain('all')}
						>
							<Compass class="h-4 w-4 shrink-0" />
							All domains
						</button>
						{#if activeFilterCount > 0}
							<button
								type="button"
								class="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={clearFilters}
							>
								<X class="h-4 w-4 shrink-0" />
								Clear
							</button>
						{/if}
					</div>
				</div>

				{#if activeFilterCount > 0}
					<div
						class="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs"
					>
						<span class="inline-flex items-center gap-1 text-muted-foreground">
							<Filter class="h-3.5 w-3.5" />
							Active
						</span>
						{#if query.trim()}
							<span
								class="rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground"
							>
								Search: {query.trim()}
							</span>
						{/if}
						{#if selectedDomain}
							<span
								class="rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground"
							>
								Domain: {selectedDomain.shortName}
							</span>
							<a
								href={getDomainPath(selectedDomain)}
								class="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-medium text-accent transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Open map
								<ArrowRight class="h-3.5 w-3.5" />
							</a>
						{/if}
						{#if activePack !== 'all'}
							{@const selectedPack = packCards.find((pack) => pack.id === activePack)}
							<span
								class="rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground"
							>
								{selectedPack?.kind ?? 'Pack'}: {selectedPack?.name}
							</span>
							{#if selectedPack}
								<a
									href={getPackPath(selectedPack)}
									class="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-medium text-accent transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									Open path
									<ArrowRight class="h-3.5 w-3.5" />
								</a>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<section aria-labelledby="featured-skills" class="mb-10">
			<div class="mb-4 flex items-end justify-between gap-4">
				<div>
					<p class="micro-label text-accent">Start Here</p>
					<h2 id="featured-skills" class="mt-1 text-2xl font-semibold text-foreground">
						Featured skills
					</h2>
				</div>
				<a
					href="/agent-skills"
					class="hidden min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
				>
					Agent repository
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>

			<div class="grid gap-3 lg:grid-cols-3">
				{#each featuredSkills as skill}
					<a
						href={getSkillPath(skill)}
						class="group flex min-h-[15rem] flex-col rounded-lg border border-border bg-card p-4 shadow-ink transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring tx tx-frame tx-weak"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="flex min-w-0 items-center gap-2">
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
								>
									<Sparkles class="h-4 w-4" />
								</span>
								<div class="min-w-0">
									<p class="micro-label">{getSkillFamily(skill)}</p>
									<h3
										class="mt-1 line-clamp-2 text-lg font-semibold text-foreground"
									>
										{getDisplayTitle(skill)}
									</h3>
								</div>
							</div>
							<ArrowRight
								class="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none"
							/>
						</div>
						<p class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
							{getSkillPromise(skill, postBySlug.get(skill.slug))}
						</p>
						<div class="mt-auto flex flex-wrap gap-1.5 pt-4">
							{#each getOutputShapes(skill).slice(0, 3) as output}
								<span
									class="rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
								>
									{output}
								</span>
							{/each}
						</div>
					</a>
				{/each}
			</div>
		</section>

		<section aria-labelledby="domain-map" class="mb-10">
			<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p class="micro-label text-accent">Domain Map</p>
					<h2 id="domain-map" class="mt-1 text-2xl font-semibold text-foreground">
						Browse by domain
					</h2>
				</div>
				<p class="max-w-xl text-sm leading-6 text-muted-foreground">
					Each domain starts broad, then narrows into families and concrete skills.
				</p>
			</div>

			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{#each allDomainOptions as domain}
					<article
						class={`flex min-h-[15rem] flex-col rounded-lg border p-4 shadow-ink transition-colors ${
							activeDomain === domain.id
								? 'border-accent bg-accent/10 text-foreground'
								: 'border-border bg-card text-foreground hover:border-accent'
						}`}
					>
						<div class="flex items-start justify-between gap-3">
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
							>
								<FolderTree class="h-4 w-4" />
							</span>
							<span
								class="rounded-full bg-muted px-2 py-1 text-2xs font-medium text-muted-foreground"
							>
								{domain.skills.length} skill{domain.skills.length === 1 ? '' : 's'}
							</span>
						</div>
						<h3 class="mt-4 text-lg font-semibold">{domain.name}</h3>
						<p class="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
							{domain.promise}
						</p>
						<div class="mt-4 flex flex-wrap gap-1.5">
							{#each domain.path.slice(0, 3) as step}
								<span
									class="rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
								>
									{step}
								</span>
							{/each}
						</div>
						<div class="mt-auto grid grid-cols-2 gap-2 pt-4">
							<button
								type="button"
								class={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									activeDomain === domain.id
										? 'border-accent bg-accent text-accent-foreground'
										: 'border-border bg-background text-foreground hover:border-accent hover:text-accent'
								}`}
								onclick={() => setDomain(domain.id)}
							>
								<Filter class="h-4 w-4" />
								Filter
							</button>
							<a
								href={getDomainPath(domain)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ListTree class="h-4 w-4" />
								Map
							</a>
						</div>
					</article>
				{/each}
			</div>
		</section>

		<section aria-labelledby="packs-stacks" class="mb-10">
			<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p class="micro-label text-accent">Packs And Stacks</p>
					<h2 id="packs-stacks" class="mt-1 text-2xl font-semibold text-foreground">
						Curated paths
					</h2>
				</div>
				<button
					type="button"
					class={`inline-flex min-h-[44px] items-center gap-2 self-start rounded-md border px-3 text-sm font-semibold shadow-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
						activePack === 'all'
							? 'border-accent bg-accent text-accent-foreground'
							: 'border-border bg-card text-foreground hover:border-accent hover:text-accent'
					}`}
					onclick={() => setPack('all')}
				>
					<ListTree class="h-4 w-4" />
					All paths
				</button>
			</div>

			<div class="grid gap-3 lg:grid-cols-4">
				{#each packCards as pack}
					{@const PackIcon = pack.kind === 'Stack' ? Workflow : Package}
					<article
						class={`flex min-h-[19rem] flex-col rounded-lg border p-4 shadow-ink transition-colors ${
							activePack === pack.id
								? 'border-accent bg-accent/10'
								: 'border-border bg-card hover:border-accent'
						}`}
					>
						<div class="flex items-start justify-between gap-3">
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
							>
								<PackIcon class="h-4 w-4" />
							</span>
							<span
								class="rounded-full bg-muted px-2 py-1 text-2xs font-medium text-muted-foreground"
							>
								{pack.kind}
							</span>
						</div>
						<h3 class="mt-4 text-lg font-semibold text-foreground">{pack.name}</h3>
						<p class="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
							{pack.job}
						</p>
						<ol class="mt-4 space-y-1.5 text-sm text-muted-foreground">
							{#each pack.order.slice(0, 3) as step, index}
								<li class="flex min-w-0 items-center gap-2">
									<span
										class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-2xs font-semibold"
									>
										{index + 1}
									</span>
									<span class="truncate">{step}</span>
								</li>
							{/each}
						</ol>
						<p class="mt-auto pt-4 text-xs font-medium text-accent">
							{pack.skills.length} available skill{pack.skills.length === 1
								? ''
								: 's'}
						</p>
						<div class="grid grid-cols-2 gap-2 pt-4">
							<button
								type="button"
								class={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									activePack === pack.id
										? 'border-accent bg-accent text-accent-foreground'
										: 'border-border bg-background text-foreground hover:border-accent hover:text-accent'
								}`}
								onclick={() => setPack(pack.id)}
							>
								<Filter class="h-4 w-4" />
								Filter
							</button>
							<a
								href={getPackPath(pack)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<ListTree class="h-4 w-4" />
								Path
							</a>
						</div>
					</article>
				{/each}
			</div>
		</section>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<section aria-labelledby="skill-results">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p class="micro-label text-accent">Explore</p>
						<h2 id="skill-results" class="mt-1 text-2xl font-semibold text-foreground">
							{filteredSkills.length} skill{filteredSkills.length === 1 ? '' : 's'}
						</h2>
					</div>
					<p class="text-sm text-muted-foreground">
						Showing {filteredSkills.length} of {skills.length}
					</p>
				</div>

				{#if filteredSkills.length > 0}
					<div class="grid gap-3 xl:grid-cols-2">
						{#each filteredSkills as skill}
							{@const post = postBySlug.get(skill.slug)}
							{@const sourceCount = getNumericStat(skill, 'sources')}
							<article
								class="flex min-h-[21rem] flex-col rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="flex min-w-0 items-center gap-2">
										<span
											class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
										>
											<Target class="h-4 w-4" />
										</span>
										<div class="min-w-0">
											<p class="micro-label">{getSkillFamily(skill)}</p>
											<h3
												class="mt-1 line-clamp-2 text-lg font-semibold text-foreground"
											>
												{getDisplayTitle(skill)}
											</h3>
										</div>
									</div>
									<span
										class="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
									>
										{humanize(skill.skill_type)}
									</span>
								</div>

								<p
									class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground"
								>
									{getSkillPromise(skill, post)}
								</p>

								<div class="mt-4 flex flex-wrap gap-1.5">
									{#each getOutputShapes(skill) as output}
										<span
											class="rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
										>
											{output}
										</span>
									{/each}
								</div>

								<div class="mt-4 grid grid-cols-3 gap-2 text-sm">
									<div class="rounded-md border border-border bg-background p-2">
										<p class="text-xs text-muted-foreground">Domain</p>
										<p class="mt-1 truncate font-semibold">
											{humanize(skill.skill_category)}
										</p>
									</div>
									<div class="rounded-md border border-border bg-background p-2">
										<p class="text-xs text-muted-foreground">Sources</p>
										<p class="mt-1 font-semibold">
											{sourceCount || skill.lineage_sources?.length || 0}
										</p>
									</div>
									<div class="rounded-md border border-border bg-background p-2">
										<p class="text-xs text-muted-foreground">Refs</p>
										<p class="mt-1 font-semibold">{skill.references.length}</p>
									</div>
								</div>

								<div class="mt-auto grid gap-2 pt-5 sm:grid-cols-3">
									<a
										href={getSkillPath(skill)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<BookOpen class="h-4 w-4" />
										Open
									</a>
									<a
										href={getAgentFilePath(skill)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<FileText class="h-4 w-4" />
										SKILL.md
									</a>
									<a
										href={getTryInBuildOsPath(skill)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<PlayCircle class="h-4 w-4" />
										Try
									</a>
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<div
						class="rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-ink tx tx-frame tx-weak"
					>
						<Search class="mx-auto h-8 w-8 text-muted-foreground" />
						<h3 class="mt-3 text-lg font-semibold text-foreground">
							No matching skills
						</h3>
						<p class="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
							Clear the filters or search for a broader domain, output, tool, or
							workflow.
						</p>
						<button
							type="button"
							class="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onclick={clearFilters}
						>
							Clear filters
						</button>
					</div>
				{/if}
			</section>

			<aside class="space-y-4 lg:sticky lg:top-20">
				<section
					aria-labelledby="active-rabbit-hole"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak"
				>
					<div class="flex items-start gap-3">
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
						>
							<ListTree class="h-4 w-4" />
						</span>
						<div class="min-w-0">
							<p class="micro-label text-accent">Rabbit Hole</p>
							<h2
								id="active-rabbit-hole"
								class="mt-1 text-lg font-semibold text-foreground"
							>
								{selectedDomain?.name ?? 'All Domains'}
							</h2>
						</div>
					</div>
					<p class="mt-3 text-sm leading-6 text-muted-foreground">
						{selectedDomain?.description ??
							'Pick a domain to see the path from broad problem to concrete skill.'}
					</p>
					<ol class="mt-4 space-y-2">
						{#each selectedDomain?.path ?? ['Pick a domain', 'Open a family', 'Choose a skill'] as step, index}
							<li class="flex gap-2 text-sm text-muted-foreground">
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground"
								>
									{index + 1}
								</span>
								<span class="pt-0.5">{step}</span>
							</li>
						{/each}
					</ol>
					{#if selectedDomain}
						<a
							href={getDomainPath(selectedDomain)}
							class="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Open domain map
							<ArrowRight class="h-4 w-4" />
						</a>
					{/if}
				</section>

				<section
					aria-labelledby="skill-families"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
				>
					<div class="flex items-center gap-2">
						<GitBranch class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="skill-families" class="text-lg font-semibold text-foreground">
							Families
						</h2>
					</div>
					<div class="mt-4 space-y-4">
						{#each filteredFamilies as family}
							<div>
								<p class="micro-label">{family.name}</p>
								<div class="mt-2 space-y-1.5">
									{#each family.skills as skill}
										<a
											href={getSkillPath(skill)}
											class="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<span class="truncate">{getDisplayTitle(skill)}</span>
											<ArrowRight class="h-3.5 w-3.5 shrink-0" />
										</a>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>

				<section
					aria-labelledby="agent-artifacts"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-center gap-2">
						<Code2 class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="agent-artifacts" class="text-lg font-semibold text-foreground">
							For Agents
						</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						The gallery is user-first, but every skill still resolves to portable agent
						files.
					</p>
					<div class="mt-4 grid gap-2">
						<a
							href="/agent-skills"
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Layers3 class="h-4 w-4" />
							Repository
						</a>
						<a
							href="/agent-skills/index.json"
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<FileText class="h-4 w-4" />
							JSON index
						</a>
					</div>
					<p class="mt-4 text-xs text-muted-foreground">
						{totalReferences} public reference files are available across the gallery.
					</p>
				</section>
			</aside>
		</div>
	</main>
</div>
