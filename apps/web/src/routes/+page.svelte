<!-- apps/web/src/routes/+page.svelte -->
<!--
  Authenticated users: analytics dashboard
  Unauthenticated users: landing page
-->
<script lang="ts">
	import './dashboard.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toastService } from '$lib/stores/toast.store';
	import { invalidateAll, replaceState } from '$app/navigation';
	import {
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
		HOME_PAGE_LAST_MODIFIED,
		SITE_DESCRIPTION,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import AnalyticsDashboard from '$lib/components/dashboard/AnalyticsDashboard.svelte';
	import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
	import { serializeJsonLd } from '$lib/utils/json-ld';
	// Canonical data model icons (consistent with InsightPanels on /projects/[id])
	import {
		FolderKanban,
		Target,
		Calendar,
		ListChecks,
		Flag,
		FileText,
		AlertTriangle
	} from 'lucide-svelte';

	let { data } = $props();

	let ExampleProjectGraphComponent = $state<any>(null);
	let exampleGraphTarget = $state<HTMLElement | null>(null);
	let exampleGraphLoading = $state(false);
	const featuredPublicExampleProjectId = '44444444-4444-4444-4444-444444444444';

	const creatorProjectExamples = [
		{
			audience: 'Authors',
			project: 'Fantasy novel revision',
			raw: `"Chapter 9 drags, the queen's motive still feels weak, I need a magic-rules doc, and I keep forgetting which clues I planted in act 1."`,
			output: [
				'Revision plan for chapter 9',
				'Character motivation notes',
				'World rules reference doc',
				'Foreshadowing checklist'
			],
			texture: 'tx tx-frame tx-weak'
		},
		{
			audience: 'YouTubers',
			project: 'Weekly video essay pipeline',
			raw: '"Need a cold open for the AI fatigue video, stronger examples, sponsor slot, B-roll list, and three shorts once the main edit is done."',
			output: [
				'Episode outline and hook options',
				'Research doc with source list',
				'Production checklist',
				'Repurposing tasks for shorts'
			],
			texture: 'tx tx-grain tx-weak'
		},
		{
			audience: 'Podcasters',
			project: 'Interview episode system',
			raw: '"Book guest, prep questions, collect listener prompts, pull clips, write show notes, and turn the best section into a newsletter."',
			output: [
				'Guest prep doc',
				'Recording and post-production checklist',
				'Clip backlog',
				'Newsletter follow-up plan'
			],
			texture: 'tx tx-thread tx-weak'
		},
		{
			audience: 'Course creators',
			project: 'Launch a paid course',
			raw: '"Need module outlines, worksheets, sales page copy, launch emails, customer questions, and somewhere to track all the assets."',
			output: [
				'Module roadmap',
				'Asset production plan',
				'Launch calendar',
				'Open questions and blockers'
			],
			texture: 'tx tx-bloom tx-weak'
		}
	] as const;

	function formatCategoryLabel(category: string) {
		return category
			.split('-')
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ');
	}

	const landingStructuredData = serializeJsonLd({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		'@id': `${SITE_URL}/#software-application`,
		name: SITE_NAME,
		description: SITE_DESCRIPTION,
		applicationCategory: 'ProductivityApplication',
		operatingSystem: 'Web',
		offers: {
			'@type': 'Offer',
			price: '20.00',
			priceCurrency: 'USD',
			availability: 'https://schema.org/InStock',
			url: `${SITE_URL}/pricing`,
			description: 'BuildOS Pro monthly plan with a 14-day free trial.'
		},
		author: {
			'@id': DEFAULT_ORGANIZATION_ID
		},
		publisher: {
			'@id': DEFAULT_ORGANIZATION_ID
		},
		image: DEFAULT_SOCIAL_IMAGE_OBJECT,
		featureList: [
			'Rough input to project structure',
			'Persistent project context',
			'Chat-based project organization',
			'Voice note capture',
			'Task and milestone organization',
			'Research and document organization',
			'Daily briefs and next-step visibility',
			'Google Calendar synchronization',
			'Project memory that compounds over time'
		],
		url: SITE_URL,
		sameAs: DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		dateModified: HOME_PAGE_LAST_MODIFIED,
		mainEntityOfPage: SITE_URL
	});

	let isAuthenticated = $derived(!!data?.user);

	// Reload data when needed
	async function handleDashboardRefresh() {
		await invalidateAll();
	}

	async function loadExampleProjectGraph() {
		if (ExampleProjectGraphComponent || exampleGraphLoading) return;
		exampleGraphLoading = true;

		try {
			const module = await import('$lib/components/landing/ExampleProjectGraph.svelte');
			ExampleProjectGraphComponent = module.default;
		} catch (error) {
			console.error('[Landing] Failed to load example project graph:', error);
		} finally {
			exampleGraphLoading = false;
		}
	}

	// Handle any messages on mount
	onMount(() => {
		const message = page.url.searchParams.get('message');
		const urlError = page.url.searchParams.get('error');

		if (message) {
			toastService.success(message);
			const url = new URL(page.url);
			url.searchParams.delete('message');
			replaceState(url.toString(), {});
		}

		if (urlError) {
			toastService.error(urlError);
			const url = new URL(page.url);
			url.searchParams.delete('error');
			replaceState(url.toString(), {});
		}
	});

	onMount(() => {
		if (isAuthenticated) return;

		if (!('IntersectionObserver' in window)) {
			loadExampleProjectGraph();
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					loadExampleProjectGraph();
				}
			},
			{ rootMargin: '200px 0px' }
		);

		if (exampleGraphTarget) {
			observer.observe(exampleGraphTarget);
		}

		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>BuildOS — Turn Messy Thinking into Structured Work</title>
	<meta
		name="description"
		content="BuildOS is a thinking environment for people making complex things. Start in chat with rough ideas, notes, and research, then turn them into structured projects with memory and a clear next move."
	/>

	<meta
		name="keywords"
		content="thinking environment, project chat, project memory, creator workflow, author workflow, YouTube workflow, task organization, daily briefs, voice notes"
	/>
	<link rel="canonical" href="https://build-os.com/" />

	<!-- Critical CSS for landing page -->
	{#if !isAuthenticated}
		<style>
			/* Critical styles to prevent layout shift */
			.fade-in {
				opacity: 1;
			}
			.text-4xl {
				font-size: 2.25rem;
				line-height: 2.5rem;
			}
			.text-xl {
				font-size: 1.25rem;
				line-height: 1.75rem;
			}
			@media (min-width: 640px) {
				.sm\:text-5xl {
					font-size: 3rem;
					line-height: 1;
				}
			}
			@media (min-width: 768px) {
				.md\:text-6xl {
					font-size: 3.75rem;
					line-height: 1;
				}
			}
		</style>
	{/if}

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/" />
	<meta property="og:title" content="BuildOS — Turn Messy Thinking into Structured Work" />
	<meta
		property="og:description"
		content="BuildOS is a thinking environment for people making complex things. Turn rough ideas, notes, and research into structured projects with memory and a clear next move."
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

	<!-- Twitter/X Card Tags (using name attribute as per X documentation) -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content="BuildOS — Turn Messy Thinking into Structured Work" />
	<meta
		name="twitter:description"
		content="BuildOS is a thinking environment for people making complex things. Turn rough ideas into structured work."
	/>
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />

	<!-- Additional Meta Tags -->
	<meta name="robots" content="index, follow" />
	<meta name="author" content="DJ Wayne" />

	<!-- Structured Data (JSON-LD) for better SEO -->
	{@html `<script type="application/ld+json">${landingStructuredData}</script>`}
</svelte:head>

{#if isAuthenticated && data.user}
	<AnalyticsDashboard
		user={{
			id: data.user.id,
			email: data.user.email,
			name: data.user.name ?? undefined,
			is_admin: data.user.is_admin,
			timezone: data.user.timezone ?? undefined
		}}
		analytics={data.dashboard ?? createEmptyUserDashboardAnalytics()}
		onrefresh={handleDashboardRefresh}
	/>
{:else}
	<!-- Synesthetic Texture Landing Page -->
	<div class="min-h-screen bg-background text-foreground">
		<!-- hero -->
		<section class="border-b border-border">
			<div
				class="mx-auto max-w-6xl px-4 py-8 sm:py-12 grid md:grid-cols-2 gap-6 sm:gap-8 items-center"
			>
				<div class="space-y-4 sm:space-y-6">
					<a
						href="#examples"
						class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-ink tx tx-frame tx-weak hover:border-accent transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span
							class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
							>Built for authors, YouTubers, and builders</span
						>
					</a>

					<h1 class="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
						Turn messy thinking into <span class="relative">
							structured work
							<span
								class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
							></span>
						</span>
					</h1>

					<p class="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
						BuildOS is a thinking environment for people making complex things. Start in
						chat with rough ideas, notes, voice memos, and research, then turn them into
						structured projects with memory and a clear next move. Keep the work
						connected instead of scattered across notes apps, task lists, and stateless
						AI chats.
					</p>

					<p class="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed">
						Built by <a
							href="/about"
							class="text-foreground underline underline-offset-4">DJ Wayne</a
						>, a former USMC Scout Sniper turned software engineer, BuildOS is for work
						that generic productivity tools flatten: books, videos, research, product
						launches, and everything else that depends on preserved context.
					</p>

					<div class="flex flex-wrap gap-2 sm:gap-3 items-center">
						<a
							href="/auth/register"
							class="pressable rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							Start in chat
						</a>
						<a
							href="#how"
							class="pressable rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold shadow-ink hover:border-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							See how it works
						</a>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak overflow-hidden wt-card"
				>
					<div
						class="h-10 border-b border-border tx tx-strip tx-med flex items-center px-4 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
					>
						Rough brief → organized plan
					</div>
					<div class="p-4 sm:p-5 grid sm:grid-cols-2 gap-3 sm:gap-4">
						<div
							class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-static tx-weak p-4"
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground mb-3"
							>
								Author brief
							</div>
							<p class="text-sm text-muted-foreground leading-relaxed">
								"Chapter 12 drags, I need to fix Maya's motivation, track my magic
								rules, and pull beta-reader notes into one place..."
							</p>
						</div>
						<div
							class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-grain tx-weak p-4"
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground mb-3"
							>
								Structured by BuildOS
							</div>
							<ul class="text-sm leading-relaxed space-y-1 text-foreground">
								<li>▸ Project: Novel draft revision</li>
								<li>▸ Doc: Character arc notes</li>
								<li>▸ Doc: Magic rules bible</li>
								<li>▸ Task: Rewrite chapter 12</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- how it works -->
		<section id="how" class="border-b border-border">
			<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10 space-y-6">
				<div class="flex items-end justify-between gap-4 flex-wrap">
					<div>
						<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
							From raw thinking to shipped work.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl">
							Three steps. No manual setup. No rebuilding context every time.
						</p>
					</div>
					<a
						href="/blogs/getting-started/how-buildos-works"
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
					>
						Read: How BuildOS Works →
					</a>
				</div>

				<div class="grid md:grid-cols-3 gap-3 sm:gap-4">
					<article
						class="rounded-lg border border-border bg-card shadow-ink tx tx-bloom tx-weak p-4"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
						>
							01 • Start
						</div>
						<h3 class="mt-2 text-sm font-semibold text-foreground">
							Bring the project in as-is.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							Start in chat with rough notes, scenes, scripts, research, or launch
							plans without stopping to organize everything first.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-4"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
						>
							02 • Shape
						</div>
						<h3 class="mt-2 text-sm font-semibold text-foreground">
							Get structure back.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							BuildOS turns the mess into projects, tasks, documents, and milestones
							that match what you are actually building.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-card shadow-ink tx tx-pulse tx-weak p-4"
					>
						<div
							class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
						>
							03 • Drive
						</div>
						<h3 class="mt-2 text-sm font-semibold text-foreground">
							Pick up where you left off.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							Open the current chapter, episode, or launch task. The rest of the
							project stays connected around it.
						</p>
					</article>
				</div>
			</div>
		</section>

		<!-- under the hood -->
		<section id="stack" class="border-b border-border">
			<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10 space-y-6">
				<div class="flex items-end justify-between gap-4 flex-wrap">
					<div>
						<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
							Everything your project needs. One place.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl">
							Most tools give you tasks or documents. Not both. Not connected. Not
							with context.
						</p>
					</div>
					<a
						href="/blogs/getting-started/under-the-hood"
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
					>
						Read: Under the Hood →
					</a>
				</div>

				<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<FolderKanban class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">Projects</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							The bodies of work you are trying to finish and publish.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<Target class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">Goals</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							The outcomes that give the work direction.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<Calendar class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">Plans</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							The stages the work moves through. Draft, record, edit, launch.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<ListChecks class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">Tasks</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							The concrete next moves that ship it.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<Flag class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">Milestones</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							Visible checkpoints that show the project is moving.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<FileText class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground">Documents</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							Research, scripts, chapter notes, outlines, and references.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<AlertTriangle class="w-4 h-4 text-red-500" />
							<span class="text-sm font-semibold text-foreground">Risks</span>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							Unknowns, blockers, and loose ends worth tracking.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-4">
						<div class="flex items-center gap-2 mb-1.5">
							<FolderKanban class="w-4 h-4 text-muted-foreground" />
							<span class="text-sm font-semibold text-foreground"
								>Flexible Structure</span
							>
						</div>
						<p class="text-sm text-muted-foreground leading-relaxed">
							Project-specific structure that adapts to books, videos, launches, and
							whatever else you are building.
						</p>
					</div>
				</div>
			</div>
		</section>

		<section id="examples" class="border-b border-border">
			<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10 space-y-6">
				<div class="flex items-end justify-between gap-4 flex-wrap">
					<div>
						<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
							See it in action.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-2xl">
							Real projects where the transformation from rough input to structure is
							obvious in seconds.
						</p>
					</div>
					<a
						href="/auth/register"
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
					>
						Start in chat →
					</a>
				</div>

				<div class="grid md:grid-cols-2 gap-3 sm:gap-4">
					{#each creatorProjectExamples as example}
						<article
							class={`rounded-lg border border-border bg-card shadow-ink p-4 ${example.texture}`}
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
							>
								{example.audience}
							</div>
							<h3 class="mt-2 text-base font-semibold text-foreground">
								{example.project}
							</h3>
							<div class="mt-3 grid gap-3 sm:grid-cols-2">
								<div
									class="rounded-lg border border-border bg-background p-3 shadow-ink-inner"
								>
									<div
										class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
									>
										Raw input
									</div>
									<p class="text-sm text-muted-foreground leading-relaxed">
										{example.raw}
									</p>
								</div>
								<div
									class="rounded-lg border border-border bg-background p-3 shadow-ink-inner"
								>
									<div
										class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
									>
										BuildOS organizes it into
									</div>
									<ul class="space-y-1 text-sm text-foreground">
										{#each example.output as item}
											<li>▸ {item}</li>
										{/each}
									</ul>
								</div>
							</div>
						</article>
					{/each}
				</div>
			</div>
		</section>

		<!-- Example Project Graph -->
		<div bind:this={exampleGraphTarget}>
			{#if ExampleProjectGraphComponent}
				<ExampleProjectGraphComponent projectId={featuredPublicExampleProjectId} />
			{:else}
				<section id="example" class="border-t border-border bg-muted">
					<div class="mx-auto max-w-6xl px-4 py-6">
						<div
							class="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
						>
							Loading example project graph...
						</div>
					</div>
				</section>
			{/if}
		</div>

		{#if data.featuredBlogPosts?.length}
			<section class="border-b border-border">
				<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10 space-y-6">
					<div class="flex items-end justify-between gap-4 flex-wrap">
						<div>
							<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
								Start with these guides.
							</h2>
							<p class="mt-2 text-sm text-muted-foreground max-w-2xl">
								The fastest way to understand BuildOS is to see how context gets
								captured, organized, and turned into a working system.
							</p>
						</div>
						<a
							href="/blogs"
							class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
						>
							Browse the full blog →
						</a>
					</div>

					<div class="grid md:grid-cols-3 gap-3 sm:gap-4">
						{#each data.featuredBlogPosts as post}
							<article
								class="rounded-lg border border-border bg-card shadow-ink p-4 tx tx-frame tx-weak"
							>
								<div
									class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
								>
									{formatCategoryLabel(post.category)}
								</div>
								<h3 class="mt-2 text-base font-semibold text-foreground">
									{post.title}
								</h3>
								<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
									{post.description}
								</p>
								<a
									href="/blogs/{post.category}/{post.slug}"
									class="mt-4 inline-flex text-sm font-semibold text-accent underline underline-offset-4"
								>
									Read guide →
								</a>
							</article>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		<!-- honest comparison + final CTA -->
		<section class="py-10 sm:py-14">
			<div class="mx-auto max-w-6xl px-4 space-y-8">
				<div class="max-w-2xl">
					<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
						You have three options.
					</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						Two of them leave your thinking scattered. One starts compounding today.
					</p>
				</div>

				<div class="grid md:grid-cols-3 gap-3 sm:gap-4">
					<article
						class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-4"
					>
						<div class="text-xs font-medium text-muted-foreground">Option 1</div>
						<h3 class="mt-1 text-base font-semibold text-foreground">
							Keep managing the sprawl.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							Notes in one app, tasks in another, context in a chat thread you will
							never find again.
						</p>
					</article>

					<article
						class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-4"
					>
						<div class="text-xs font-medium text-muted-foreground">Option 2</div>
						<h3 class="mt-1 text-base font-semibold text-foreground">
							Wait for the perfect tool.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							There is always a better one coming. Meanwhile, your ideas keep piling
							up unstructured.
						</p>
					</article>

					<article
						class="rounded-lg border border-accent/40 bg-accent/5 shadow-ink-strong tx tx-bloom tx-weak p-4"
					>
						<div class="text-xs font-semibold text-accent">Option 3</div>
						<h3 class="mt-1 text-base font-semibold text-foreground">Start in chat.</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							Your system gets better with every conversation, note, and project
							update. The value compounds from day one.
						</p>
					</article>
				</div>

				<div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-2">
					<a
						href="/auth/register"
						class="pressable rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Start in chat
					</a>
					<a
						href="/blogs/getting-started/how-buildos-works"
						class="pressable rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold shadow-ink hover:border-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Learn more
					</a>
				</div>
			</div>
		</section>
	</div>
{/if}
