<!-- apps/web/src/routes/investors/+page.svelte -->
<script lang="ts">
	import { Brain, Zap, Target, Mail, ArrowRight, Mic, Database, TrendingUp } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';

	let innerWidth: number;
</script>

<SEOHead
	title="Investors - BuildOS | AI-Native Productivity Platform for the Agent Economy"
	description="The first AI-native productivity platform built for the agent economy. Founded by DJ Wayne. Follow BuildOS development and investment opportunities."
	canonical="https://build-os.com/investors"
	keywords="BuildOS investors, AI productivity platform, agent economy, voice AI, context management, startup investment, DJ Wayne"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'BuildOS',
		url: 'https://build-os.com',
		logo: 'https://build-os.com/brain-bolt.png',
		description: 'AI-native productivity platform built for the agent economy',
		founder: {
			'@type': 'Person',
			name: 'DJ Wayne',
			jobTitle: 'Founder',
			description:
				'Former USMC Scout Sniper, 8 years software engineering experience, YC-backed startup background'
		},
		industry: 'Productivity Software',
		keywords: [
			'AI productivity',
			'context management',
			'voice AI',
			'agent economy',
			'LLM platform'
		],
		targetMarket: ['Individual professionals', 'Teams', 'Enterprise'],
		competitiveAdvantage: [
			'AI-native architecture',
			'Voice-first design',
			'Transparent context engine'
		],
		contactPoint: {
			'@type': 'ContactPoint',
			email: 'dj@build-os.com',
			contactType: 'Business Inquiries'
		}
	}}
/>

<svelte:window bind:innerWidth />

