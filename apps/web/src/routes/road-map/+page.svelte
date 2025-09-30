<!-- apps/web/src/routes/road-map/+page.svelte -->
<script lang="ts">
	import {
		CheckCircle,
		Clock,
		Wrench,
		Calendar,
		Sparkles,
		Users,
		MessageCircle
	} from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';

	let innerWidth = 0;

	$: isMobile = innerWidth < 768;
</script>

<SEOHead
	title="Roadmap - BuildOS | AI-Powered Project Management Development Timeline"
	description="Detailed BuildOS development roadmap with monthly milestones. Track our progress building the AI co-pilot for chaotic, idea-rich minds."
	canonical="https://build-os.com/road-map"
	keywords="BuildOS roadmap, AI productivity development, project management roadmap, AI assistant timeline, brain dump organization roadmap"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: 'BuildOS Development Roadmap',
		description:
			'Detailed monthly timeline for BuildOS development - the AI project completion partner',
		author: {
			'@type': 'Organization',
			name: 'BuildOS'
		},
		publisher: {
			'@type': 'Organization',
			name: 'BuildOS',
			logo: {
				'@type': 'ImageObject',
				url: 'https://build-os.com/brain-bolt.png'
			}
		},
		datePublished: '2025-07-21',
		dateModified: '2025-08-28'
	}}
/>

<svelte:window bind:innerWidth />

