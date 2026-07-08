<!-- apps/web/src/routes/skills/path/[path]/+page.svelte -->
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
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Brain,
		CheckCircle2,
		Code2,
		FileText,
		FolderTree,
		GitBranch,
		Layers3,
		ListTree,
		Package,
		PlayCircle,
		Target,
		Workflow
	} from '$lib/icons/lucide';
	import {
		buildPostBySlug,
		getAgentFilePath,
		getDisplayTitle,
		getDomainPath,
		getNumericStat,
		getOutputShapes,
		getPackPath,
		getSkillFamily,
		getSkillPath,
		getSkillPromise,
		getTryInBuildOsPath,
		humanize
	} from '$lib/skills/skill-gallery';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Skill = PageData['pack']['skills'][number];

	let pack = $derived(data.pack);
	let postBySlug = $derived(buildPostBySlug(data.posts));
	let startSkill = $derived((pack.skills[0] ?? null) as Skill | null);
	let PathIcon = $derived(pack.kind === 'Stack' ? Workflow : Package);
	let totalReferences = $derived(
		pack.skills.reduce((total, skill) => total + skill.references.length, 0)
	);
	let totalSources = $derived(
		pack.skills.reduce((total, skill) => total + getNumericStat(skill, 'sources'), 0)
	);

	function stageLabel(index: number, skill: Skill): string {
		return pack.order[index] ?? getSkillFamily(skill);
	}

	function generateJsonLd() {
		const pathUrl = `${SITE_URL}${getPackPath(pack)}`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				'@id': pathUrl,
				name: `${pack.name} - ${SITE_NAME}`,
				description: pack.job,
				url: pathUrl,
				isPartOf: {
					'@id': DEFAULT_WEBSITE_ID,
					name: `${SITE_NAME} Skill Gallery`
				},
				publisher: {
					'@id': DEFAULT_ORGANIZATION_ID
				},
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: pack.skills.length,
					itemListElement: pack.skills.map((skill, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: stageLabel(index, skill),
						item: {
							'@type': 'CreativeWork',
							name: getDisplayTitle(skill),
							description: skill.description,
							url: `${SITE_URL}${getSkillPath(skill)}`,
							genre: humanize(skill.skill_category)
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
	<title>{pack.name} - BuildOS Skill Gallery</title>
	<meta name="description" content={pack.job} />
	<link rel="canonical" href={`${SITE_URL}${getPackPath(pack)}`} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${SITE_URL}${getPackPath(pack)}`} />
	<meta property="og:title" content={`${pack.name} - BuildOS Skill Gallery`} />
	<meta property="og:description" content={pack.job} />
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
	<meta name="twitter:url" content={`${SITE_URL}${getPackPath(pack)}`} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={`${pack.name} - BuildOS Skill Gallery`} />
	<meta name="twitter:description" content={pack.job} />
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
				<ArrowLeft class="h-4 w-4" />
				Skill Gallery
			</a>

			<div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
				<div class="max-w-4xl">
					<div class="mb-4 flex flex-wrap items-center gap-2">
						<span
							class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-accent"
						>
							<PathIcon class="h-4 w-4" />
							{pack.kind}
						</span>
						<span
							class="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground"
						>
							{pack.skills.length} stage{pack.skills.length === 1 ? '' : 's'}
						</span>
					</div>
					<h1
						class="max-w-4xl text-3xl font-semibold leading-tight text-foreground sm:text-5xl"
					>
						{pack.name}
					</h1>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						{pack.job}
					</p>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
						{pack.description}
					</p>

					<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						{#if startSkill}
							<a
								href={getTryInBuildOsPath(startSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try first stage
							</a>
							<a
								href={getSkillPath(startSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<BookOpen class="h-4 w-4" />
								Open first stage
							</a>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Stages</p>
						<p class="mt-1 text-2xl font-semibold">{pack.skills.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Domains</p>
						<p class="mt-1 text-2xl font-semibold">{data.domains.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Sources</p>
						<p class="mt-1 text-2xl font-semibold">{totalSources}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Refs</p>
						<p class="mt-1 text-2xl font-semibold">{totalReferences}</p>
					</div>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<section aria-labelledby="path-stages">
				<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p class="micro-label text-accent">Operating Path</p>
						<h2 id="path-stages" class="mt-1 text-2xl font-semibold text-foreground">
							Run the stages in order
						</h2>
					</div>
					<p class="max-w-xl text-sm leading-6 text-muted-foreground">
						Each stage is a full skill page for users and a portable SKILL.md for
						agents.
					</p>
				</div>

				<ol class="space-y-4">
					{#each pack.skills as skill, index}
						{@const post = postBySlug.get(skill.slug)}
						<li
							class="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak sm:grid-cols-[3.25rem_minmax(0,1fr)]"
						>
							<div
								class="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-sm font-semibold text-accent"
							>
								{index + 1}
							</div>
							<div class="min-w-0">
								<div
									class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
								>
									<div class="min-w-0">
										<p class="micro-label">{stageLabel(index, skill)}</p>
										<h3 class="mt-1 text-xl font-semibold text-foreground">
											{getDisplayTitle(skill)}
										</h3>
										<p class="mt-2 text-sm leading-6 text-muted-foreground">
											{getSkillPromise(skill, post)}
										</p>
									</div>
									<span
										class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
									>
										<Target class="h-3.5 w-3.5" />
										{getSkillFamily(skill)}
									</span>
								</div>

								<div class="mt-4 flex flex-wrap gap-1.5">
									{#each getOutputShapes(skill).slice(0, 4) as output}
										<span
											class="rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
										>
											{output}
										</span>
									{/each}
								</div>

								<div class="mt-5 grid gap-2 sm:grid-cols-3">
									<a
										href={getSkillPath(skill)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<BookOpen class="h-4 w-4" />
										Open
									</a>
									<a
										href={getTryInBuildOsPath(skill)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<PlayCircle class="h-4 w-4" />
										Try
									</a>
									<a
										href={getAgentFilePath(skill)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<FileText class="h-4 w-4" />
										SKILL.md
									</a>
								</div>
							</div>
						</li>
					{/each}
				</ol>
			</section>

			<aside class="space-y-4 lg:sticky lg:top-20">
				<section
					aria-labelledby="path-contents"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak"
				>
					<div class="flex items-center gap-2">
						<ListTree class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="path-contents" class="text-lg font-semibold text-foreground">
							Path Contents
						</h2>
					</div>
					<ol class="mt-4 space-y-2">
						{#each pack.skills as skill, index}
							<li class="flex min-w-0 gap-2 text-sm">
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground"
								>
									{index + 1}
								</span>
								<div class="min-w-0">
									<p class="truncate font-semibold text-foreground">
										{stageLabel(index, skill)}
									</p>
									<p class="truncate text-xs text-muted-foreground">
										{getDisplayTitle(skill)}
									</p>
								</div>
							</li>
						{/each}
					</ol>
				</section>

				{#if data.domains.length}
					<section
						aria-labelledby="path-domains"
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex items-center gap-2">
							<FolderTree class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="path-domains" class="text-lg font-semibold text-foreground">
								Domains
							</h2>
						</div>
						<div class="mt-4 space-y-2">
							{#each data.domains as domain}
								<a
									href={getDomainPath(domain)}
									class="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span class="truncate font-medium">{domain.shortName}</span>
									<ArrowRight class="h-3.5 w-3.5 shrink-0" />
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if data.relatedPacks.length}
					<section
						aria-labelledby="related-paths"
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex items-center gap-2">
							<GitBranch class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="related-paths" class="text-lg font-semibold text-foreground">
								Related Paths
							</h2>
						</div>
						<div class="mt-4 space-y-2">
							{#each data.relatedPacks as related}
								<a
									href={getPackPath(related)}
									class="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span class="truncate font-medium">{related.name}</span>
									<ArrowRight class="h-3.5 w-3.5 shrink-0" />
								</a>
							{/each}
						</div>
					</section>
				{/if}

				<section
					aria-labelledby="path-agent-files"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-center gap-2">
						<Code2 class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="path-agent-files" class="text-lg font-semibold text-foreground">
							For Agents
						</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						Use the path as the human sequence. Each stage exposes its own portable
						file.
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
						Catalog {data.catalogVersion}; {data.totalSkills} total public skills.
					</p>
				</section>

				<section
					aria-labelledby="path-check"
					class="rounded-lg border border-border bg-card p-4 shadow-ink"
				>
					<div class="flex items-center gap-2">
						<CheckCircle2 class="h-4 w-4 shrink-0 text-success" />
						<h2 id="path-check" class="text-lg font-semibold text-foreground">
							Use This When
						</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						You need a sequence of skills instead of one isolated playbook.
					</p>
				</section>
			</aside>
		</div>
	</main>
</div>
