<!-- apps/web/src/routes/+page.svelte -->
<script lang="ts">
	import { CheckCircle2, Calendar, Zap } from 'lucide-svelte';
	import './dashboard.css';
	import type { User } from '$lib/types/dashboard';
	import type { DashboardData } from '$lib/services/dashboardData.service';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { toastService } from '$lib/stores/toast.store';
	import { invalidateAll, replaceState } from '$app/navigation';
	import BuildOSFlow from '$lib/components/dashboard/BuildOSFlow.svelte';
	import Button from '$components/ui/Button.svelte';

	let { data } = $props();

	// Svelte 5 runes: Convert reactive declarations to $derived
	function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
		return !!value && typeof (value as PromiseLike<T>).then === 'function';
	}

	function getErrorMessage(error: unknown, fallback: string): string {
		if (error instanceof Error && error.message) return error.message;
		if (typeof error === 'string' && error.length > 0) return error;
		return fallback;
	}

	let isAuthenticated = $derived(!!data?.user);
	let user = $derived(data?.user as User | null);

	let dashboardStreamVersion = 0;
	let dashboardDataState = $state<DashboardData | null>(
		isPromiseLike<DashboardData>(data.dashboardData)
			? null
			: ((data.dashboardData as DashboardData | null) ?? null)
	);
	let dashboardErrorState = $state<string | null>(data.dashboardError ?? null);
	let dashboardLoadingState = $state<boolean>(
		Boolean(data.dashboardLoading) || isPromiseLike<DashboardData>(data.dashboardData)
	);

	$effect(() => {
		const incoming = data.dashboardData;
		const incomingError = data.dashboardError ?? null;
		const incomingLoading = Boolean(data.dashboardLoading);
		const currentVersion = ++dashboardStreamVersion;

		if (isPromiseLike<DashboardData>(incoming)) {
			dashboardLoadingState = true;

			incoming
				.then((result) => {
					if (currentVersion !== dashboardStreamVersion) return;
					dashboardDataState = (result as DashboardData) ?? null;
					dashboardErrorState = incomingError;
					dashboardLoadingState = incomingLoading;
				})
				.catch((error) => {
					if (currentVersion !== dashboardStreamVersion) return;
					dashboardDataState = null;
					dashboardErrorState = getErrorMessage(error, 'Failed to load dashboard data');
					dashboardLoadingState = false;
				});

			return;
		}

		dashboardDataState = (incoming as DashboardData | null) ?? null;
		dashboardErrorState = incomingError;
		dashboardLoadingState = incomingLoading;
	});

	let dashboardData = $derived(dashboardDataState);
	let dashboardError = $derived(dashboardErrorState);
	let isLoadingDashboard = $derived(dashboardLoadingState);

	let innerWidth = $state<number | 0>(0);

	// Lazy load Dashboard component only when needed
	let Dashboard = $state<any>(null);

	// Svelte 5 runes: Use $effect instead of reactive statement for side effects
	$effect(() => {
		if (isAuthenticated && !Dashboard && browser) {
			import('$lib/components/dashboard/Dashboard.svelte').then((module) => {
				Dashboard = module.default;
			});
		}
	});

	let heroVideoLoaded = false;

	function handleHeroVideoLoad() {
		heroVideoLoaded = true;
	}

	// Reload dashboard data when needed
	async function handleDashboardRefresh() {
		// Invalidate all data to trigger a reload
		await invalidateAll();
	}

	// Handle any messages on mount
	onMount(() => {
		const message = $page.url.searchParams.get('message');
		const urlError = $page.url.searchParams.get('error');

		if (message) {
			toastService.success(message);
			// Clean up URL
			const url = new URL($page.url);
			url.searchParams.delete('message');
			replaceState(url.toString(), {});
		}

		if (urlError) {
			toastService.error(urlError);
			// Clean up URL
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
			initialData={dashboardData}
			{isLoadingDashboard}
			{dashboardError}
			onrefresh={handleDashboardRefresh}
		/>
	{:else}
		<!-- PERFORMANCE: Lightweight loading state with better UX -->
		<div
			class="min-h-screen bg-surface-scratch dark:bg-slate-900 text-slate-900 dark:text-slate-100"
			aria-busy="true"
		>
			<div class="flex items-center justify-center min-h-screen">
				<div class="text-center">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"
						role="status"
						aria-label="Loading dashboard"
					></div>
					<p class="text-slate-600 dark:text-slate-400">Preparing dashboard...</p>
				</div>
			</div>
		</div>
	{/if}
{:else}
	<!-- PERFORMANCE: Optimized landing page with better loading -->
	<div
		class="min-h-screen bg-surface-scratch dark:bg-slate-900 text-slate-900 dark:text-slate-100"
	>
		<!-- Hero Section -->
		<section class="relative industrial-panel" aria-label="Hero section">
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
				<div class="text-center mb-12">
					<!-- Video Icon Container (keep existing) -->
					<div class="flex justify-center mb-8">
						<!-- ... existing video code ... -->
					</div>

					<div class="relative z-10 max-w-4xl mx-auto text-center flex flex-col">
						<!-- Tagline with industrial styling -->
						<h1
							class="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight fade-in text-slate-900 dark:text-slate-100"
						>
							Project organization built <br />for
							<span class="text-[var(--accent-orange)]">the AI era.</span>
						</h1>

						<!-- Subtitle -->
						<p
							class="text-xl text-slate-700 dark:text-slate-300 mb-8 max-w-2xl mx-auto fade-in leading-relaxed"
						>
							Your thoughts, organized.<br class="hidden sm:block" />
							Your next step, clear.
						</p>

						<!-- CTA with tactile button -->
						<p class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
							Ready for BuildOS to help you organize your projects?
						</p>
						<a href="/auth/register" aria-label="Start working with BuildOS">
							<button class="btn-tactile px-8 py-3 text-lg">
								Start Brain Dumping →
							</button>
						</a>

						<!-- Trust Signal -->
						<p
							class="text-sm text-slate-600 dark:text-slate-400 mt-6 fade-in badge-draft inline-block m-auto"
						>
							14-day free trial • No credit card • Actually built for ADHD
						</p>
					</div>
				</div>
			</div>
		</section>

		<BuildOSFlow />

		<!-- Who It's For Section -->
		<section
			class="py-20 bg-[var(--surface-panel)] noise-overlay"
			aria-labelledby="audience-heading"
		>
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2
					id="audience-heading"
					class="text-3xl font-bold text-center mb-12 text-slate-900 dark:text-slate-100"
				>
					Finally, a home base for scattered minds
				</h2>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-8 workbench-grid">
					<!-- For ADHD -->
					<article class="card-industrial p-6 dither-soft relative">
						<h3 class="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-100">
							ADHD Minds
						</h3>
						<p class="text-slate-700 dark:text-slate-300 mb-4">
							<strong>Your brain isn't broken. Your tools are.</strong> Traditional productivity
							tools demand linear thinking. Your brain doesn't work that way. BuildOS gets
							it.
						</p>
						<ul class="text-sm text-slate-600 dark:text-slate-400 space-y-2">
							<li class="flex items-start">
								<span class="text-[var(--accent-blue)] mr-2 font-bold">✓</span>
								<span>Dump thoughts in any order</span>
							</li>
							<li class="flex items-start">
								<span class="text-[var(--accent-blue)] mr-2 font-bold">✓</span>
								<span>AI finds the structure</span>
							</li>
							<li class="flex items-start">
								<span class="text-[var(--accent-blue)] mr-2 font-bold">✓</span>
								<span>Tiny next steps, not overwhelming lists</span>
							</li>
						</ul>
					</article>

					<!-- For Overwhelmed Professionals -->
					<article class="card-industrial p-6 dither-soft relative">
						<h3 class="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-100">
							Overwhelmed Professionals
						</h3>
						<p class="text-slate-700 dark:text-slate-300 mb-4">
							<strong>From drowning to directing.</strong> When everything feels urgent,
							nothing is clear. BuildOS turns your mental chaos into a command center.
						</p>
						<ul class="text-sm text-slate-600 dark:text-slate-400 space-y-2">
							<li class="flex items-start">
								<span class="text-[var(--accent-olive)] mr-2 font-bold">✓</span>
								<span>Post-meeting brain dumps</span>
							</li>
							<li class="flex items-start">
								<span class="text-[var(--accent-olive)] mr-2 font-bold">✓</span>
								<span>All projects in one place</span>
							</li>
							<li class="flex items-start">
								<span class="text-[var(--accent-olive)] mr-2 font-bold">✓</span>
								<span>Know exactly what to tackle next</span>
							</li>
						</ul>
					</article>

					<!-- For Students & Creators -->
					<article class="card-industrial p-6 dither-soft relative">
						<h3 class="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-100">
							Students & Creators
						</h3>
						<p class="text-slate-700 dark:text-slate-300 mb-4">
							<strong>Chaos to dean's list (or ship list).</strong> Stop losing brilliant
							ideas to the void. Capture everything, organize instantly, actually finish
							projects.
						</p>
						<ul class="text-sm text-slate-600 dark:text-slate-400 space-y-2">
							<li class="flex items-start">
								<span class="text-[var(--accent-orange)] mr-2 font-bold">✓</span>
								<span>Semester panic → study plan</span>
							</li>
							<li class="flex items-start">
								<span class="text-[var(--accent-orange)] mr-2 font-bold">✓</span>
								<span>Creative sparks → content calendar</span>
							</li>
							<li class="flex items-start">
								<span class="text-[var(--accent-orange)] mr-2 font-bold">✓</span>
								<span>Ideas → execution</span>
							</li>
						</ul>
					</article>
				</div>
			</div>
		</section>

		<!-- Trust & Objections Section -->
		<section
			class="py-20 bg-[var(--surface-scratch)] dither-pattern"
			aria-labelledby="trust-heading"
		>
			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2
					id="trust-heading"
					class="text-3xl font-bold text-center mb-12 text-slate-900 dark:text-slate-100"
				>
					Built by someone who struggled with chaos and needed better
				</h2>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div class="clarity-zone p-6">
						<h3 class="font-semibold text-lg mb-2 text-slate-900 dark:text-slate-100">
							🧠 No Shame Zone
						</h3>
						<p class="text-slate-700 dark:text-slate-300">
							We know you've abandoned Notion 6 times. BuildOS works even on your
							worst days. No complex setup. No maintenance guilt.
						</p>
					</div>

					<div class="clarity-zone p-6">
						<h3 class="font-semibold text-lg mb-2 text-slate-900 dark:text-slate-100">
							⚡ 60-Second Clarity
						</h3>
						<p class="text-slate-700 dark:text-slate-300">
							From brain dump to organized projects in literally one minute. Voice,
							text, paste—however your thoughts come out.
						</p>
					</div>

					<div class="clarity-zone p-6">
						<h3 class="font-semibold text-lg mb-2 text-slate-900 dark:text-slate-100">
							📍 Your Home Base
						</h3>
						<p class="text-slate-700 dark:text-slate-300">
							Not another app to manage. This is where all your scattered thoughts
							finally come together. Users call it their "external brain."
						</p>
					</div>

					<div class="clarity-zone p-6">
						<h3 class="font-semibold text-lg mb-2 text-slate-900 dark:text-slate-100">
							🎯 Progress, Not Perfection
						</h3>
						<p class="text-slate-700 dark:text-slate-300">
							Celebrate tiny wins. One task done > perfect system abandoned. BuildOS
							keeps you moving forward, not organizing forever.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Three Pillars -->
		<section
			class="py-20 bg-[var(--surface-panel)] noise-overlay"
			aria-labelledby="pillars-heading"
		>
			<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<h2
					id="pillars-heading"
					class="text-3xl font-bold text-center mb-12 text-slate-900 dark:text-slate-100"
				>
					Brain dump. See structure. Take action.
				</h2>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
					<!-- Talk It Out -->
					<article class="text-center fade-in">
						<div
							class="utility-block w-16 h-16 rounded-sm flex items-center justify-center mx-auto mb-4 float-animation"
						>
							<CheckCircle2
								class="w-8 h-8 text-gray-700 dark:text-gray-200"
								aria-hidden="true"
							/>
						</div>
						<h3 class="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-100">
							Talk It Out
						</h3>
						<p class="text-slate-700 dark:text-slate-300 leading-relaxed">
							<strong>Your thoughts, any format.</strong> Voice ramble at 2am? Frantic
							typing after a meeting? Copy-paste from everywhere? BuildOS handles it all.
							No formatting. No structure needed. Just dump.
						</p>
					</article>

					<!-- AI Organization -->
					<article class="text-center fade-in delay-200">
						<div
							class="utility-block w-16 h-16 rounded-sm flex items-center justify-center mx-auto mb-4 float-animation delay-2000"
						>
							<Zap
								class="w-8 h-8 text-gray-700 dark:text-gray-200"
								aria-hidden="true"
							/>
						</div>
						<h3 class="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-100">
							AI Organization
						</h3>
						<p class="text-slate-700 dark:text-slate-300 leading-relaxed">
							<strong>Instant clarity from chaos.</strong> Watch your word vomit transform
							into clear projects with phases. Every task extracted. Ideas parked for later.
							Context that builds over time.
						</p>
					</article>

					<!-- One-Click Execution -->
					<article class="text-center fade-in delay-400">
						<div
							class="utility-block w-16 h-16 rounded-sm flex items-center justify-center mx-auto mb-4 float-animation delay-4000"
						>
							<Calendar
								class="w-8 h-8 text-gray-700 dark:text-gray-200"
								aria-hidden="true"
							/>
						</div>
						<h3 class="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-100">
							One-Click Execution
						</h3>
						<p class="text-slate-700 dark:text-slate-300 leading-relaxed">
							<strong>From "I should" to "I did".</strong> See your next step. Click to
							schedule. Get daily briefs that actually help. Stop planning. Start doing.
						</p>
					</article>
				</div>
			</div>
		</section>

		<!-- Final CTA -->
		<section
			class="relative my-6 py-20 industrial-panel grain-animate"
			aria-labelledby="cta-heading"
		>
			<div class="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
				<h2
					id="cta-heading"
					class="text-3xl font-bold mb-6 text-slate-900 dark:text-slate-100"
				>
					Your scattered thoughts are not the problem.
					{#if innerWidth > 600}
						<br />
					{/if}
					They're potential waiting to be organized.
				</h2>
				<p class="text-xl text-slate-700 dark:text-slate-300 mb-4 mt-8 leading-relaxed">
					You've tried the complex systems. You've abandoned the perfect planners.
				</p>
				<p class="text-xl text-slate-700 dark:text-slate-300 mb-8 leading-relaxed">
					What if the tools were wrong, not you?
				</p>
				<p
					class="text-lg text-slate-700 dark:text-slate-300 mb-8 leading-relaxed font-semibold"
				>
					BuildOS is your home base. The one place where your chaos becomes clarity.
				</p>
				<div class="space-y-4">
					<a href="/auth/register" aria-label="Start your free trial with BuildOS">
						<button class="btn-tactile px-8 py-3 text-lg">
							Find Your Home Base →
						</button>
					</a>
					<p class="text-sm text-slate-600 dark:text-slate-400 badge-draft inline-block">
						Join 500+ scattered minds who finally stick with their system<br />
						14 days free • Cancel anytime • No shame in trying
					</p>
				</div>
			</div>
		</section>
	</div>
{/if}
