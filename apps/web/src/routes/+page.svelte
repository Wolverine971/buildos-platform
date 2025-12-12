<!-- apps/web/src/routes/+page.svelte -->
<script lang="ts">
	import { CircleCheck, Calendar, Zap } from 'lucide-svelte';
	import './dashboard.css';
	import type { User } from '$lib/types/dashboard';
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { toastService } from '$lib/stores/toast.store';
	import { invalidateAll, replaceState } from '$app/navigation';
	import BuildOSFlow from '$lib/components/dashboard/BuildOSFlow.svelte';

	let { data } = $props();

	// Helper to detect streaming promises
	function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
		return !!value && typeof (value as PromiseLike<T>).then === 'function';
	}

	let isAuthenticated = $derived(!!data?.user);
	let user = $derived(data?.user as User | null);

	// Projects streaming state (loaded server-side)
	let projectsStreamVersion = 0;
	let projectsState = $state<OntologyProjectSummary[]>(
		isPromiseLike<OntologyProjectSummary[]>(data.projects)
			? []
			: ((data.projects as OntologyProjectSummary[] | null) ?? [])
	);
	let projectsLoadingState = $state<boolean>(
		isPromiseLike<OntologyProjectSummary[]>(data.projects)
	);

	// Stream projects from server-loaded promise
	$effect(() => {
		const incoming = data.projects;
		const currentVersion = ++projectsStreamVersion;

		if (isPromiseLike<OntologyProjectSummary[]>(incoming)) {
			projectsLoadingState = true;

			incoming
				.then((result) => {
					if (currentVersion !== projectsStreamVersion) return;
					projectsState = result ?? [];
					projectsLoadingState = false;
				})
				.catch((error) => {
					if (currentVersion !== projectsStreamVersion) return;
					console.error('[Dashboard] Failed to load projects:', error);
					projectsState = [];
					projectsLoadingState = false;
				});

			return;
		}

		projectsState = (incoming as OntologyProjectSummary[] | null) ?? [];
		projectsLoadingState = false;
	});

	let projects = $derived(projectsState);
	let isLoadingProjects = $derived(projectsLoadingState);

	let innerWidth = $state<number | 0>(0);

	// Lazy load Dashboard component only when needed
	let Dashboard = $state<any>(null);

	$effect(() => {
		if (isAuthenticated && !Dashboard && browser) {
			import('$lib/components/dashboard/Dashboard.svelte').then((module) => {
				Dashboard = module.default;
			});
		}
	});

	// Reload data when needed
	async function handleDashboardRefresh() {
		await invalidateAll();
	}

	// Handle any messages on mount
	onMount(() => {
		const message = $page.url.searchParams.get('message');
		const urlError = $page.url.searchParams.get('error');

		if (message) {
			toastService.success(message);
			const url = new URL($page.url);
			url.searchParams.delete('message');
			replaceState(url.toString(), {});
		}

		if (urlError) {
			toastService.error(urlError);
			const url = new URL($page.url);
			url.searchParams.delete('error');
			replaceState(url.toString(), {});
		}
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
		<!-- Note: /api/dashboard/bottom-sections is lazy-loaded via IntersectionObserver -->
		<!-- No preload needed - saves bandwidth for users who don't scroll -->
	{:else}
		<!-- Preload critical landing page resources -->
		<link rel="preload" href="/s-brain-bolt.webp" as="image" type="image/webp" />
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="dns-prefetch" href="https://fonts.gstatic.com" />
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
	<meta name="twitter:image" content="https://build-os.com/twitter-card-1200x628.webp" />
	<meta name="twitter:image:alt" content="BuildOS - AI-First Project Organization Platform" />

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
		"description": "AI-first project organization platform that transforms brain dumps into structured projects. Perfect for disorganized minds, founders, and creators who need clarity.",
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
			"ratingValue": "4.8",
			"ratingCount": "127"
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

<svelte:window bind:innerWidth />

{#if isAuthenticated}
	<!-- PERFORMANCE: Render Dashboard when component is loaded -->
	{#if Dashboard}
		<Dashboard
			user={data.user}
			initialProjects={projects}
			{isLoadingProjects}
			onrefresh={handleDashboardRefresh}
		/>
	{:else}
		<!-- PERFORMANCE: Lightweight loading state with better UX -->
		<div class="min-h-screen bg-background text-foreground" aria-busy="true">
			<div class="flex items-center justify-center min-h-screen">
				<div class="text-center">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"
						role="status"
						aria-label="Loading dashboard"
					></div>
					<p class="text-muted-foreground">Preparing dashboard...</p>
				</div>
			</div>
		</div>
	{/if}
{:else}
	<!-- PERFORMANCE: Optimized landing page with Inkprint styling -->
	<div class="min-h-screen bg-background text-foreground">
		<!-- Hero Section -->
		<section class="relative border-b border-border overflow-hidden" aria-label="Hero section">
			<!-- Subtle halftone background texture -->
			<div
				class="absolute inset-0 hero-halftone-bg pointer-events-none"
				aria-hidden="true"
			></div>

			<div class="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
				<div class="text-center mb-12">
					<div class="relative z-10 max-w-4xl mx-auto text-center flex flex-col">
						<!-- Tagline with Inkprint styling -->
						<h1
							class="text-4xl sm:text-5xl md:text-6xl font-black mb-6 leading-tight fade-in text-foreground tracking-tight"
						>
							Project organization built <br class="hidden sm:block" />for
							<span class="relative inline-block">
								<span class="relative z-10">the AI era.</span>
								<span
									class="absolute inset-x-[-0.15em] bottom-[0.05em] -z-10 h-[0.55em] rounded-sm bg-accent/20 hero-highlight"
								></span>
							</span>
						</h1>

						<!-- Subtitle -->
						<p
							class="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto fade-in leading-relaxed"
						>
							Your thoughts, organized.<br class="hidden sm:block" />
							Your next step, clear.
						</p>

						<!-- CTA with Inkprint button -->
						<div class="flex flex-col items-center gap-4">
							<p class="text-base sm:text-lg font-semibold text-foreground">
								Ready for BuildOS to help you organize your projects?
							</p>
							<a
								href="/auth/register"
								aria-label="Start working with BuildOS"
								class="group"
							>
								<button
									class="pressable rounded-full bg-foreground px-8 py-3.5 text-lg font-bold text-background shadow-ink-strong border-2 border-transparent hover:border-accent transition-all duration-200 group-hover:scale-[1.02]"
								>
									Start Brain Dumping
									<span
										class="inline-block ml-1 transition-transform duration-200 group-hover:translate-x-1"
										>→</span
									>
								</button>
							</a>
						</div>

						<!-- Trust Signal -->
						<p
							class="text-sm text-muted-foreground mt-8 fade-in inline-flex items-center gap-2 m-auto px-5 py-2.5 rounded-full border border-border bg-card/80 backdrop-blur-sm shadow-ink"
						>
							<span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
							14-day free trial • No credit card • Actually built for ADHD
						</p>
					</div>
				</div>
			</div>
		</section>

		<BuildOSFlow />

		<!-- Who It's For Section -->
		<section class="py-20 bg-muted border-b border-border" aria-labelledby="audience-heading">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2
					id="audience-heading"
					class="text-3xl font-bold text-center mb-12 text-foreground"
				>
					Finally, a home base for scattered minds
				</h2>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
					<!-- For ADHD -->
					<article
						class="rounded-3xl border border-border bg-card shadow-ink tx tx-bloom tx-weak ink-frame p-6"
					>
						<h3 class="text-xl font-semibold mb-3 text-foreground">ADHD Minds</h3>
						<p class="text-muted-foreground mb-4">
							<strong class="text-foreground"
								>Your brain isn't broken. Your tools are.</strong
							> Traditional productivity tools demand linear thinking. Your brain doesn't
							work that way. BuildOS gets it.
						</p>
						<ul class="text-sm text-muted-foreground space-y-2">
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Dump thoughts in any order</span>
							</li>
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>AI finds the structure</span>
							</li>
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Tiny next steps, not overwhelming lists</span>
							</li>
						</ul>
					</article>

					<!-- For Overwhelmed Professionals -->
					<article
						class="rounded-3xl border border-border bg-card shadow-ink tx tx-grain tx-weak ink-frame p-6"
					>
						<h3 class="text-xl font-semibold mb-3 text-foreground">
							Overwhelmed Professionals
						</h3>
						<p class="text-muted-foreground mb-4">
							<strong class="text-foreground">From drowning to directing.</strong> When
							everything feels urgent, nothing is clear. BuildOS turns your mental chaos
							into a command center.
						</p>
						<ul class="text-sm text-muted-foreground space-y-2">
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Post-meeting brain dumps</span>
							</li>
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>All projects in one place</span>
							</li>
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Know exactly what to tackle next</span>
							</li>
						</ul>
					</article>

					<!-- For Students & Creators -->
					<article
						class="rounded-3xl border border-border bg-card shadow-ink tx tx-pulse tx-weak ink-frame p-6"
					>
						<h3 class="text-xl font-semibold mb-3 text-foreground">
							Students & Creators
						</h3>
						<p class="text-muted-foreground mb-4">
							<strong class="text-foreground"
								>Chaos to dean's list (or ship list).</strong
							> Stop losing brilliant ideas to the void. Capture everything, organize instantly,
							actually finish projects.
						</p>
						<ul class="text-sm text-muted-foreground space-y-2">
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Semester panic → study plan</span>
							</li>
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Creative sparks → content calendar</span>
							</li>
							<li class="flex items-start">
								<span class="text-accent mr-2 font-bold">✓</span>
								<span>Ideas → execution</span>
							</li>
						</ul>
					</article>
				</div>
			</div>
		</section>

		<!-- Trust & Objections Section -->
		<section class="py-20 bg-background border-b border-border" aria-labelledby="trust-heading">
			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2 id="trust-heading" class="text-3xl font-bold text-center mb-12 text-foreground">
					Built by someone who struggled with chaos and needed better
				</h2>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div
						class="rounded-2xl border border-border bg-card tx tx-thread tx-weak p-6 shadow-ink ink-frame"
					>
						<h3 class="font-semibold text-lg mb-2 text-foreground">🧠 No Shame Zone</h3>
						<p class="text-muted-foreground">
							We know you've abandoned Notion 6 times. BuildOS works even on your
							worst days. No complex setup. No maintenance guilt.
						</p>
					</div>

					<div
						class="rounded-2xl border border-border bg-card tx tx-thread tx-weak p-6 shadow-ink ink-frame"
					>
						<h3 class="font-semibold text-lg mb-2 text-foreground">
							⚡ 60-Second Clarity
						</h3>
						<p class="text-muted-foreground">
							From brain dump to organized projects in literally one minute. Voice,
							text, paste—however your thoughts come out.
						</p>
					</div>

					<div
						class="rounded-2xl border border-border bg-card tx tx-thread tx-weak p-6 shadow-ink ink-frame"
					>
						<h3 class="font-semibold text-lg mb-2 text-foreground">
							📍 Your Home Base
						</h3>
						<p class="text-muted-foreground">
							Not another app to manage. This is where all your scattered thoughts
							finally come together. Users call it their "external brain."
						</p>
					</div>

					<div
						class="rounded-2xl border border-border bg-card tx tx-thread tx-weak p-6 shadow-ink ink-frame"
					>
						<h3 class="font-semibold text-lg mb-2 text-foreground">
							🎯 Progress, Not Perfection
						</h3>
						<p class="text-muted-foreground">
							Celebrate tiny wins. One task done > perfect system abandoned. BuildOS
							keeps you moving forward, not organizing forever.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Three Pillars -->
		<section class="py-20 bg-muted border-b border-border" aria-labelledby="pillars-heading">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2
					id="pillars-heading"
					class="text-3xl font-bold text-center mb-12 text-foreground"
				>
					Brain dump. See structure. Take action.
				</h2>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
					<!-- Talk It Out -->
					<article class="text-center fade-in">
						<div
							class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border bg-card shadow-ink tx tx-bloom tx-weak ink-frame"
						>
							<CircleCheck class="w-8 h-8 text-foreground" aria-hidden="true" />
						</div>
						<h3 class="text-xl font-semibold mb-3 text-foreground">Talk It Out</h3>
						<p class="text-muted-foreground leading-relaxed">
							<strong class="text-foreground">Your thoughts, any format.</strong> Voice
							ramble at 2am? Frantic typing after a meeting? Copy-paste from everywhere?
							BuildOS handles it all. No formatting. No structure needed. Just dump.
						</p>
					</article>

					<!-- AI Organization -->
					<article class="text-center fade-in delay-200">
						<div
							class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border bg-card shadow-ink tx tx-grain tx-weak ink-frame"
						>
							<Zap class="w-8 h-8 text-foreground" aria-hidden="true" />
						</div>
						<h3 class="text-xl font-semibold mb-3 text-foreground">AI Organization</h3>
						<p class="text-muted-foreground leading-relaxed">
							<strong class="text-foreground">Instant clarity from chaos.</strong> Watch
							your word vomit transform into clear projects with phases. Every task extracted.
							Ideas parked for later. Context that builds over time.
						</p>
					</article>

					<!-- One-Click Execution -->
					<article class="text-center fade-in delay-400">
						<div
							class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border bg-card shadow-ink tx tx-pulse tx-weak ink-frame"
						>
							<Calendar class="w-8 h-8 text-foreground" aria-hidden="true" />
						</div>
						<h3 class="text-xl font-semibold mb-3 text-foreground">
							One-Click Execution
						</h3>
						<p class="text-muted-foreground leading-relaxed">
							<strong class="text-foreground">From "I should" to "I did".</strong> See
							your next step. Click to schedule. Get daily briefs that actually help. Stop
							planning. Start doing.
						</p>
					</article>
				</div>
			</div>
		</section>

		<!-- Final CTA -->
		<section
			class="relative my-6 py-20 bg-card border border-border rounded-3xl mx-4 tx tx-frame tx-weak shadow-ink-strong overflow-hidden"
			aria-labelledby="cta-heading"
		>
			<!-- Subtle halftone accent in corner -->
			<div
				class="absolute -top-20 -right-20 w-64 h-64 cta-halftone-accent opacity-30 pointer-events-none"
				aria-hidden="true"
			></div>

			<div class="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
				<h2
					id="cta-heading"
					class="text-2xl sm:text-3xl font-black mb-6 text-foreground tracking-tight"
				>
					Your scattered thoughts are not the problem.
					{#if innerWidth > 600}
						<br />
					{/if}
					They're potential waiting to be organized.
				</h2>
				<p class="text-lg sm:text-xl text-muted-foreground mb-4 mt-8 leading-relaxed">
					You've tried the complex systems. You've abandoned the perfect planners.
				</p>
				<p class="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed">
					What if the tools were wrong, not you?
				</p>
				<p class="text-base sm:text-lg text-foreground mb-8 leading-relaxed font-semibold">
					BuildOS is your home base. The one place where your chaos becomes clarity.
				</p>
				<div class="flex flex-col items-center gap-4">
					<a
						href="/auth/register"
						aria-label="Start your free trial with BuildOS"
						class="group"
					>
						<button
							class="pressable rounded-full bg-accent px-8 py-3.5 text-lg font-bold text-accent-foreground shadow-ink-strong border-2 border-transparent hover:border-foreground/20 transition-all duration-200 group-hover:scale-[1.02]"
						>
							Find Your Home Base
							<span
								class="inline-block ml-1 transition-transform duration-200 group-hover:translate-x-1"
								>→</span
							>
						</button>
					</a>
					<p
						class="text-sm text-muted-foreground inline-flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-5 py-2.5 rounded-full border border-border bg-background/80 backdrop-blur-sm shadow-ink"
					>
						<span>Join 500+ scattered minds who finally stick with their system</span>
						<span class="hidden sm:inline text-border">•</span>
						<span class="text-xs sm:text-sm">14 days free • Cancel anytime</span>
					</p>
				</div>
			</div>
		</section>
	</div>
{/if}

<style>
	/* Hero section halftone background */
	.hero-halftone-bg {
		background-image: radial-gradient(
			circle at 30% 20%,
			hsl(var(--accent) / 0.04) 1px,
			transparent 1px
		);
		background-size: 24px 24px;
		mask-image: radial-gradient(
			ellipse 80% 60% at 50% 0%,
			rgba(0, 0, 0, 0.5) 0%,
			transparent 70%
		);
		-webkit-mask-image: radial-gradient(
			ellipse 80% 60% at 50% 0%,
			rgba(0, 0, 0, 0.5) 0%,
			transparent 70%
		);
	}

	:global(.dark) .hero-halftone-bg {
		background-image: radial-gradient(
			circle at 30% 20%,
			hsl(var(--accent) / 0.06) 1px,
			transparent 1px
		);
	}

	/* Hero highlight with halftone texture */
	.hero-highlight {
		background-image: radial-gradient(
			circle at center,
			hsl(var(--accent) / 0.15) 1px,
			transparent 1px
		);
		background-size: 4px 4px;
		background-color: hsl(var(--accent) / 0.15);
	}

	/* CTA section corner halftone */
	.cta-halftone-accent {
		background-image: radial-gradient(
			circle at center,
			hsl(var(--accent) / 0.4) 2px,
			transparent 2px
		);
		background-size: 8px 8px;
		border-radius: 50%;
		filter: blur(1px);
	}

	:global(.dark) .cta-halftone-accent {
		background-image: radial-gradient(
			circle at center,
			hsl(var(--accent) / 0.5) 2px,
			transparent 2px
		);
	}

	/* Fade in animation for landing page elements */
	.fade-in {
		animation: fadeInUp 0.6s ease-out forwards;
	}

	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