<main class="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
	<!-- Header -->
	<section class="pt-24 pb-12 px-4 sm:px-6 lg:px-8">
		<div class="max-w-4xl mx-auto">
			<div class="flex items-center gap-4 mb-8">
				<img
					src="/brain-bolt.png"
					alt="BuildOS"
					class="w-12 h-12 rounded-xl"
					width="48"
					height="48"
				/>
				<div>
					<h1 class="text-4xl md:text-5xl font-bold">BuildOS Roadmap</h1>
					<p class="text-gray-600 dark:text-gray-400 mt-2">
						📅 Last updated: August 10, 2025
						{#if isMobile}
							<br />
						{/if}

						<a
							href="https://build-os.com/feedback"
							class="text-blue-600 hover:text-blue-700"
							>Got feedback? Report it here 📬</a
						>
					</p>
				</div>
			</div>

			<div
				class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-6 mb-8"
			>
				<h2 class="text-lg font-semibold mb-3 text-blue-900 dark:text-blue-100">
					🎯 Mission
				</h2>
				<p class="text-blue-800 dark:text-blue-200">
					Build the AI co-pilot for your chaotic, idea-rich mind. Users brain dump → AI
					organizes everything → Users execute → Projects get completed.
				</p>
			</div>

			<!-- Status Legend -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
				<div class="flex items-center gap-2">
					<CheckCircle class="w-5 h-5 text-green-600" />
					<span class="text-sm font-medium">Live</span>
				</div>
				<div class="flex items-center gap-2">
					<Wrench class="w-5 h-5 text-orange-600" />
					<span class="text-sm font-medium">In Progress</span>
				</div>
				<div class="flex items-center gap-2">
					<Calendar class="w-5 h-5 text-blue-600" />
					<span class="text-sm font-medium">Planned</span>
				</div>
				<div class="flex items-center gap-2">
					<Sparkles class="w-5 h-5 text-purple-600" />
					<span class="text-sm font-medium">Future Vision</span>
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
					<div class="w-3 h-3 bg-green-600 rounded-full"></div>
					<h2 class="text-2xl font-bold">July 2025 - Live & Functional</h2>
					<span
						class="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm font-medium"
					>
						Current State
					</span>
				</div>

				<div
					class="border-l-2 border-green-200 dark:border-green-800 pl-6 ml-1.5 space-y-4"
				>
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-green-600" />
							Core Brain Dump & Project System
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
							<li>✅ Brain Dump Capture (text & voice)</li>
							<li>
								✅ AI Parsing Engine - automatically extracts projects, tasks, notes
							</li>
							<li>✅ Project Complexity Detection - breaks big goals into phases</li>
							<li>
								✅ Rich Project Context - AI-generated markdown for each project
							</li>
							<li>
								✅ Voice-to-Action - convert voice dumps into structured projects
								and tasks
							</li>
							<li>✅ AI Summarization - actionable briefs for projects</li>
							<li>
								🔗 Context Linking - automatically connect related tasks, notes,
								projects to the original brain dump
							</li>
							<li>
								📜 View project context history - see how project has evolved from
								one braindump to the next
							</li>
						</ul>
					</div>

					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-green-600" />
							Smart Task & Calendar Management
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<CheckCircle class="w-4 h-4 text-green-600" />
							User Experience & Infrastructure
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
					<div class="w-3 h-3 bg-orange-600 rounded-full"></div>
					<h2 class="text-2xl font-bold">August 2025</h2>
					<span
						class="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded-full text-sm font-medium"
					>
						In Progress
					</span>
				</div>

				<div
					class="border-l-2 border-orange-200 dark:border-orange-800 pl-6 ml-1.5 space-y-4"
				>
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Wrench class="w-4 h-4 text-orange-600" />
							User Experience Improvements
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
					<div class="w-3 h-3 bg-blue-600 rounded-full"></div>
					<h2 class="text-2xl font-bold">September 2025</h2>
					<span
						class="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium"
					>
						Planned
					</span>
				</div>

				<div class="border-l-2 border-blue-200 dark:border-blue-800 pl-6 ml-1.5 space-y-4">
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Calendar class="w-4 h-4 text-blue-600" />
							Enhanced Organization
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
							<li>🏷️ Tagging & Search - organize and quickly find your data</li>
							<li>🗣️ Project Brief interaction</li>
							<li>⟳ Recurring Tasks & Projects - plan and automate your workflows</li>
							<li>💲 Activate pricing gate- 7 day free trial</li>
						</ul>
					</div>

					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Calendar class="w-4 h-4 text-blue-600" />
							Community & Integrations
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
					<div class="w-3 h-3 bg-purple-600 rounded-full"></div>
					<h2 class="text-2xl font-bold">October 2025</h2>
					<span
						class="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium"
					>
						Next Phase
					</span>
				</div>

				<div
					class="border-l-2 border-purple-200 dark:border-purple-800 pl-6 ml-1.5 space-y-4"
				>
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Sparkles class="w-4 h-4 text-purple-600" />
							Project Intelligence Engine (Beta)
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
					<div class="w-3 h-3 bg-purple-600 rounded-full"></div>
					<h2 class="text-2xl font-bold">November 2025</h2>
					<span
						class="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium"
					>
						Advanced Features
					</span>
				</div>

				<div
					class="border-l-2 border-purple-200 dark:border-purple-800 pl-6 ml-1.5 space-y-4"
				>
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Sparkles class="w-4 h-4 text-purple-600" />
							Predictive Project Management
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Sparkles class="w-4 h-4 text-purple-600" />
							Unified Interface Evolution
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
							<li>
								🇼🇮🇵 Eliminate separate /braindump page - everything flows through
								projects
							</li>
							<li>
								🇼🇮🇵 Context-aware braindump parsing - knows which project you're
								updating
							</li>
							<li>
								🇼🇮🇵 Daily brief braindumping - update projects through morning brief
							</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- DECEMBER 2025 -->
			<div class="mb-16">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-3 h-3 bg-indigo-600 rounded-full"></div>
					<h2 class="text-2xl font-bold">December 2025</h2>
					<span
						class="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 rounded-full text-sm font-medium"
					>
						Premium Launch
					</span>
				</div>

				<div
					class="border-l-2 border-indigo-200 dark:border-indigo-800 pl-6 ml-1.5 space-y-4"
				>
					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Sparkles class="w-4 h-4 text-indigo-600" />
							Premium Synthesis Features
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
							<li>💎 Deep Project Analysis - comprehensive project optimization</li>
							<li>💎 Strategic Recommendations - Strategic guidance</li>
							<li>💎 Custom Synthesis Requests - on-demand project deep dives</li>
							<li>💎 Multi-Project Portfolio Optimization</li>
						</ul>
						<div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<p class="text-sm text-blue-800 dark:text-blue-200">
								<strong>Tiered Model:</strong> Free tier includes basic task deduplication
								and simple suggestions. Premium tier unlocks advanced AI synthesis and
								proactive project management.
							</p>
						</div>
					</div>

					<div
						class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Sparkles class="w-4 h-4 text-indigo-600" />
							Complete Life Integration
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
					<div
						class="w-3 h-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full"
					></div>
					<h2 class="text-2xl font-bold">2026+ Future Vision</h2>
					<span
						class="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium"
					>
						Long-term Vision
					</span>
				</div>

				<div
					class="border-l-2 border-gradient-to-b border-purple-200 dark:border-purple-800 pl-6 ml-1.5 space-y-4"
				>
					<div
						class="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700"
					>
						<h3 class="font-semibold mb-3 flex items-center gap-2">
							<Sparkles class="w-4 h-4 text-purple-600" />
							AI Operating System for Projects
						</h3>
						<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
						<div class="mt-4 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg">
							<p class="text-sm font-medium text-purple-800 dark:text-purple-200">
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
	<section class="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-800">
		<div class="max-w-4xl mx-auto text-center">
			<h2 class="text-3xl font-bold mb-4">Help Shape the Future</h2>
			<p class="text-lg text-gray-600 dark:text-gray-400 mb-8">
				Join our beta community and work directly with us to influence this roadmap. Your
				feedback drives what we build next.
			</p>

			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="/beta"
					class="inline-flex items-center px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-lg font-semibold"
				>
					<Users class="w-5 h-5 mr-3" />
					Join Beta Program
				</a>
				<a
					href="https://build-os.com/feedback"
					class="inline-flex items-center px-8 py-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-lg font-semibold"
				>
					<MessageCircle class="w-5 h-5 mr-3" />
					Share Feedback
				</a>
			</div>

			<p class="text-sm text-gray-500 dark:text-gray-400 mt-6">
				Free during beta • Direct founder access • Shape product direction
			</p>
		</div>
	</section>
</main>
