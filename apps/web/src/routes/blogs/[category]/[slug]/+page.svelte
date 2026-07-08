<!-- apps/web/src/routes/blogs/[category]/[slug]/+page.svelte -->
<script lang="ts">
	import {
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_OBJECT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_CREATOR,
		DEFAULT_TWITTER_SITE,
		SITE_URL,
		SITE_NAME
	} from '$lib/constants/seo';
	import type { PageData } from './$types';
	import { ArrowLeft, Calendar, Clock, History, Tag } from 'lucide-svelte';
	import {
		AGENT_SKILLS_COLLECTION,
		formatBlogDate,
		getContentCollectionPath,
		getContentCollectionUrl,
		getContentPostPath,
		getContentPostUrl,
		parseBlogDate,
		type BlogLineageSource
	} from '$lib/utils/blog';
	import { serializeJsonLd } from '$lib/utils/json-ld';

	let { data }: { data: PageData } = $props();

	const publishedDate = $derived(parseBlogDate(data.post.date));
	const formattedDate = $derived(formatBlogDate(data.post.date, 'MMMM dd, yyyy'));
	const formattedLastmod = $derived(
		formatBlogDate(data.post.lastmod || data.post.date, 'MMMM dd, yyyy')
	);
	const showUpdatedDate = $derived((data.post.lastmod || data.post.date) !== data.post.date);
	const isAgentSkillPost = $derived(data.post.category === 'agent-skills');
	const isSourceAnalysisPost = $derived(data.post.category === 'source-analyses');
	const showSourceLineage = $derived(isAgentSkillPost || isSourceAnalysisPost);
	const categoryDisplayName = $derived(
		isAgentSkillPost
			? AGENT_SKILLS_COLLECTION.name
			: data.post.category.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
	);
	const categoryPath = $derived(getContentCollectionPath(data.post.category));
	const categoryUrl = $derived(getContentCollectionUrl(SITE_URL, data.post.category));

	const articleUrl = $derived(getContentPostUrl(SITE_URL, data.post));
	const agentSkillMarkdownUrl = $derived(`${articleUrl}/skill.md`);
	const portableSkillMarkdownUrl = $derived(`${articleUrl}/portable/SKILL.md`);
	const skillBundleUrl = $derived(`${articleUrl}/bundle.zip`);
	const skillBundleCommand = $derived(`curl -L ${skillBundleUrl} -o ${data.post.slug}.zip`);
	const portableSkillCommand = $derived(`curl -L ${portableSkillMarkdownUrl}`);
	const agentSkillIndexUrl = `${SITE_URL}/agent-skills/index.json`;
	// SEO meta title: prefer a trimmed `seoTitle` (kept under ~60 chars incl. " | BuildOS")
	// while the visible H1 keeps the full `title`. Falls back to `title` when unset.
	const metaTitle = $derived(`${data.post.seoTitle ?? data.post.title} | BuildOS`);
	const lineageSources = $derived(data.post.lineageSources ?? []);
	const lineagePeople = $derived(data.post.lineagePeople ?? []);
	const lineageStatEntries = $derived(Object.entries(data.post.lineageStats ?? {}));
	const stackWith = $derived(data.post.stackWith ?? []);
	const relatedSkills = $derived(data.post.relatedSkills ?? []);

	type JsonLdNode = Record<string, unknown>;

	function isYoutubeUrl(url?: string) {
		return Boolean(url && (url.includes('youtube.com') || url.includes('youtu.be')));
	}

	function getYoutubeVideoId(url?: string): string | null {
		if (!url) return null;
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.replace(/^www\./, '');
			if (host === 'youtu.be') {
				const id = parsed.pathname.slice(1).split('/')[0] ?? '';
				return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
			}
			if (
				host === 'youtube.com' ||
				host === 'm.youtube.com' ||
				host === 'youtube-nocookie.com'
			) {
				const v = parsed.searchParams.get('v');
				if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
				const embedMatch = parsed.pathname.match(
					/^\/(?:embed|shorts|v)\/([a-zA-Z0-9_-]{11})/
				);
				if (embedMatch) return embedMatch[1] ?? null;
			}
			return null;
		} catch {
			return null;
		}
	}

	function getYoutubeStartSeconds(url?: string): number | null {
		if (!url) return null;
		try {
			const parsed = new URL(url);
			const raw = parsed.searchParams.get('t') ?? parsed.searchParams.get('start');
			if (!raw) return null;
			if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
			const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
			if (!match) return null;
			const [, h, m, s] = match;
			const seconds =
				(Number.parseInt(h ?? '0', 10) || 0) * 3600 +
				(Number.parseInt(m ?? '0', 10) || 0) * 60 +
				(Number.parseInt(s ?? '0', 10) || 0);
			return seconds > 0 ? seconds : null;
		} catch {
			return null;
		}
	}

	function getLineageSourceId(source: BlogLineageSource, index: number) {
		return source.url ? `${source.url}#source` : `${articleUrl}#source-${index + 1}`;
	}

	function getLineageCreatorId(source: BlogLineageSource, index: number) {
		if (
			source.creator &&
			source.channelName &&
			source.creatorType === 'Organization' &&
			source.creator === source.channelName &&
			source.creatorUrl === source.channelUrl
		) {
			return getLineageChannelId(source, index);
		}

		return source.creatorUrl
			? `${source.creatorUrl}#creator`
			: `${articleUrl}#source-creator-${index + 1}`;
	}

	function getLineageChannelId(source: BlogLineageSource, index: number) {
		return source.channelUrl
			? `${source.channelUrl}#channel`
			: `${articleUrl}#source-channel-${index + 1}`;
	}

	function getLineageChannels(sources: BlogLineageSource[]) {
		const channels = new Map<string, { name: string; url?: string }>();

		for (const source of sources) {
			const name = source.channelName;
			if (!name) continue;

			const key = source.channelUrl ?? name;
			if (!channels.has(key)) {
				channels.set(key, { name, url: source.channelUrl });
			}
		}

		return [...channels.values()];
	}

	function isSameLineageSource(source: BlogLineageSource, candidate: BlogLineageSource) {
		if (source.url && candidate.url) return source.url === candidate.url;
		return source.title.trim().toLowerCase() === candidate.title.trim().toLowerCase();
	}

	function buildLineageGraph(sources: BlogLineageSource[], people: string[]) {
		const nodesById = new Map<string, JsonLdNode>();
		const sourceRefs: JsonLdNode[] = [];
		const mentionRefs: JsonLdNode[] = [];
		const peopleByName = new Map<string, string>();

		const getPersonKey = (name: string) =>
			name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ' ')
				.trim();

		for (const [index, source] of sources.entries()) {
			const sourceId = getLineageSourceId(source, index);
			const creatorId = source.creator ? getLineageCreatorId(source, index) : null;
			const channelId = source.channelName ? getLineageChannelId(source, index) : null;
			const sourceType =
				source.sourceType === 'youtube_video' || isYoutubeUrl(source.url)
					? 'VideoObject'
					: 'CreativeWork';

			if (source.creator && creatorId) {
				nodesById.set(creatorId, {
					'@type': source.creatorType ?? 'Person',
					'@id': creatorId,
					name: source.creator,
					url: source.creatorUrl,
					sameAs: source.creatorUrl ? [source.creatorUrl] : undefined
				});
				mentionRefs.push({ '@id': creatorId });

				if ((source.creatorType ?? 'Person') === 'Person') {
					peopleByName.set(getPersonKey(source.creator), creatorId);
				}
			}

			if (source.channelName && channelId) {
				nodesById.set(channelId, {
					'@type': 'Organization',
					'@id': channelId,
					name: source.channelName,
					url: source.channelUrl,
					sameAs: source.channelUrl ? [source.channelUrl] : undefined
				});
				mentionRefs.push({ '@id': channelId });
			}

			const sourceNode: JsonLdNode = {
				'@type': sourceType,
				'@id': sourceId,
				name: source.title,
				url: source.url,
				creator: creatorId ? { '@id': creatorId } : source.creator,
				publisher: channelId ? { '@id': channelId } : undefined,
				isPartOf: channelId ? { '@id': channelId } : undefined
			};

			nodesById.set(sourceId, sourceNode);
			sourceRefs.push({ '@id': sourceId });
		}

		for (const person of people) {
			const personKey = getPersonKey(person);
			const existingPersonId = peopleByName.get(personKey);

			if (existingPersonId) {
				mentionRefs.push({ '@id': existingPersonId });
				continue;
			}

			const personId = `${articleUrl}#mentioned-${person
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')}`;
			if (!nodesById.has(personId)) {
				nodesById.set(personId, {
					'@type': 'Person',
					'@id': personId,
					name: person
				});
			}
			peopleByName.set(personKey, personId);
			mentionRefs.push({ '@id': personId });
		}

		const uniqueMentionRefs = [
			...new Map(mentionRefs.map((ref) => [String(ref['@id']), ref])).values()
		];

		return {
			nodes: [...nodesById.values()],
			sourceRefs,
			mentionRefs: uniqueMentionRefs
		};
	}

	const lineageChannels = $derived(getLineageChannels(lineageSources));

	const featuredYoutubeUrl = $derived.by(() => {
		if (getYoutubeVideoId(data.post.sourceUrl)) return data.post.sourceUrl;
		const fromLineage = lineageSources.find((source) => getYoutubeVideoId(source.url) !== null);
		return fromLineage?.url;
	});
	const featuredYoutubeId = $derived(getYoutubeVideoId(featuredYoutubeUrl));
	const featuredYoutubeStart = $derived(getYoutubeStartSeconds(featuredYoutubeUrl));
	const featuredYoutubeTitle = $derived(
		data.post.sourceTitle ||
			lineageSources.find((source) => source.url === featuredYoutubeUrl)?.title ||
			'YouTube video'
	);
	const featuredYoutubeEmbedSrc = $derived.by(() => {
		if (!featuredYoutubeId) return null;
		const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
		if (featuredYoutubeStart) params.set('start', String(featuredYoutubeStart));
		return `https://www.youtube-nocookie.com/embed/${featuredYoutubeId}?${params.toString()}`;
	});

	const jsonLd = $derived.by(() => {
		const primarySource: BlogLineageSource | null = data.post.sourceTitle
			? {
					title: data.post.sourceTitle,
					creator: data.post.sourceCreator,
					url: data.post.sourceUrl,
					sourceType: isYoutubeUrl(data.post.sourceUrl)
						? 'youtube_video'
						: 'creative_work'
				}
			: null;
		const citationSources =
			primarySource &&
			!lineageSources.some((source) => isSameLineageSource(source, primarySource))
				? [...lineageSources, primarySource]
				: lineageSources;
		const lineageGraph = buildLineageGraph(citationSources, lineagePeople);
		const graphItems: Record<string, unknown>[] = [
			{
				'@type': 'BlogPosting',
				'@id': `${articleUrl}#article`,
				headline: data.post.title,
				description: data.post.description,
				image: DEFAULT_SOCIAL_IMAGE_OBJECT,
				url: articleUrl,
				datePublished: data.post.date,
				dateModified: data.post.lastmod || data.post.date,
				author: {
					'@type': 'Person',
					name: data.post.author || 'BuildOS Team',
					url: `${SITE_URL}/about`,
					sameAs: ['https://twitter.com/djwayne3', 'https://www.linkedin.com/in/djwayne3']
				},
				publisher: {
					'@type': 'Organization',
					'@id': DEFAULT_ORGANIZATION_ID,
					name: SITE_NAME,
					url: SITE_URL,
					logo: DEFAULT_ORGANIZATION_LOGO_IMAGE,
					sameAs: [...DEFAULT_ORGANIZATION_SOCIAL_PROFILES]
				},
				mainEntityOfPage: {
					'@type': 'WebPage',
					'@id': articleUrl
				},
				keywords: data.post.tags.join(', '),
				wordCount: data.wordCount || undefined,
				timeRequired: `PT${data.post.readingTime}M`,
				citation: lineageGraph.sourceRefs.length ? lineageGraph.sourceRefs : undefined,
				mentions: lineageGraph.mentionRefs.length ? lineageGraph.mentionRefs : undefined,
				articleSection: categoryDisplayName,
				inLanguage: 'en-US',
				about: relatedSkills.length
					? relatedSkills.map((skill) => ({
							'@type': 'DefinedTerm',
							name: skill,
							url: `${SITE_URL}/agent-skills/${skill}`
						}))
					: undefined,
				copyrightYear: publishedDate?.getFullYear(),
				copyrightHolder: {
					'@id': DEFAULT_ORGANIZATION_ID
				},
				speakable: {
					'@type': 'SpeakableSpecification',
					cssSelector: ['[data-speakable="headline"]', '[data-speakable="description"]']
				},
				isPartOf: isAgentSkillPost
					? {
							'@type': 'CollectionPage',
							'@id': `${categoryUrl}#collection`,
							name: `${SITE_NAME} Agent Skills`,
							url: categoryUrl
						}
					: {
							'@type': 'Blog',
							'@id': `${SITE_URL}/blogs#blog`,
							name: `${SITE_NAME} Blog`,
							url: `${SITE_URL}/blogs`
						}
			},
			{
				'@type': 'BreadcrumbList',
				'@id': `${articleUrl}#breadcrumb`,
				itemListElement: isAgentSkillPost
					? [
							{
								'@type': 'ListItem',
								position: 1,
								name: AGENT_SKILLS_COLLECTION.name,
								item: categoryUrl
							},
							{
								'@type': 'ListItem',
								position: 2,
								name: data.post.title
							}
						]
					: [
							{
								'@type': 'ListItem',
								position: 1,
								name: 'Blog',
								item: `${SITE_URL}/blogs`
							},
							{
								'@type': 'ListItem',
								position: 2,
								name: categoryDisplayName,
								item: categoryUrl
							},
							{
								'@type': 'ListItem',
								position: 3,
								name: data.post.title
							}
						]
			}
		];

		graphItems.push(...lineageGraph.nodes);

		if (data.post.faq?.length) {
			graphItems.push({
				'@type': 'FAQPage',
				'@id': `${articleUrl}#faq`,
				mainEntity: data.post.faq.map((item) => ({
					'@type': 'Question',
					name: item.q,
					acceptedAnswer: {
						'@type': 'Answer',
						text: item.a
					}
				}))
			});
		}

		return {
			'@context': 'https://schema.org',
			'@graph': graphItems
		};
	});
