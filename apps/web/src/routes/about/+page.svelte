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
</script>

<SEOHead
	title="About BuildOS - AI-Powered Brain Dump Organization | DJ Wayne"
	description="BuildOS transforms scattered thoughts into organized action with AI. Founded by DJ Wayne, a former USMC Scout Sniper turned software engineer. Brain dump your ideas, get daily briefs, and build context for better productivity."
	canonical="https://build-os.com/about"
	keywords="BuildOS story, DJ Wayne, AI productivity tool, brain dump organization, context building, productivity chaos solution, LLM integration"
	author="DJ Wayne"
	twitterCreator="@djwayne3"
/>

<main class="min-h-screen bg-background">
	<!-- Hero Section -->
	<section class="bg-muted tx tx-grain tx-weak">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
			<header class="text-center">
				<div class="flex justify-center mb-8">
					<div
						class="rounded-lg border border-border bg-card shadow-ink w-20 h-20 rounded-sm flex items-center justify-center"
					>
						<video
							src="/onboarding-assets/animations/brain-bolt-electric.mp4"
							class="w-16 h-16"
							autoplay
							loop
							muted
							playsinline
							aria-label="BuildOS application icon"
						></video>
					</div>
				</div>
				<h1 class="text-5xl md:text-6xl font-bold text-foreground mb-6">
					About <span class="text-accent">BuildOS</span>
				</h1>
				<p class="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
					Let AI organize your thoughts. Transform brain dumps into structured action with
					daily briefs and intelligent calendar integration.
				</p>
				<div
					class="text-sm text-muted-foreground rounded-lg border border-border bg-card px-3 py-1.5 inline-block"
				>
					Built by someone who believes humans are nowhere near as productive as we could
					be
				</div>
			</header>
		</div>
	</section>

	<!-- The Problem -->
	<section class="py-16 bg-background" aria-labelledby="problem-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-12">
				<h2
					id="problem-heading"
					class="text-3xl md:text-4xl font-bold text-foreground mb-6"
				>
					The Problem
				</h2>
				<p class="text-lg text-muted-foreground max-w-2xl mx-auto">
					You're drowning in scattered thoughts across multiple tools, and you keep
					repeating yourself to AI assistants because you can't maintain context.
				</p>
			</header>

			<div class="rounded-lg border border-border bg-card shadow-ink p-8 relative">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
					<article>
						<h3 class="text-xl font-semibold text-foreground mb-4">
							Productivity Tool Chaos
						</h3>
						<ul class="space-y-3 text-muted-foreground" role="list">
							<li class="flex items-start space-x-3">
								<div
									class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
									aria-hidden="true"
								></div>
								<p>Notion for docs, Obsidian for notes, Google Docs for sharing</p>
							</li>
							<li class="flex items-start space-x-3">
								<div
									class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
									aria-hidden="true"
								></div>
								<p>Moleskines, Apple Notes, random text files everywhere</p>
							</li>
							<li class="flex items-start space-x-3">
								<div
									class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
									aria-hidden="true"
								></div>
								<p>Brilliant ideas lost in the chaos of daily tasks</p>
							</li>
						</ul>
					</article>
					<article>
						<h3 class="text-xl font-semibold text-foreground mb-4">LLM Context Loss</h3>
						<ul class="space-y-3 text-muted-foreground" role="list">
							<li class="flex items-start space-x-3">
								<div
									class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
									aria-hidden="true"
								></div>
								<p>Repeating the same project context to Claude and ChatGPT</p>
							</li>
							<li class="flex items-start space-x-3">
								<div
									class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
									aria-hidden="true"
								></div>
								<p>No way to build on previous AI conversations</p>
							</li>
							<li class="flex items-start space-x-3">
								<div
									class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
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
	<section class="py-16 bg-muted tx tx-grain tx-weak" aria-labelledby="how-it-works-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-12">
				<h2
					id="how-it-works-heading"
					class="text-3xl md:text-4xl font-bold text-foreground mb-6"
				>
					How BuildOS Works
				</h2>
				<p class="text-lg text-muted-foreground max-w-2xl mx-auto">
					Brain dump everything. Let AI organize it. Get daily briefs. Schedule tasks.
					Build context for better iteration.
				</p>
			</header>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
				<article class="text-center">
					<div
						class="rounded-lg border border-border bg-card shadow-ink w-16 h-16 rounded-sm flex items-center justify-center mb-4 mx-auto"
					>
						<Brain class="w-8 h-8 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-lg font-semibold text-foreground mb-2">Brain Dump</h3>
					<p class="text-muted-foreground text-sm">
						Capture all your scattered thoughts without worrying about structure
					</p>
				</article>

				<article class="text-center">
					<div
						class="rounded-lg border border-border bg-card shadow-ink w-16 h-16 rounded-sm flex items-center justify-center mb-4 mx-auto"
					>
						<Zap class="w-8 h-8 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-lg font-semibold text-foreground mb-2">AI Organization</h3>
					<p class="text-muted-foreground text-sm">
						AI processes your thoughts into projects, tasks, and context
					</p>
				</article>

				<article class="text-center">
					<div
						class="rounded-lg border border-border bg-card shadow-ink w-16 h-16 rounded-sm flex items-center justify-center mb-4 mx-auto"
					>
						<MessageSquare class="w-8 h-8 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-lg font-semibold text-foreground mb-2">Daily Briefs</h3>
					<p class="text-muted-foreground text-sm">
						Get personalized updates on your projects and priorities
					</p>
				</article>

				<article class="text-center">
					<div
						class="rounded-lg border border-border bg-card shadow-ink w-16 h-16 rounded-sm flex items-center justify-center mb-4 mx-auto"
					>
						<Calendar class="w-8 h-8 text-foreground" aria-hidden="true" />
					</div>
					<h3 class="text-lg font-semibold text-foreground mb-2">Smart Scheduling</h3>
					<p class="text-muted-foreground text-sm">
						Tasks automatically find optimal time slots in your calendar
					</p>
				</article>
			</div>

			<div
				class="mt-12 rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak p-8"
			>
				<h3 class="text-xl font-semibold text-foreground mb-4 text-center">
					The Real Power: Context Building
				</h3>
				<p class="text-muted-foreground text-center max-w-2xl mx-auto">
					BuildOS creates rich project context that you can copy and share with LLMs. No
					more repeating yourself - just paste your project context and say "iterate on
					this" or "what should I do next?"
				</p>
			</div>
		</div>
	</section>

	<!-- Founder Story -->
	<section class="py-16 bg-card" aria-labelledby="founder-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-12">
				<h2
					id="founder-heading"
					class="text-3xl md:text-4xl font-bold text-foreground mb-6"
				>
					Meet the Founder
				</h2>
				<p class="text-lg text-muted-foreground max-w-2xl mx-auto">
					A veteran on a mission to solve productivity chaos through AI-powered
					organization.
				</p>
			</header>

			<!-- DJ Wayne Section -->
			<div class="mb-16">
				<h3 class="text-2xl font-bold text-center text-foreground mb-8">DJ Wayne</h3>
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
					<aside class="lg:order-1">
						<div class="flex justify-center mb-6">
							<img
								src="/s-dj-wayne-profile.webp"
								alt="DJ Wayne, Founder of BuildOS - a professional headshot"
								class="w-32 h-32 rounded-full object-cover shadow-lg border-4 border-border"
								width="128"
								height="128"
								loading="lazy"
							/>
						</div>
						<div class="text-center space-y-2 text-muted-foreground">
							<p class="font-medium">Former USMC Scout Sniper</p>
							<p>8 years building software</p>
							<p>YC-backed startup experience (Curri)</p>
							<p>Power user of Claude & ChatGPT</p>
						</div>
					</aside>

					<div class="space-y-6 lg:order-2">
						<article>
							<h4 class="text-xl font-semibold text-foreground mb-3">
								The Breaking Point
							</h4>
							<p class="text-muted-foreground">
								I was juggling multiple projects - BuildOS, 9takes.com, client work,
								family life. My thoughts were scattered across Notion, Obsidian,
								Google Docs, Moleskines, Apple Notes, and random text files. I was
								drowning in my own productivity system.
							</p>
						</article>

						<article>
							<h4 class="text-xl font-semibold text-foreground mb-3">
								The LLM Problem
							</h4>
							<p class="text-muted-foreground">
								As a power user of Claude and ChatGPT, I was constantly repeating
								the same project context just to get them to iterate on my ideas. I
								needed a way to build and maintain context that I could share with
								LLMs for better collaboration.
							</p>
						</article>

						<article>
							<h4 class="text-xl font-semibold text-foreground mb-3">The Solution</h4>
							<p class="text-muted-foreground">
								BuildOS was born from this frustration. I'm now using BuildOS to
								build BuildOS - the ultimate dogfooding. It's helped me organize my
								chaos and iterate faster with AI assistance.
							</p>
						</article>
					</div>
				</div>

				<div class="mt-12 bg-muted rounded-2xl p-8">
					<blockquote class="text-center">
						<p class="text-lg text-muted-foreground italic mb-4">
							"I believe humans are nowhere near as productive as we could be. We have
							incredible tools, but we're still stuck in organizational chaos. Build
							OS is my attempt to fix that."
						</p>
						<footer class="text-muted-foreground">
							<cite>— DJ Wayne, Founder</cite>
						</footer>
					</blockquote>
				</div>
			</div>
		</div>
	</section>

	<!-- Current Status -->
	<section class="py-16 bg-muted" aria-labelledby="status-heading">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<header class="text-center mb-12">
				<h2 id="status-heading" class="text-3xl md:text-4xl font-bold text-foreground mb-6">
					Where We Are Now
				</h2>
			</header>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
				<article
					class="bg-card rounded-2xl p-6 text-center shadow-ink tx tx-frame tx-weak border border-border"
				>
					<div class="text-3xl font-bold text-accent mb-2" aria-label="MVP phase">
						MVP
					</div>
					<h3 class="font-semibold text-foreground mb-2">Building Phase</h3>
					<p class="text-muted-foreground text-sm">
						Core brain dump processing and AI organization features
					</p>
				</article>

				<article
					class="bg-card rounded-2xl p-6 text-center shadow-ink tx tx-frame tx-weak border border-border"
				>
					<div class="text-3xl font-bold text-accent mb-2" aria-label="July launch">
						July
					</div>
					<h3 class="font-semibold text-foreground mb-2">Beta Launch</h3>
					<p class="text-muted-foreground text-sm">
						Early access for users who want to shape the product
					</p>
				</article>

				<article
					class="bg-card rounded-2xl p-6 text-center shadow-ink tx tx-frame tx-weak border border-border"
				>
					<div class="text-3xl font-bold text-accent mb-2" aria-label="Solo founder">
						1
					</div>
					<h3 class="font-semibold text-foreground mb-2">Solo Founder</h3>
					<p class="text-muted-foreground text-sm">
						Bootstrapped and focused on solving real problems
					</p>
				</article>
			</div>
		</div>
	</section>

	<!-- Join Us -->
	<section class="py-16 bg-muted tx tx-grain tx-weak" aria-labelledby="join-heading">
		<div class="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
			<header class="mb-12">
				<h2 id="join-heading" class="text-3xl md:text-4xl font-bold text-foreground mb-6">
					Ready to Organize Your Chaos?
				</h2>
				<p class="text-xl text-muted-foreground mb-12">
					Join the beta and help build the future of AI-powered productivity.
				</p>
			</header>

			<nav
				class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto"
				aria-label="Action links"
			>
				<a
					href="/beta"
					class="rounded-lg border border-border bg-card shadow-ink p-6 hover:brightness-105 transition-all group relative tx tx-grain tx-weak"
					aria-label="Join the BuildOS beta program"
				>
					<Users
						class="w-8 h-8 mx-auto mb-4 text-foreground group-hover:scale-110 transition-transform"
						aria-hidden="true"
					/>
					<h3 class="font-semibold mb-2 text-foreground">Join Beta</h3>
					<p class="text-sm text-muted-foreground">Get early access</p>
				</a>

				<a
					href="/investors"
					class="rounded-lg border border-border bg-card shadow-ink p-6 hover:brightness-105 transition-all group relative tx tx-grain tx-weak"
					aria-label="Learn about investment opportunities with BuildOS"
				>
					<Coffee
						class="w-8 h-8 mx-auto mb-4 text-foreground group-hover:scale-110 transition-transform"
						aria-hidden="true"
					/>
					<h3 class="font-semibold mb-2 text-foreground">Invest</h3>
					<p class="text-sm text-muted-foreground">Partner with us</p>
				</a>

				<a
					href="/contact"
					class="rounded-lg border border-border bg-card shadow-ink p-6 hover:brightness-105 transition-all group relative tx tx-grain tx-weak"
					aria-label="Contact the BuildOS team"
				>
					<MessageCircle
						class="w-8 h-8 mx-auto mb-4 text-foreground group-hover:scale-110 transition-transform"
						aria-hidden="true"
					/>
					<h3 class="font-semibold mb-2 text-foreground">Connect</h3>
					<p class="text-sm text-muted-foreground">Let's chat</p>
				</a>
			</nav>
		</div>
	</section>
</main>
