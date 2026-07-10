<!-- apps/web/src/routes/skills/domain/[domain]/+page.svelte -->
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
		Code2,
		FileText,
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
		buildPostBySlug,
		getAgentFilePath,
		getDisplayTitle,
		getFamilyPath,
		getOutputShapes,
		getPackPath,
		getPreviewSearchText,
		getPreviewSkillPath,
		getSearchText,
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

	type Skill = PageData['domain']['skills'][number];
	type Preview = PageData['domain']['previews'][number];

	let query = $state('');

	let domain = $derived(data.domain);
	let postBySlug = $derived(buildPostBySlug(data.posts));
	let normalizedQuery = $derived(normalizeSearchText(query));
	let featuredSkill = $derived(data.featuredSkill as Skill | null);
	let featuredPreview = $derived(data.featuredPreview as Preview | null);
	let previewByRuntimeId = $derived(
		new Map(domain.previews.map((preview) => [preview.runtime_skill_id, preview]))
	);
	let filteredSkills = $derived.by(() => {
		if (!normalizedQuery) return domain.skills;

		return domain.skills.filter((skill) => {
			const post = postBySlug.get(skill.slug);
			return normalizeSearchText(getSearchText(skill, post)).includes(normalizedQuery);
		});
	});
	let filteredFamilies = $derived(groupSkillsByFamily(filteredSkills));
	let filteredPreviews = $derived.by(() => {
		if (!normalizedQuery) return domain.previews;
		return domain.previews.filter((preview) =>
			normalizeSearchText(getPreviewSearchText(preview)).includes(normalizedQuery)
		);
	});
	let filteredPreviewFamilies = $derived(
		data.previewFamilies
			.map((family) => ({
				...family,
				previews: family.previews.filter((preview) =>
					filteredPreviews.some(
						(filteredPreview) =>
							filteredPreview.runtime_skill_id === preview.runtime_skill_id
					)
				)
			}))
			.filter((family) => family.previews.length > 0)
	);
	let totalMatches = $derived(filteredSkills.length + filteredPreviews.length);

	function clearSearch() {
		query = '';
	}

	function familyId(name: string): string {
		return `family-${normalizeSearchText(name).replace(/\s+/g, '-') || 'skills'}`;
	}

	function getPreviewHierarchyLabel(preview: Preview): string {
		if (!preview.parent_id) return 'Root workflow';
		const parent = previewByRuntimeId.get(preview.parent_id);
		return parent ? `Child of ${parent.title}` : 'Child workflow';
	}

	function generateJsonLd() {
		const domainUrl = `${SITE_URL}/skills/domain/${domain.id}`;
		const entries = [
			...domain.skills.map((skill) => ({
				name: getDisplayTitle(skill),
				description: skill.description,
				url: `${SITE_URL}${getSkillPath(skill)}`,
				genre: humanize(skill.skill_type)
			})),
			...domain.previews.map((preview) => ({
				name: preview.title,
				description: preview.description,
				url: `${SITE_URL}${getPreviewSkillPath(preview)}`,
				genre: 'Reviewed Preview'
			}))
		];
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				'@id': domainUrl,
				name: `${domain.name} Skills - ${SITE_NAME}`,
				description: domain.promise,
				url: domainUrl,
				isPartOf: {
					'@id': DEFAULT_WEBSITE_ID,
					name: `${SITE_NAME} Skill Gallery`
				},
				publisher: {
					'@id': DEFAULT_ORGANIZATION_ID
				},
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: entries.length,
					itemListElement: entries.map((entry, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						item: {
							'@type': 'CreativeWork',
							...entry
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
	<title>{domain.name} Skills - BuildOS Skill Gallery</title>
	<meta name="description" content={domain.promise} />
	<link rel="canonical" href={`${SITE_URL}/skills/domain/${domain.id}`} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${SITE_URL}/skills/domain/${domain.id}`} />
	<meta property="og:title" content={`${domain.name} Skills - BuildOS Skill Gallery`} />
	<meta property="og:description" content={domain.promise} />
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
	<meta name="twitter:url" content={`${SITE_URL}/skills/domain/${domain.id}`} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={`${domain.name} Skills - BuildOS Skill Gallery`} />
	<meta name="twitter:description" content={domain.promise} />
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
					<div class="mb-4 inline-flex items-center gap-2 text-accent">
						<FolderTree class="h-4 w-4 shrink-0" />
						<span class="micro-label">Domain Map</span>
					</div>
					<h1
						class="max-w-4xl text-3xl font-semibold leading-tight text-foreground sm:text-5xl"
					>
						{domain.name}
					</h1>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						{domain.promise}
					</p>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
						{domain.description}
					</p>

					<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						{#if featuredSkill}
							<a
								href={getTryInBuildOsPath(featuredSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try start skill
							</a>
							<a
								href={getSkillPath(featuredSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<BookOpen class="h-4 w-4" />
								Open start skill
							</a>
						{:else if featuredPreview}
							<a
								href={getTryInBuildOsPath(featuredPreview)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try start preview
							</a>
							<a
								href={getPreviewSkillPath(featuredPreview)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<Sparkles class="h-4 w-4" />
								Open start preview
							</a>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Published</p>
						<p class="mt-1 text-2xl font-semibold">{domain.skills.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Previews</p>
						<p class="mt-1 text-2xl font-semibold">{domain.previews.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Families</p>
						<p class="mt-1 text-2xl font-semibold">{data.familyCount}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Paths</p>
						<p class="mt-1 text-2xl font-semibold">{data.packs.length}</p>
					</div>
				</div>
			</div>

			<div
				class="mt-8 rounded-lg border border-border bg-background p-3 shadow-ink tx tx-grid tx-weak"
			>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<label class="relative block min-w-0 flex-1">
						<span class="sr-only">Search {domain.shortName} skills</span>
						<Search
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							bind:value={query}
							type="search"
							placeholder={`Search ${domain.shortName.toLowerCase()} skills, outputs, files, and jobs...`}
							class="h-12 w-full rounded-md border border-border-strong bg-card pl-10 pr-3 text-base text-foreground shadow-ink-inner outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring sm:text-sm"
						/>
					</label>
					{#if query.trim()}
						<button
							type="button"
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onclick={clearSearch}
						>
							<X class="h-4 w-4" />
							Clear
						</button>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<section aria-labelledby="domain-path" class="mb-10">
			<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p class="micro-label text-accent">Rabbit Hole</p>
					<h2 id="domain-path" class="mt-1 text-2xl font-semibold text-foreground">
						Follow the path
					</h2>
				</div>
				<p class="max-w-xl text-sm leading-6 text-muted-foreground">
					Start broad, then narrow toward the skill that matches the immediate job.
				</p>
			</div>

			<ol class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{#each domain.path as step, index}
					<li
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex items-start gap-3">
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-sm font-semibold text-accent"
							>
								{index + 1}
							</span>
							<div class="min-w-0">
								<p class="micro-label">Step {index + 1}</p>
								<p class="mt-1 text-sm font-semibold leading-6 text-foreground">
									{step}
								</p>
							</div>
						</div>
					</li>
				{/each}
			</ol>
		</section>

		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<section aria-labelledby="domain-skills">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p class="micro-label text-accent">Domain Catalog</p>
						<h2 id="domain-skills" class="mt-1 text-2xl font-semibold text-foreground">
							{totalMatches}
							{domain.shortName.toLowerCase()} entr{totalMatches === 1 ? 'y' : 'ies'}
						</h2>
					</div>
					<p class="text-sm text-muted-foreground">
						Showing {totalMatches} of {domain.skills.length + domain.previews.length}
					</p>
				</div>

				{#if filteredFamilies.length > 0 || filteredPreviewFamilies.length > 0}
					<div class="space-y-8">
						{#each filteredFamilies as family}
							<section
								aria-labelledby={familyId(family.name)}
								class="border-t border-border pt-6 first:border-t-0 first:pt-0"
							>
								<div class="mb-3 flex items-center gap-2">
									<GitBranch class="h-4 w-4 shrink-0 text-accent" />
									<h3 id={familyId(family.name)}>
										<a
											href={getFamilyPath(family)}
											class="inline-flex min-h-[44px] items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{family.name}
											<ArrowRight class="h-4 w-4" />
										</a>
									</h3>
									<span
										class="rounded-full border border-border bg-card px-2 py-1 text-2xs font-medium text-muted-foreground"
									>
										{family.skills.length}
									</span>
								</div>

								<div class="grid gap-3 xl:grid-cols-2">
									{#each family.skills as skill}
										{@const post = postBySlug.get(skill.slug)}
										<article
											class="flex min-h-[19rem] flex-col rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="flex min-w-0 items-center gap-2">
													<span
														class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
													>
														<Target class="h-4 w-4" />
													</span>
													<div class="min-w-0">
														<p class="micro-label">
															{humanize(skill.skill_type)}
														</p>
														<h4
															class="mt-1 line-clamp-2 text-lg font-semibold text-foreground"
														>
															{getDisplayTitle(skill)}
														</h4>
													</div>
												</div>
												<span
													class="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
												>
													{skill.references.length} refs
												</span>
											</div>

											<p
												class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground"
											>
												{getSkillPromise(skill, post)}
											</p>

											<div class="mt-4 flex flex-wrap gap-1.5">
												{#each getOutputShapes(skill).slice(0, 4) as output}
													<span
														class="rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
													>
														{output}
													</span>
												{/each}
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
										</article>
									{/each}
								</div>
							</section>
						{/each}

						{#each filteredPreviewFamilies as family}
							<section
								aria-labelledby={familyId(`preview-${family.name}`)}
								class="border-t border-border pt-6 first:border-t-0 first:pt-0"
							>
								<div class="mb-3 flex items-center gap-2">
									<Sparkles class="h-4 w-4 shrink-0 text-accent" />
									<h3 id={familyId(`preview-${family.name}`)}>
										<a
											href={getFamilyPath(family)}
											class="inline-flex min-h-[44px] items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{family.name}
											<ArrowRight class="h-4 w-4" />
										</a>
									</h3>
									<span
										class="rounded-full border border-accent/50 bg-accent/10 px-2 py-1 text-2xs font-medium text-accent"
									>
										{family.previews.length} preview{family.previews.length ===
										1
											? ''
											: 's'}
									</span>
								</div>

								<div class="grid gap-3 xl:grid-cols-2">
									{#each family.previews as preview}
										<article
											class="flex min-h-[19rem] flex-col rounded-lg border border-dashed border-accent/60 bg-card p-4 shadow-ink tx tx-frame tx-weak"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="flex min-w-0 items-center gap-2">
													<span
														class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/50 bg-accent/10 text-accent"
													>
														<Sparkles class="h-4 w-4" />
													</span>
													<div class="min-w-0">
														<p class="micro-label">
															{getPreviewHierarchyLabel(preview)}
														</p>
														<h4
															class="mt-1 line-clamp-2 text-lg font-semibold text-foreground"
														>
															{preview.title}
														</h4>
													</div>
												</div>
												<span
													class="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-2xs font-semibold text-accent"
												>
													Preview
												</span>
											</div>

											<p
												class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground"
											>
												{preview.description}
											</p>

											<div class="mt-4 flex flex-wrap gap-1.5">
												{#each preview.output_shapes.slice(0, 4) as output}
													<span
														class="rounded-full border border-border bg-background px-2 py-1 text-2xs font-medium text-muted-foreground"
													>
														{output}
													</span>
												{/each}
											</div>

											<div class="mt-auto grid grid-cols-2 gap-2 pt-5">
												<a
													href={getPreviewSkillPath(preview)}
													class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													<BookOpen class="h-4 w-4" />
													Open
												</a>
												<a
													href={getTryInBuildOsPath(preview)}
													class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													<PlayCircle class="h-4 w-4" />
													Try
												</a>
											</div>
										</article>
									{/each}
								</div>
							</section>
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
							Clear the search or try a broader output, job, or skill family.
						</p>
						<button
							type="button"
							class="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onclick={clearSearch}
						>
							Clear search
						</button>
					</div>
				{/if}
			</section>

			<aside class="space-y-4 lg:sticky lg:top-20">
				{#if featuredSkill}
					<section
						aria-labelledby="start-skill"
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak"
					>
						<div class="flex items-start gap-3">
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
							>
								<Brain class="h-4 w-4" />
							</span>
							<div class="min-w-0">
								<p class="micro-label text-accent">Start Skill</p>
								<h2
									id="start-skill"
									class="mt-1 text-lg font-semibold text-foreground"
								>
									{getDisplayTitle(featuredSkill)}
								</h2>
							</div>
						</div>
						<p class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
							{getSkillPromise(featuredSkill, postBySlug.get(featuredSkill.slug))}
						</p>
						<div class="mt-4 grid gap-2">
							<a
								href={getTryInBuildOsPath(featuredSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try in BuildOS
							</a>
							<a
								href={getSkillPath(featuredSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<BookOpen class="h-4 w-4" />
								Read skill page
							</a>
						</div>
					</section>
				{:else if featuredPreview}
					<section
						aria-labelledby="start-preview"
						class="rounded-lg border border-dashed border-accent/60 bg-card p-4 shadow-ink tx tx-thread tx-weak"
					>
						<div class="flex items-start gap-3">
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/50 bg-accent/10 text-accent"
							>
								<Sparkles class="h-4 w-4" />
							</span>
							<div class="min-w-0">
								<p class="micro-label text-accent">Start Preview</p>
								<h2
									id="start-preview"
									class="mt-1 text-lg font-semibold text-foreground"
								>
									{featuredPreview.title}
								</h2>
							</div>
						</div>
						<p class="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
							{featuredPreview.description}
						</p>
						<div class="mt-4 grid gap-2">
							<a
								href={getTryInBuildOsPath(featuredPreview)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try in BuildOS
							</a>
							<a
								href={getPreviewSkillPath(featuredPreview)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<BookOpen class="h-4 w-4" />
								Read preview page
							</a>
						</div>
					</section>
				{/if}

				{#if data.packs.length}
					<section
						aria-labelledby="domain-packs"
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex items-center gap-2">
							<ListTree class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="domain-packs" class="text-lg font-semibold text-foreground">
								Packs And Stacks
							</h2>
						</div>
						<div class="mt-4 space-y-3">
							{#each data.packs as pack}
								{@const PackIcon = pack.kind === 'Stack' ? Workflow : Package}
								<div class="rounded-md border border-border bg-background p-3">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="micro-label">{pack.kind}</p>
											<p class="mt-1 truncate font-semibold text-foreground">
												{pack.name}
											</p>
										</div>
										<PackIcon class="h-4 w-4 shrink-0 text-accent" />
									</div>
									<p
										class="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground"
									>
										{pack.job}
									</p>
									<div class="mt-3 space-y-1.5">
										{#each pack.skills.slice(0, 4) as skill}
											<a
												href={getSkillPath(skill)}
												class="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<span class="truncate"
													>{getDisplayTitle(skill)}</span
												>
												<ArrowRight class="h-3.5 w-3.5 shrink-0" />
											</a>
										{/each}
									</div>
									<a
										href={getPackPath(pack)}
										class="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										Open path
										<ArrowRight class="h-4 w-4" />
									</a>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<section
					aria-labelledby="domain-agent-files"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-center gap-2">
						<Code2 class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="domain-agent-files" class="text-lg font-semibold text-foreground">
							For Agents
						</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						Published skills expose portable agent files. Reviewed previews deliberately
						keep those files private until publication review is complete.
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
						Catalog {data.catalogVersion}; {domain.skills.length} published · {domain
							.previews.length}
						reviewed previews in this domain.
					</p>
				</section>
			</aside>
		</div>
	</div>
</div>