</script>

<svelte:head>
	<title>{metaTitle}</title>
	<meta name="description" content={data.post.description} />
	<meta name="author" content={data.post.author || 'BuildOS Team'} />
	<link rel="canonical" href={articleUrl} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="article" />
	<meta property="og:url" content={articleUrl} />
	<meta property="og:title" content={metaTitle} />
	<meta property="og:description" content={data.post.description} />
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:secure_url" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<link rel="image_src" href={DEFAULT_SOCIAL_IMAGE_URL} />

	<!-- Article specific Open Graph -->
	<meta property="article:author" content={data.post.author || 'BuildOS Team'} />
	<meta property="article:published_time" content={data.post.date} />
	<meta property="article:modified_time" content={data.post.lastmod || data.post.date} />
	<meta property="article:section" content={categoryDisplayName} />
	{#each data.post.tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={articleUrl} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={metaTitle} />
	<meta name="twitter:description" content={data.post.description} />
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />

	<!-- Additional Meta Tags -->
	<meta name="robots" content="index, follow" />

	<!-- JSON-LD Structured Data -->
	{@html '<script type="application/ld+json">' + serializeJsonLd(jsonLd) + '</script>'}
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Breadcrumb -->
		<nav
			class="flex items-center gap-1.5 text-xs text-muted-foreground py-4 border-b border-border"
		>
			{#if !isAgentSkillPost}
				<a href="/blogs" class="hover:text-accent transition-colors">Blog</a>
				<span>/</span>
			{/if}
			<a href={categoryPath} class="hover:text-accent transition-colors">
				{categoryDisplayName}
			</a>
		</nav>

		<!-- Article Header -->
		<header class="pt-8 sm:pt-12 pb-6 sm:pb-8">
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground mb-4"
			>
				<span
					class="shrink-0 px-2 py-0.5 bg-accent/10 text-accent rounded-full font-medium border border-accent/20"
				>
					{categoryDisplayName}
				</span>
				<span class="flex shrink-0 items-center gap-1">
					<Calendar class="w-3 h-3" />
					Published {formattedDate}
				</span>
				{#if showUpdatedDate}
					<span class="flex shrink-0 items-center gap-1">
						<History class="w-3 h-3" />
						Updated {formattedLastmod}
					</span>
				{/if}
				<span class="flex shrink-0 items-center gap-1">
					<Clock class="w-3 h-3" />
					{data.post.readingTime} min read
				</span>
			</div>

			<h1
				class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-[1.1]"
				data-speakable="headline"
			>
				{data.post.title}
			</h1>

			<p
				class="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed"
				data-speakable="description"
			>
				{data.post.description}
			</p>

			<div
				class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
			>
				<span
					class="inline-flex shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:pt-1"
				>
					By <span class="font-medium text-foreground"
						>{data.post.author || 'BuildOS Team'}</span
					>
				</span>

				{#if data.post.tags.length > 0}
					<div class="flex min-w-0 flex-wrap gap-1.5 sm:justify-end">
						{#each data.post.tags as tag}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
							>
								<Tag class="w-2.5 h-2.5 mr-0.5" />
								{tag}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			{#if isAgentSkillPost}
				<div
					class="mt-6 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground shadow-ink"
				>
					<span class="block text-xs font-medium uppercase tracking-wide text-foreground">
						For agents
					</span>
					<div class="mt-2 flex flex-wrap gap-2">
						<a
							href={portableSkillMarkdownUrl}
							class="inline-flex items-center rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
						>
							Portable SKILL.md
						</a>
						<a
							href={skillBundleUrl}
							class="inline-flex items-center rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
						>
							bundle.zip
						</a>
						<a
							href={agentSkillMarkdownUrl}
							class="inline-flex items-center rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
						>
							BuildOS SKILL.md
						</a>
						<a
							href={agentSkillIndexUrl}
							class="inline-flex items-center rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
						>
							index.json
						</a>
					</div>
					<div class="mt-3 grid gap-2">
						<code
							class="block overflow-x-auto rounded border border-border bg-muted px-3 py-2 text-xs text-foreground"
						>
							{skillBundleCommand}
						</code>
						<code
							class="block overflow-x-auto rounded border border-border bg-muted px-3 py-2 text-xs text-foreground"
						>
							{portableSkillCommand}
						</code>
					</div>
				</div>
			{/if}

			{#if showSourceLineage && (lineageSources.length || lineagePeople.length || relatedSkills.length)}
				<div
					class="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
				>
					<span class="block text-xs font-medium uppercase tracking-wide text-foreground">
						{isSourceAnalysisPost ? 'Source Notes' : 'Source Lineage'}
					</span>
					{#if lineagePeople.length}
						<p class="mt-2 text-xs">
							<span class="font-medium text-foreground">People referenced:</span>
							{lineagePeople.join(', ')}
						</p>
					{/if}
					{#if lineageStatEntries.length}
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each lineageStatEntries as [key, value]}
								<span
									class="inline-flex items-center rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
								>
									<span class="font-medium text-foreground">{value}</span>
									<span class="ml-1"
										>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span
									>
								</span>
							{/each}
						</div>
					{/if}
					{#if stackWith.length}
						<p class="mt-2 text-xs">
							<span class="font-medium text-foreground">Stacks with:</span>
							{stackWith.join(', ')}
						</p>
					{/if}
					{#if relatedSkills.length}
						<p class="mt-2 text-xs">
							<span class="font-medium text-foreground">Related skills:</span>
							{#each relatedSkills as skill, index}
								{#if index > 0}<span>, </span>{/if}
								<a
									href={`/agent-skills/${skill}`}
									class="text-accent hover:underline"
								>
									{skill}
								</a>
							{/each}
						</p>
					{/if}
					{#if lineageChannels.length}
						<p class="mt-2 text-xs">
							<span class="font-medium text-foreground">YouTube channels:</span>
							{#each lineageChannels as channel, index}
								{#if index > 0}<span>, </span>{/if}
								{#if channel.url}
									<a
										href={channel.url}
										class="text-accent hover:underline"
										target="_blank"
										rel="noreferrer"
									>
										{channel.name}
									</a>
								{:else}
									<span>{channel.name}</span>
								{/if}
							{/each}
						</p>
					{/if}
					{#if lineageSources.length}
						<ul class="mt-2 space-y-1.5 text-xs">
							{#each lineageSources as source}
								<li>
									{#if source.url}
										<a
											href={source.url}
											class="text-accent hover:underline"
											target="_blank"
											rel="noreferrer"
										>
											{source.title}
										</a>
									{:else}
										<span class="text-foreground">{source.title}</span>
									{/if}
									{#if source.creator}
										<span> by {source.creator}</span>
									{/if}
									{#if source.channelName && source.channelName !== source.creator}
										<span> on </span>
										{#if source.channelUrl}
											<a
												href={source.channelUrl}
												class="text-accent hover:underline"
												target="_blank"
												rel="noreferrer"
											>
												{source.channelName}
											</a>
										{:else}
											<span>{source.channelName}</span>
										{/if}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</header>

		<!-- Divider -->
		<hr class="border-border" />

		<!-- Content -->
		<article class="py-8 sm:py-10">
			{#if featuredYoutubeEmbedSrc}
				<div class="mb-6 sm:mb-8">
					<div
						class="relative w-full overflow-hidden rounded-lg border border-border shadow-ink"
						style="aspect-ratio: 16 / 9;"
					>
						<iframe
							src={featuredYoutubeEmbedSrc}
							title={featuredYoutubeTitle}
							class="absolute inset-0 h-full w-full"
							loading="lazy"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							referrerpolicy="strict-origin-when-cross-origin"
							allowfullscreen
						></iframe>
					</div>
				</div>
			{/if}
			<div
				class="prose prose-neutral max-w-none
				prose-headings:text-foreground prose-headings:tracking-tight
				prose-p:text-foreground/90 prose-p:leading-relaxed
				prose-li:text-foreground/90
				prose-strong:text-foreground prose-strong:font-semibold
				prose-a:text-accent prose-a:no-underline hover:prose-a:underline
				prose-blockquote:text-muted-foreground prose-blockquote:border-accent/30 prose-blockquote:not-italic
				prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
				prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg
				prose-hr:border-border
				prose-img:rounded-lg prose-img:shadow-ink
				prose-th:text-foreground prose-td:text-foreground/90
				prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg"
			>
				{#if data.contentHtml}
					{@html data.contentHtml}
				{:else}
					<div class="text-center py-12">
						<p class="text-sm text-muted-foreground">Content not available.</p>
					</div>
				{/if}
			</div>
		</article>

		<!-- Divider -->
		<hr class="border-border" />

		<!-- Footer Navigation -->
		<div class="py-6 flex flex-col sm:flex-row gap-3">
			<a
				href={categoryPath}
				class="flex-1 inline-flex items-center justify-center gap-2 bg-muted text-foreground text-sm font-medium px-4 py-2.5 rounded-lg border border-border hover:border-accent/40 transition-colors shadow-ink pressable"
			>
				<ArrowLeft class="w-3.5 h-3.5" />
				More {categoryDisplayName}
			</a>
			<a
				href="/blogs"
				class="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-accent/90 transition-colors shadow-ink pressable"
			>
				All Articles
			</a>
		</div>
	</div>

	<!-- Related Articles -->
	{#if data.relatedPosts && data.relatedPosts.length > 0}
		<section class="border-t border-border bg-muted/30 py-8 sm:py-10">
			<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2 class="text-base font-semibold text-foreground mb-4">Related Articles</h2>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each data.relatedPosts as relatedPost}
						<a
							href={getContentPostPath(relatedPost)}
							class="group block bg-card border border-border rounded-lg p-4 hover:shadow-ink hover:border-accent/40 transition-all duration-200 pressable"
						>
							<span
								class="flex items-center gap-1 text-xs text-muted-foreground mb-2"
							>
								<Calendar class="w-2.5 h-2.5" />
								{formatBlogDate(relatedPost.date)}
							</span>

							<h3
								class="text-sm font-medium text-foreground mb-1.5 line-clamp-2 group-hover:text-accent transition-colors"
							>
								{relatedPost.title}
							</h3>

							<p class="text-xs text-muted-foreground line-clamp-2">
								{relatedPost.description}
							</p>
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}
</div>