<div class="min-h-screen bg-background text-foreground">
	<!-- Hero Section -->
	<section class="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
		<div class="max-w-5xl mx-auto text-center">
			<div class="flex justify-center mb-8">
				<div class="relative">
					<video
						autoplay
						loop
						muted
						playsinline
						class="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover bg-black shadow-ink"
					>
						<source
							src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
							type="video/mp4"
						/>
					</video>
				</div>
			</div>

			<h1
				class="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-8 leading-tight text-foreground"
			>
				The AI-First
				<span
					class="bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-transparent"
				>
					Productivity Platform
				</span>
			</h1>

			<p
				class="text-xl md:text-2xl text-muted-foreground mb-12 max-w-4xl mx-auto leading-relaxed"
			>
				While others retrofit AI into old systems,
				{#if innerWidth > 600}
					<br />
				{/if}

				BuildOS is being built from the ground up to using AI but focusing on understanding
				the user.
			</p>

			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="#updates"
					class="inline-flex items-center px-8 py-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 shadow-ink pressable transition-all duration-300 text-lg font-semibold"
				>
					<Mail class="w-5 h-5 mr-3" />
					Get Updates
				</a>
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Inquiry"
					class="inline-flex items-center px-8 py-4 border-2 border-border text-foreground rounded-lg hover:border-accent shadow-ink pressable transition-all duration-300 text-lg font-semibold"
				>
					<ArrowRight class="w-5 h-5 mr-3" />
					Connect
				</a>
			</div>
		</div>
	</section>

	<!-- The Problem & Solution -->
	<section class="py-20 px-4 sm:px-6 lg:px-8 bg-muted rounded-lg">
		<div class="max-w-6xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-foreground">
				Building for the AI Era
			</h2>

			<div class="grid md:grid-cols-3 gap-8">
				<div
					class="bg-card rounded-lg p-8 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div
						class="w-12 h-12 bg-accent/10 rounded-lg mb-6 flex items-center justify-center"
					>
						<TrendingUp class="w-6 h-6 text-accent" />
					</div>
					<h3 class="text-xl font-bold mb-4 text-foreground">Large Market</h3>
					<p class="text-muted-foreground mb-2">
						Productivity software market ($75B+) converging with AI tools market ($800B+
						projected by 2030).
					</p>
					<ul class="text-sm text-muted-foreground space-y-2">
						<li>• Notion ($10B valuation, 2021)</li>
						<li>• Linear ($1.25B valuation, 2025)</li>
						<li>• ChatGPT (800M weekly users, Jan 2025)</li>
					</ul>
				</div>

				<div
					class="bg-card rounded-lg p-8 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div
						class="w-12 h-12 bg-purple-500/10 rounded-lg mb-6 flex items-center justify-center"
					>
						<Zap class="w-6 h-6 text-purple-500" />
					</div>
					<h3 class="text-xl font-bold mb-4 text-foreground">Right Timing</h3>
					<p class="text-muted-foreground mb-2">
						The convergence of voice AI, context management needs, and the emerging
						agent economy creates the perfect timing.
					</p>
					<ul class="text-sm text-muted-foreground space-y-2">
						<li>• Voice AI adoption exploding</li>
						<li>• Context/memory becoming critical</li>
						<li>• Agents need clear context</li>
					</ul>
				</div>

				<div
					class="bg-card rounded-lg p-8 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div
						class="w-12 h-12 bg-emerald-500/10 rounded-lg mb-6 flex items-center justify-center"
					>
						<Target class="w-6 h-6 text-emerald-500" />
					</div>
					<h3 class="text-xl font-bold mb-4 text-foreground">First Mover</h3>
					<p class="text-muted-foreground">
						Only productivity platform built AI-first from day one. Competitors are
						retrofitting AI into existing systems.
					</p>
					<ul class="text-sm text-muted-foreground space-y-2">
						<li>• Competitors retrofitting AI</li>
						<li>• We started with an AI framework</li>
						<li>• Early MCP adoption</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- Technical Advantages -->
	<section class="py-20 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-foreground">
				Technical Advantages
			</h2>

			<div class="space-y-8">
				<div
					class="bg-card border border-accent/30 rounded-lg p-8 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-12 h-12 bg-accent rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Brain class="w-6 h-6 text-accent-foreground" />
						</div>
						<div>
							<h3 class="text-xl font-bold mb-3 text-foreground">
								AI-Native Architecture
							</h3>
							<p class="text-muted-foreground mb-4">
								While Notion, Linear, and others bolt AI onto existing systems,
								BuildOS was designed with AI at the core. As Andrej Karpathy noted,
								neural networks are "eating through" traditional code - BuildOS
								embodies this shift by letting AI dynamically structure your
								projects and context.
							</p>
							<p class="text-muted-foreground text-xs mb-4">
								<a
									href="https://youtu.be/LCEmiRjPEtQ?si=jvual-4XF0xfrif8&t=287"
									target="_blank"
									rel="noopener noreferrer"
									class="hover:text-accent transition-colors"
								>
									Source: Andrej Karpathy - "Software in the Era of AI" →
								</a>
							</p>
							<p class="text-foreground text-sm font-medium">
								→ This architectural advantage compounds over time and becomes
								impossible to replicate
							</p>
						</div>
					</div>
				</div>

				<div
					class="bg-card border border-purple-500/30 rounded-lg p-8 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Mic class="w-6 h-6 text-white" />
						</div>
						<div>
							<h3 class="text-xl font-bold mb-3 text-foreground">
								Voice-First Design
							</h3>
							<p class="text-muted-foreground mb-4">
								Users get more value from AI through voice interaction because it
								has less friction than writing. BuildOS is designed for natural
								conversation - once users start talking to it, they don't stop.
							</p>
							<p class="text-foreground text-sm font-medium">
								→ Voice AI adoption is accelerating, and BuildOS is positioned to
								capture this shift
							</p>
						</div>
					</div>
				</div>

				<div
					class="bg-card border border-emerald-500/30 rounded-lg p-8 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-start space-x-4">
						<div
							class="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Database class="w-6 h-6 text-white" />
						</div>
						<div>
							<h3 class="text-xl font-bold mb-3 text-foreground">
								Transparent Context Engine
							</h3>
							<p class="text-muted-foreground mb-4">
								Unlike ChatGPT's hidden memory, BuildOS shows users exactly what AI
								remembers. Users edit, build upon, and control their context -
								creating compound knowledge that improves over time. BuildOS serves
								as the persistent checkpoint where external agents return to sync
								context and coordinate tasks.
							</p>
							<p class="text-foreground text-sm font-medium">
								→ This becomes the control center for multi-agent workflows
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Development Roadmap -->
	<section class="py-20 px-4 sm:px-6 lg:px-8 bg-muted rounded-lg">
		<div class="max-w-6xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-foreground">
				From Tool to Platform
			</h2>

			<div class="grid md:grid-cols-3 gap-8">
				<!-- Phase 1 -->
				<div
					class="bg-card rounded-lg p-8 shadow-ink border border-border tx tx-grain tx-weak"
				>
					<div class="text-sm font-semibold text-accent mb-2">
						PHASE 1 • NOW - Q2 2025
					</div>
					<h3 class="text-xl font-bold mb-4 text-foreground">Productivity Tool</h3>
					<p class="text-muted-foreground mb-6">
						AI-powered organization for individuals. Brain dumps become structured
						projects with intelligent task management.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center space-x-2">
							<div class="flex items-center">✅</div>
							<span class="text-muted-foreground">Voice-native interface</span>
						</div>
						<div class="flex items-center space-x-2">
							<div class="flex items-center">✅</div>
							<span class="text-muted-foreground">Context building engine</span>
						</div>
						<div class="flex items-center space-x-2">
							<div class="flex items-center">✅</div>
							<span class="text-muted-foreground">Calendar integration</span>
						</div>
					</div>
				</div>

				<!-- Phase 2 -->
				<div
					class="bg-card rounded-lg p-8 shadow-ink-strong border-2 border-accent tx tx-pulse tx-weak"
				>
					<div class="text-sm font-semibold text-purple-500 mb-2">PHASE 2 • Q3 2025</div>
					<h3 class="text-xl font-bold mb-4 text-foreground">LLM Platform</h3>
					<p class="text-muted-foreground mb-6">
						Become the context checkpoint for AI interactions. Users maintain their core
						context in BuildOS while external agents sync back to update progress and
						coordinate next steps.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-purple-500 rounded-full"></div>
							<span class="text-muted-foreground">MCP server integration</span>
						</div>
						<!-- <div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-purple-500 rounded-full"></div>
							<span class="text-muted-foreground">API ecosystem</span>
						</div> -->
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-accent rounded-full"></div>
							<span class="text-muted-foreground">Collaboration features</span>
						</div>
					</div>
				</div>

				<!-- Phase 3 -->
				<div
					class="bg-card rounded-lg p-8 shadow-ink border border-border tx tx-bloom tx-weak"
				>
					<div class="text-sm font-semibold text-amber-500 mb-2">PHASE 3 • 2026+</div>
					<h3 class="text-xl font-bold mb-4 text-foreground">Agent Operating System</h3>
					<p class="text-muted-foreground mb-6">
						The operating system for AI agents. BuildOS becomes the persistent memory
						and coordination layer where multiple specialized agents checkpoint their
						progress and share context.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-amber-500 rounded-full"></div>
							<span class="text-muted-foreground">3rd party agent integrations</span>
						</div>
						<!-- <div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-amber-500 rounded-full"></div>
							<span class="text-muted-foreground"
								>Cross-platform orchestration</span
							>
						</div> -->
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-accent rounded-full"></div>
							<span class="text-muted-foreground">Increased tool usage</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Founders -->
	<section class="py-20 px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-foreground">The Founder</h2>

			<div class="flex justify-center">
				<!-- DJ Wayne -->
				<div
					class="bg-card rounded-lg p-8 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div class="flex justify-center mb-6">
						<img
							src="/s-dj-wayne-profile.webp"
							alt="DJ Wayne - BuildOS Founder"
							class="w-32 h-32 rounded-full object-cover shadow-ink border-4 border-border"
							width="128"
							height="128"
							loading="lazy"
						/>
					</div>
					<div class="text-center mb-6">
						<p class="font-bold text-xl text-foreground">DJ Wayne</p>
					</div>
					<div class="space-y-2 text-muted-foreground text-sm">
						<p>• Former USMC Scout Sniper</p>
						<p>• 8 years software engineering</p>
						<p>• YC-backed startup experience (Curri)</p>
						<p>
							• Serial builder: 9takes.com, thecadretraining.com,
							tinytribeadventures.com
						</p>
					</div>
					<div class="mt-6 pt-6 border-t border-border">
						<h4 class="font-semibold text-foreground mb-3">Why BuildOS</h4>
						<p class="text-muted-foreground text-sm">
							I built BuildOS because I needed it. As a power user of Claude and
							ChatGPT managing multiple projects, I wanted a home base to stay
							organized. The existing tools didn't work for me, so I built my own.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Updates Section -->
	<section id="updates" class="py-20 px-4 sm:px-6 lg:px-8 bg-muted rounded-lg">
		<div class="max-w-3xl mx-auto text-center">
			<h2 class="text-4xl font-bold mb-8 text-foreground">Follow BuildOS Development</h2>

			<p class="text-xl text-muted-foreground mb-12">
				Get updates on product development, user growth, and technical milestones. No spam,
				just progress updates from a founder building the future.
			</p>

			<div class="mt-8 text-sm text-muted-foreground">
				For business inquiries: <a
					href="mailto:dj@build-os.com"
					class="text-accent hover:text-accent/80 transition-colors">dj@build-os.com</a
				>
			</div>
		</div>
	</section>

	<!-- Connect -->
	<section
		class="mt-10 py-20 px-4 sm:px-6 lg:px-8 rounded-lg bg-gradient-to-r from-accent to-purple-500 text-accent-foreground"
	>
		<div class="max-w-3xl mx-auto text-center">
			<h2 class="text-4xl font-bold mb-8">Building for the AI Era</h2>

			<p class="text-xl text-accent-foreground/80 mb-12">
				Join us in building the coordination layer for AI agents. As specialized agents
				proliferate, they need a central checkpoint for context and memory - BuildOS is
				building that foundation.
			</p>

			<div class="space-y-6">
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Discussion"
					class="inline-flex items-center px-8 py-4 bg-background text-foreground rounded-lg shadow-ink pressable transition-all duration-300 text-lg font-semibold"
				>
					<Mail class="w-5 h-5 mr-3" />
					Connect
					<ArrowRight class="w-5 h-5 ml-3" />
				</a>

				<div
					class="flex flex-col sm:flex-row gap-4 justify-center text-accent-foreground/80"
				>
					<span>• Investor inquiries welcome</span>
					<span>• Strategic partnerships</span>
					<span>• AI/productivity expertise valued</span>
				</div>
			</div>
		</div>
	</section>
</div>
