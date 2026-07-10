<!-- apps/web/src/routes/skills/family/[family]/+page.svelte -->
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
		CircleDashed,
		FileText,
		FolderTree,
		GitBranch,
		ListTree,
		Package,
		PlayCircle,
		Search,
		Sparkles,
		Target,
		X
	} from '$lib/icons/lucide';
	import {
		buildPostBySlug,
		getAgentFilePath,
		getDisplayTitle,
		getDomainPath,
		getFamilyPath,
		getOutputShapes,
		getPackPath,
		getPreviewSearchText,
		getPreviewSkillPath,
		getSearchText,
		getSkillPath,
		getSkillPromise,
		getTryInBuildOsPath,
		normalizeSearchText
	} from '$lib/skills/skill-gallery';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Tree = PageData['trees'][number];
	type Child = Tree['children'][number];
	type Preview = PageData['previews'][number];

	let query = $state('');
	let family = $derived(data.family);
	let postBySlug = $derived(buildPostBySlug(data.posts));
	let previewByRuntimeId = $derived(
		new Map(data.previews.map((preview) => [preview.runtime_skill_id, preview]))
	);
	let normalizedQuery = $derived(normalizeSearchText(query));
	let childCount = $derived(data.trees.reduce((total, tree) => total + tree.children.length, 0));
	let filteredSkills = $derived.by(() => {
		if (!normalizedQuery) return family.skills;
		return family.skills.filter((skill) =>
			normalizeSearchText(getSearchText(skill, postBySlug.get(skill.slug))).includes(
				normalizedQuery
			)
		);
	});
	let filteredTrees = $derived.by(() => {
		if (!normalizedQuery) return data.trees.filter((tree) => tree.children.length > 0);

		return data.trees
			.map((tree) => {
				const parentMatches = normalizeSearchText(
					getSearchText(tree.skill, postBySlug.get(tree.skill.slug))
				).includes(normalizedQuery);
				const children = tree.children.filter((child) =>
					childMatches(child, normalizedQuery)
				);
				return {
					...tree,
					children: parentMatches ? tree.children : children
				};
			})
			.filter((tree) => tree.children.length > 0);
	});
	let filteredStandalonePreviews = $derived.by(() => {
		if (!normalizedQuery) return data.standalonePreviews;
		return data.standalonePreviews.filter((preview) =>
			normalizeSearchText(getPreviewSearchText(preview)).includes(normalizedQuery)
		);
	});
	let startSkill = $derived(data.startSkill ?? null);
	let startPreview = $derived(data.startPreview ?? null);

	function childMatches(child: Child, normalized: string): boolean {
		return normalizeSearchText(
			[child.name, child.id, child.summary, ...child.when_to_load].filter(Boolean).join(' ')
		).includes(normalized);
	}

	function getPreviewHierarchyLabel(preview: Preview): string {
		if (!preview.parent_id) return 'Root workflow';
		const parent = previewByRuntimeId.get(preview.parent_id);
		return parent ? `Child of ${parent.title}` : 'Child workflow';
	}

	function clearSearch() {
		query = '';
	}

	function generateJsonLd() {
		const familyUrl = `${SITE_URL}${getFamilyPath(family)}`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				'@id': familyUrl,
				name: `${family.name} Skills - ${SITE_NAME}`,
				description: `Browse ${family.name} workflows, public skills, reviewed previews, and child skill paths.`,
				url: familyUrl,
				isPartOf: {
					'@id': DEFAULT_WEBSITE_ID,
					name: `${SITE_NAME} Skill Gallery`
				},
				publisher: {
					'@id': DEFAULT_ORGANIZATION_ID
				},
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: family.skills.length + data.previews.length,
					itemListElement: [
						...family.skills.map((skill) => ({
							name: getDisplayTitle(skill),
							description: skill.description,
							url: `${SITE_URL}${getSkillPath(skill)}`
						})),
						...data.previews.map((preview) => ({
							name: preview.title,
							description: preview.description,
							url: `${SITE_URL}${getPreviewSkillPath(preview)}`
						}))
					].map((item, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						item: {
							'@type': 'CreativeWork',
							...item
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
	<title>{family.name} Skills - BuildOS Skill Gallery</title>
	<meta
		name="description"
		content={`Browse ${family.name} workflows, public skills, reviewed previews, and child skill paths.`}
	/>
	<link rel="canonical" href={`${SITE_URL}${getFamilyPath(family)}`} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${SITE_URL}${getFamilyPath(family)}`} />
	<meta property="og:title" content={`${family.name} Skills - BuildOS Skill Gallery`} />
	<meta
		property="og:description"
		content={`Browse ${family.name} workflows, public skills, reviewed previews, and child skill paths.`}
	/>
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:secure_url" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={`${SITE_URL}${getFamilyPath(family)}`} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={`${family.name} Skills - BuildOS Skill Gallery`} />
	<meta
		name="twitter:description"
		content={`Browse ${family.name} workflows, public skills, reviewed previews, and child skill paths.`}
	/>
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
						<GitBranch class="h-4 w-4 shrink-0" />
						<span class="micro-label">Skill Family</span>
					</div>
					<h1 class="text-3xl font-semibold leading-tight sm:text-5xl">{family.name}</h1>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						Start with a published workflow or reviewed preview, then move into a
						narrower procedure when the job calls for it.
					</p>
					{#if startSkill}
						<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
							<a
								href={getSkillPath(startSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<BookOpen class="h-4 w-4" />
								Open start skill
							</a>
							<a
								href={getTryInBuildOsPath(startSkill)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try start skill
							</a>
						</div>
					{:else if startPreview}
						<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
							<a
								href={getPreviewSkillPath(startPreview)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<Sparkles class="h-4 w-4" />
								Open start preview
							</a>
							<a
								href={getTryInBuildOsPath(startPreview)}
								class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<PlayCircle class="h-4 w-4" />
								Try start preview
							</a>
						</div>
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Public skills</p>
						<p class="mt-1 text-2xl font-semibold">{family.skills.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Previews</p>
						<p class="mt-1 text-2xl font-semibold">{data.previews.length}</p>
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
						<span class="sr-only">Search {family.name}</span>
						<Search
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							bind:value={query}
							type="search"
							placeholder={`Search ${family.name.toLowerCase()} skills and child procedures...`}
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
		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<div class="space-y-10">
				<section aria-labelledby="family-skills">
					<p class="micro-label text-accent">Public Skills</p>
					<h2 id="family-skills" class="mt-1 text-2xl font-semibold">
						{filteredSkills.length} available workflow{filteredSkills.length === 1
							? ''
							: 's'}
					</h2>
					{#if filteredSkills.length}
						<div class="mt-5 grid gap-3 md:grid-cols-2">
							{#each filteredSkills as skill}
								{@const post = postBySlug.get(skill.slug)}
								<article
									class="flex min-h-[18rem] flex-col rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
								>
									<div class="flex min-w-0 items-start gap-3">
										<span
											class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
										>
											<Target class="h-4 w-4" />
										</span>
										<h3 class="line-clamp-2 text-lg font-semibold">
											{getDisplayTitle(skill)}
										</h3>
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
												>{output}</span
											>
										{/each}
									</div>
									<div class="mt-auto grid grid-cols-3 gap-2 pt-5">
										<a
											href={getSkillPath(skill)}
											class="inline-flex min-h-[44px] items-center justify-center rounded-md border border-accent bg-accent px-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>Open</a
										>
										<a
											href={getTryInBuildOsPath(skill)}
											class="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-semibold transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>Try</a
										>
										<a
											href={getAgentFilePath(skill)}
											class="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-semibold transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>SKILL.md</a
										>
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<p
							class="mt-5 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
						>
							No public skill title or description matches this search. Reviewed
							preview and child-skill matches still appear below.
						</p>
					{/if}
				</section>

				{#if data.standalonePreviews.length}
					<section aria-labelledby="family-previews" class="border-t border-border pt-8">
						<p class="micro-label text-accent">Reviewed Previews</p>
						<h2 id="family-previews" class="mt-1 text-2xl font-semibold">
							{filteredStandalonePreviews.length} preview{filteredStandalonePreviews.length ===
							1
								? ''
								: 's'} ready to explore
						</h2>
						<p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
							These reviewed synopses can launch editable workflows while their
							portable artifacts remain unpublished.
						</p>
						{#if filteredStandalonePreviews.length}
							<div class="mt-5 grid gap-3 md:grid-cols-2">
								{#each filteredStandalonePreviews as preview}
									<article
										class="flex min-h-[17rem] flex-col rounded-lg border border-dashed border-accent/60 bg-card p-4 shadow-ink tx tx-frame tx-weak"
									>
										<div class="flex min-w-0 items-start justify-between gap-3">
											<span
												class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/50 bg-accent/10 text-accent"
											>
												<Sparkles class="h-4 w-4" />
											</span>
											<span
												class="rounded-full bg-accent/10 px-2 py-1 text-2xs font-semibold text-accent"
											>
												Preview
											</span>
										</div>
										<p class="mt-3 micro-label text-muted-foreground">
											{getPreviewHierarchyLabel(preview)}
										</p>
										<h3 class="mt-1 line-clamp-2 text-lg font-semibold">
											{preview.title}
										</h3>
										<p
											class="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground"
										>
											{preview.description}
										</p>
										<div class="mt-4 flex flex-wrap gap-1.5">
											{#each preview.output_shapes.slice(0, 3) as output}
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
												class="inline-flex min-h-[44px] items-center justify-center rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												Open
											</a>
											<a
												href={getTryInBuildOsPath(preview)}
												class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<PlayCircle class="h-4 w-4" />
												Try
											</a>
										</div>
									</article>
								{/each}
							</div>
						{:else}
							<p
								class="mt-5 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
							>
								No reviewed preview matches this search.
							</p>
						{/if}
					</section>
				{/if}

				{#if childCount > 0}
					<section aria-labelledby="child-tree" class="border-t border-border pt-8">
						<p class="micro-label text-accent">Child Skill Tree</p>
						<h2 id="child-tree" class="mt-1 text-2xl font-semibold">
							Move into narrower procedures
						</h2>
						<p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
							Public child skills open directly. Reviewed runtime children open as
							previews; internal children remain visible so the family map is
							complete.
						</p>
						{#if filteredTrees.length}
							<div class="mt-5 space-y-4">
								{#each filteredTrees as tree}
									<article
										class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak"
									>
										<a
											href={getSkillPath(tree.skill)}
											class="group flex min-w-0 items-center justify-between gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<div class="min-w-0">
												<p class="micro-label">Parent workflow</p>
												<h3
													class="mt-1 truncate text-lg font-semibold group-hover:text-accent"
												>
													{getDisplayTitle(tree.skill)}
												</h3>
											</div>
											<ArrowRight
												class="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent"
											/>
										</a>
										<div class="mt-4 grid gap-2 md:grid-cols-2">
											{#each tree.children as child}
												{#if child.slug}
													<a
														href={getSkillPath({ slug: child.slug })}
														class="group rounded-md border border-border bg-background p-3 transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														<div
															class="flex min-w-0 items-center justify-between gap-2"
														>
															<p
																class="truncate text-sm font-semibold"
															>
																{child.name ?? child.id}
															</p>
															<ArrowRight
																class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-accent"
															/>
														</div>
														<p
															class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
														>
															{child.summary}
														</p>
													</a>
												{:else if child.previewSlug}
													<a
														href={getPreviewSkillPath({
															slug: child.previewSlug
														})}
														class="group rounded-md border border-dashed border-accent/60 bg-accent/5 p-3 transition-colors hover:border-accent hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														<div
															class="flex min-w-0 items-center justify-between gap-2"
														>
															<p
																class="truncate text-sm font-semibold"
															>
																{child.name ?? child.id}
															</p>
															<ArrowRight
																class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-accent"
															/>
														</div>
														<p
															class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
														>
															{child.summary}
														</p>
														<p
															class="mt-2 text-2xs font-semibold text-accent"
														>
															Reviewed preview
														</p>
													</a>
												{:else}
													<div
														class="rounded-md border border-border bg-background p-3"
													>
														<div
															class="flex min-w-0 items-center justify-between gap-2"
														>
															<p
																class="truncate text-sm font-semibold"
															>
																{child.name ?? child.id}
															</p>
															<CircleDashed
																class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
															/>
														</div>
														<p
															class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
														>
															{child.summary}
														</p>
														<p
															class="mt-2 text-2xs font-medium text-muted-foreground"
														>
															Gallery entry pending
														</p>
													</div>
												{/if}
											{/each}
										</div>
									</article>
								{/each}
							</div>
						{:else}
							<div
								class="mt-5 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
							>
								<ListTree class="mb-3 h-5 w-5" />
								No child procedure matches this search.
							</div>
						{/if}
					</section>
				{/if}
			</div>

			<aside class="space-y-4 lg:sticky lg:top-20">
				{#if data.domains.length}
					<section
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
						aria-labelledby="family-domains"
					>
						<div class="flex items-center gap-2">
							<FolderTree class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="family-domains" class="text-lg font-semibold">Domains</h2>
						</div>
						<div class="mt-4 space-y-2">
							{#each data.domains as domain}
								<a
									href={getDomainPath(domain)}
									class="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span class="truncate">{domain.name}</span>
									<ArrowRight class="h-3.5 w-3.5 shrink-0" />
								</a>
							{/each}
						</div>
					</section>
				{/if}

				{#if data.packs.length}
					<section
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
						aria-labelledby="family-paths"
					>
						<div class="flex items-center gap-2">
							<Package class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="family-paths" class="text-lg font-semibold">
								Packs And Stacks
							</h2>
						</div>
						<div class="mt-4 space-y-2">
							{#each data.packs as pack}
								<a
									href={getPackPath(pack)}
									class="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span class="truncate">{pack.name}</span>
									<ArrowRight class="h-3.5 w-3.5 shrink-0" />
								</a>
							{/each}
						</div>
					</section>
				{/if}

				<section
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
					aria-labelledby="family-agent-files"
				>
					<div class="flex items-center gap-2">
						<FileText class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="family-agent-files" class="text-lg font-semibold">For Agents</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						Each public workflow keeps its portable agent file one click away.
					</p>
					<p class="mt-4 text-xs text-muted-foreground">
						Catalog {data.catalogVersion}; {data.totalSkills} public skills.
					</p>
				</section>
			</aside>
		</div>
	</div>
</div>
