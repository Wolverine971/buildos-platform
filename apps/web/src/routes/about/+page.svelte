<!-- apps/web/src/routes/about/+page.svelte -->
<script lang="ts">
	import {
		Brain,
		Calendar,
		MessageSquare,
		Zap,
		Users,
		MessageCircle,
		Coffee
	} from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
		DEFAULT_ORGANIZATION_SOCIAL_PROFILES
	} from '$lib/constants/seo';
	import { onMount } from 'svelte';

	let prefersReducedMotion = $state(false);

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		// Listen for changes
		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mediaQuery.addEventListener('change', handleChange);

		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

<SEOHead
	title="About BuildOS — Turn scattered thinking into structured work"
	description="BuildOS is a founder-led AI productivity system that turns scattered notes, conversations, and project fragments into structured context, daily briefs, and better next actions."
	canonical="https://build-os.com/about"
	keywords="BuildOS story, DJ Wayne, AI productivity tool, project context, context building, productivity chaos solution, LLM integration"
	author="DJ Wayne"
	twitterCreator="@djwayne3"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': DEFAULT_ORGANIZATION_ID,
		name: 'BuildOS',
		url: 'https://build-os.com',
		logo: DEFAULT_ORGANIZATION_LOGO_IMAGE,
		description:
			'AI-powered productivity platform that transforms unstructured thoughts into actionable plans.',
		foundingDate: '2025-11-01',
		founder: {
			'@type': 'Person',
			name: 'DJ Wayne',
			jobTitle: 'Founder & CEO',
			description:
				'Former USMC Scout Sniper turned software engineer with 8 years of experience building software.',
			sameAs: ['https://twitter.com/djwayne3']
		},
		sameAs: DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		contactPoint: {
			'@type': 'ContactPoint',
			email: 'dj@build-os.com',
			contactType: 'customer service'
		},
		address: {
			'@type': 'PostalAddress',
			addressLocality: 'Glen Burnie',
			addressRegion: 'Maryland',
			addressCountry: 'US'
		}
	}}
/>

