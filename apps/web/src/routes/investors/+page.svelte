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

<div class="min-h-screen bg-white dark:bg-gray-900">
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
						class="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover bg-black"
					>
						<source src="/mountain-moving.mp4" type="video/mp4" />
					</video>
				</div>
			</div>

			<h1
				class="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-8 leading-tight text-gray-900 dark:text-white"
			>
				The AI-First
				<span
					class="bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent"
				>
					Productivity Platform
				</span>
			</h1>

			<p
				class="text-xl md:text-2xl text-gray-600 dark:text-gray-400 mb-12 max-w-4xl mx-auto leading-relaxed"
			>
				While others retrofit AI into old systems,
				{#if innerWidth > 600}
					<br />
				{/if}

				BuildOS was built from the ground up for the agent economy.
			</p>

			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="#updates"
					class="inline-flex items-center px-8 py-4 bg-primary-600 text-white rounded-xl hover:bg-primary-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-lg font-semibold"
				>
					<Mail class="w-5 h-5 mr-3" />
					Get Updates
				</a>
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Inquiry"
					class="inline-flex items-center px-8 py-4 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-lg font-semibold"
				>
					<ArrowRight class="w-5 h-5 mr-3" />
					Connect
				</a>
			</div>
		</div>
	</section>

	<!-- The Problem & Solution -->
	<section class="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
		<div class="max-w-6xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-gray-900 dark:text-white">
				Building for the AI Era
			</h2>

			<div class="grid md:grid-cols-3 gap-8">
				<div class="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-md">
					<div
						class="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg mb-6 flex items-center justify-center"
					>
						<TrendingUp class="w-6 h-6 text-primary-600 dark:text-primary-400" />
					</div>
					<h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						Large Market
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-2">
						Productivity software market ($75B+) converging with AI tools market ($800B+
						projected by 2030).
					</p>
					<ul class="text-sm text-gray-500 dark:text-gray-400 space-y-2">
						<li>• Notion ($10B valuation, 2021)</li>
						<li>• Linear ($1.25B valuation, 2025)</li>
						<li>• ChatGPT (800M weekly users, Jan 2025)</li>
					</ul>
				</div>

				<div class="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-md">
					<div
						class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg mb-6 flex items-center justify-center"
					>
						<Zap class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						Right Timing
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-2">
						The convergence of voice AI, context management needs, and the emerging
						agent economy creates the perfect timing.
					</p>
					<ul class="text-sm text-gray-500 dark:text-gray-400 space-y-2">
						<li>• Voice AI adoption exploding</li>
						<li>• Context/memory becoming critical</li>
						<li>• Agents need clear context</li>
					</ul>
				</div>

				<div class="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-md">
					<div
						class="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg mb-6 flex items-center justify-center"
					>
						<Target class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						First Mover
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Only productivity platform built AI-first from day one. Competitors are
						retrofitting AI into existing systems.
					</p>
					<ul class="text-sm text-gray-500 dark:text-gray-400 space-y-2">
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
			<h2 class="text-4xl font-bold text-center mb-16 text-gray-900 dark:text-white">
				Technical Advantages
			</h2>

			<div class="space-y-8">
				<div class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-8">
					<div class="flex items-start space-x-4">
						<div
							class="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Brain class="w-6 h-6 text-white" />
						</div>
						<div>
							<h3 class="text-xl font-bold mb-3 text-gray-900 dark:text-white">
								AI-Native Architecture
							</h3>
							<p class="text-gray-700 dark:text-gray-300 mb-4">
								While Notion, Linear, and others bolt AI onto existing systems,
								BuildOS was designed with AI at the core. As Andrej Karpathy noted,
								neural networks are "eating through" traditional code - BuildOS
								embodies this shift by letting AI dynamically structure your
								projects and context.
							</p>
							<p class="text-gray-500 dark:text-gray-500 text-xs mb-4">
								<a
									href="https://youtu.be/LCEmiRjPEtQ?si=jvual-4XF0xfrif8&t=287"
									target="_blank"
									rel="noopener noreferrer"
									class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
								>
									Source: Andrej Karpathy - "Software in the Era of AI" →
								</a>
							</p>
							<p class="text-gray-600 dark:text-gray-400 text-sm font-medium">
								→ This architectural advantage compounds over time and becomes
								impossible to replicate
							</p>
						</div>
					</div>
				</div>

				<div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-8">
					<div class="flex items-start space-x-4">
						<div
							class="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Mic class="w-6 h-6 text-white" />
						</div>
						<div>
							<h3 class="text-xl font-bold mb-3 text-gray-900 dark:text-white">
								Voice-First Design
							</h3>
							<p class="text-gray-700 dark:text-gray-300 mb-4">
								Users get more value from AI through voice interaction because it
								has less friction than writing. BuildOS is designed for natural
								conversation - once users start talking to it, they don't stop.
							</p>
							<p class="text-gray-600 dark:text-gray-400 text-sm font-medium">
								→ Voice AI adoption is accelerating, and BuildOS is positioned to
								capture this shift
							</p>
						</div>
					</div>
				</div>

				<div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-8">
					<div class="flex items-start space-x-4">
						<div
							class="w-12 h-12 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0"
						>
							<Database class="w-6 h-6 text-white" />
						</div>
						<div>
							<h3 class="text-xl font-bold mb-3 text-gray-900 dark:text-white">
								Transparent Context Engine
							</h3>
							<p class="text-gray-700 dark:text-gray-300 mb-4">
								Unlike ChatGPT's hidden memory, BuildOS shows users exactly what AI
								remembers. Users edit, build upon, and control their context -
								creating compound knowledge that improves over time. BuildOS serves
								as the persistent checkpoint where external agents return to sync
								context and coordinate tasks.
							</p>
							<p class="text-gray-600 dark:text-gray-400 text-sm font-medium">
								→ This becomes the control center for multi-agent workflows
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Development Roadmap -->
	<section class="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
		<div class="max-w-6xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-gray-900 dark:text-white">
				From Tool to Platform
			</h2>

			<div class="grid md:grid-cols-3 gap-8">
				<!-- Phase 1 -->
				<div class="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-md">
					<div class="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-2">
						PHASE 1 • NOW - Q2 2025
					</div>
					<h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						Productivity Tool
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-6">
						AI-powered organization for individuals. Brain dumps become structured
						projects with intelligent task management.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center space-x-2">
							<div class="flex items-center">✅</div>
							<span class="text-gray-600 dark:text-gray-400"
								>Voice-native interface</span
							>
						</div>
						<div class="flex items-center space-x-2">
							<div class="flex items-center">✅</div>
							<span class="text-gray-600 dark:text-gray-400"
								>Context building engine</span
							>
						</div>
						<div class="flex items-center space-x-2">
							<div class="flex items-center">✅</div>
							<span class="text-gray-600 dark:text-gray-400"
								>Calendar integration</span
							>
						</div>
					</div>
				</div>

				<!-- Phase 2 -->
				<div
					class="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-md border-2 border-primary-200 dark:border-primary-800"
				>
					<div class="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
						PHASE 2 • Q3 2025
					</div>
					<h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						LLM Platform
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-6">
						Become the context checkpoint for AI interactions. Users maintain their core
						context in BuildOS while external agents sync back to update progress and
						coordinate next steps.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-purple-500 rounded-full"></div>
							<span class="text-gray-600 dark:text-gray-400"
								>MCP server integration</span
							>
						</div>
						<!-- <div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-purple-500 rounded-full"></div>
							<span class="text-gray-600 dark:text-gray-400">API ecosystem</span>
						</div> -->
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-primary-500 rounded-full"></div>
							<span class="text-gray-600 dark:text-gray-400"
								>Collaboration features</span
							>
						</div>
					</div>
				</div>

				<!-- Phase 3 -->
				<div class="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-md">
					<div class="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-2">
						PHASE 3 • 2026+
					</div>
					<h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						Agent Operating System
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-6">
						The operating system for AI agents. BuildOS becomes the persistent memory
						and coordination layer where multiple specialized agents checkpoint their
						progress and share context.
					</p>
					<div class="space-y-2 text-sm">
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-orange-500 rounded-full"></div>
							<span class="text-gray-600 dark:text-gray-400"
								>3rd party agent integrations</span
							>
						</div>
						<!-- <div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-orange-500 rounded-full"></div>
							<span class="text-gray-600 dark:text-gray-400"
								>Cross-platform orchestration</span
							>
						</div> -->
						<div class="flex items-center space-x-2">
							<div class="w-2 h-2 bg-primary-500 rounded-full"></div>
							<span class="text-gray-600 dark:text-gray-400"
								>Increased tool usage</span
							>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Founders -->
	<section class="py-20 px-4 sm:px-6 lg:px-8">
		<div class="max-w-3xl mx-auto">
			<h2 class="text-4xl font-bold text-center mb-16 text-gray-900 dark:text-white">
				The Founder
			</h2>

			<div class="flex justify-center">
				<!-- DJ Wayne -->
				<div class="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-md">
					<div class="flex justify-center mb-6">
						<img
							src="/s-dj-wayne-profile.webp"
							alt="DJ Wayne - BuildOS Founder"
							class="w-32 h-32 rounded-full object-cover shadow-lg border-4 border-gray-100 dark:border-gray-700"
							width="128"
							height="128"
							loading="lazy"
						/>
					</div>
					<div class="text-center mb-6">
						<p class="font-bold text-xl text-gray-900 dark:text-white">DJ Wayne</p>
					</div>
					<div class="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
						<p>• Former USMC Scout Sniper</p>
						<p>• 8 years software engineering</p>
						<p>• YC-backed startup experience (Curri)</p>
						<p>
							• Serial builder: 9takes.com, thecadretraining.com,
							tinytribeadventures.com
						</p>
					</div>
					<div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
						<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
							Why BuildOS
						</h4>
						<p class="text-gray-600 dark:text-gray-400 text-sm">
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
	<section id="updates" class="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
		<div class="max-w-3xl mx-auto text-center">
			<h2 class="text-4xl font-bold mb-8 text-gray-900 dark:text-white">
				Follow BuildOS Development
			</h2>

			<p class="text-xl text-gray-600 dark:text-gray-400 mb-12">
				Get updates on product development, user growth, and technical milestones. No spam,
				just progress updates from a founder building the future.
			</p>

			<!-- <div class="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg">
				<div class="flex flex-col sm:flex-row gap-4 justify-center mb-6">
					<div class="text-center">
						<div class="text-lg font-semibold text-gray-900 dark:text-white">
							Monthly Updates
						</div>
						<div class="text-sm text-gray-600 dark:text-gray-400">
							Product progress, user feedback, technical milestones
						</div>
					</div>
					<div class="text-center">
						<div class="text-lg font-semibold text-gray-900 dark:text-white">
							Authentic Insights
						</div>
						<div class="text-sm text-gray-600 dark:text-gray-400">
							Real challenges, wins, and learnings from building
						</div>
					</div>
				</div>

				<div class="flex flex-col sm:flex-row gap-4 justify-center">
					<input
						type="email"
						placeholder="Your email address"
						class="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg flex-1 max-w-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
					/>
					<Button
						variant="primary"
						size="md"
						class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
					>
						Get Updates
					</Button>
				</div>
			</div> -->

			<div class="mt-8 text-sm text-gray-500 dark:text-gray-400">
				For business inquiries: <a
					href="mailto:dj@build-os.com"
					class="text-primary-600 hover:text-primary-700">dj@build-os.com</a
				>
			</div>
		</div>
	</section>

	<!-- Connect -->
	<section
		class="mt-10 py-20 px-4 sm:px-6 lg:px-8 rounded-lg bg-gradient-to-r from-primary-600 to-purple-600 text-white"
	>
		<div class="max-w-3xl mx-auto text-center">
			<h2 class="text-4xl font-bold mb-8">Building for the AI Era</h2>

			<p class="text-xl text-blue-100 mb-12">
				Join us in building the coordination layer for AI agents. As specialized agents
				proliferate, they need a central checkpoint for context and memory - BuildOS is
				building that foundation.
			</p>

			<div class="space-y-6">
				<a
					href="mailto:dj@build-os.com?subject=BuildOS Discussion"
					class="inline-flex items-center px-8 py-4 bg-white text-primary-900 rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-lg font-semibold"
				>
					<Mail class="w-5 h-5 mr-3" />
					Connect
					<ArrowRight class="w-5 h-5 ml-3" />
				</a>

				<div class="flex flex-col sm:flex-row gap-4 justify-center text-primary-100">
					<span>• Investor inquiries welcome</span>
					<span>• Strategic partnerships</span>
					<span>• AI/productivity expertise valued</span>
				</div>
			</div>
		</div>
	</section>
</div>
