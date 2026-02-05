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
	title="About BuildOS - AI-Powered Brain Dump Organization | DJ Wayne"
	description="BuildOS transforms scattered thoughts into organized action with AI. Founded by DJ Wayne, a former USMC Scout Sniper turned software engineer. Brain dump your ideas, get daily briefs, and build context for better productivity."
	canonical="https://build-os.com/about"
	keywords="BuildOS story, DJ Wayne, AI productivity tool, brain dump organization, context building, productivity chaos solution, LLM integration"
	author="DJ Wayne"
	twitterCreator="@djwayne3"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'BuildOS',
		url: 'https://build-os.com',
		logo: 'https://build-os.com/brain-bolt.png',
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
		sameAs: ['https://twitter.com/build_os'],
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
		<div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
			<header class="text-center sp-focus">
				<!-- Logo -->
				<div class="flex justify-center mb-4">
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

				<!-- Title -->
				<h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-3">
					About <span class="text-accent">BuildOS</span>
				</h1>

				<!-- Subtitle -->
				<p class="text-sm sm:text-base text-muted-foreground mb-4 max-w-2xl mx-auto">
					Let AI organize your thoughts. Transform brain dumps into structured action with
					daily briefs and intelligent calendar integration.
				</p>

				<!-- Tag -->
				<div
					class="inline-block px-3 py-1.5 text-xs sm:text-sm text-muted-foreground tx tx-frame tx-weak wt-paper"
				>
					Built by someone who believes humans are nowhere near as productive as we could
					be
				</div>
			</header>
		</div>
	</section>

	<!-- The Problem -->
	<section class="py-8 sm:py-10 bg-background" aria-labelledby="problem-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6">
			<!-- Header -->
			<header class="text-center mb-5">
				<h2
					id="problem-heading"
					class="text-2xl sm:text-3xl font-bold text-foreground mb-2"
				>
					The Problem
				</h2>
				<p class="text-sm text-muted-foreground max-w-2xl mx-auto">
					You're drowning in scattered thoughts across multiple tools, and you keep
					repeating yourself to AI assistants because you can't maintain context.
				</p>
			</header>

			<!-- Problem Card -->
			<div class="p-4 sm:p-6 tx tx-static tx-weak wt-card sp-block">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<!-- Productivity Chaos -->
					<article class="space-y-2">
						<h3 class="text-sm sm:text-base font-semibold text-foreground">
							Productivity Tool Chaos
						</h3>
						<ul
							class="space-y-1.5 text-xs sm:text-sm text-muted-foreground"
							role="list"
						>
							<li class="flex items-start gap-2">
								<div
									class="w-1 h-1 bg-accent rounded-full mt-1.5 shrink-0"
									aria-hidden="true"
								></div>
								<p>Notion for docs, Obsidian for notes, Google Docs for sharing</p>
							</li>
							<li class="flex items-start gap-2">
								<div
									class="w-1 h-1 bg-accent rounded-full mt-1.5 shrink-0"
									aria-hidden="true"
								></div>
								<p>Moleskines, Apple Notes, random text files everywhere</p>
							</li>
							<li class="flex items-start gap-2">
								<div
									class="w-1 h-1 bg-accent rounded-full mt-1.5 shrink-0"
									aria-hidden="true"
								></div>
								<p>Brilliant ideas lost in the chaos of daily tasks</p>
							</li>
						</ul>
					</article>

					<!-- LLM Context Loss -->
					<article class="space-y-2">
						<h3 class="text-sm sm:text-base font-semibold text-foreground">
							LLM Context Loss
						</h3>
						<ul
							class="space-y-1.5 text-xs sm:text-sm text-muted-foreground"
							role="list"
						>
							<li class="flex items-start gap-2">
								<div
									class="w-1 h-1 bg-accent rounded-full mt-1.5 shrink-0"
									aria-hidden="true"
								></div>
								<p>Repeating the same project context to Claude and ChatGPT</p>
							</li>
							<li class="flex items-start gap-2">
								<div
									class="w-1 h-1 bg-accent rounded-full mt-1.5 shrink-0"
									aria-hidden="true"
								></div>
								<p>No way to build on previous AI conversations</p>
							</li>
							<li class="flex items-start gap-2">
								<div
									class="w-1 h-1 bg-accent rounded-full mt-1.5 shrink-0"
									aria-hidden="true"
								></div>
								<p>Losing momentum because you can't iterate efficiently</p>
							</li>
						</ul>
					</article>
				</div>
			</div>
		</div>
	</section>

	<!-- How BuildOS Works -->
	<section class="py-8 sm:py-10 bg-muted" aria-labelledby="how-it-works-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6">
			<!-- Header -->
			<header class="text-center mb-5">
				<h2
					id="how-it-works-heading"
					class="text-2xl sm:text-3xl font-bold text-foreground mb-2"
				>
					How BuildOS Works
				</h2>
				<p class="text-sm text-muted-foreground max-w-2xl mx-auto">
					Brain dump everything. Let AI organize it. Get daily briefs. Schedule tasks.
					Build context for better iteration.
				</p>
			</header>

			<!-- Feature Grid -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
				<!-- Brain Dump -->
				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-2 mx-auto tx tx-bloom tx-weak wt-paper"
					>
						<Brain class="w-6 h-6 sm:w-7 sm:h-7 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">Brain Dump</h3>
					<p class="text-xs text-muted-foreground">
						Capture scattered thoughts without structure
					</p>
				</article>

				<!-- AI Organization -->
				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-2 mx-auto tx tx-grain tx-weak wt-paper"
					>
						<Zap class="w-6 h-6 sm:w-7 sm:h-7 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">AI Organization</h3>
					<p class="text-xs text-muted-foreground">
						AI processes thoughts into projects, tasks, and context
					</p>
				</article>

				<!-- Daily Briefs -->
				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-2 mx-auto tx tx-pulse tx-weak wt-paper"
					>
						<MessageSquare
							class="w-6 h-6 sm:w-7 sm:h-7 text-foreground"
							aria-hidden="true"
						/>
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">Daily Briefs</h3>
					<p class="text-xs text-muted-foreground">
						Personalized updates on projects and priorities
					</p>
				</article>

				<!-- Smart Scheduling -->
				<article class="text-center sp-inline">
					<div
						class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mb-2 mx-auto tx tx-frame tx-weak wt-paper"
					>
						<Calendar
							class="w-6 h-6 sm:w-7 sm:h-7 text-foreground"
							aria-hidden="true"
						/>
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">Smart Scheduling</h3>
					<p class="text-xs text-muted-foreground">
						Tasks find optimal time slots automatically
					</p>
				</article>
			</div>

			<!-- Context Building Callout -->
			<div class="mt-5 p-4 sm:p-6 tx tx-thread tx-weak wt-card sp-block">
				<h3 class="text-sm sm:text-base font-semibold text-foreground mb-2 text-center">
					The Real Power: Context Building
				</h3>
				<p class="text-xs sm:text-sm text-muted-foreground text-center max-w-2xl mx-auto">
					BuildOS creates rich project context that you can copy and share with LLMs. No
					more repeating yourself - just paste your project context and say "iterate on
					this" or "what should I do next?"
				</p>
			</div>
		</div>
	</section>

	<!-- Founder Story -->
	<section class="py-8 sm:py-10 bg-background" aria-labelledby="founder-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6">
			<!-- Header -->
			<header class="text-center mb-5">
				<h2
					id="founder-heading"
					class="text-2xl sm:text-3xl font-bold text-foreground mb-2"
				>
					Meet the Founder
				</h2>
				<p class="text-sm text-muted-foreground max-w-2xl mx-auto">
					A veteran on a mission to solve productivity chaos through AI-powered
					organization.
				</p>
			</header>

			<!-- DJ Wayne Section -->
			<div class="space-y-4">
				<h3 class="text-lg sm:text-xl font-bold text-center text-foreground">DJ Wayne</h3>

				<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
					<!-- Profile -->
					<aside class="lg:order-1 sp-inline">
						<div class="flex justify-center mb-3">
							<img
								src="/s-dj-wayne-profile.webp"
								alt="DJ Wayne, Founder of BuildOS - a professional headshot"
								class="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover shadow-ink-strong border-2 border-border"
								width="112"
								height="112"
								loading="lazy"
							/>
						</div>
						<div class="text-center space-y-1 text-xs sm:text-sm text-muted-foreground">
							<p class="font-medium text-foreground">Former USMC Scout Sniper</p>
							<p>8 years building software</p>
							<p>YC-backed startup experience (Curri)</p>
							<p>Power user of Claude & ChatGPT</p>
						</div>
					</aside>

					<!-- Story -->
					<div class="space-y-3 lg:order-2">
						<article class="space-y-1.5">
							<h4 class="text-sm sm:text-base font-semibold text-foreground">
								The Breaking Point
							</h4>
							<p class="text-xs sm:text-sm text-muted-foreground">
								I was juggling multiple projects - BuildOS, 9takes.com, client work,
								family life. My thoughts were scattered across Notion, Obsidian,
								Google Docs, Moleskines, Apple Notes, and random text files. I was
								drowning in my own productivity system.
							</p>
						</article>

						<article class="space-y-1.5">
							<h4 class="text-sm sm:text-base font-semibold text-foreground">
								The LLM Problem
							</h4>
							<p class="text-xs sm:text-sm text-muted-foreground">
								As a power user of Claude and ChatGPT, I was constantly repeating
								the same project context just to get them to iterate on my ideas. I
								needed a way to build and maintain context that I could share with
								LLMs for better collaboration.
							</p>
						</article>

						<article class="space-y-1.5">
							<h4 class="text-sm sm:text-base font-semibold text-foreground">
								The Solution
							</h4>
							<p class="text-xs sm:text-sm text-muted-foreground">
								BuildOS was born from this frustration. I'm now using BuildOS to
								build BuildOS - the ultimate dogfooding. It's helped me organize my
								chaos and iterate faster with AI assistance.
							</p>
						</article>
					</div>
				</div>

				<!-- Quote -->
				<div class="p-4 sm:p-6 tx tx-frame tx-weak wt-card sp-block">
					<blockquote class="text-center">
						<p class="text-sm sm:text-base text-muted-foreground italic mb-2">
							"I believe humans are nowhere near as productive as we could be. We have
							incredible tools, but we're still stuck in organizational chaos. BuildOS
							is my attempt to fix that."
						</p>
						<footer class="text-xs sm:text-sm text-muted-foreground">
							<cite>— DJ Wayne, Founder</cite>
						</footer>
					</blockquote>
				</div>
			</div>
		</div>
	</section>

	<!-- Current Status -->
	<section class="py-8 sm:py-10 bg-muted" aria-labelledby="status-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6">
			<!-- Header -->
			<header class="text-center mb-5">
				<h2 id="status-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
					Where We Are Now
				</h2>
			</header>

			<!-- Status Grid -->
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
				<!-- MVP -->
				<article class="p-4 text-center tx tx-grain tx-weak wt-paper sp-inline">
					<div
						class="text-2xl sm:text-3xl font-bold text-accent mb-1"
						aria-label="MVP phase"
					>
						MVP
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">Building Phase</h3>
					<p class="text-xs text-muted-foreground">
						Core brain dump processing and AI organization
					</p>
				</article>

				<!-- Launch Date -->
				<article class="p-4 text-center tx tx-pulse tx-weak wt-paper sp-inline">
					<div
						class="text-2xl sm:text-3xl font-bold text-accent mb-1"
						aria-label="July launch"
					>
						July
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">Beta Launch</h3>
					<p class="text-xs text-muted-foreground">
						Early access for users who want to shape the product
					</p>
				</article>

				<!-- Team Size -->
				<article class="p-4 text-center tx tx-frame tx-weak wt-paper sp-inline">
					<div
						class="text-2xl sm:text-3xl font-bold text-accent mb-1"
						aria-label="Solo founder"
					>
						1
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-1">Solo Founder</h3>
					<p class="text-xs text-muted-foreground">
						Bootstrapped and focused on solving real problems
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- Join Us -->
	<section class="py-8 sm:py-10 bg-background" aria-labelledby="join-heading">
		<div class="max-w-4xl mx-auto text-center px-4 sm:px-6">
			<!-- Header -->
			<header class="mb-5">
				<h2 id="join-heading" class="text-2xl sm:text-3xl font-bold text-foreground mb-2">
					Ready to Organize Your Chaos?
				</h2>
				<p class="text-sm text-muted-foreground">
					Join the beta and help build the future of AI-powered productivity.
				</p>
			</header>

			<!-- CTA Grid -->
			<nav
				class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto"
				aria-label="Action links"
			>
				<!-- Join Beta -->
				<a
					href="/beta"
					class="p-4 hover:border-accent hover:bg-accent/5 transition-all group pressable tx tx-bloom tx-weak wt-paper sp-inline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label="Join the BuildOS beta program"
				>
					<Users
						class="w-6 h-6 sm:w-7 sm:h-7 mx-auto mb-2 text-foreground group-hover:text-accent transition-colors"
						aria-hidden="true"
					/>
					<h3 class="text-sm font-semibold mb-0.5 text-foreground">Join Beta</h3>
					<p class="text-xs text-muted-foreground">Get early access</p>
				</a>

				<!-- Invest -->
				<a
					href="/investors"
					class="p-4 hover:border-accent hover:bg-accent/5 transition-all group pressable tx tx-thread tx-weak wt-paper sp-inline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label="Learn about investment opportunities with BuildOS"
				>
					<Coffee
						class="w-6 h-6 sm:w-7 sm:h-7 mx-auto mb-2 text-foreground group-hover:text-accent transition-colors"
						aria-hidden="true"
					/>
					<h3 class="text-sm font-semibold mb-0.5 text-foreground">Invest</h3>
					<p class="text-xs text-muted-foreground">Partner with us</p>
				</a>

				<!-- Connect -->
				<a
					href="/contact"
					class="p-4 hover:border-accent hover:bg-accent/5 transition-all group pressable tx tx-pulse tx-weak wt-paper sp-inline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label="Contact the BuildOS team"
				>
					<MessageCircle
						class="w-6 h-6 sm:w-7 sm:h-7 mx-auto mb-2 text-foreground group-hover:text-accent transition-colors"
						aria-hidden="true"
					/>
					<h3 class="text-sm font-semibold mb-0.5 text-foreground">Connect</h3>
					<p class="text-xs text-muted-foreground">Let's chat</p>
				</a>
			</nav>
		</div>
	</section>
</main>
