<!-- apps/web/src/routes/road-map/+page.svelte -->
<script lang="ts">
	import { CircleCheck, Wrench, Calendar, Sparkles, Users, MessageCircle } from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_LOGO_IMAGE,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';

	let innerWidth = $state(0);
	let isMobile = $derived(innerWidth < 768);
</script>

<SEOHead
	title="Roadmap - BuildOS | AI-Powered Project Management Development Timeline"
	description="Detailed BuildOS development roadmap with monthly milestones. Track our progress building the AI co-pilot for chaotic, idea-rich minds."
	canonical="https://build-os.com/road-map"
	keywords="BuildOS roadmap, AI productivity development, project management roadmap, AI assistant timeline, project context roadmap"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Article',
		'@id': `${SITE_URL}/road-map#article`,
		headline: 'BuildOS Development Roadmap',
		description:
			'Detailed monthly timeline for BuildOS development - the AI project completion partner',
		author: {
			'@type': 'Organization',
			'@id': DEFAULT_ORGANIZATION_ID,
			name: SITE_NAME,
			url: SITE_URL
		},
		publisher: {
			'@type': 'Organization',
			'@id': DEFAULT_ORGANIZATION_ID,
			name: SITE_NAME,
			url: SITE_URL,
			logo: DEFAULT_ORGANIZATION_LOGO_IMAGE
		},
		datePublished: '2025-07-21',
		dateModified: '2025-08-28',
		mainEntityOfPage: `${SITE_URL}/road-map`
	}}
/>

<svelte:window bind:innerWidth />

