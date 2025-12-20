<!-- apps/web/src/routes/investors/+page.svelte -->
<script lang="ts">
	import { Brain, Zap, Target, Mail, ArrowRight, Mic, Database, TrendingUp } from 'lucide-svelte';
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
	<section class="pt-20 pb-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto text-center">
			<div class="flex justify-center mb-6">
				<div class="relative">
					<video
						autoplay
						loop
						muted
						playsinline
						class="w-20 h-20 md:w-24 md:h-24 rounded-xl object-cover bg-black shadow-ink"
					>
						<source
							src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
							type="video/mp4"
						/>
					</video>
				</div>
			</div>

			<h1
				class="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight text-foreground"
			>
				The AI-First
				<span class="text-accent">Productivity Platform</span>
			</h1>

			<p
				class="text-lg md:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed"
			>
				While others retrofit AI into old systems,
				{#if innerWidth > 600}
					<br />
				{/if}
				BuildOS is being built from the ground up using AI but focusing on understanding the user.
			</p>

			<div class="flex flex-col sm:flex-row gap-3 justify-center">
				<a
					href="#updates"
					class="inline-flex items-center justify-center px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 shadow-ink pressable transition-colors font-semibold tracking-tight"
				>
					<Mail class="w-5 h-5 mr-2" />
					Get Updates
				</a>
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Inquiry"
					class="inline-flex items-center justify-center px-6 py-3 border border-border bg-card text-foreground rounded-lg hover:border-accent hover:bg-accent/5 shadow-ink pressable transition-colors font-semibold tracking-tight"
				>
					<ArrowRight class="w-5 h-5 mr-2" />
					Connect
				</a>
			</div>
		</div>
	</section>

	<!-- The Problem & Solution -->
	<section class="py-16 px-4 sm:px-6 lg:px-8 bg-muted tx tx-grain tx-weak">
		<div class="max-w-6xl mx-auto">
			<h2 class="text-3xl font-bold text-center mb-12 text-foreground">
				Building for the AI Era
			</h2>

			<div class="grid md:grid-cols-3 gap-4 md:gap-6">
				<div
					class="bg-card rounded-lg p-6 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div
						class="w-10 h-10 bg-accent/10 rounded-lg mb-4 flex items-center justify-center"
					>
						<TrendingUp class="w-5 h-5 text-accent" />
					</div>
					<h3 class="text-lg font-bold mb-3 text-foreground">Large Market</h3>
					<p class="text-sm text-muted-foreground mb-3">
						Productivity software market ($75B+) converging with AI tools market ($800B+
						projected by 2030).
					</p>
					<ul class="text-xs text-muted-foreground space-y-1.5">
						<li>• Notion ($10B valuation, 2021)</li>
						<li>• Linear ($1.25B valuation, 2025)</li>
						<li>• ChatGPT (800M weekly users, Jan 2025)</li>
					</ul>
				</div>

				<div
					class="bg-card rounded-lg p-6 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div
						class="w-10 h-10 bg-info/10 rounded-lg mb-4 flex items-center justify-center"
					>
						<Zap class="w-5 h-5 text-info" />
					</div>
					<h3 class="text-lg font-bold mb-3 text-foreground">Right Timing</h3>
					<p class="text-sm text-muted-foreground mb-3">
						The convergence of voice AI, context management needs, and the emerging
						agent economy creates the perfect timing.
					</p>
					<ul class="text-xs text-muted-foreground space-y-1.5">
						<li>• Voice AI adoption exploding</li>
						<li>• Context/memory becoming critical</li>
						<li>• Agents need clear context</li>
					</ul>
				</div>

				<div
					class="bg-card rounded-lg p-6 shadow-ink border border-border tx tx-frame tx-weak"
				>
					<div
						class="w-10 h-10 bg-success/10 rounded-lg mb-4 flex items-center justify-center"
					>
						<Target class="w-5 h-5 text-success" />
					</div>
					<h3 class="text-lg font-bold mb-3 text-foreground">First Mover</h3>
					<p class="text-sm text-muted-foreground mb-3">
						Only productivity platform built AI-first from day one. Competitors are
						retrofitting AI into existing systems.
					</p>
					<ul class="text-xs text-muted-foreground space-y-1.5">
						<li>• Competitors retrofitting AI</li>
						<li>• We started with an AI framework</li>
						<li>• Early MCP adoption</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- Technical Advantages -->
	<section class="py-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<h2 class="text-3xl font-bold text-center mb-10 text-foreground">
				Technical Advantages
			</h2>

			<div class="space-y-4">
				<div
					class="bg-card border border-accent/30 rounded-lg p-6 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-start gap-4">
						<div
							class="w-10 h-10 bg-accent rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Brain class="w-5 h-5 text-accent-foreground" />
						</div>
						<div>
							<h3 class="text-lg font-bold mb-2 text-foreground">
								AI-Native Architecture
							</h3>
							<p class="text-sm text-muted-foreground mb-3">
								While Notion, Linear, and others bolt AI onto existing systems,
								BuildOS was designed with AI at the core. As Andrej Karpathy noted,
								neural networks are "eating through" traditional code - BuildOS
								embodies this shift by letting AI dynamically structure your
								projects and context.
							</p>
							<p class="text-muted-foreground text-xs mb-3">
								<a
									href="https://youtu.be/LCEmiRjPEtQ?si=jvual-4XF0xfrif8&t=287"
									target="_blank"
									rel="noopener noreferrer"
									class="hover:text-accent transition-colors"
								>
									Source: Andrej Karpathy - "Software in the Era of AI" →
								</a>
							</p>
							<p class="text-foreground text-sm font-semibold">
								→ This architectural advantage compounds over time and becomes
								impossible to replicate
							</p>
						</div>
					</div>
				</div>

				<div
					class="bg-card border border-info/30 rounded-lg p-6 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-start gap-4">
						<div
							class="w-10 h-10 bg-info rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Mic class="w-5 h-5 text-white" />
						</div>
						<div>
							<h3 class="text-lg font-bold mb-2 text-foreground">
								Voice-First Design
							</h3>
							<p class="text-sm text-muted-foreground mb-3">
								Users get more value from AI through voice interaction because it
								has less friction than writing. BuildOS is designed for natural
								conversation - once users start talking to it, they don't stop.
							</p>
							<p class="text-foreground text-sm font-semibold">
								→ Voice AI adoption is accelerating, and BuildOS is positioned to
								capture this shift
							</p>
						</div>
					</div>
				</div>

				<div
					class="bg-card border border-success/30 rounded-lg p-6 shadow-ink tx tx-bloom tx-weak"
				>
					<div class="flex items-start gap-4">
						<div
							class="w-10 h-10 bg-success rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Database class="w-5 h-5 text-white" />
						</div>
						<div>
							<h3 class="text-lg font-bold mb-2 text-foreground">
								Transparent Context Engine
							</h3>
							<p class="text-sm text-muted-foreground mb-3">
								Unlike ChatGPT's hidden memory, BuildOS shows users exactly what AI
								remembers. Users edit, build upon, and control their context -
								creating compound knowledge that improves over time. BuildOS serves
								as the persistent checkpoint where external agents return to sync
								context and coordinate tasks.
							</p>
							<p class="text-foreground text-sm font-semibold">
								→ This becomes the control center for multi-agent workflows
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Development Roadmap -->
	<section class="py-16 px-4 sm:px-6 lg:px-8 bg-muted tx tx-thread tx-weak">
		<div class="max-w-6xl mx-auto">
			<h2 class="text-3xl font-bold text-center mb-10 text-foreground">
				From Tool to Platform
			</h2>

			<div class="grid md:grid-cols-3 gap-4 md:gap-6">
				<!-- Phase 1 -->
				<div
					class="bg-card rounded-lg p-6 shadow-ink border border-border tx tx-grain tx-weak"
				>
					<p class="text-[0.65rem] uppercase tracking-[0.15em] text-accent font-semibold mb-2">
						PHASE 1 • NOW - Q2 2025
					</p>
					<h3 class="text-lg font-bold mb-3 text-foreground">Productivity Tool</h3>
					<p class="text-sm text-muted-foreground mb-4">
						AI-powered organization for individuals. Brain dumps become structured
						projects with intelligent task management.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<span class="text-success">✓</span>
							<span class="text-muted-foreground">Voice-native interface</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-success">✓</span>
							<span class="text-muted-foreground">Context building engine</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-success">✓</span>
							<span class="text-muted-foreground">Calendar integration</span>
						</div>
					</div>
				</div>

				<!-- Phase 2 -->
				<div
					class="bg-card rounded-lg p-6 shadow-ink-strong border-2 border-accent tx tx-pulse tx-weak"
				>
					<p class="text-[0.65rem] uppercase tracking-[0.15em] text-info font-semibold mb-2">
						PHASE 2 • Q3 2025
					</p>
					<h3 class="text-lg font-bold mb-3 text-foreground">LLM Platform</h3>
					<p class="text-sm text-muted-foreground mb-4">
						Become the context checkpoint for AI interactions. Users maintain their core
						context in BuildOS while external agents sync back to update progress and
						coordinate next steps.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<div class="w-1.5 h-1.5 bg-info rounded-full"></div>
							<span class="text-muted-foreground">MCP server integration</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-1.5 h-1.5 bg-accent rounded-full"></div>
							<span class="text-muted-foreground">Collaboration features</span>
						</div>
					</div>
				</div>

				<!-- Phase 3 -->
				<div
					class="bg-card rounded-lg p-6 shadow-ink border border-border tx tx-bloom tx-weak"
				>
					<p class="text-[0.65rem] uppercase tracking-[0.15em] text-warning font-semibold mb-2">
						PHASE 3 • 2026+
					</p>
					<h3 class="text-lg font-bold mb-3 text-foreground">Agent Operating System</h3>
					<p class="text-sm text-muted-foreground mb-4">
						The operating system for AI agents. BuildOS becomes the persistent memory
						and coordination layer where multiple specialized agents checkpoint their
						progress and share context.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<div class="w-1.5 h-1.5 bg-warning rounded-full"></div>
							<span class="text-muted-foreground">3rd party agent integrations</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-1.5 h-1.5 bg-accent rounded-full"></div>
							<span class="text-muted-foreground">Increased tool usage</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Founders -->
	<section class="py-16 px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl mx-auto">
			<h2 class="text-3xl font-bold text-center mb-10 text-foreground">The Founder</h2>

			<div class="flex justify-center">
				<!-- DJ Wayne -->
				<div
					class="bg-card rounded-lg p-6 shadow-ink border border-border tx tx-frame tx-weak max-w-md"
				>
					<div class="flex justify-center mb-4">
						<img
							src="/s-dj-wayne-profile.webp"
							alt="DJ Wayne - BuildOS Founder"
							class="w-24 h-24 rounded-full object-cover shadow-ink border-2 border-border"
							width="96"
							height="96"
							loading="lazy"
						/>
					</div>
					<div class="text-center mb-4">
						<p class="font-bold text-lg text-foreground">DJ Wayne</p>
					</div>
					<div class="space-y-1.5 text-muted-foreground text-sm">
						<p>• Former USMC Scout Sniper</p>
						<p>• 8 years software engineering</p>
						<p>• YC-backed startup experience (Curri)</p>
						<p>
							• Serial builder: 9takes.com, thecadretraining.com,
							tinytribeadventures.com
						</p>
					</div>
					<div class="mt-4 pt-4 border-t border-border">
						<h4 class="font-semibold text-foreground mb-2 text-sm">Why BuildOS</h4>
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
	<section id="updates" class="py-16 px-4 sm:px-6 lg:px-8 bg-muted tx tx-frame tx-weak">
		<div class="max-w-3xl mx-auto text-center">
			<h2 class="text-3xl font-bold mb-6 text-foreground">Follow BuildOS Development</h2>

			<p class="text-muted-foreground mb-8">
				Get updates on product development, user growth, and technical milestones. No spam,
				just progress updates from a founder building the future.
			</p>

			<div class="text-sm text-muted-foreground">
				For business inquiries: <a
					href="mailto:dj@build-os.com"
					class="text-accent hover:text-accent/80 transition-colors font-semibold">dj@build-os.com</a
				>
			</div>
		</div>
	</section>

	<!-- Connect -->
	<section
		class="mt-8 py-16 px-4 sm:px-6 lg:px-8 bg-accent tx tx-frame tx-med"
	>
		<div class="max-w-3xl mx-auto text-center">
			<h2 class="text-3xl font-bold mb-6 text-accent-foreground">Building for the AI Era</h2>

			<p class="text-accent-foreground/90 mb-8">
				Join us in building the coordination layer for AI agents. As specialized agents
				proliferate, they need a central checkpoint for context and memory - BuildOS is
				building that foundation.
			</p>

			<div class="space-y-4">
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Discussion"
					class="inline-flex items-center justify-center px-6 py-3 bg-background text-foreground rounded-lg shadow-ink pressable transition-colors font-semibold tracking-tight"
				>
					<Mail class="w-5 h-5 mr-2" />
					Connect
					<ArrowRight class="w-5 h-5 ml-2" />
				</a>

				<div
					class="flex flex-col sm:flex-row gap-3 justify-center text-sm text-accent-foreground/80"
				>
					<span>• Investor inquiries welcome</span>
					<span>• Strategic partnerships</span>
					<span>• AI/productivity expertise valued</span>
				</div>
			</div>
		</div>
	</section>
</div>
