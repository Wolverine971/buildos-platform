<script lang="ts">
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_URL,
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
		Check,
		Copy,
		GitBranch,
		ListTree,
		PlayCircle,
		ShieldCheck,
		Sparkles,
		Target,
		Workflow
	} from '$lib/icons/lucide';
	import {
		getDomainPath,
		getFamilyPath,
		getPreviewSkillPath,
		getTryInBuildOsPath,
		humanize
	} from '$lib/skills/skill-gallery';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let preview = $derived(data.preview);
	let copiedPrompt = $state<string | null>(null);

	async function copyPrompt(prompt: string) {
		await navigator.clipboard.writeText(prompt);
		copiedPrompt = prompt;
		window.setTimeout(() => {
			if (copiedPrompt === prompt) copiedPrompt = null;
		}, 1800);
	}

	function generateJsonLd() {
		const previewUrl = `${SITE_URL}${getPreviewSkillPath(preview)}`;
		return JSON.stringify(
			{
				'@context': 'https://schema.org',
				'@type': 'CreativeWork',
				'@id': previewUrl,
				name: preview.title,
				description: preview.description,
				url: previewUrl,
				isPartOf: { '@id': DEFAULT_WEBSITE_ID, name: `${SITE_NAME} Skill Gallery` },
				publisher: { '@id': DEFAULT_ORGANIZATION_ID },
				genre: humanize(preview.domain_id),
				about: preview.output_shapes
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
	<title>{preview.title} Preview - BuildOS Skill Gallery</title>
	<meta name="description" content={preview.description} />
	<link rel="canonical" href={`${SITE_URL}${getPreviewSkillPath(preview)}`} />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={`${SITE_URL}${getPreviewSkillPath(preview)}`} />
	<meta property="og:title" content={`${preview.title} Preview - BuildOS`} />
	<meta property="og:description" content={preview.description} />
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={`${preview.title} Preview - BuildOS`} />
	<meta name="twitter:description" content={preview.description} />
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

			<div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
				<div class="max-w-4xl">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
						>
							<Sparkles class="h-3.5 w-3.5" />
							Reviewed preview
						</span>
						<span class="micro-label text-muted-foreground">{preview.family}</span>
					</div>
					<h1 class="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">
						{preview.title}
					</h1>
					<p class="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
						{preview.description}
					</p>
					<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						<a
							href={getTryInBuildOsPath(preview)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<PlayCircle class="h-4 w-4" />
							Try in BuildOS
						</a>
						<a
							href={getFamilyPath(preview.family)}
							class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<GitBranch class="h-4 w-4" />
							Open family
						</a>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-background/85 p-4 shadow-ink-inner">
					<p class="micro-label text-accent">Publication status</p>
					<p class="mt-2 text-lg font-semibold">Preview, not yet portable</p>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						This reviewed synopsis can launch an editable workflow draft. The full internal
						definition and reference files are not published here.
					</p>
					<div class="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
						Updated {preview.trust.last_updated} · Eval {preview.trust.eval_status}
					</div>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-10 lg:px-6">
		<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
			<div class="space-y-10">
				<section aria-labelledby="preview-use-cases">
					<div class="flex items-center gap-2 text-accent">
						<Target class="h-4 w-4" />
						<p class="micro-label">Use Cases</p>
					</div>
					<h2 id="preview-use-cases" class="mt-1 text-2xl font-semibold">When to use it</h2>
					<div class="mt-5 grid gap-3 md:grid-cols-3">
						{#each preview.use_cases as useCase}
							<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
								<p class="text-sm leading-6 text-muted-foreground">{useCase}</p>
							</div>
						{/each}
					</div>
				</section>

				<section aria-labelledby="preview-workflow" class="border-t border-border pt-8">
					<div class="flex items-center gap-2 text-accent">
						<Workflow class="h-4 w-4" />
						<p class="micro-label">Workflow</p>
					</div>
					<h2 id="preview-workflow" class="mt-1 text-2xl font-semibold">How it works</h2>
					<ol class="mt-5 grid gap-3 md:grid-cols-2">
						{#each preview.workflow as step, index}
							<li class="flex gap-3 rounded-lg border border-border bg-card p-4 shadow-ink">
								<span
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent bg-accent/10 text-xs font-semibold text-accent"
									>{index + 1}</span
								>
								<p class="text-sm leading-6 text-muted-foreground">{step}</p>
							</li>
						{/each}
					</ol>
				</section>

				<section aria-labelledby="preview-try" class="border-t border-border pt-8">
					<p class="micro-label text-accent">Try It</p>
					<h2 id="preview-try" class="mt-1 text-2xl font-semibold">Start with an editable prompt</h2>
					<div class="mt-5 space-y-3">
						{#each preview.starter_prompts as prompt}
							<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
								<p class="text-sm leading-6 text-foreground">{prompt}</p>
								<div class="mt-4 flex flex-col gap-2 sm:flex-row">
									<a
										href={getTryInBuildOsPath(preview, prompt)}
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<PlayCircle class="h-4 w-4" />
										Use prompt
									</a>
									<button
										type="button"
										class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										onclick={() => copyPrompt(prompt)}
									>
										{#if copiedPrompt === prompt}
											<Check class="h-4 w-4" /> Copied
										{:else}
											<Copy class="h-4 w-4" /> Copy prompt
										{/if}
									</button>
								</div>
							</div>
						{/each}
					</div>
				</section>
			</div>

			<aside class="space-y-4 lg:sticky lg:top-20">
				<section class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
					<div class="flex items-center gap-2">
						<ListTree class="h-4 w-4 text-accent" />
						<h2 class="text-lg font-semibold">Outputs</h2>
					</div>
					<div class="mt-4 flex flex-wrap gap-1.5">
						{#each preview.output_shapes as output}
							<span class="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">{output}</span>
						{/each}
					</div>
				</section>

				<section class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak">
					<div class="flex items-center gap-2">
						<ShieldCheck class="h-4 w-4 text-accent" />
						<h2 class="text-lg font-semibold">Guardrails</h2>
					</div>
					<ul class="mt-4 space-y-3">
						{#each preview.guardrails as guardrail}
							<li class="flex gap-2 text-sm leading-6 text-muted-foreground">
								<Check class="mt-1 h-4 w-4 shrink-0 text-accent" />
								<span>{guardrail}</span>
							</li>
						{/each}
					</ul>
				</section>

				{#if data.domain}
					<a
						href={getDomainPath(data.domain)}
						class="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold shadow-ink transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span>{data.domain.name}</span>
						<ArrowRight class="h-4 w-4" />
					</a>
				{/if}

				{#if data.relatedPreviews.length}
					<section class="rounded-lg border border-border bg-card p-4 shadow-ink">
						<h2 class="text-lg font-semibold">More {preview.family} previews</h2>
						<div class="mt-3 space-y-2">
							{#each data.relatedPreviews.slice(0, 4) as related}
								<a
									href={getPreviewSkillPath(related)}
									class="flex min-h-[44px] items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span class="line-clamp-2">{related.title}</span>
									<ArrowRight class="h-3.5 w-3.5 shrink-0" />
								</a>
							{/each}
						</div>
					</section>
				{/if}
			</aside>
		</div>
	</main>
</div>