<main class="min-h-screen bg-background">
	<!-- Hero Section - Mode B: Orientation Surface -->
	<section class="bg-muted atmo atmo-med rim-accent">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 lg:py-16">
			<header class="text-center sp-focus">
				<div class="flex justify-center mb-5">
					<div
						class="w-20 h-20 flex items-center justify-center tx tx-bloom tx-weak wt-card"
					>
						<video
							src="/onboarding-assets/animations/brain-bolt-electric.mp4"
							class="w-16 h-16"
							autoplay={!prefersReducedMotion}
							loop
							muted
							playsinline
							aria-hidden="true"
						></video>
					</div>
				</div>

				<p class="text-xs sm:text-sm font-semibold text-accent mb-3">
					A thinking environment for complex work
				</p>
				<h1
					class="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 max-w-4xl mx-auto text-pretty"
				>
					Scattered context is killing your best work.
				</h1>
				<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
					BuildOS turns messy notes, AI conversations, project fragments, and calendar
					pressure into structured context you can act on.
				</p>

				<div class="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
					<a
						href="/beta"
						class="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						aria-label="Join the BuildOS beta program"
					>
						<Users class="w-4 h-4" aria-hidden="true" />
						Join the beta
					</a>
					<a
						href="#founder-story"
						class="inline-flex min-h-11 w-full sm:w-auto items-center justify-center rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						Read the story
					</a>
				</div>

				<p class="mt-5 text-xs sm:text-sm text-muted-foreground max-w-2xl mx-auto">
					Built by DJ Wayne, a former USMC Scout Sniper and software engineer who kept
					rebuilding the same project context for Claude and ChatGPT.
				</p>
			</header>
		</div>
	</section>

	<!-- Before / After -->
	<section class="py-10 sm:py-12 bg-background" aria-labelledby="problem-heading">
		<div class="max-w-5xl mx-auto px-4 sm:px-6">
			<header class="text-center mb-6">
				<h2
					id="problem-heading"
					class="text-2xl sm:text-3xl font-bold text-foreground mb-2"
				>
					From scattered context to structured action
				</h2>
				<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
					The problem is not a lack of tools. It is the drag of keeping every tool,
					thought, and AI assistant pointed at the same truth.
				</p>
			</header>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<article class="p-5 sm:p-6 tx tx-static tx-weak wt-card sp-block">
					<p class="text-xs font-semibold text-accent mb-2">Before BuildOS</p>
					<h3 class="text-lg font-bold text-foreground mb-3">
						Your work keeps resetting
					</h3>
					<ul class="space-y-2 text-sm text-muted-foreground" role="list">
						<li class="flex items-start gap-2">
							<span
								class="w-1.5 h-1.5 bg-accent rounded-full mt-2 shrink-0"
								aria-hidden="true"
							></span>
							<p>
								Notes live in Notion, Obsidian, Google Docs, Apple Notes, and
								notebooks.
							</p>
						</li>
						<li class="flex items-start gap-2">
							<span
								class="w-1.5 h-1.5 bg-accent rounded-full mt-2 shrink-0"
								aria-hidden="true"
							></span>
							<p>
								AI conversations start over because the useful context is scattered.
							</p>
						</li>
						<li class="flex items-start gap-2">
							<span
								class="w-1.5 h-1.5 bg-accent rounded-full mt-2 shrink-0"
								aria-hidden="true"
							></span>
							<p>Momentum leaks away while you reconstruct what already happened.</p>
						</li>
					</ul>
				</article>

				<article class="p-5 sm:p-6 tx tx-thread tx-weak wt-card sp-block">
					<p class="text-xs font-semibold text-accent mb-2">With BuildOS</p>
					<h3 class="text-lg font-bold text-foreground mb-3">Your context compounds</h3>
					<ul class="space-y-2 text-sm text-muted-foreground" role="list">
						<li class="flex items-start gap-2">
							<span
								class="w-1.5 h-1.5 bg-accent rounded-full mt-2 shrink-0"
								aria-hidden="true"
							></span>
							<p>
								Talk through the messy version and let AI turn it into project
								structure.
							</p>
						</li>
						<li class="flex items-start gap-2">
							<span
								class="w-1.5 h-1.5 bg-accent rounded-full mt-2 shrink-0"
								aria-hidden="true"
							></span>
							<p>Keep reusable project context ready for better AI collaboration.</p>
						</li>
						<li class="flex items-start gap-2">
							<span
								class="w-1.5 h-1.5 bg-accent rounded-full mt-2 shrink-0"
								aria-hidden="true"
							></span>
							<p>
								Use daily briefs and calendar-aware planning to protect the next
								action.
							</p>
						</li>
					</ul>
				</article>
			</div>
		</div>
	</section>

	<!-- How BuildOS Works -->
	<section class="py-10 sm:py-12 bg-muted" aria-labelledby="how-it-works-heading">
		<div class="max-w-5xl mx-auto px-4 sm:px-6">
			<header class="text-center mb-7">
				<h2
					id="how-it-works-heading"
					class="text-2xl sm:text-3xl font-bold text-foreground mb-2"
				>
					How BuildOS works
				</h2>
				<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
					Capture the raw material, build the project context, and come back to a clearer
					next step.
				</p>
			</header>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-3 mx-auto tx tx-bloom tx-weak wt-paper"
					>
						<Brain class="w-6 h-6 sm:w-7 sm:h-7 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Capture raw thoughts
					</h3>
					<p class="text-sm text-muted-foreground">
						Drop in the unpolished version before structure exists.
					</p>
				</article>

				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-3 mx-auto wt-paper"
					>
						<Zap class="w-6 h-6 sm:w-7 sm:h-7 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Let AI organize it
					</h3>
					<p class="text-sm text-muted-foreground">
						Turn notes into projects, tasks, decisions, and open questions.
					</p>
				</article>

				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-3 mx-auto wt-paper"
					>
						<MessageSquare
							class="w-6 h-6 sm:w-7 sm:h-7 text-foreground"
							aria-hidden="true"
						/>
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Review the brief
					</h3>
					<p class="text-sm text-muted-foreground">
						See what matters today without rebuilding the whole picture.
					</p>
				</article>

				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-3 mx-auto wt-paper"
					>
						<Calendar
							class="w-6 h-6 sm:w-7 sm:h-7 text-foreground"
							aria-hidden="true"
						/>
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Protect time
					</h3>
					<p class="text-sm text-muted-foreground">
						Move from organized context to scheduled work.
					</p>
				</article>
			</div>

			<div class="mt-8 p-5 sm:p-6 tx tx-thread tx-weak wt-card sp-block">
				<h3 class="text-base sm:text-lg font-semibold text-foreground mb-2 text-center">
					The real product is reusable context
				</h3>
				<p class="text-sm sm:text-base text-muted-foreground text-center max-w-2xl mx-auto">
					BuildOS gives you the project memory you need to ask an AI assistant to iterate,
					critique, plan, or unblock the work without explaining everything again.
				</p>
			</div>
		</div>
	</section>

	<!-- Founder Story -->
	<section
		id="founder-story"
		class="py-10 sm:py-12 bg-background"
		aria-labelledby="founder-heading"
	>
		<div class="max-w-5xl mx-auto px-4 sm:px-6">
			<header class="text-center mb-8">
				<h2
					id="founder-heading"
					class="text-2xl sm:text-3xl font-bold text-foreground mb-2"
				>
					Why BuildOS exists
				</h2>
				<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
					BuildOS started with a problem every builder runs into — context that falls
					apart the moment you need it most.
				</p>
			</header>

			<div class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
				<aside class="sp-inline">
					<div class="flex justify-center lg:justify-start mb-4">
						<img
							src="/s-dj-wayne-profile.webp"
							alt="DJ Wayne, founder of BuildOS"
							class="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover shadow-ink-strong border-2 border-border"
							width="128"
							height="128"
							loading="lazy"
						/>
					</div>
					<div class="text-center lg:text-left space-y-1.5 text-sm text-muted-foreground">
						<h3 class="text-lg sm:text-xl font-bold text-foreground">DJ Wayne</h3>
						<p class="font-medium text-foreground">Founder of BuildOS</p>
						<p>Former USMC Scout Sniper</p>
						<p>8 years building software</p>
						<p>YC-backed startup experience at Curri</p>
					</div>
				</aside>

				<div class="space-y-5">
					<article class="space-y-2">
						<h3 class="text-base sm:text-lg font-semibold text-foreground">
							When your best work keeps resetting
						</h3>
						<p class="text-sm sm:text-base leading-7 text-muted-foreground">
							I was juggling BuildOS, 9takes.com, client work, family life, and a pile
							of half-structured ideas. The context was everywhere: Notion, Obsidian,
							Google Docs, Moleskines, Apple Notes, and random text files.
						</p>
					</article>

					<article class="space-y-2">
						<h3 class="text-base sm:text-lg font-semibold text-foreground">
							When AI can't remember your project
						</h3>
						<p class="text-sm sm:text-base leading-7 text-muted-foreground">
							Claude and ChatGPT were useful, but only after I rebuilt the same
							project background over and over. The better the work became, the more
							painful it was to keep the context alive.
						</p>
					</article>

					<article class="space-y-2">
						<h3 class="text-base sm:text-lg font-semibold text-foreground">
							The proof: BuildOS builds BuildOS
						</h3>
						<p class="text-sm sm:text-base leading-7 text-muted-foreground">
							BuildOS is now what I use to build BuildOS. It helps me capture the
							messy version, preserve project memory, and come back to the next useful
							action without starting from zero.
						</p>
					</article>
				</div>
			</div>

			<div class="mt-8 p-5 sm:p-6 tx tx-frame tx-weak wt-card sp-block">
				<blockquote class="text-center">
					<p class="text-base sm:text-lg leading-7 text-muted-foreground italic mb-3">
						"I believe humans are nowhere near as productive as we could be. We have
						incredible tools, but we're still stuck rebuilding context instead of doing
						the work."
					</p>
					<footer class="text-sm text-muted-foreground">
						<cite>- DJ Wayne, Founder</cite>
					</footer>
				</blockquote>
			</div>
		</div>
	</section>

	<!-- Current Status -->
	<section class="py-10 sm:py-12 bg-muted" aria-labelledby="status-heading">
		<div class="max-w-5xl mx-auto px-4 sm:px-6">
			<header class="text-center mb-6">
				<h2 id="status-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
					Where BuildOS is now
				</h2>
				<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
					The product is still early, which is exactly when the right users can shape it.
				</p>
			</header>

			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<article class="p-5 text-center wt-paper sp-inline">
					<div
						class="text-2xl sm:text-3xl font-bold text-accent mb-1"
						aria-label="MVP phase"
					>
						MVP
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Building phase
					</h3>
					<p class="text-sm text-muted-foreground">Core capture and AI organization.</p>
				</article>

				<article class="p-5 text-center wt-paper sp-inline">
					<div
						class="text-2xl sm:text-3xl font-bold text-accent mb-1"
						aria-label="July 2026 beta launch"
					>
						July 2026
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Beta launch
					</h3>
					<p class="text-sm text-muted-foreground">
						Early access for users who want to shape the product.
					</p>
				</article>

				<article class="p-5 text-center wt-paper sp-inline">
					<div
						class="text-2xl sm:text-3xl font-bold text-accent mb-1"
						aria-label="Solo founder"
					>
						1
					</div>
					<h3 class="text-sm sm:text-base font-semibold text-foreground mb-1">
						Solo founder
					</h3>
					<p class="text-sm text-muted-foreground">
						Bootstrapped and focused on real workflow pain.
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- Join Us -->
	<section class="py-10 sm:py-12 bg-background" aria-labelledby="join-heading">
		<div class="max-w-4xl mx-auto text-center px-4 sm:px-6">
			<header class="mb-6">
				<h2 id="join-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
					Help shape the beta
				</h2>
				<p class="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
					Join early if your best ideas are scattered across tools and you want AI to help
					turn them into organized action.
				</p>
			</header>

			<nav
				class="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
				aria-label="Action links"
			>
				<a
					href="/beta"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label="Join the BuildOS beta program"
				>
					<Users class="w-4 h-4" aria-hidden="true" />
					Join beta
				</a>
				<a
					href="/contact"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:border-accent hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label="Contact the BuildOS team"
				>
					<MessageCircle class="w-4 h-4" aria-hidden="true" />
					Contact DJ
				</a>
				<a
					href="/investors"
					class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label="Learn about investment opportunities with BuildOS"
				>
					<Coffee class="w-4 h-4" aria-hidden="true" />
					Investor info
				</a>
			</nav>
		</div>
	</section>
</main>
