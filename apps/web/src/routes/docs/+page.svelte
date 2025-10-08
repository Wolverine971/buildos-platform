<!-- apps/web/src/routes/docs/+page.svelte -->
<script lang="ts">
	import {
		Book,
		Code,
		Zap,
		Brain,
		Target,
		FolderOpen,
		Calendar,
		StickyNote,
		ArrowRight,
		Mail,
		BarChart3,
		Settings,
		Copy,
		Play,
		Edit3,
		CheckCircle,
		Clock
	} from 'lucide-svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Documentation - BuildOS | Complete Guide to AI-Native Productivity"
	description="Complete documentation for BuildOS. Learn how to transform brain dumps into organized projects with AI-powered context building, daily briefs, and calendar integration."
	canonical="https://build-os.com/docs"
	keywords="BuildOS documentation, brain dump guide, project context building, daily briefs, AI productivity tutorial, calendar integration, MCP server"
/>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="bg-white dark:bg-gray-800 py-20">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="flex justify-center mb-8">
				<video
					src="/onboarding-assets/animations/brain-bolt-electric.mp4"
					class="w-16 h-16"
					autoplay
					loop
					muted
					playsinline
					aria-label="BuildOS Icon"
				></video>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
				BuildOS Documentation
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
				Learn how to transform scattered thoughts into organized action with AI-powered
				context building and smart project management.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="#getting-started"
					class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
				>
					<Zap class="w-5 h-5 mr-2" />
					Quick Start Guide
				</a>
				<a
					href="#workflow"
					class="inline-flex items-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
				>
					<BarChart3 class="w-5 h-5 mr-2" />
					How It Works
				</a>
			</div>
		</div>
	</div>

	<!-- Main Documentation -->
	<div class="py-20">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
				<!-- Sidebar Navigation -->
				<div class="lg:col-span-1">
					<nav class="sticky top-8">
						<div
							class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
						>
							<h3 class="font-semibold text-gray-900 dark:text-white mb-4">
								Documentation
							</h3>
							<ul class="space-y-2">
								<li>
									<a
										href="#getting-started"
										class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
										>Getting Started</a
									>
								</li>
								<li>
									<a
										href="#navigation"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>Key Pages & Navigation</a
									>
								</li>
								<li>
									<a
										href="#workflow"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>How It Works</a
									>
								</li>
								<li>
									<a
										href="#brain-dump"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>Brain Dump</a
									>
								</li>
								<li>
									<a
										href="#project-context"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>Project Context</a
									>
								</li>
								<li>
									<a
										href="#phases"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>Phases & Task Management</a
									>
								</li>
								<li>
									<a
										href="#calendar"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>Calendar Integration</a
									>
								</li>
								<li>
									<a
										href="#daily-briefs"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>Daily Briefs</a
									>
								</li>
								<li>
									<a
										href="#llm-integration"
										class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
										>LLM Integration</a
									>
								</li>
							</ul>
						</div>
					</nav>
				</div>

				<!-- Main Content -->
				<div class="lg:col-span-3">
					<div
						class="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 space-y-12"
					>
						<!-- Getting Started -->
						<section id="getting-started">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Zap class="w-7 h-7 mr-3 text-primary-600 dark:text-primary-400" />
								Getting Started
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									BuildOS transforms your scattered thoughts into organized action
									through AI-powered project management. The key is to think in
									terms of projects from the start.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Recommended First-Time User Journey
								</h3>
								<ol
									class="list-decimal list-inside space-y-4 text-gray-600 dark:text-gray-300 mb-8"
								>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Log in and go to Brain Dump page</strong
										> - This is where the magic begins
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Brain dump about your first project</strong
										> - Choose "New Project" and talk about goals, current state,
										what's happening
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Review and approve AI operations</strong
										> - See what BuildOS will create before it executes
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Create more projects</strong
										> - Add work projects, fitness goals, personal initiatives
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Visit Projects page</strong
										> - View and manually edit your projects
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Generate phases</strong
										> - Create structured plans for complex projects
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Connect Google Calendar</strong
										> - Enable one-click task scheduling
									</li>
								</ol>

								<div
									class="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-6"
								>
									<h4
										class="font-semibold text-primary-900 dark:text-primary-100 mb-3"
									>
										💡 Pro Tip: Think in Projects
									</h4>
									<p class="text-primary-800 dark:text-primary-200">
										Always frame your brain dumps as projects with clear goals,
										phases, current state, and blockers. This helps BuildOS
										create rich, actionable context that you can use with any
										LLM.
									</p>
								</div>
							</div>
						</section>

						<!-- Navigation -->
						<section id="navigation">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<BarChart3
									class="w-7 h-7 mr-3 text-emerald-600 dark:text-emerald-400"
								/>
								Key Pages & Navigation
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-8">
									BuildOS is organized around five main pages that work together
									to keep you organized and productive:
								</p>

								<!-- Page Grid -->
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<BarChart3
												class="w-6 h-6 text-primary-600 dark:text-primary-400 mr-3"
											/>
											<h4
												class="font-semibold text-primary-900 dark:text-primary-100"
											>
												Dashboard
											</h4>
										</div>
										<p
											class="text-sm text-primary-800 dark:text-primary-200 mb-2"
										>
											Your daily command center showing:
										</p>
										<ul
											class="text-xs text-primary-700 dark:text-primary-300 space-y-1"
										>
											<li class="text-primary-700 dark:text-primary-300">
												• Today's tasks and tomorrow's agenda
											</li>
											<li class="text-primary-700 dark:text-primary-300">
												• Recent brain dumps
											</li>
											<li class="text-primary-700 dark:text-primary-300">
												• Past week's accomplishments
											</li>
											<li class="text-primary-700 dark:text-primary-300">
												• Quick access to all functions
											</li>
										</ul>
									</div>

									<div
										class="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<Brain
												class="w-6 h-6 text-purple-600 dark:text-purple-400 mr-3"
											/>
											<h4
												class="font-semibold text-purple-900 dark:text-purple-100"
											>
												Brain Dump
											</h4>
										</div>
										<p
											class="text-sm text-purple-800 dark:text-purple-200 mb-2"
										>
											Apple Notes-style interface for:
										</p>
										<ul
											class="text-xs text-purple-700 dark:text-purple-300 space-y-1"
										>
											<li class="text-purple-700 dark:text-purple-300">
												• Voice or text input
											</li>
											<li class="text-purple-700 dark:text-purple-300">
												• Project selection
											</li>
											<li class="text-purple-700 dark:text-purple-300">
												• Creating new projects
											</li>
											<li class="text-purple-700 dark:text-purple-300">
												• Adding quick notes
											</li>
										</ul>
									</div>

									<div
										class="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<FolderOpen
												class="w-6 h-6 text-emerald-600 dark:text-emerald-400 mr-3"
											/>
											<h4
												class="font-semibold text-emerald-900 dark:text-emerald-100"
											>
												Projects
											</h4>
										</div>
										<p
											class="text-sm text-emerald-800 dark:text-emerald-200 mb-2"
										>
											View and manage all projects:
										</p>
										<ul
											class="text-xs text-emerald-700 dark:text-emerald-300 space-y-1"
										>
											<li class="text-emerald-700 dark:text-emerald-300">
												• Edit project context
											</li>
											<li class="text-emerald-700 dark:text-emerald-300">
												• Manage tasks and notes
											</li>
											<li class="text-emerald-700 dark:text-emerald-300">
												• Generate phases
											</li>
											<li class="text-emerald-700 dark:text-emerald-300">
												• Export context for LLMs
											</li>
										</ul>
									</div>

									<div
										class="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<Mail
												class="w-6 h-6 text-orange-600 dark:text-orange-400 mr-3"
											/>
											<h4
												class="font-semibold text-orange-900 dark:text-orange-100"
											>
												Briefs
											</h4>
										</div>
										<p
											class="text-sm text-orange-800 dark:text-orange-200 mb-2"
										>
											AI-generated project updates:
										</p>
										<ul
											class="text-xs text-orange-700 dark:text-orange-300 space-y-1"
										>
											<li class="text-orange-700 dark:text-orange-300">
												• Individual project briefs
											</li>
											<li class="text-orange-700 dark:text-orange-300">
												• Master daily briefings
											</li>
											<li class="text-orange-700 dark:text-orange-300">
												• Customizable frequency
											</li>
											<li class="text-orange-700 dark:text-orange-300">
												• Email delivery options
											</li>
										</ul>
									</div>
								</div>

								<div
									class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-xl p-6"
								>
									<div class="flex items-center mb-3">
										<Clock
											class="w-6 h-6 text-gray-600 dark:text-gray-400 mr-3"
										/>
										<h4 class="font-semibold text-gray-900 dark:text-white">
											History
										</h4>
									</div>
									<p class="text-sm text-gray-700 dark:text-gray-300">
										Chronological view of all your brain dumps. Perfect for
										reflecting on your thinking patterns and tracking how
										projects evolved over time.
									</p>
								</div>

								<div
									class="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-6 mt-6"
								>
									<h4
										class="font-semibold text-primary-900 dark:text-primary-100 mb-3"
									>
										🔧 Settings & Integrations
									</h4>
									<p class="text-primary-800 dark:text-primary-200">
										Connect your Google Calendar and customize your productivity
										preferences at
										<a
											href="/profile?tab=calendar"
											class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline font-medium transition-colors"
											>/profile?tab=calendar</a
										>
									</p>
								</div>
							</div>
						</section>

						<!-- How It Works -->
						<section id="workflow">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Target
									class="w-7 h-7 mr-3 text-emerald-600 dark:text-emerald-400"
								/>
								How BuildOS Works
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-8">
									BuildOS follows a simple but powerful workflow that turns chaos
									into clarity:
								</p>

								<!-- Simple Flowchart -->
								<div
									class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-2xl p-8 mb-8"
								>
									<div class="flex flex-col space-y-6">
										<!-- Step 1 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/50 border border-purple-200 dark:border-purple-700 rounded-full"
											>
												<Brain
													class="w-6 h-6 text-purple-600 dark:text-purple-400"
												/>
											</div>
											<div class="flex-1">
												<h4
													class="font-semibold text-gray-900 dark:text-white"
												>
													Brain Dump About Projects
												</h4>
												<p class="text-sm text-gray-600 dark:text-gray-300">
													Capture project goals, current state, blockers,
													and thoughts
												</p>
											</div>
											<ArrowRight
												class="w-5 h-5 text-gray-400 dark:text-gray-500"
											/>
										</div>

										<!-- Step 2 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-primary-100 dark:bg-primary-900/50 border border-primary-200 dark:border-primary-700 rounded-full"
											>
												<CheckCircle
													class="w-6 h-6 text-primary-600 dark:text-primary-400"
												/>
											</div>
											<div class="flex-1">
												<h4
													class="font-semibold text-gray-900 dark:text-white"
												>
													Review & Approve AI Processing
												</h4>
												<p class="text-sm text-gray-600 dark:text-gray-300">
													See what BuildOS will create and edit before
													execution
												</p>
											</div>
											<ArrowRight
												class="w-5 h-5 text-gray-400 dark:text-gray-500"
											/>
										</div>

										<!-- Step 3 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 rounded-full"
											>
												<FolderOpen
													class="w-6 h-6 text-emerald-600 dark:text-emerald-400"
												/>
											</div>
											<div class="flex-1">
												<h4
													class="font-semibold text-gray-900 dark:text-white"
												>
													Rich Project Context Created
												</h4>
												<p class="text-sm text-gray-600 dark:text-gray-300">
													AI builds comprehensive markdown context + tasks
													+ notes
												</p>
											</div>
											<ArrowRight
												class="w-5 h-5 text-gray-400 dark:text-gray-500"
											/>
										</div>

										<!-- Step 4 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-orange-100 dark:bg-orange-900/50 border border-orange-200 dark:border-orange-700 rounded-full"
											>
												<Copy
													class="w-6 h-6 text-orange-600 dark:text-orange-400"
												/>
											</div>
											<div class="flex-1">
												<h4
													class="font-semibold text-gray-900 dark:text-white"
												>
													Export to Any LLM
												</h4>
												<p class="text-sm text-gray-600 dark:text-gray-300">
													Copy context to ChatGPT, Claude, or any AI for
													collaboration
												</p>
											</div>
											<ArrowRight
												class="w-5 h-5 text-gray-400 dark:text-gray-500"
											/>
										</div>

										<!-- Step 5 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-rose-100 dark:bg-rose-900/50 border border-rose-200 dark:border-rose-700 rounded-full"
											>
												<Brain
													class="w-6 h-6 text-rose-600 dark:text-rose-400"
												/>
											</div>
											<div class="flex-1">
												<h4
													class="font-semibold text-gray-900 dark:text-white"
												>
													Continuous Context Building
												</h4>
												<p class="text-sm text-gray-600 dark:text-gray-300">
													Dump learnings back to build richer project
													context
												</p>
											</div>
										</div>
									</div>
								</div>

								<div
									class="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-6"
								>
									<h4
										class="font-semibold text-primary-900 dark:text-primary-100 mb-3"
									>
										The Context Building Loop
									</h4>
									<p class="text-primary-800 dark:text-primary-200">
										Each brain dump builds richer project context. Copy this
										context to work with any LLM, then dump your learnings,
										research, and new insights back into BuildOS. This creates a
										powerful feedback loop of continuous project intelligence.
									</p>
								</div>
							</div>
						</section>

						<!-- Brain Dump -->
						<section id="brain-dump">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Brain class="w-7 h-7 mr-3 text-purple-600 dark:text-purple-400" />
								Brain Dump: The Starting Point
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									Brain dumping is where all organization begins in BuildOS. The
									interface is designed to capture thoughts quickly and
									intelligently process them into structured projects.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Brain Dump Interface
								</h3>

								<div class="relative mb-6">
									<div
										class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-xl p-4 shadow-lg"
									>
										<div
											class="relative overflow-hidden rounded-lg bg-white dark:bg-gray-900"
										>
											<img
												src="/blogs/s-braindump-page.webp"
												alt="BuildOS Brain Dump Interface - Project selection dropdown with Apple Notes-style input area"
												class="w-full h-auto object-contain max-w-full"
												style="aspect-ratio: 1405 / 893"
												loading="lazy"
												decoding="async"
											/>
											<!-- Optional: Add a subtle overlay for better text contrast if needed -->
											<div
												class="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none"
											></div>
										</div>
										<!-- Caption -->
										<p
											class="text-sm text-gray-600 dark:text-gray-400 mt-3 text-center italic"
										>
											Brain Dump interface showing project selection
										</p>
									</div>
								</div>

								<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
									<div
										class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center"
										>
											<FolderOpen
												class="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400"
											/>
											Existing Project
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Add to an existing project's context, tasks, and notes
										</p>
									</div>
									<div
										class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center"
										>
											<Target
												class="w-5 h-5 mr-2 text-primary-600 dark:text-primary-400"
											/>
											New Project
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Create a new project with goals, phases, and context
										</p>
									</div>
									<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6">
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center"
										>
											<StickyNote
												class="w-5 h-5 mr-2 text-amber-600 dark:text-amber-400"
											/>
											Quick Note
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Capture thoughts that don't belong to a specific project
										</p>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Input Methods
								</h3>
								<ul
									class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 mb-6"
								>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Voice Input:</strong
										> Speak naturally about your project like you're talking to a
										colleague
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Text Input:</strong
										> Type stream-of-consciousness style thoughts and ideas
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Mixed Mode:</strong
										> Switch between voice and text as needed
									</li>
								</ul>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Best Practices for New Projects
								</h3>
								<div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 mb-6">
									<p class="text-gray-600 dark:text-gray-300 mb-4">
										When creating a new project, include these elements in your
										brain dump:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Clear Goals:</strong
											> What you want to achieve
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Current State:</strong
											> Where you are now
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Phases/Timeline:</strong
											> How you plan to get there
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Blockers:</strong
											> What's in your way
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Resources:</strong
											> What tools/people you need
										</li>
									</ul>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									AI Processing & Approval
								</h3>
								<p class="text-gray-600 dark:text-gray-300 mb-4">
									After brain dumping, BuildOS shows you exactly what it plans to
									create:
								</p>
								<div class="space-y-3 mb-6">
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
										/>
										<span class="text-gray-600 dark:text-gray-300"
											>Preview project context sections</span
										>
									</div>
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
										/>
										<span class="text-gray-600 dark:text-gray-300"
											>Review generated tasks and notes</span
										>
									</div>
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
										/>
										<span class="text-gray-600 dark:text-gray-300"
											>Edit before final approval</span
										>
									</div>
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
										/>
										<span class="text-gray-600 dark:text-gray-300"
											>Execute with confidence</span
										>
									</div>
								</div>

								<div
									class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-600 rounded-xl p-6"
								>
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										Example Brain Dump (Fitness Project)
									</h4>
									<blockquote class="text-gray-600 dark:text-gray-300 italic">
										"I want to start a fitness project. My goal is to lose 20
										pounds and build muscle over the next 6 months. Right now
										I'm completely out of shape and haven't worked out in 2
										years. I think I need to start with basic cardio and
										bodyweight exercises, then gradually add weight training. My
										biggest blockers are time management and staying motivated.
										I have a gym membership but prefer working out at home
										initially..."
									</blockquote>
								</div>
							</div>
						</section>

						<!-- Project Context -->
						<section id="project-context">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Target
									class="w-7 h-7 mr-3 text-primary-600 dark:text-primary-400"
								/>
								Project Context: Your AI Collaboration Engine
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									Project context is the most powerful feature of BuildOS. It's
									rich, structured information about your projects that gets
									smarter with every brain dump and serves as the foundation for
									AI collaboration.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									What is Project Context?
								</h3>
								<div
									class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6 mb-6"
								>
									<p class="text-gray-600 dark:text-gray-300 mb-4">
										Project context is a comprehensive markdown document that
										captures everything important about your project:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											Strategic objectives and success metrics
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Current status and progress updates
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Challenges, blockers, and solutions
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Resources, tools, and team information
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Timeline, phases, and next actions
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Technical details and implementation notes
										</li>
									</ul>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									How Context Builds Over Time
								</h3>
								<div class="space-y-4 mb-8">
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											1
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Initial Brain Dump:</strong
												> AI creates foundational context structure
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											2
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Ongoing Brain Dumps:</strong
												> Each session adds new insights and updates
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											3
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Manual Refinement:</strong
												> Edit and restructure using the rich markdown editor
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											4
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>External Research:</strong
												> Import learnings from LLM collaborations and research
											</p>
										</div>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Context Editing Interface
								</h3>

								<!-- Placeholder for context editing screenshot -->
								<div class="relative mb-6">
									<div
										class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-xl p-4 shadow-lg"
									>
										<div
											class="relative overflow-hidden rounded-lg bg-white dark:bg-gray-900"
										>
											<img
												src="/blogs/s-context-edit.webp"
												alt="Rich markdown editor for editing project context"
												class="w-full h-auto object-contain max-w-full"
												style="aspect-ratio: 1356 / 996"
												loading="lazy"
												decoding="async"
											/>
											<!-- Optional: Add a subtle overlay for better text contrast if needed -->
											<div
												class="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none"
											></div>
										</div>
										<!-- Caption -->
										<p
											class="text-sm text-gray-600 dark:text-gray-400 mt-3 text-center italic"
										>
											Rich markdown editor with section organization and
											ability to export context.
										</p>
									</div>
								</div>

								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<Edit3
												class="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2"
											/>
											<h4 class="font-semibold text-gray-900 dark:text-white">
												Rich Markdown Editor
											</h4>
										</div>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Full markdown support with headers, lists, links, and
											formatting for comprehensive project documentation
										</p>
									</div>
									<div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6">
										<div class="flex items-center mb-3">
											<Copy
												class="w-5 h-5 text-purple-600 dark:text-purple-400 mr-2"
											/>
											<h4 class="font-semibold text-gray-900 dark:text-white">
												One-Click Export
											</h4>
										</div>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Copy full context to clipboard for immediate use in
											ChatGPT, Claude, or any LLM
										</p>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									The LLM Collaboration Workflow
								</h3>
								<div
									class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 mb-6"
								>
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										🔄 The Power Loop
									</h4>
									<ol
										class="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Export context</strong
											> from BuildOS to any LLM
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Collaborate and research</strong
											> with AI using rich project context
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Create documents, plans, code</strong
											> with informed AI assistance
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Brain dump learnings</strong
											> back into BuildOS
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Context gets richer</strong
											> for next iteration
										</li>
									</ol>
									<p class="text-gray-600 dark:text-gray-300 mt-4">
										This creates a continuous intelligence loop where your
										projects become smarter and more detailed over time.
									</p>
								</div>

								<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6">
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										💡 Why Context Matters
									</h4>
									<p class="text-gray-600 dark:text-gray-300">
										Instead of starting every AI conversation from scratch, you
										bring rich, evolving context that helps LLMs understand your
										projects deeply. This leads to better advice, more relevant
										suggestions, and faster problem-solving.
									</p>
								</div>
							</div>
						</section>

						<!-- Phases & Task Management -->
						<section id="phases">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Calendar
									class="w-7 h-7 mr-3 text-emerald-600 dark:text-emerald-400"
								/>
								Phases & Task Management
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									Transform your projects into structured execution plans with
									AI-generated phases and intelligent task organization.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Phase Generation
								</h3>
								<div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 mb-6">
									<p class="text-gray-600 dark:text-gray-300 mb-4">
										Click the "Generate Phases" button on any project to create
										a structured execution plan:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											AI analyzes your project context and existing tasks
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Creates 2-8 logical phases based on project complexity
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Organizes tasks into appropriate phases with dependency
											respect
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Suggests timelines and milestones for each phase
										</li>
									</ul>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Kanban & Timeline Views
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center"
										>
											<Target
												class="w-5 h-5 mr-2 text-primary-600 dark:text-primary-400"
											/>
											Kanban View
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
											Trello-style board with phases as columns
										</p>
										<ul
											class="text-xs text-gray-600 dark:text-gray-300 space-y-1"
										>
											<li class="text-gray-700 dark:text-gray-300">
												• Drag and drop tasks between phases
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Visual progress tracking
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Easy task management
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Phase-by-phase organization
											</li>
										</ul>
									</div>
									<div
										class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center"
										>
											<BarChart3
												class="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400"
											/>
											Timeline View
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
											Gantt-style timeline with date tracking
										</p>
										<ul
											class="text-xs text-gray-600 dark:text-gray-300 space-y-1"
										>
											<li class="text-gray-700 dark:text-gray-300">
												• Phase start and end dates
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Dependency visualization
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Timeline adjustments
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Progress milestones
											</li>
										</ul>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Task Management Features
								</h3>
								<div class="space-y-4 mb-6">
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Manual Task Creation:</strong
												> Add tasks directly to any project or phase
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>AI Task Generation:</strong
												> Tasks created automatically from brain dumps
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Drag & Drop Organization:</strong
												> Move tasks between phases easily
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Task Dependencies:</strong
												> Link tasks that depend on each other
											</p>
										</div>
									</div>
								</div>

								<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6">
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										🎯 Phase Management Tips
									</h4>
									<ul
										class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											Use phases to break large projects into manageable
											chunks
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Adjust AI-generated phases to match your preferred
											working style
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Move tasks between phases as your project evolves
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Use timeline view for deadline-driven projects
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Use kanban view for flexible, iteration-based work
										</li>
									</ul>
								</div>
							</div>
						</section>

						<!-- Calendar Integration -->
						<section id="calendar">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Calendar
									class="w-7 h-7 mr-3 text-emerald-600 dark:text-emerald-400"
								/>
								Calendar Integration
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									Transform tasks into scheduled action with seamless Google
									Calendar integration. Bridge the gap between planning and
									execution.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Setup Instructions
								</h3>
								<ol
									class="list-decimal list-inside space-y-3 text-gray-600 dark:text-gray-300 mb-8"
								>
									<li class="text-gray-700 dark:text-gray-300">
										Go to
										<a
											href="/profile?tab=calendar"
											class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
											>/profile and tab "calendar"</a
										>
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										Click "Connect Google Calendar" to open OAuth flow
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										Grant BuildOS permissions to read and create calendar events
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										Configure your work hours and scheduling preferences
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										Start one-click scheduling tasks to your calendar
									</li>
								</ol>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Smart Scheduling Features
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<Calendar
												class="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2"
											/>
											<h4 class="font-semibold text-gray-900 dark:text-white">
												One-Click Scheduling
											</h4>
										</div>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Click "Schedule" on any task to automatically find
											optimal time slots and create calendar events
										</p>
									</div>
									<div
										class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6"
									>
										<div class="flex items-center mb-3">
											<Settings
												class="w-5 h-5 text-primary-600 dark:text-primary-400 mr-2"
											/>
											<h4 class="font-semibold text-gray-900 dark:text-white">
												Work Hours Respect
											</h4>
										</div>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Only schedules during your defined working hours and
											respects your work-life balance preferences
										</p>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Calendar vs Task Dates
								</h3>
								<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 mb-6">
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										📅 Important Distinction
									</h4>
									<p class="text-gray-600 dark:text-gray-300 mb-4">
										Tasks can have due dates for planning purposes, but calendar
										scheduling is a separate action:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Task Dates:</strong
											> Due dates and deadlines for project planning
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Calendar Events:</strong
											> Actual time blocks when you'll work on tasks
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Your Choice:</strong
											> Decide which tasks get scheduled and when
										</li>
									</ul>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Scheduling Workflow
								</h3>
								<div class="space-y-4 mb-6">
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											1
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>View tasks</strong
												> in your Dashboard, Projects, or Phases
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											2
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Click "Schedule"</strong
												> on any task you want to time-block
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											3
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Choose date and time</strong
												> from suggested optimal slots
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											4
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Event created</strong
												> with task context and details automatically included
											</p>
										</div>
									</div>
								</div>

								<div class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6">
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										🔗 Currently Supported
									</h4>
									<p class="text-gray-600 dark:text-gray-300">
										Google Calendar integration is fully live. Support for
										Outlook, Apple Calendar, and other providers is planned for
										future releases based on user feedback.
									</p>
								</div>
							</div>
						</section>

						<!-- Daily Briefs -->
						<section id="daily-briefs">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Mail class="w-7 h-7 mr-3 text-orange-600 dark:text-orange-400" />
								Daily Briefs
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									Stay aligned with AI-generated briefings that synthesize your
									project status, priorities, and next actions into actionable
									intelligence.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Brief Types & Customization
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2"
										>
											Individual Project Briefs
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Deep-dive updates on specific projects with focused
											insights, next actions, and context-aware
											recommendations
										</p>
									</div>
									<div
										class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2"
										>
											Master Daily Briefings
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											Comprehensive overview of all projects, priorities for
											the day, and strategic alignment across your work
										</p>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Scheduling & Delivery
								</h3>
								<ul
									class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 mb-6"
								>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Daily Frequency:</strong
										> Perfect for active projects needing constant momentum
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Weekly Frequency:</strong
										> Great for longer-term projects and strategic overview
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>Email Delivery:</strong
										> Briefs delivered to your inbox automatically
									</li>
									<li class="text-gray-700 dark:text-gray-300">
										<strong class="text-gray-900 dark:text-white"
											>In-App Access:</strong
										> View all briefs on the Briefs page anytime
									</li>
								</ul>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									What's Included in Briefs
								</h3>
								<div class="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 mb-6">
									<p class="text-gray-600 dark:text-gray-300 mb-4">
										Each brief is generated from your rich project context and
										includes:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Project Status:</strong
											> Current progress and milestone updates
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Priority Actions:</strong
											> What to focus on today/this week
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Blockers & Challenges:</strong
											> Items needing attention or decisions
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Recent Context:</strong
											> Insights from latest brain dumps
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											<strong class="text-gray-900 dark:text-white"
												>Strategic Alignment:</strong
											> How projects connect to your bigger goals
										</li>
									</ul>
								</div>

								<div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6">
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										📧 Smart Intelligence Delivery
									</h4>
									<p class="text-gray-600 dark:text-gray-300">
										Briefs aren't just task lists - they're intelligent
										synthesis of your project context that help you stay
										strategic while maintaining momentum. Each brief is unique
										to your current situation and goals.
									</p>
								</div>
							</div>
						</section>

						<!-- LLM Integration -->
						<section id="llm-integration">
							<h2
								class="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center"
							>
								<Copy class="w-7 h-7 mr-3 text-purple-600 dark:text-purple-400" />
								LLM Integration: Your AI Collaboration Advantage
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-gray-600 dark:text-gray-300 mb-6">
									BuildOS's most powerful feature is seamless integration with any
									LLM. Copy rich project context to ChatGPT, Claude, or any AI for
									informed collaboration.
								</p>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									The Context Export Workflow
								</h3>
								<div class="space-y-4 mb-8">
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											1
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>One-Click Copy:</strong
												> Export full project context from any project page
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											2
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Paste in Any LLM:</strong
												> Provide rich context to ChatGPT, Claude, Gemini, etc.
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											3
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Collaborate & Create:</strong
												> Get informed AI assistance on strategy, code, content,
												etc.
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											4
										</div>
										<div>
											<p class="text-gray-600 dark:text-gray-300">
												<strong class="text-gray-900 dark:text-white"
													>Brain Dump Results:</strong
												> Add new insights back to BuildOS to enrich context
											</p>
										</div>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									Use Cases for LLM Collaboration
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2"
										>
											Strategic Planning
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
											Share project context for informed strategy advice
										</p>
										<ul
											class="text-xs text-gray-600 dark:text-gray-300 space-y-1"
										>
											<li class="text-gray-700 dark:text-gray-300">
												• Market analysis with project specifics
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Risk assessment for current initiatives
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Resource allocation recommendations
											</li>
										</ul>
									</div>
									<div
										class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6"
									>
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2"
										>
											Technical Implementation
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
											Get code and architecture advice with full context
										</p>
										<ul
											class="text-xs text-gray-600 dark:text-gray-300 space-y-1"
										>
											<li class="text-gray-700 dark:text-gray-300">
												• Code reviews with project requirements
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Architecture decisions with constraints
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Debugging with system context
											</li>
										</ul>
									</div>
									<div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6">
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2"
										>
											Content Creation
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
											Generate aligned content with brand context
										</p>
										<ul
											class="text-xs text-gray-600 dark:text-gray-300 space-y-1"
										>
											<li class="text-gray-700 dark:text-gray-300">
												• Marketing copy with brand voice
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Documentation with technical context
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Blog posts with strategic alignment
											</li>
										</ul>
									</div>
									<div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6">
										<h4
											class="font-semibold text-gray-900 dark:text-white mb-2"
										>
											Problem Solving
										</h4>
										<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
											Get specific solutions with complete context
										</p>
										<ul
											class="text-xs text-gray-600 dark:text-gray-300 space-y-1"
										>
											<li class="text-gray-700 dark:text-gray-300">
												• Troubleshooting with environment details
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Process improvement with current workflows
											</li>
											<li class="text-gray-700 dark:text-gray-300">
												• Decision making with all constraints
											</li>
										</ul>
									</div>
								</div>

								<h3
									class="text-xl font-semibold text-gray-900 dark:text-white mb-4"
								>
									The Continuous Intelligence Loop
								</h3>
								<div
									class="bg-gradient-to-r from-purple-50 to-primary-50 dark:from-purple-900/20 dark:to-primary-900/20 rounded-xl p-6 mb-6"
								>
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										🔄 BuildOS + LLMs = Compound Intelligence
									</h4>
									<p class="text-gray-600 dark:text-gray-300 mb-4">
										Each collaboration cycle makes your projects smarter:
									</p>
									<ol
										class="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300"
									>
										<li class="text-gray-700 dark:text-gray-300">
											Export rich context → Get better AI advice
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Create documents/code/strategies → With informed AI
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Brain dump learnings → Context gets richer
										</li>
										<li class="text-gray-700 dark:text-gray-300">
											Next export includes new insights → Even better advice
										</li>
									</ol>
								</div>

								<div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6">
									<h4 class="font-semibold text-gray-900 dark:text-white mb-3">
										💡 Why This Matters
									</h4>
									<p class="text-gray-600 dark:text-gray-300">
										Instead of starting every AI conversation from scratch, you
										build cumulative intelligence. Your projects become living
										documents that grow smarter with every interaction, leading
										to faster problem-solving and better outcomes.
									</p>
								</div>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Help Section -->
	<section class="py-20 bg-white dark:bg-gray-800">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">
				Ready to Start Building?
			</h2>
			<p class="text-lg text-gray-600 dark:text-gray-300 mb-8">
				Transform your scattered thoughts into organized action with BuildOS's AI-powered
				project management.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="/auth/register"
					class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
				>
					Get Started Now <ArrowRight class="w-4 h-4 ml-2" />
				</a>
				<a
					href="/contact"
					class="inline-flex items-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
				>
					Contact Support <ArrowRight class="w-4 h-4 ml-2" />
				</a>
			</div>
		</div>
	</section>
</div>
