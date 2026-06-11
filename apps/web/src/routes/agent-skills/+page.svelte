<!-- apps/web/src/routes/agent-skills/+page.svelte -->
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
		BookOpen,
		Brain,
		Check,
		Code2,
		Copy,
		Download,
		ExternalLink,
		FileText,
		GitBranch,
		Layers3,
		Search
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Skill = PageData['catalog']['skills'][number];

	let query = $state('');
	let activeCategory = $state('all');
	let copiedSlug = $state<string | null>(null);
	let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

	let skills = $derived(data.catalog.skills);
	let categoryOptions = $derived(
		Array.from(
			new Set(
				skills
					.map((skill) => skill.skill_category)
					.filter((category): category is string => Boolean(category))
			)
		).sort((a, b) => humanize(a).localeCompare(humanize(b)))
	);
	let totalReferenceCount = $derived(
		skills.reduce((total, skill) => total + skill.references.length, 0)
	);
	let totalLineageSourceCount = $derived(
		skills.reduce((total, skill) => total + getNumericStat(skill, 'sources'), 0)
	);
	let filteredSkills = $derived(
		skills.filter((skill) => {
			const normalizedQuery = normalizeSearchText(query);
			const matchesCategory =
				activeCategory === 'all' || skill.skill_category === activeCategory;
			if (!matchesCategory) return false;
			if (!normalizedQuery) return true;

			const haystack = [
				skill.title,
				skill.description,
				skill.slug,
				skill.public_skill_id,
				skill.runtime_skill_id,
				skill.skill_type,
				skill.skill_category,
				...(skill.providers ?? []),
				...(skill.compatible_agents ?? []),
				...(skill.stack_with ?? []),
				...(skill.lineage_people ?? [])
			]
				.filter((value): value is string => Boolean(value))
				.join(' ');

			return normalizeSearchText(haystack).includes(normalizedQuery);
		})
	);

	function normalizeSearchText(value: string): string {
		return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	}

	function humanize(value?: string): string {
		if (!value) return 'Uncategorized';
		return value
			.split(/[-_]/)
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function getNumericStat(skill: Skill, key: string): number {
		const value = skill.lineage_stats?.[key];
		return typeof value === 'number' ? value : 0;
	}

	function getSkillPath(skill: Skill): string {
		return `/agent-skills/${skill.slug}`;
	}

	function getPortableSkillPath(skill: Skill): string {
		return `${getSkillPath(skill)}/portable/SKILL.md`;
	}

	function getBundlePath(skill: Skill): string {
		return `${getSkillPath(skill)}/bundle.zip`;
	}

	function getBuildOsSkillPath(skill: Skill): string {
		return `${getSkillPath(skill)}/skill.md`;
	}

	function getBundleCommand(skill: Skill): string {
		return `curl -L ${skill.bundle_zip_url} -o ${skill.slug}.zip`;
	}

	async function copyBundleCommand(skill: Skill) {
		if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

		await navigator.clipboard.writeText(getBundleCommand(skill));
		copiedSlug = skill.slug;
		if (copyResetTimer) clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => {
			if (copiedSlug === skill.slug) copiedSlug = null;
			copyResetTimer = null;
		}, 2000);
	}

	function generateJsonLd() {
		const collectionUrl = `${SITE_URL}/agent-skills`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				'@id': collectionUrl,
				name: `${SITE_NAME} Agent Skills`,
				description: data.category.description,
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
							name: skill.title,
							description: skill.description,
							url: skill.url,
							encoding: [
								{
									'@type': 'MediaObject',
									contentUrl: skill.portable_skill_md_url,
									encodingFormat: 'text/markdown'
								},
								{
									'@type': 'MediaObject',
									contentUrl: skill.bundle_zip_url,
									encodingFormat: 'application/zip'
								}
							]
						}
					}))
				}
			},
			null,
			2
		);
	}

	let jsonLdString = $derived(generateJsonLd());
</script>