<main class="min-h-screen bg-background text-foreground">
	<!-- Header -->
	<section class="pt-24 pb-12 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<div class="flex items-center gap-4 mb-8">
				<img
					src="/brain-bolt.webp"
					alt="BuildOS"
					class="w-12 h-12 rounded-xl shadow-ink"
					width="48"
					height="48"
				/>
				<div>
					<h1 class="text-4xl md:text-5xl font-bold text-foreground">BuildOS Roadmap</h1>
					<p class="text-muted-foreground mt-2">
						<span class="micro-label text-accent">LAST UPDATED</span> August 10, 2025
						{#if isMobile}
							<br />
						{/if}

						<a
							href="https://build-os.com/feedback"
							class="text-accent hover:text-accent/80 transition-colors pressable"
							>Got feedback? Report it here 📬</a
						>
					</p>
				</div>
			</div>

			<div
				class="bg-card border border-accent/30 rounded-lg p-6 mb-8 shadow-ink tx tx-bloom tx-weak"
			>
				<h2 class="text-lg font-semibold mb-3 text-foreground">🎯 Mission</h2>
				<p class="text-muted-foreground">
					Build the AI co-pilot for your chaotic, idea-rich mind. Users talk through rough
					work → AI organizes everything → Users execute → Projects get completed.
				</p>
			</div>

			<!-- Status Legend -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
				<div class="flex items-center gap-2">
					<CircleCheck class="w-5 h-5 text-success" />
					<span class="text-sm font-medium text-foreground">Live</span>
				</div>
				<div class="flex items-center gap-2">
					<Wrench class="w-5 h-5 text-warning" />
					<span class="text-sm font-medium text-foreground">In Progress</span>
				</div>
				<div class="flex items-center gap-2">
					<Calendar class="w-5 h-5 text-accent" />
					<span class="text-sm font-medium text-foreground">Planned</span>
				</div>
				<div class="flex items-center gap-2">
					<Sparkles class="w-5 h-5 text-info" />
					<span class="text-sm font-medium text-foreground">Future Vision</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Timeline -->
	<section class="pb-20 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<!-- JULY 2025 - Current Features -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-success rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">
						July 2025 - Live & Functional
					</h2>
					<span
						class="px-3 py-1 bg-success/10 text-success border border-success/20 rounded-full text-sm font-medium"
					>
						Current State
					</span>
				</div>

				<div class="border-l-2 border-success/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-grain tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<CircleCheck class="w-4 h-4 text-success" />
							Core Capture & Project System
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>✅ Project Capture (text & voice)</li>
							<li>
								✅ AI Parsing Engine - automatically extracts projects, tasks, notes
							</li>
							<li>✅ Project Complexity Detection - breaks big goals into phases</li>
							<li>
								✅ Rich Project Context - AI-generated markdown for each project
							</li>
							<li>
								✅ Voice-to-Action - convert voice notes into structured projects
								and tasks
							</li>
							<li>✅ AI Summarization - actionable briefs for projects</li>
							<li>
								🔗 Context Linking - automatically connect related tasks, notes,
								projects to the original captured context
							</li>
							<li>
								📜 View project context history - see how project has evolved from
								one session to the next
							</li>
						</ul>
					</div>

					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-grain tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<CircleCheck class="w-4 h-4 text-success" />
							Smart Task & Calendar Management
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								✅ Google Calendar Integration - sync tasks and view calendar
								context
							</li>
							<li>
								✅ Google Calendar Scheduling - schedules tasks around existing
								events
							</li>
							<!-- <li>✅ Homepage Task Sync - tasks update in real-time</li> -->
							<li>
								✅ Improved Daily Briefs - actionable with links to projects, tasks,
								and notes
							</li>
							<li>
								✅ Task Visibility - view completed, scheduled and archived tasks
							</li>
							<!-- <li>✅ Faster Task/Note Updates - instant UI reflection</li> -->
						</ul>
					</div>

					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-grain tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<CircleCheck class="w-4 h-4 text-success" />
							User Experience & Infrastructure
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								✅ Personalized Onboarding - adapts to goals and work style (more to
								come)
							</li>
							<li>✅ User Accounts + Google OAuth - secure sign-in</li>
							<li>✅ UI Themes (Light/Dark Mode)</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- AUGUST 2025 -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-warning rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">August 2025</h2>
					<span
						class="px-3 py-1 bg-warning/10 text-warning border border-warning/20 rounded-full text-sm font-medium"
					>
						In Progress
					</span>
				</div>

				<div class="border-l-2 border-warning/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-pulse tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Wrench class="w-4 h-4 text-warning" />
							User Experience Improvements
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<!-- <li>
								🛠 Responsive UI Overhaul - better mobile experience across screen
								sizes
							</li> -->
							<li>
								✅ Phase-to-Calendar Scheduling - automatically schedule entire
								project phases
							</li>
							<li>
								✅ Smart Time Blocking - BuildOS finds optimal work sessions for
								tasks
							</li>
							<li>
								🌀 Feedback Portal - public board to vote on features and track
								progress
							</li>
							<li>
								📋 Adjustable Briefs - customize the cadence and time of day you
								want your briefs
							</li>
							<li>
								🛠️ Task workbench- with a whole project as context, deep dive into a
								task and flesh out the steps needed to complete the task
							</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- SEPTEMBER 2025 -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-accent rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">September 2025</h2>
					<span
						class="px-3 py-1 bg-accent/10 text-accent border border-accent/20 rounded-full text-sm font-medium"
					>
						Planned
					</span>
				</div>

				<div class="border-l-2 border-accent/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-frame tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Calendar class="w-4 h-4 text-accent" />
							Enhanced Organization
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>🏷️ Tagging & Search - organize and quickly find your data</li>
							<li>🗣️ Project Brief interaction</li>
							<li>⟳ Recurring Tasks & Projects - plan and automate your workflows</li>
							<li>💲 Activate pricing gate- 7 day free trial</li>
						</ul>
					</div>

					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-frame tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Calendar class="w-4 h-4 text-accent" />
							Community & Integrations
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								👨‍👨‍👦‍👦 Discord Community - private group for feedback and early access
							</li>
							<li>💬 Live Beta Feedback Sessions - AMAs and roadmap walkthroughs</li>
							<li>
								🤲 Onboarding-Driven Suggestions - smart tips based on goals and
								activity
							</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- OCTOBER 2025 -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-info rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">October 2025</h2>
					<span
						class="px-3 py-1 bg-info/10 text-info border border-info/20 rounded-full text-sm font-medium"
					>
						Next Phase
					</span>
				</div>

				<div class="border-l-2 border-info/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-bloom tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Sparkles class="w-4 h-4 text-info" />
							Project Intelligence Engine (Beta)
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								🎯 Project Completion Scoring - AI analyzes likelihood of project
								success
							</li>
							<li>
								⏩ Proactive Project Prompts - AI detects gaps and asks clarifying
								questions
							</li>
							<li>
								🧪 Smart Project Synthesis - AI helps refine project scope and
								details
							</li>
							<li>
								⚔️ Conflict Detection - identify competing priorities across
								projects
							</li>
							<li>📝 BuildOS homework- give BuildOS homework</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- NOVEMBER 2025 -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-info rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">November 2025</h2>
					<span
						class="px-3 py-1 bg-info/10 text-info border border-info/20 rounded-full text-sm font-medium"
					>
						Advanced Features
					</span>
				</div>

				<div class="border-l-2 border-info/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-bloom tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Sparkles class="w-4 h-4 text-info" />
							Predictive Project Management
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								🔮 Next Step Predictions - AI suggests what to do next based on
								progress
							</li>
							<li>
								📈 Timeline Optimization - AI adjusts schedules based on realistic
								progress
							</li>
							<li>
								🚧 Bottleneck Detection - identify and resolve project blockers
								early
							</li>
						</ul>
					</div>

					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-bloom tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Sparkles class="w-4 h-4 text-info" />
							Unified Interface Evolution
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>
								✅ Eliminate separate capture page - everything flows through
								projects
							</li>
							<li>✅ Context-aware capture - knows which project you're updating</li>
							<li>
								🇼🇮🇵 Daily brief project updates - update projects through morning
								brief
							</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- DECEMBER 2025 -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-accent rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">December 2025</h2>
					<span
						class="px-3 py-1 bg-accent/10 text-accent border border-accent/20 rounded-full text-sm font-medium"
					>
						Premium Launch
					</span>
				</div>

				<div class="border-l-2 border-accent/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-thread tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Sparkles class="w-4 h-4 text-accent" />
							Premium Synthesis Features
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>💎 Deep Project Analysis - comprehensive project optimization</li>
							<li>💎 Strategic Recommendations - Strategic guidance</li>
							<li>💎 Custom Synthesis Requests - on-demand project deep dives</li>
							<li>💎 Multi-Project Portfolio Optimization</li>
						</ul>
						<div class="mt-3 p-3 bg-accent/10 border border-accent/20 rounded-lg">
							<p class="text-sm text-foreground">
								<strong>Tiered Model:</strong> Free tier includes basic task deduplication
								and simple suggestions. Premium tier unlocks advanced AI synthesis and
								proactive project management.
							</p>
						</div>
					</div>

					<div
						class="bg-card rounded-lg p-4 border border-border shadow-ink tx tx-thread tx-weak"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Sparkles class="w-4 h-4 text-accent" />
							Complete Life Integration
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>🤖 AI Project Manager Mode - proactive reminders and guidance</li>
							<li>🤖 Automated Status Updates and Reports</li>
							<li>🤖 Hand-holding to Project Completion</li>
							<li>🤖 Smart Intervention when projects stall</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- 2026+ FUTURE VISION -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-accent rounded-full"></div>
					<h2 class="text-2xl font-bold text-foreground">2026+ Future Vision</h2>
					<span
						class="px-3 py-1 bg-accent/10 text-accent border border-accent/20 rounded-full text-sm font-medium"
					>
						Long-term Vision
					</span>
				</div>

				<div class="border-l-2 border-accent/30 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-card rounded-lg p-4 border border-accent/30 shadow-ink tx tx-bloom tx-med"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2 text-foreground">
							<Sparkles class="w-4 h-4 text-accent" />
							AI Operating System for Projects
						</h3>
						<ul class="space-y-2 text-sm text-muted-foreground">
							<li>🚀 Graph-Style Knowledge Mapping - visualize how ideas connect</li>
							<li>
								🚀 Task Dependency Chains - auto-schedule based on prerequisite
								tasks
							</li>
							<li>🚀 Mobile App - native iOS/Android version</li>
							<li>
								🚀 Multi-Brain Workspaces - switch between personal & project modes
							</li>
							<li>
								🚀 Agent Integration - third-party AI agents work with BuildOS
								context (MCP server)
							</li>
						</ul>
						<div class="mt-4 p-4 bg-muted border border-border rounded-lg">
							<p class="text-sm font-medium text-foreground">
								🎯 <strong>Ultimate Vision:</strong> BuildOS becomes the operating system
								for how humans and AI collaborate on projects. Users dump ideas, AI handles
								all the organization, scheduling, and project management - humans focus
								purely on execution and creativity.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<section class="py-16 px-4 sm:px-6 lg:px-8 bg-muted">
		<div class="max-w-4xl mx-auto text-center">
			<h2 class="text-3xl font-bold mb-4 text-foreground">Help Shape the Future</h2>
			<p class="text-lg text-muted-foreground mb-8">
				Join our beta community and work directly with us to influence this roadmap. Your
				feedback drives what we build next.
			</p>

			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="/beta"
					class="inline-flex items-center px-8 py-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors text-lg font-semibold shadow-ink pressable"
				>
					<Users class="w-5 h-5 mr-3" />
					Join Beta Program
				</a>
				<a
					href="https://build-os.com/feedback"
					class="inline-flex items-center px-8 py-4 border border-border text-foreground rounded-lg hover:bg-muted hover:border-accent transition-colors text-lg font-semibold shadow-ink pressable"
				>
					<MessageCircle class="w-5 h-5 mr-3" />
					Share Feedback
				</a>
			</div>

			<p class="text-sm text-muted-foreground mt-6">
				Free during beta • Direct founder access • Shape product direction
			</p>
		</div>
	</section>
</main>
