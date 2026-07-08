<!-- apps/web/src/routes/skills/[slug]/+page.svelte -->
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
		Download,
		FileText,
		GitBranch,
		Layers3,
		ListTree,
		Package,
		PlayCircle,
		ShieldCheck,
		Target,
		Workflow
	} from '$lib/icons/lucide';
	import {
		getAgentFilePath,
		getAgentRepositoryPath,
		getBuildOsSkillPath,
		getBundlePath,
		getDisplayTitle,
		getFallbackGuardrails,
		getFallbackTryPrompts,
		getFallbackUseCases,
		getFallbackWorkflow,
		getNumericStat,
		getOutputShapes,
		getSkillFamily,
		getSkillPath,
		getSkillPromise,
		getTryInBuildOsPath,
		humanize
	} from '$lib/skills/skill-gallery';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let skill = $derived(data.skill);
	let post = $derived(data.post);
	let runtime = $derived(data.runtime);
	let displayTitle = $derived(getDisplayTitle(skill));
	let family = $derived(getSkillFamily(skill));
	let domainLabel = $derived(humanize(skill.skill_category));
	let outputShapes = $derived(getOutputShapes(skill));
	let useCases = $derived(
		runtime?.when_to_use.length ? runtime.when_to_use : getFallbackUseCases(skill)
	);
	let workflow = $derived(
		runtime?.workflow.length ? runtime.workflow : getFallbackWorkflow(skill)
	);
	let guardrails = $derived(
		runtime?.guardrails.length ? runtime.guardrails : getFallbackGuardrails(skill)
	);
	let tryPrompts = $derived(getFallbackTryPrompts(skill));
	let sourceCount = $derived(
		getNumericStat(skill, 'sources') || skill.lineage_sources?.length || 0
	);
	let primitiveCount = $derived(getNumericStat(skill, 'primitives'));
	let promise = $derived(getSkillPromise(skill, post));
	let runtimeExamples = $derived(runtime?.examples.slice(0, 3) ?? []);
	let lineagePeople = $derived(skill.lineage_people?.slice(0, 8) ?? []);
	let lineageSources = $derived(skill.lineage_sources?.slice(0, 5) ?? []);

	function generateJsonLd() {
		const skillUrl = `${SITE_URL}${getSkillPath(skill)}`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CreativeWork',
				'@id': skillUrl,
				name: displayTitle,
				description: skill.description,
				url: skillUrl,
				isPartOf: {
					'@id': DEFAULT_WEBSITE_ID,
					name: `${SITE_NAME} Skill Gallery`
				},
				publisher: {
					'@id': DEFAULT_ORGANIZATION_ID
				},
				genre: domainLabel,
				about: outputShapes
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
	<title>{displayTitle} - BuildOS Skill Gallery</title>
	<meta name="description" content={promise} />
	<link rel="canonical" href={`${SITE_URL}${getSkillPath(skill)}`} />

	<meta property="og:type" content="article" />
	<meta property="og:url" content={`${SITE_URL}${getSkillPath(skill)}`} />
	<meta property="og:title" content={`${displayTitle} - BuildOS Skill Gallery`} />
	<meta property="og:description" content={promise} />
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
	<meta name="twitter:url" content={`${SITE_URL}${getSkillPath(skill)}`} />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={`${displayTitle} - BuildOS Skill Gallery`} />
	<meta name="twitter:description" content={promise} />
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
					<div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
						<span
							class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 font-medium text-accent"
						>
							<Target class="h-4 w-4" />
							{family}
						</span>
						<span
							class="rounded-full border border-border bg-background px-3 py-1.5 text-muted-foreground"
						>
							{domainLabel}
						</span>
						<span
							class="rounded-full border border-border bg-background px-3 py-1.5 text-muted-foreground"
						>
							{humanize(skill.skill_type)}
						</span>
					</div>

					<h1
						class="max-w-4xl text-3xl font-semibold leading-tight text-foreground sm:text-5xl"
					>
						{displayTitle}
					</h1>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						{promise}
					</p>

					<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						<a
							href={getTryInBuildOsPath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<PlayCircle class="h-4 w-4" />
							Try in BuildOS
						</a>
						<a
							href={getAgentRepositoryPath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<BookOpen class="h-4 w-4" />
							Read guide
						</a>
						<a
							href={getAgentFilePath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<FileText class="h-4 w-4" />
							SKILL.md
						</a>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Sources</p>
						<p class="mt-1 text-2xl font-semibold">{sourceCount}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Refs</p>
						<p class="mt-1 text-2xl font-semibold">{skill.references.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Steps</p>
						<p class="mt-1 text-2xl font-semibold">{workflow.length}</p>
					</div>
					<div
						class="rounded-lg border border-border bg-background/85 p-3 shadow-ink-inner"
					>
						<p class="text-xs text-muted-foreground">Outputs</p>
						<p class="mt-1 text-2xl font-semibold">{outputShapes.length}</p>
					</div>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<div class="space-y-10">
				<section aria-labelledby="what-it-does">
					<p class="micro-label text-accent">What It Does</p>
					<h2 id="what-it-does" class="mt-1 text-2xl font-semibold text-foreground">
						Use it when the job needs a real procedure.
					</h2>
					<div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
						<div class="space-y-3">
							{#each useCases.slice(0, 5) as useCase}
								<div
									class="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-ink"
								>
									<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-success" />
									<p class="text-sm leading-6 text-muted-foreground">{useCase}</p>
								</div>
							{/each}
						</div>
						<div
							class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
						>
							<p class="micro-label">Outputs</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each outputShapes as output}
									<span
										class="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground"
									>
										{output}
									</span>
								{/each}
							</div>
							<p class="mt-4 text-sm leading-6 text-muted-foreground">
								The page is for humans first. The files in the rail make the same
								procedure available to agents.
							</p>
						</div>
					</div>
				</section>

				<section aria-labelledby="try-it" class="border-t border-border pt-8">
					<p class="micro-label text-accent">Try It</p>
					<h2 id="try-it" class="mt-1 text-2xl font-semibold text-foreground">
						Start with one of these prompts.
					</h2>
					<div class="mt-5 grid gap-3 md:grid-cols-2">
						{#each tryPrompts as prompt}
							<div
								class="flex min-h-[8rem] flex-col rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grid tx-weak"
							>
								<p class="text-sm leading-6 text-foreground">{prompt}</p>
								<a
									href={getTryInBuildOsPath(skill)}
									class="mt-auto inline-flex min-h-[44px] items-center gap-2 self-start pt-4 text-sm font-semibold text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									Try in BuildOS
									<ArrowRight class="h-4 w-4" />
								</a>
							</div>
						{/each}
					</div>
				</section>

				<section aria-labelledby="procedure" class="border-t border-border pt-8">
					<p class="micro-label text-accent">Procedure</p>
					<h2 id="procedure" class="mt-1 text-2xl font-semibold text-foreground">
						The operating path
					</h2>
					<ol class="mt-5 space-y-3">
						{#each workflow as step, index}
							<li
								class="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-ink sm:grid-cols-[3rem_minmax(0,1fr)]"
							>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-sm font-semibold text-foreground"
								>
									{index + 1}
								</div>
								<p class="text-sm leading-6 text-muted-foreground">{step}</p>
							</li>
						{/each}
					</ol>
				</section>

				<section aria-labelledby="boundaries" class="border-t border-border pt-8">
					<p class="micro-label text-accent">Boundaries</p>
					<h2 id="boundaries" class="mt-1 text-2xl font-semibold text-foreground">
						What the skill refuses or checks carefully
					</h2>
					<div class="mt-5 grid gap-3 md:grid-cols-2">
						{#each guardrails.slice(0, 6) as guardrail}
							<div
								class="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-ink"
							>
								<ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-info" />
								<p class="text-sm leading-6 text-muted-foreground">{guardrail}</p>
							</div>
						{/each}
					</div>
				</section>

				{#if runtimeExamples.length}
					<section aria-labelledby="examples" class="border-t border-border pt-8">
						<p class="micro-label text-accent">Examples</p>
						<h2 id="examples" class="mt-1 text-2xl font-semibold text-foreground">
							Runtime examples
						</h2>
						<div class="mt-5 space-y-3">
							{#each runtimeExamples as example}
								<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
									<p class="font-semibold text-foreground">
										{example.description}
									</p>
									{#if example.next_steps.length}
										<ul class="mt-3 space-y-1.5 text-sm text-muted-foreground">
											{#each example.next_steps.slice(0, 4) as step}
												<li class="flex gap-2">
													<span
														class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
													></span>
													<span>{step}</span>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}

				{#if data.relatedSkills.length}
					<section aria-labelledby="related-skills" class="border-t border-border pt-8">
						<p class="micro-label text-accent">Related Skills</p>
						<h2 id="related-skills" class="mt-1 text-2xl font-semibold text-foreground">
							Follow the thread
						</h2>
						<div class="mt-5 grid gap-3 md:grid-cols-2">
							{#each data.relatedSkills as related}
								<a
									href={getSkillPath(related)}
									class="group flex min-h-[10rem] flex-col rounded-lg border border-border bg-card p-4 shadow-ink transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring tx tx-frame tx-weak"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="micro-label">{getSkillFamily(related)}</p>
											<h3
												class="mt-1 line-clamp-2 text-lg font-semibold text-foreground"
											>
												{getDisplayTitle(related)}
											</h3>
										</div>
										<ArrowRight
											class="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none"
										/>
									</div>
									<p
										class="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground"
									>
										{related.description}
									</p>
								</a>
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<aside class="space-y-4 lg:sticky lg:top-20">
				<section
					aria-labelledby="agent-files"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-center gap-2">
						<Code2 class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="agent-files" class="text-lg font-semibold text-foreground">
							For Agents
						</h2>
					</div>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						Use the gallery to understand the job. Use these files to run or port the
						skill.
					</p>
					<div class="mt-4 grid gap-2">
						<a
							href={getAgentFilePath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<FileText class="h-4 w-4" />
							Portable SKILL.md
						</a>
						<a
							href={getBundlePath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Download class="h-4 w-4" />
							Bundle.zip
						</a>
						<a
							href={getBuildOsSkillPath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Brain class="h-4 w-4" />
							BuildOS SKILL.md
						</a>
						<a
							href={getAgentRepositoryPath(skill)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<BookOpen class="h-4 w-4" />
							Repository guide
						</a>
					</div>
					{#if runtime?.id}
						<p class="mt-4 truncate font-mono text-xs text-muted-foreground">
							{runtime.id}
						</p>
					{/if}
				</section>

				<section
					aria-labelledby="trust-lineage"
					class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak"
				>
					<div class="flex items-center gap-2">
						<GitBranch class="h-4 w-4 shrink-0 text-accent" />
						<h2 id="trust-lineage" class="text-lg font-semibold text-foreground">
							Trust And Lineage
						</h2>
					</div>
					<div class="mt-4 grid grid-cols-2 gap-2 text-sm">
						<div class="rounded-md border border-border bg-background p-2">
							<p class="text-xs text-muted-foreground">Sources</p>
							<p class="mt-1 font-semibold">{sourceCount}</p>
						</div>
						<div class="rounded-md border border-border bg-background p-2">
							<p class="text-xs text-muted-foreground">Primitives</p>
							<p class="mt-1 font-semibold">{primitiveCount}</p>
						</div>
						<div class="rounded-md border border-border bg-background p-2">
							<p class="text-xs text-muted-foreground">Refs</p>
							<p class="mt-1 font-semibold">{skill.references.length}</p>
						</div>
						<div class="rounded-md border border-border bg-background p-2">
							<p class="text-xs text-muted-foreground">Catalog</p>
							<p class="mt-1 font-semibold">{data.catalogVersion}</p>
						</div>
					</div>

					{#if lineagePeople.length}
						<div class="mt-4">
							<p class="micro-label">People</p>
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each lineagePeople as person}
									<span
										class="rounded-full border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground"
									>
										{person}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if lineageSources.length}
						<div class="mt-4">
							<p class="micro-label">Source Highlights</p>
							<div class="mt-2 space-y-2">
								{#each lineageSources as source}
									<div class="rounded-md border border-border bg-background p-2">
										<p class="line-clamp-2 text-sm font-medium text-foreground">
											{source.title}
										</p>
										{#if source.creator}
											<p class="mt-1 truncate text-xs text-muted-foreground">
												{source.creator}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</section>

				{#if data.containingPacks.length}
					<section
						aria-labelledby="skill-packs"
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex items-center gap-2">
							<Package class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="skill-packs" class="text-lg font-semibold text-foreground">
								Packs And Stacks
							</h2>
						</div>
						<div class="mt-4 space-y-3">
							{#each data.containingPacks as pack}
								<div class="rounded-md border border-border bg-background p-3">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="micro-label">{pack.kind}</p>
											<p class="mt-1 truncate font-semibold text-foreground">
												{pack.name}
											</p>
										</div>
										{#if pack.kind === 'Stack'}
											<Workflow class="h-4 w-4 shrink-0 text-accent" />
										{:else}
											<Package class="h-4 w-4 shrink-0 text-accent" />
										{/if}
									</div>
									<p
										class="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground"
									>
										{pack.job}
									</p>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				{#if runtime?.child_skills.length || runtime?.reference_modules.length}
					<section
						aria-labelledby="skill-modules"
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
					>
						<div class="flex items-center gap-2">
							<ListTree class="h-4 w-4 shrink-0 text-accent" />
							<h2 id="skill-modules" class="text-lg font-semibold text-foreground">
								Modules
							</h2>
						</div>
						{#if runtime?.child_skills.length}
							<div class="mt-4">
								<p class="micro-label">Child Skills</p>
								<div class="mt-2 space-y-2">
									{#each runtime.child_skills.slice(0, 5) as child}
										<div
											class="rounded-md border border-border bg-background p-2"
										>
											<p class="truncate text-sm font-medium text-foreground">
												{child.name ?? child.id}
											</p>
											<p
												class="mt-1 line-clamp-2 text-xs text-muted-foreground"
											>
												{child.summary}
											</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}
						{#if runtime?.reference_modules.length}
							<div class="mt-4">
								<p class="micro-label">References</p>
								<div class="mt-2 space-y-2">
									{#each runtime.reference_modules.slice(0, 5) as reference}
										<div
											class="rounded-md border border-border bg-background p-2"
										>
											<p class="truncate text-sm font-medium text-foreground">
												{reference.name ?? reference.id}
											</p>
											<p
												class="mt-1 line-clamp-2 text-xs text-muted-foreground"
											>
												{reference.summary}
											</p>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</section>
				{/if}

				<a
					href="/skills"
					class="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Layers3 class="h-4 w-4" />
					Browse all {data.totalSkills} skills
				</a>
			</aside>
		</div>
	</main>
</div>
