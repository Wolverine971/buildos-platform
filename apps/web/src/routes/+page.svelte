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
	<title>BuildOS - Your Home Base for Scattered Minds | Brain Dump to Action</title>
	<meta
		name="description"
		content="Built for disorganized minds who need to get organized. Transform scattered thoughts into organized action. Brain dump, get AI organization, execute. 14-day free trial."
	/>

	<meta
		name="keywords"
		content="AI project management, ADHD productivity tool, brain dump app, task organization, Google Calendar sync, daily briefs, voice notes, context management, chaotic minds"
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
	<meta property="og:title" content="BuildOS - Your Home Base for Scattered Minds" />
	<meta
		property="og:description"
		content="Finally, a productivity tool that gets how your brain works. BuildOS: where scattered thoughts become organized action. Built by someone who struggled with organization and needed a better way."
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
	<meta name="twitter:title" content="BuildOS - Your Home Base for Scattered Minds" />
	<meta
		name="twitter:description"
		content="Finally, a productivity tool that gets how your brain works. Transform scattered thoughts into organized action. 14-day free trial."
	/>
	<meta name="twitter:image" content="https://build-os.com/twitter_card_light.webp" />
	<meta name="twitter:image:alt" content="BuildOS - AI Project Collaboration Platform" />

	<!-- Additional Meta Tags -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="robots" content="index, follow" />
	<meta name="author" content="DJ Wayne" />

	<!-- Structured Data (JSON-LD) for better SEO -->
	{@html `<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"name": "BuildOS",
		"description": "AI project collaboration platform that transforms brain dumps into shared project context. Built for disorganized minds, founders, and creators who need clarity.",
		"applicationCategory": "ProductivityApplication",
		"operatingSystem": "Web",
		"offers": {
			"@type": "Offer",
			"price": "0",
			"priceCurrency": "USD",
			"description": "14-day free trial"
		},
		"aggregateRating": {
			"@type": "AggregateRating",
			"ratingValue": 4.8,
			"ratingCount": 127
		},
		"author": {
			"@type": "Organization",
			"name": "BuildOS",
			"url": "https://build-os.com"
		},
		"screenshot": "https://build-os.com/brain-bolt.png",
		"featureList": [
			"AI-powered brain dump processing",
			"Google Calendar synchronization",
			"Project phase management",
			"Daily AI briefs",
			"Task organization",
			"Context document generation",
			"Recurring task management",
			"Voice note capture"
		],
		"url": "https://build-os.com",
		"sameAs": [
			"https://twitter.com/build_os"
		]
	}
	</script>`}
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
						href="/blogs/getting-started/who-is-buildos-for"
						class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-ink tx tx-frame tx-weak hover:border-accent transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
						<span
							class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
							>Built for chaotic brains</span
						>
					</a>

					<h1 class="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
						Turn scattered ideas into a <span class="relative">
							living project brain
							<span
								class="absolute inset-x-0 bottom-1 -z-10 h-[0.65em] tx tx-bloom tx-med rounded"
							></span>
						</span>
					</h1>

					<p class="text-sm sm:text-base text-muted-foreground max-w-xl">
						BuildOS listens to brain dumps, carves structure out of noise, and keeps
						context warm — so you can stay in flow.
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
							href="#how"
						>
							See how it works →
						</a>
					</div>
				</div>

				<div
					class="rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak overflow-hidden wt-card"
				>
					<div
						class="h-10 border-b border-border tx tx-strip tx-med flex items-center px-4 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
					>
						Project: Raise Seed & Ship v1
					</div>
					<div class="p-3 sm:p-4 space-y-2 sm:space-y-3">
						<div class="grid sm:grid-cols-2 gap-2 sm:gap-3">
							<div
								class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-static tx-weak p-3"
							>
								<div
									class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-2"
								>
									Raw brain dump
								</div>
								<p class="text-[0.8rem] text-muted-foreground leading-relaxed">
									"Schedule investor calls, fix landing copy, ship onboarding.
									Also want a content plan tied to signups…"
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
									<li>▸ Goal: Close 3–5 angel checks</li>
									<li>▸ Plan: Weekly content engine</li>
									<li>▸ Milestone: Landing page clarity</li>
									<li>▸ Task: Investor pipeline</li>
								</ul>
							</div>
						</div>

						<div
							class="rounded-lg border border-border bg-background shadow-ink-inner tx tx-thread tx-weak p-3 flex items-center justify-between gap-3"
						>
							<p class="text-sm">
								<span class="text-muted-foreground">Next move:</span> Follow up with
								the 4 investors who opened your deck twice.
							</p>
							<a
								href="/auth/register"
								class="pressable rounded-full border border-border bg-accent text-accent-foreground px-3 py-1.5 text-xs font-semibold shadow-ink shrink-0 hover:opacity-90 transition-opacity"
								aria-label="Sign up to use BuildOS"
							>
								Do this now
							</a>
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
							From noise → structure → action.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl">
							BuildOS builds a project structure around you — goals, tasks, plans,
							risks, relationships — so the AI understands what you're building.
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
							Talk, type, or paste chaos. BuildOS ingests notes and half-baked ideas
							into a single project brain.
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
							Agents split your dump into goals, tasks, plans, risks — adapting to
							your project instead of forcing rigid templates.
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
							BuildOS surfaces next moves, tracks dependencies, and keeps long-term
							context warm.
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
							Under the hood.
						</h2>
						<p class="mt-2 text-sm text-muted-foreground max-w-xl">
							BuildOS organizes your work into flexible building blocks — projects,
							goals, plans, tasks, milestones, documents, and risks — that combine
							however makes sense for YOUR work.
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
							The big containers for everything you're working toward.
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
							The outcomes you're driving toward. The "why."
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
							Strategic groupings of work. Phases and sprints.
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
						<p class="text-sm text-foreground">The actual work. What you do today.</p>
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
							Significant markers. Progress made visible.
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
							Notes, specs, context. The knowledge you need.
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
							Things that could go wrong. Tracked and mitigated.
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
							AI-inferred properties that adapt to your project.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Example Project Graph -->
		<div bind:this={exampleGraphTarget}>
			{#if ExampleProjectGraphComponent}
				<ExampleProjectGraphComponent />
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
					Ready to turn chaos into clarity?
				</h2>
				<p class="text-sm text-muted-foreground mb-6 max-w-lg mx-auto">
					14-day free trial. No credit card required. Built for how your brain actually
					works.
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
