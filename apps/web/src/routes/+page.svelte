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
	import AnalyticsDashboard from '$lib/components/dashboard/AnalyticsDashboard.svelte';
	import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
	// Canonical data model icons (consistent with InsightPanels on /projects/[id])
	import {
		FolderKanban,
		Target,
		Calendar,
		ListChecks,
		Flag,
		FileText,
		AlertTriangle,
		Sparkles
	} from 'lucide-svelte';

	let { data } = $props();

	let ExampleProjectGraphComponent = $state<any>(null);
	let exampleGraphTarget = $state<HTMLElement | null>(null);
	let exampleGraphLoading = $state(false);
	const featuredPublicExampleProjectId = '44444444-4444-4444-4444-444444444444';

	const thinkingEnvironmentVisuals = [
		{
			eyebrow: 'Capture surface',
			title: 'A place for rough thinking',
			description:
				'Voice notes, chapter fragments, scene ideas, hook drafts, and research all land in one working surface before they disappear.',
			texture: 'tx tx-frame tx-weak',
			tags: ['voice notes', 'research', 'rough ideas']
		},
		{
			eyebrow: 'Working map',
			title: 'Projects with visible shape',
			description:
				'Chapters, episodes, sources, deadlines, assets, and risks stop living in separate tools and start connecting in one environment.',
			texture: 'tx tx-grain tx-weak',
			tags: ['episodes', 'chapters', 'assets']
		},
		{
			eyebrow: 'Focus window',
			title: 'One active thread at a time',
			description:
				'Zoom into the current scene, script, or task without losing the rest of the project around it.',
			texture: 'tx tx-thread tx-weak',
			tags: ['current scene', 'next move', 'deep work']
		},
		{
			eyebrow: 'Memory layer',
			title: 'Context that stays warm',
			description:
				'Rules, references, prior decisions, and feedback remain attached to the work, so you stop starting from scratch.',
			texture: 'tx tx-bloom tx-weak',
			tags: ['feedback', 'references', 'project memory']
		}
	] as const;

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

	const audienceSegments = [
		{
			label: 'Authors',
			title: 'Books, series, and messy creative arcs',
			description:
				'Great fit when a project has chapters, world rules, character notes, feedback, and long-lived context.'
		},
		{
			label: 'YouTubers',
			title: 'Research-heavy video systems',
			description:
				'Great fit when each video turns into scripts, examples, B-roll, sponsor notes, clips, and follow-on content.'
		},
		{
			label: 'Newsletter operators',
			title: 'Recurring content with deep research',
			description:
				'Great fit when ideas, references, drafts, and publishing cadence need to stay connected week after week.'
		},
		{
			label: 'Podcasters',
			title: 'Episodes with many moving pieces',
			description:
				'Great fit when booking, prep, recording, editing, clips, and show notes all need one home base.'
		},
		{
			label: 'Course creators',
			title: 'Content plus launch operations',
			description:
				'Great fit when curriculum, assets, emails, and launch tasks have to move as one project.'
		},
		{
			label: 'SaaS builders',
			title: 'Product work tied to content',
			description:
				'Great fit when shipping the product and telling the story around it happen in the same week.'
		}
	] as const;

	const landingJsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'BuildOS',
		description:
			'BuildOS is a thinking environment that transforms rough notes, scripts, chapters, and research into structured projects with persistent context.',
		applicationCategory: 'ProductivityApplication',
		operatingSystem: 'Web',
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD',
			description: '14-day free trial'
		},
		author: {
			'@type': 'Organization',
			name: 'BuildOS',
			url: 'https://build-os.com'
		},
		screenshot: 'https://build-os.com/brain-bolt.png',
		featureList: [
			'Brain dump to project structure',
			'Persistent project context',
			'Voice note capture',
			'Task and milestone organization',
			'Research and document organization',
			'Daily briefs and next-step visibility',
			'Google Calendar synchronization',
			'Project memory that compounds over time'
		],
		url: 'https://build-os.com',
		sameAs: ['https://twitter.com/build_os']
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
	<title>BuildOS - A Thinking Environment for Authors, YouTubers, and Builders</title>
	<meta
		name="description"
		content="BuildOS is a thinking environment for authors, YouTubers, and builders. Dump rough ideas, scripts, chapters, and research. BuildOS turns them into structured projects that keep context warm over time."
	/>

	<meta
		name="keywords"
		content="AI project management, thinking environment, brain dump app, task organization, Google Calendar sync, daily briefs, voice notes, context management, creator productivity"
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
	<meta
		property="og:title"
		content="BuildOS - A Thinking Environment for Authors, YouTubers, and Builders"
	/>
	<meta
		property="og:description"
		content="BuildOS turns rough thoughts into structured work. Built for authors, YouTubers, and builders with complex projects that need more than a task list."
	/>
	<meta property="og:image" content="https://build-os.com/brain-bolt.png" />

	<!-- PERFORMANCE: Conditional preloads based on auth state -->
	{#if isAuthenticated}
		<!-- No preload needed - saves bandwidth for users who don't scroll -->
	{:else}
		<!-- Preload critical landing page resources -->
		<link rel="preload" href="/s-brain-bolt.webp" as="image" type="image/webp" />
	{/if}

	<!-- Twitter/X Card Tags (using name attribute as per X documentation) -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="@build_os" />
	<meta name="twitter:creator" content="@djwayne3" />
	<meta
		name="twitter:title"
		content="BuildOS - A Thinking Environment for Authors, YouTubers, and Builders"
	/>
	<meta
		name="twitter:description"
		content="Dump ideas, scripts, chapters, and research. BuildOS turns them into structured projects that keep context warm over time."
	/>
	<meta name="twitter:image" content="https://build-os.com/twitter_card_light.webp" />
	<meta
		name="twitter:image:alt"
		content="BuildOS - A Thinking Environment for Complex Creative Work"
	/>

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="index, follow" />
	<meta name="author" content="DJ Wayne" />

	<!-- Structured Data (JSON-LD) for better SEO -->
	{@html `<script type="application/ld+json">${landingJsonLd}</script>`}
</svelte:head>

{#if isAuthenticated && data.user}
	<AnalyticsDashboard
		user={{
			id: data.user.id,
			email: data.user.email,
			name: data.user.name ?? undefined,
			is_admin: data.user.is_admin
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

					<h1 class="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
						A <span class="relative">
							thinking environment
							<span
								class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
							></span>
						</span> for people making complex things
					</h1>

					<p class="text-sm sm:text-base text-muted-foreground max-w-xl">
						Dump rough ideas, chapters, scripts, research, and launch notes. BuildOS
						turns them into structured projects that stay connected as the work grows.
					</p>

					<div class="flex flex-wrap gap-2 sm:gap-3 items-center">
						<a
							href="/auth/register"
							class="pressable rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							Get started free
						</a>
						<a
							class="text-xs text-muted-foreground hover:text-accent underline underline-offset-4 transition-colors px-2 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
							href="#thinking-environment"
						>
							See the environment →
						</a>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak overflow-hidden wt-card"
				>
					<div
						class="h-10 border-b border-border tx tx-strip tx-med flex items-center px-4 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
					>
						Thinking environment • creator work
					</div>
					<div class="p-3 sm:p-4 space-y-3">
						<div class="grid sm:grid-cols-2 gap-2 sm:gap-3">
							<div
								class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-static tx-weak p-3"
							>
								<div
									class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
								>
									Author dump
								</div>
								<p class="text-[0.8rem] text-muted-foreground leading-relaxed">
									"Chapter 12 drags, I need to fix Maya's motivation, track my
									magic rules, and pull beta-reader notes into one place..."
								</p>
							</div>
							<div
								class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-grain tx-weak p-3"
							>
								<div
									class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
								>
									Structured by BuildOS
								</div>
								<ul class="text-[0.8rem] leading-relaxed">
									<li>▸ Project: Novel draft revision</li>
									<li>▸ Doc: Character arc notes</li>
									<li>▸ Doc: Magic rules bible</li>
									<li>▸ Task: Rewrite chapter 12</li>
								</ul>
							</div>
						</div>

						<div class="grid sm:grid-cols-2 gap-2 sm:gap-3">
							<div
								class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-static tx-weak p-3"
							>
								<div
									class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
								>
									YouTube dump
								</div>
								<p class="text-[0.8rem] text-muted-foreground leading-relaxed">
									"Need a better hook for the AI fatigue episode, a source list,
									sponsor note, B-roll ideas, and three shorts after the main
									cut."
								</p>
							</div>
							<div
								class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-thread tx-weak p-3"
							>
								<div
									class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
								>
									Structured by BuildOS
								</div>
								<ul class="text-[0.8rem] leading-relaxed">
									<li>▸ Project: AI fatigue video essay</li>
									<li>▸ Plan: Research → script → edit</li>
									<li>▸ Doc: Sources and examples</li>
									<li>▸ Task: Draft the cold open</li>
								</ul>
							</div>
						</div>

						<div
							class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-thread tx-weak p-3 flex items-center justify-between gap-3"
						>
							<p class="text-sm">
								<span class="text-muted-foreground">Next move:</span> Open the current
								scene, script, or launch task without losing the rest of the project.
							</p>
							<a
								href="/auth/register"
								class="pressable rounded-full border border-border bg-accent text-accent-foreground px-3 py-1.5 text-xs font-semibold shadow-ink shrink-0 hover:opacity-90 transition-opacity"
								aria-label="Sign up to use BuildOS"
							>
								Try it now
							</a>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section id="thinking-environment" class="border-b border-border">
			<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10 space-y-6">
				<div class="flex items-end justify-between gap-4 flex-wrap">
					<div>
						<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
							What a thinking environment looks like.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-2xl">
							Not a blank document. Not a disconnected task list. A working surface
							where capture, structure, focus, and memory live together.
						</p>
					</div>
					<a
						href="#examples"
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
					>
						See grounded examples →
					</a>
				</div>

				<div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
					{#each thinkingEnvironmentVisuals as visual}
						<article
							class={`rounded-lg border border-border bg-card shadow-ink p-4 ${visual.texture}`}
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
							>
								{visual.eyebrow}
							</div>
							<h3 class="mt-2 text-sm font-semibold text-foreground">
								{visual.title}
							</h3>
							<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
								{visual.description}
							</p>
							<div class="mt-3 flex flex-wrap gap-1.5">
								{#each visual.tags as tag}
									<span
										class="rounded-full border border-border bg-background px-2 py-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground shadow-ink-inner"
									>
										{tag}
									</span>
								{/each}
							</div>
						</article>
					{/each}
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
							BuildOS helps authors, YouTubers, and builders move from messy inputs to
							clear next moves without rebuilding context every time.
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
							01 • Capture
						</div>
						<h3 class="mt-2 text-sm font-semibold text-foreground">
							Dump everything in your head.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							Talk, type, or paste ideas, scenes, scripts, research, or launch notes
							without stopping to organize them first.
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
							Carve structure out of noise.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							BuildOS turns the mess into projects, documents, tasks, milestones, and
							working context that match the project you are actually building.
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
							Stay in flow. The OS remembers.
						</h3>
						<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
							Open the current chapter, episode, or launch task with the rest of the
							work still connected around it.
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
							What the environment holds.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl">
							A real thinking environment needs more than tasks. It needs work,
							context, drafts, timing, progress, and open loops in one place.
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
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<FolderKanban class="w-3.5 h-3.5 text-emerald-500" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Projects</span
							>
						</div>
						<p class="text-sm text-foreground">
							The bodies of work you are trying to finish and publish.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<Target class="w-3.5 h-3.5 text-amber-500" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Goals</span
							>
						</div>
						<p class="text-sm text-foreground">
							The outcomes that give the work direction.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<Calendar class="w-3.5 h-3.5 text-indigo-500" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Plans</span
							>
						</div>
						<p class="text-sm text-foreground">
							The stages the work moves through. Draft, record, edit, launch.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<ListChecks class="w-3.5 h-3.5 text-muted-foreground" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Tasks</span
							>
						</div>
						<p class="text-sm text-foreground">The concrete next moves that ship it.</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<Flag class="w-3.5 h-3.5 text-emerald-500" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Milestones</span
							>
						</div>
						<p class="text-sm text-foreground">
							Visible checkpoints that show the project is moving.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<FileText class="w-3.5 h-3.5 text-sky-500" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Documents</span
							>
						</div>
						<p class="text-sm text-foreground">
							Research, scripts, chapter notes, outlines, and references.
						</p>
					</div>
					<div class="rounded-lg border border-border bg-card tx tx-frame tx-weak p-3">
						<div class="flex items-center gap-2 mb-1">
							<AlertTriangle class="w-3.5 h-3.5 text-red-500" />
							<span
								class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground"
								>Risks</span
							>
						</div>
						<p class="text-sm text-foreground">
							Unknowns, blockers, and loose ends worth tracking.
						</p>
					</div>
					<div
						class="rounded-lg border border-accent/20 bg-accent/5 shadow-ink tx tx-bloom tx-weak p-3"
					>
						<div class="flex items-center gap-2 mb-1">
							<Sparkles class="w-3.5 h-3.5 text-accent" />
							<span class="text-[0.65rem] uppercase tracking-[0.15em] text-accent"
								>Flexible Props</span
							>
						</div>
						<p class="text-sm text-foreground">
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
							Grounded creator projects.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-2xl">
							Real projects where the transformation from dump to structure is obvious
							in seconds.
						</p>
					</div>
					<a
						href="/auth/register"
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
					>
						Start building context now →
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

				<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
					{#each audienceSegments as segment}
						<article
							class="rounded-lg border border-border bg-card shadow-ink p-4 tx tx-frame tx-weak"
						>
							<div
								class="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
							>
								{segment.label}
							</div>
							<h3 class="mt-2 text-sm font-semibold text-foreground">
								{segment.title}
							</h3>
							<p class="mt-2 text-sm text-muted-foreground leading-relaxed">
								{segment.description}
							</p>
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

		<!-- final CTA -->
		<section class="py-10 sm:py-12">
			<div class="mx-auto max-w-6xl px-4 text-center">
				<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
					Ready to work inside a thinking environment?
				</h2>
				<p class="text-sm text-muted-foreground mb-6 max-w-lg mx-auto">
					Start with a book, a video series, a newsletter system, or a product launch. The
					context compounds from day one.
				</p>
				<div class="flex flex-wrap justify-center gap-2 sm:gap-3">
					<a
						href="/auth/register"
						class="pressable rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background shadow-ink hover:opacity-90 transition-opacity"
					>
						Get started free
					</a>
					<a
						href="/blogs/getting-started/how-buildos-works"
						class="pressable rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold shadow-ink hover:border-accent transition-colors"
					>
						Learn more
					</a>
				</div>
			</div>
		</section>
	</div>
{/if}