<svelte:head>
	<title>Agent Skills - BuildOS | Skill Repository</title>
	<meta
		name="description"
		content="Browse public BuildOS agent skills with human guides, portable SKILL.md files, downloadable bundles, source lineage, and machine-readable metadata."
	/>
	<meta
		name="keywords"
		content="BuildOS agent skills, AI skills, SKILL.md, skill repository, Claude Code skills, Codex skills, agent lineage"
	/>
	<link rel="canonical" href={`${SITE_URL}/agent-skills`} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${SITE_URL}/agent-skills`} />
	<meta property="og:title" content="BuildOS Agent Skills Repository" />
	<meta
		property="og:description"
		content="Public BuildOS agent skills with portable SKILL.md files, bundles, references, and source lineage."
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
	<meta name="twitter:url" content={`${SITE_URL}/agent-skills`} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content="BuildOS Agent Skills Repository" />
	<meta
		name="twitter:description"
		content="Portable agent skills with human guides, SKILL.md files, bundles, references, and source lineage."
	/>
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta name="robots" content="index, follow" />

	{@html `<script type="application/ld+json">${escapeSerializedJsonLd(jsonLdString)}</script>`}
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-bloom tx-weak">
		<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
			<div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<div class="max-w-3xl">
					<div class="mb-4 inline-flex items-center gap-2 text-xs font-medium uppercase text-accent">
						<Brain class="h-4 w-4" />
						BuildOS Skill Repository
					</div>
					<h1
						class="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl"
					>
						Agent Skills
					</h1>
					<p class="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
						Portable skill guides, runtime definitions, source lineage, and downloadable
						agent bundles.
					</p>
				</div>

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[34rem]">
					<div class="rounded-lg border border-border bg-background/80 p-3">
						<p class="text-xs text-muted-foreground">Skills</p>
						<p class="mt-1 text-2xl font-semibold">{skills.length}</p>
					</div>
					<div class="rounded-lg border border-border bg-background/80 p-3">
						<p class="text-xs text-muted-foreground">Categories</p>
						<p class="mt-1 text-2xl font-semibold">{categoryOptions.length}</p>
					</div>
					<div class="rounded-lg border border-border bg-background/80 p-3">
						<p class="text-xs text-muted-foreground">References</p>
						<p class="mt-1 text-2xl font-semibold">{totalReferenceCount}</p>
					</div>
					<div class="rounded-lg border border-border bg-background/80 p-3">
						<p class="text-xs text-muted-foreground">Sources</p>
						<p class="mt-1 text-2xl font-semibold">{totalLineageSourceCount}</p>
					</div>
				</div>
			</div>
		</div>
	</header>

	<section class="border-b border-border bg-background">
		<div class="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div class="relative max-w-xl flex-1">
					<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						bind:value={query}
						type="search"
						placeholder="Search skills, creators, stacks, or categories"
						class="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
					/>
				</div>

				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
							activeCategory === 'all'
								? 'border-accent bg-accent text-accent-foreground'
								: 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground'
						}`}
						onclick={() => (activeCategory = 'all')}
					>
						All
					</button>
					{#each categoryOptions as category}
						<button
							type="button"
							class={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
								activeCategory === category
									? 'border-accent bg-accent text-accent-foreground'
									: 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground'
							}`}
							onclick={() => (activeCategory = category)}
						>
							{humanize(category)}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
		<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm text-muted-foreground">
				Showing {filteredSkills.length} of {skills.length} skills
			</p>
			<div class="flex flex-wrap gap-2">
				<a
					href="/agent-skills/index.json"
					class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-accent/50"
				>
					<Code2 class="h-4 w-4" />
					JSON index
				</a>
				<a
					href="/llms.txt"
					class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-accent/50"
				>
					<FileText class="h-4 w-4" />
					llms.txt
				</a>
			</div>
		</div>

		{#if filteredSkills.length > 0}
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each filteredSkills as skill}
					{@const sourceCount = getNumericStat(skill, 'sources')}
					{@const primitiveCount = getNumericStat(skill, 'primitives')}
					<article
						class="flex min-h-[22rem] flex-col rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex flex-wrap items-center gap-2 text-xs">
							<span
								class="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 font-medium text-muted-foreground"
							>
								<Layers3 class="h-3.5 w-3.5" />
								{humanize(skill.skill_type)}
							</span>
							<span
								class="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 font-medium text-muted-foreground"
							>
								<GitBranch class="h-3.5 w-3.5" />
								{humanize(skill.skill_category)}
							</span>
						</div>

						<div class="mt-4">
							<h2 class="text-xl font-semibold leading-snug text-foreground">
								<a href={getSkillPath(skill)} class="hover:text-accent">
									{skill.title}
								</a>
							</h2>
							<p class="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
								{skill.description}
							</p>
						</div>

						<div class="mt-4 grid grid-cols-3 gap-2 text-sm">
							<div class="rounded border border-border bg-background p-2">
								<p class="text-xs text-muted-foreground">Sources</p>
								<p class="mt-1 font-semibold">{sourceCount || skill.lineage_sources?.length || 0}</p>
							</div>
							<div class="rounded border border-border bg-background p-2">
								<p class="text-xs text-muted-foreground">Primitives</p>
								<p class="mt-1 font-semibold">{primitiveCount}</p>
							</div>
							<div class="rounded border border-border bg-background p-2">
								<p class="text-xs text-muted-foreground">Refs</p>
								<p class="mt-1 font-semibold">{skill.references.length}</p>
							</div>
						</div>

						{#if skill.lineage_people?.length}
							<div class="mt-4">
								<p class="mb-2 text-xs font-medium uppercase text-muted-foreground">
									Lineage
								</p>
								<div class="flex flex-wrap gap-1.5">
									{#each skill.lineage_people.slice(0, 5) as person}
										<span
											class="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
										>
											{person}
										</span>
									{/each}
									{#if skill.lineage_people.length > 5}
										<span
											class="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
										>
											+{skill.lineage_people.length - 5}
										</span>
									{/if}
								</div>
							</div>
						{/if}

						<div class="mt-auto pt-5">
							<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
								<a
									href={getSkillPath(skill)}
									class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-accent/50"
								>
									<BookOpen class="h-3.5 w-3.5" />
									Guide
								</a>
								<a
									href={getPortableSkillPath(skill)}
									class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-accent/50"
								>
									<FileText class="h-3.5 w-3.5" />
									SKILL.md
								</a>
								<a
									href={getBundlePath(skill)}
									class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-accent/50"
								>
									<Download class="h-3.5 w-3.5" />
									Bundle
								</a>
								<button
									type="button"
									class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:border-accent/50"
									onclick={() => copyBundleCommand(skill)}
								>
									{#if copiedSlug === skill.slug}
										<Check class="h-3.5 w-3.5 text-emerald-500" />
										Copied
									{:else}
										<Copy class="h-3.5 w-3.5" />
										Copy curl
									{/if}
								</button>
							</div>

							<div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
								<a href={getBuildOsSkillPath(skill)} class="inline-flex items-center gap-1 hover:text-accent">
									BuildOS runtime <ExternalLink class="h-3 w-3" />
								</a>
								{#if skill.runtime_skill_id}
									<span class="font-mono">{skill.runtime_skill_id}</span>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="rounded-lg border border-border bg-card p-8 text-center shadow-ink">
				<Search class="mx-auto h-8 w-8 text-muted-foreground" />
				<h2 class="mt-3 text-lg font-semibold">No matching skills</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Adjust the search or category filter.
				</p>
			</div>
		{/if}
	</main>
</div>
