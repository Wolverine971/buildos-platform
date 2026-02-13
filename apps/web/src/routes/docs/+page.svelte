<!-- apps/web/src/routes/docs/+page.svelte -->
<script lang="ts">
	import {
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

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="bg-muted py-20">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="flex justify-center mb-8">
				<div
					class="rounded-lg border border-border bg-card shadow-ink w-16 h-16 rounded-sm flex items-center justify-center"
				>
					<video
						src="/onboarding-assets/animations/brain-bolt-electric.mp4"
						class="w-12 h-12"
						autoplay
						loop
						muted
						playsinline
						aria-label="BuildOS Icon"
					></video>
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-6">
				BuildOS Documentation
			</h1>
			<p class="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
				Learn how to transform scattered thoughts into organized action with AI-powered
				context building and smart project management.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="#getting-started"
					class="inline-flex items-center px-6 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:bg-accent/90 transition-colors shadow-ink pressable"
				>
					<Zap class="w-5 h-5 mr-2" />
					Quick Start Guide
				</a>
				<a
					href="#workflow"
					class="inline-flex items-center px-6 py-3 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-muted transition-colors shadow-ink"
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
							class="rounded-lg border border-border bg-card shadow-ink p-6 relative tx tx-frame tx-weak"
						>
							<h3 class="font-semibold text-foreground mb-4">Documentation</h3>
							<ul class="space-y-2">
								<li>
									<a
										href="#getting-started"
										class="text-accent hover:text-accent/80 transition-all"
										>Getting Started</a
									>
								</li>
								<li>
									<a
										href="#navigation"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>Key Pages & Navigation</a
									>
								</li>
								<li>
									<a
										href="#workflow"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>How It Works</a
									>
								</li>
								<li>
									<a
										href="#brain-dump"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>Brain Dump</a
									>
								</li>
								<li>
									<a
										href="#project-context"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>Project Context</a
									>
								</li>
								<li>
									<a
										href="#phases"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>Phases & Task Management</a
									>
								</li>
								<li>
									<a
										href="#calendar"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>Calendar Integration</a
									>
								</li>
								<li>
									<a
										href="#daily-briefs"
										class="text-muted-foreground hover:text-foreground transition-colors"
										>Daily Briefs</a
									>
								</li>
								<li>
									<a
										href="#llm-integration"
										class="text-muted-foreground hover:text-foreground transition-colors"
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
						class="rounded-lg border border-border bg-card shadow-ink p-8 relative space-y-12 tx tx-grain tx-weak"
					>
						<!-- Getting Started -->
						<section id="getting-started">
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Zap class="w-7 h-7 mr-3 text-accent" />
								Getting Started
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									BuildOS transforms your scattered thoughts into organized action
									through AI-powered project management. The key is to think in
									terms of projects from the start.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Recommended First-Time User Journey
								</h3>
								<ol
									class="list-decimal list-inside space-y-4 text-muted-foreground mb-8"
								>
									<li class="text-muted-foreground">
										<strong class="text-foreground"
											>Log in and go to Brain Dump page</strong
										> - This is where the magic begins
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground"
											>Brain dump about your first project</strong
										> - Choose "New Project" and talk about goals, current state,
										what's happening
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground"
											>Review and approve AI operations</strong
										> - See what BuildOS will create before it executes
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Create more projects</strong
										> - Add work projects, fitness goals, personal initiatives
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Visit Projects page</strong>
										- View and manually edit your projects
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Generate phases</strong> - Create
										structured plans for complex projects
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground"
											>Connect Google Calendar</strong
										> - Enable one-click task scheduling
									</li>
								</ol>

								<div class="bg-accent/10 border border-accent/30 rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										💡 Pro Tip: Think in Projects
									</h4>
									<p class="text-muted-foreground">
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
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<BarChart3 class="w-7 h-7 mr-3 text-foreground" />
								Key Pages & Navigation
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-8">
									BuildOS is organized around five main pages that work together
									to keep you organized and productive:
								</p>

								<!-- Page Grid -->
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div
										class="bg-accent/10 border border-accent/30 rounded-lg p-6"
									>
										<div class="flex items-center mb-3">
											<BarChart3 class="w-6 h-6 text-accent mr-3" />
											<h4 class="font-semibold text-foreground">Dashboard</h4>
										</div>
										<p class="text-sm text-muted-foreground mb-2">
											Your daily command center showing:
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Today's tasks and tomorrow's agenda
											</li>
											<li class="text-muted-foreground">
												• Recent brain dumps
											</li>
											<li class="text-muted-foreground">
												• Past week's accomplishments
											</li>
											<li class="text-muted-foreground">
												• Quick access to all functions
											</li>
										</ul>
									</div>

									<div
										class="bg-accent/10 border border-accent/30 rounded-lg p-6"
									>
										<div class="flex items-center mb-3">
											<Brain class="w-6 h-6 text-accent mr-3" />
											<h4 class="font-semibold text-foreground">
												Brain Dump
											</h4>
										</div>
										<p class="text-sm text-muted-foreground mb-2">
											Apple Notes-style interface for:
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Voice or text input
											</li>
											<li class="text-muted-foreground">
												• Project selection
											</li>
											<li class="text-muted-foreground">
												• Creating new projects
											</li>
											<li class="text-muted-foreground">
												• Adding quick notes
											</li>
										</ul>
									</div>

									<div class="bg-muted border border-border rounded-lg p-6">
										<div class="flex items-center mb-3">
											<FolderOpen class="w-6 h-6 text-foreground mr-3" />
											<h4 class="font-semibold text-foreground">Projects</h4>
										</div>
										<p class="text-sm text-muted-foreground mb-2">
											View and manage all projects:
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Edit project context
											</li>
											<li class="text-muted-foreground">
												• Manage tasks and notes
											</li>
											<li class="text-muted-foreground">• Generate phases</li>
											<li class="text-muted-foreground">
												• Export context for LLMs
											</li>
										</ul>
									</div>

									<div class="bg-muted border border-border rounded-lg p-6">
										<div class="flex items-center mb-3">
											<Mail class="w-6 h-6 text-foreground mr-3" />
											<h4 class="font-semibold text-foreground">Briefs</h4>
										</div>
										<p class="text-sm text-muted-foreground mb-2">
											AI-generated project updates:
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Individual project briefs
											</li>
											<li class="text-muted-foreground">
												• Master daily briefings
											</li>
											<li class="text-muted-foreground">
												• Customizable frequency
											</li>
											<li class="text-muted-foreground">
												• Email delivery options
											</li>
										</ul>
									</div>
								</div>

								<div class="bg-muted border border-border rounded-lg p-6">
									<div class="flex items-center mb-3">
										<Clock class="w-6 h-6 text-muted-foreground mr-3" />
										<h4 class="font-semibold text-foreground">History</h4>
									</div>
									<p class="text-sm text-muted-foreground">
										Chronological view of all your brain dumps. Perfect for
										reflecting on your thinking patterns and tracking how
										projects evolved over time.
									</p>
								</div>

								<div
									class="bg-accent/10 border border-accent/30 rounded-lg p-6 mt-6"
								>
									<h4 class="font-semibold text-foreground mb-3">
										🔧 Settings & Integrations
									</h4>
									<p class="text-muted-foreground">
										Connect your Google Calendar and customize your productivity
										preferences at
										<a
											href="/profile?tab=calendar"
											class="text-accent hover:text-accent/80 hover:underline font-medium transition-colors"
											>/profile?tab=calendar</a
										>
									</p>
								</div>
							</div>
						</section>

						<!-- How It Works -->
						<section id="workflow">
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Target class="w-7 h-7 mr-3 text-foreground" />
								How BuildOS Works
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-8">
									BuildOS follows a simple but powerful workflow that turns chaos
									into clarity:
								</p>

								<!-- Simple Flowchart -->
								<div class="bg-muted border border-border rounded-lg p-8 mb-8">
									<div class="flex flex-col space-y-6">
										<!-- Step 1 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-accent/20 border border-accent/30 rounded-full"
											>
												<Brain class="w-6 h-6 text-accent" />
											</div>
											<div class="flex-1">
												<h4 class="font-semibold text-foreground">
													Brain Dump About Projects
												</h4>
												<p class="text-sm text-muted-foreground">
													Capture project goals, current state, blockers,
													and thoughts
												</p>
											</div>
											<ArrowRight class="w-5 h-5 text-muted-foreground/60" />
										</div>

										<!-- Step 2 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-accent/20 border border-accent/40 rounded-full"
											>
												<CheckCircle class="w-6 h-6 text-accent" />
											</div>
											<div class="flex-1">
												<h4 class="font-semibold text-foreground">
													Review & Approve AI Processing
												</h4>
												<p class="text-sm text-muted-foreground">
													See what BuildOS will create and edit before
													execution
												</p>
											</div>
											<ArrowRight class="w-5 h-5 text-muted-foreground/60" />
										</div>

										<!-- Step 3 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-muted border border-border rounded-full"
											>
												<FolderOpen class="w-6 h-6 text-foreground" />
											</div>
											<div class="flex-1">
												<h4 class="font-semibold text-foreground">
													Rich Project Context Created
												</h4>
												<p class="text-sm text-muted-foreground">
													AI builds comprehensive markdown context + tasks
													+ notes
												</p>
											</div>
											<ArrowRight class="w-5 h-5 text-muted-foreground/60" />
										</div>

										<!-- Step 4 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-muted border border-border rounded-full"
											>
												<Copy class="w-6 h-6 text-foreground" />
											</div>
											<div class="flex-1">
												<h4 class="font-semibold text-foreground">
													Export to Any LLM
												</h4>
												<p class="text-sm text-muted-foreground">
													Copy context to ChatGPT, Claude, or any AI for
													collaboration
												</p>
											</div>
											<ArrowRight class="w-5 h-5 text-muted-foreground/60" />
										</div>

										<!-- Step 5 -->
										<div class="flex items-center space-x-4">
											<div
												class="flex items-center justify-center w-12 h-12 bg-muted border border-border rounded-full"
											>
												<Brain class="w-6 h-6 text-foreground" />
											</div>
											<div class="flex-1">
												<h4 class="font-semibold text-foreground">
													Continuous Context Building
												</h4>
												<p class="text-sm text-muted-foreground">
													Dump learnings back to build richer project
													context
												</p>
											</div>
										</div>
									</div>
								</div>

								<div class="bg-accent/10 border border-accent/30 rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										The Context Building Loop
									</h4>
									<p class="text-muted-foreground">
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
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Brain class="w-7 h-7 mr-3 text-accent" />
								Brain Dump: The Starting Point
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									Brain dumping is where all organization begins in BuildOS. The
									interface is designed to capture thoughts quickly and
									intelligently process them into structured projects.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Brain Dump Interface
								</h3>

								<div class="relative mb-6">
									<div
										class="bg-muted border border-border rounded-lg p-4 shadow-ink-strong"
									>
										<div class="relative overflow-hidden rounded-lg bg-card">
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
											class="text-sm text-muted-foreground mt-3 text-center italic"
										>
											Brain Dump interface showing project selection
										</p>
									</div>
								</div>

								<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
									<div class="bg-muted rounded-lg p-6">
										<h4
											class="font-semibold text-foreground mb-2 flex items-center"
										>
											<FolderOpen class="w-5 h-5 mr-2 text-foreground" />
											Existing Project
										</h4>
										<p class="text-sm text-muted-foreground">
											Add to an existing project's context, tasks, and notes
										</p>
									</div>
									<div class="bg-accent/10 rounded-lg p-6">
										<h4
											class="font-semibold text-foreground mb-2 flex items-center"
										>
											<Target class="w-5 h-5 mr-2 text-accent" />
											New Project
										</h4>
										<p class="text-sm text-muted-foreground">
											Create a new project with goals, phases, and context
										</p>
									</div>
									<div class="bg-muted rounded-lg p-6">
										<h4
											class="font-semibold text-foreground mb-2 flex items-center"
										>
											<StickyNote class="w-5 h-5 mr-2 text-foreground" />
											Quick Note
										</h4>
										<p class="text-sm text-muted-foreground">
											Capture thoughts that don't belong to a specific project
										</p>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Input Methods
								</h3>
								<ul
									class="list-disc list-inside space-y-2 text-muted-foreground mb-6"
								>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Voice Input:</strong> Speak naturally
										about your project like you're talking to a colleague
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Text Input:</strong> Type stream-of-consciousness
										style thoughts and ideas
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Mixed Mode:</strong> Switch between
										voice and text as needed
									</li>
								</ul>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Best Practices for New Projects
								</h3>
								<div class="bg-accent/10 rounded-lg p-6 mb-6">
									<p class="text-muted-foreground mb-4">
										When creating a new project, include these elements in your
										brain dump:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Clear Goals:</strong> What
											you want to achieve
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Current State:</strong> Where
											you are now
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Phases/Timeline:</strong
											> How you plan to get there
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Blockers:</strong> What's
											in your way
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Resources:</strong> What
											tools/people you need
										</li>
									</ul>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									AI Processing & Approval
								</h3>
								<p class="text-muted-foreground mb-4">
									After brain dumping, BuildOS shows you exactly what it plans to
									create:
								</p>
								<div class="space-y-3 mb-6">
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0"
										/>
										<span class="text-muted-foreground"
											>Preview project context sections</span
										>
									</div>
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0"
										/>
										<span class="text-muted-foreground"
											>Review generated tasks and notes</span
										>
									</div>
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0"
										/>
										<span class="text-muted-foreground"
											>Edit before final approval</span
										>
									</div>
									<div class="flex items-center space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0"
										/>
										<span class="text-muted-foreground"
											>Execute with confidence</span
										>
									</div>
								</div>

								<div class="bg-muted border border-border rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										Example Brain Dump (Fitness Project)
									</h4>
									<blockquote class="text-muted-foreground italic">
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
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Target class="w-7 h-7 mr-3 text-accent" />
								Project Context: Your AI Collaboration Engine
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									Project context is the most powerful feature of BuildOS. It's
									rich, structured information about your projects that gets
									smarter with every brain dump and serves as the foundation for
									AI collaboration.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									What is Project Context?
								</h3>
								<div class="bg-accent/10 rounded-lg p-6 mb-6">
									<p class="text-muted-foreground mb-4">
										Project context is a comprehensive markdown document that
										captures everything important about your project:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											Strategic objectives and success metrics
										</li>
										<li class="text-muted-foreground">
											Current status and progress updates
										</li>
										<li class="text-muted-foreground">
											Challenges, blockers, and solutions
										</li>
										<li class="text-muted-foreground">
											Resources, tools, and team information
										</li>
										<li class="text-muted-foreground">
											Timeline, phases, and next actions
										</li>
										<li class="text-muted-foreground">
											Technical details and implementation notes
										</li>
									</ul>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									How Context Builds Over Time
								</h3>
								<div class="space-y-4 mb-8">
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											1
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Initial Brain Dump:</strong
												> AI creates foundational context structure
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											2
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Ongoing Brain Dumps:</strong
												> Each session adds new insights and updates
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											3
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Manual Refinement:</strong
												> Edit and restructure using the rich markdown editor
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											4
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>External Research:</strong
												> Import learnings from LLM collaborations and research
											</p>
										</div>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Context Editing Interface
								</h3>

								<!-- Placeholder for context editing screenshot -->
								<div class="relative mb-6">
									<div
										class="bg-muted border border-border rounded-lg p-4 shadow-ink-strong"
									>
										<div class="relative overflow-hidden rounded-lg bg-card">
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
											class="text-sm text-muted-foreground mt-3 text-center italic"
										>
											Rich markdown editor with section organization and
											ability to export context.
										</p>
									</div>
								</div>

								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div class="bg-muted rounded-lg p-6">
										<div class="flex items-center mb-3">
											<Edit3 class="w-5 h-5 text-foreground mr-2" />
											<h4 class="font-semibold text-foreground">
												Rich Markdown Editor
											</h4>
										</div>
										<p class="text-sm text-muted-foreground">
											Full markdown support with headers, lists, links, and
											formatting for comprehensive project documentation
										</p>
									</div>
									<div class="bg-accent/10 rounded-lg p-6">
										<div class="flex items-center mb-3">
											<Copy class="w-5 h-5 text-accent mr-2" />
											<h4 class="font-semibold text-foreground">
												One-Click Export
											</h4>
										</div>
										<p class="text-sm text-muted-foreground">
											Copy full context to clipboard for immediate use in
											ChatGPT, Claude, or any LLM
										</p>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									The LLM Collaboration Workflow
								</h3>
								<div class="bg-muted rounded-lg p-6 mb-6">
									<h4 class="font-semibold text-foreground mb-3">
										🔄 The Power Loop
									</h4>
									<ol
										class="list-decimal list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Export context</strong> from
											BuildOS to any LLM
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Collaborate and research</strong
											> with AI using rich project context
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Create documents, plans, code</strong
											> with informed AI assistance
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Brain dump learnings</strong
											> back into BuildOS
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Context gets richer</strong
											> for next iteration
										</li>
									</ol>
									<p class="text-muted-foreground mt-4">
										This creates a continuous intelligence loop where your
										projects become smarter and more detailed over time.
									</p>
								</div>

								<div class="bg-muted rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										💡 Why Context Matters
									</h4>
									<p class="text-muted-foreground">
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
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Calendar class="w-7 h-7 mr-3 text-foreground" />
								Phases & Task Management
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									Transform your projects into structured execution plans with
									AI-generated phases and intelligent task organization.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Phase Generation
								</h3>
								<div class="bg-accent/10 rounded-lg p-6 mb-6">
									<p class="text-muted-foreground mb-4">
										Click the "Generate Phases" button on any project to create
										a structured execution plan:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											AI analyzes your project context and existing tasks
										</li>
										<li class="text-muted-foreground">
											Creates 2-8 logical phases based on project complexity
										</li>
										<li class="text-muted-foreground">
											Organizes tasks into appropriate phases with dependency
											respect
										</li>
										<li class="text-muted-foreground">
											Suggests timelines and milestones for each phase
										</li>
									</ul>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Kanban & Timeline Views
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div class="bg-accent/10 rounded-lg p-6">
										<h4
											class="font-semibold text-foreground mb-2 flex items-center"
										>
											<Target class="w-5 h-5 mr-2 text-accent" />
											Kanban View
										</h4>
										<p class="text-sm text-muted-foreground mb-3">
											Trello-style board with phases as columns
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Drag and drop tasks between phases
											</li>
											<li class="text-muted-foreground">
												• Visual progress tracking
											</li>
											<li class="text-muted-foreground">
												• Easy task management
											</li>
											<li class="text-muted-foreground">
												• Phase-by-phase organization
											</li>
										</ul>
									</div>
									<div class="bg-muted rounded-lg p-6">
										<h4
											class="font-semibold text-foreground mb-2 flex items-center"
										>
											<BarChart3 class="w-5 h-5 mr-2 text-foreground" />
											Timeline View
										</h4>
										<p class="text-sm text-muted-foreground mb-3">
											Gantt-style timeline with date tracking
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Phase start and end dates
											</li>
											<li class="text-muted-foreground">
												• Dependency visualization
											</li>
											<li class="text-muted-foreground">
												• Timeline adjustments
											</li>
											<li class="text-muted-foreground">
												• Progress milestones
											</li>
										</ul>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Task Management Features
								</h3>
								<div class="space-y-4 mb-6">
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Manual Task Creation:</strong
												> Add tasks directly to any project or phase
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>AI Task Generation:</strong
												> Tasks created automatically from brain dumps
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Drag & Drop Organization:</strong
												> Move tasks between phases easily
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<CheckCircle
											class="w-5 h-5 text-foreground flex-shrink-0 mt-0.5"
										/>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Task Dependencies:</strong
												> Link tasks that depend on each other
											</p>
										</div>
									</div>
								</div>

								<div class="bg-muted rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										🎯 Phase Management Tips
									</h4>
									<ul
										class="list-disc list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											Use phases to break large projects into manageable
											chunks
										</li>
										<li class="text-muted-foreground">
											Adjust AI-generated phases to match your preferred
											working style
										</li>
										<li class="text-muted-foreground">
											Move tasks between phases as your project evolves
										</li>
										<li class="text-muted-foreground">
											Use timeline view for deadline-driven projects
										</li>
										<li class="text-muted-foreground">
											Use kanban view for flexible, iteration-based work
										</li>
									</ul>
								</div>
							</div>
						</section>

						<!-- Calendar Integration -->
						<section id="calendar">
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Calendar class="w-7 h-7 mr-3 text-foreground" />
								Calendar Integration
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									Transform tasks into scheduled action with seamless Google
									Calendar integration. Bridge the gap between planning and
									execution.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Setup Instructions
								</h3>
								<ol
									class="list-decimal list-inside space-y-3 text-muted-foreground mb-8"
								>
									<li class="text-muted-foreground">
										Go to
										<a
											href="/profile?tab=calendar"
											class="text-accent hover:underline font-medium"
											>/profile and tab "calendar"</a
										>
									</li>
									<li class="text-muted-foreground">
										Click "Connect Google Calendar" to open OAuth flow
									</li>
									<li class="text-muted-foreground">
										Grant BuildOS permissions to read and create calendar events
									</li>
									<li class="text-muted-foreground">
										Configure your work hours and scheduling preferences
									</li>
									<li class="text-muted-foreground">
										Start one-click scheduling tasks to your calendar
									</li>
								</ol>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Smart Scheduling Features
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div class="bg-muted rounded-lg p-6">
										<div class="flex items-center mb-3">
											<Calendar class="w-5 h-5 text-foreground mr-2" />
											<h4 class="font-semibold text-foreground">
												One-Click Scheduling
											</h4>
										</div>
										<p class="text-sm text-muted-foreground">
											Click "Schedule" on any task to automatically find
											optimal time slots and create calendar events
										</p>
									</div>
									<div class="bg-accent/10 rounded-lg p-6">
										<div class="flex items-center mb-3">
											<Settings class="w-5 h-5 text-accent mr-2" />
											<h4 class="font-semibold text-foreground">
												Work Hours Respect
											</h4>
										</div>
										<p class="text-sm text-muted-foreground">
											Only schedules during your defined working hours and
											respects your work-life balance preferences
										</p>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Calendar vs Task Dates
								</h3>
								<div class="bg-muted rounded-lg p-6 mb-6">
									<h4 class="font-semibold text-foreground mb-3">
										📅 Important Distinction
									</h4>
									<p class="text-muted-foreground mb-4">
										Tasks can have due dates for planning purposes, but calendar
										scheduling is a separate action:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Task Dates:</strong> Due
											dates and deadlines for project planning
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Calendar Events:</strong
											> Actual time blocks when you'll work on tasks
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Your Choice:</strong> Decide
											which tasks get scheduled and when
										</li>
									</ul>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Scheduling Workflow
								</h3>
								<div class="space-y-4 mb-6">
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											1
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground">View tasks</strong> in
												your Dashboard, Projects, or Phases
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											2
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Click "Schedule"</strong
												> on any task you want to time-block
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											3
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Choose date and time</strong
												> from suggested optimal slots
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											4
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Event created</strong
												> with linked entity context and details automatically
												included
											</p>
										</div>
									</div>
								</div>

								<div class="bg-accent/10 rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										🔗 Currently Supported
									</h4>
									<p class="text-muted-foreground">
										Google Calendar integration is fully live. Support for
										Outlook, Apple Calendar, and other providers is planned for
										future releases based on user feedback.
									</p>
								</div>
							</div>
						</section>

						<!-- Daily Briefs -->
						<section id="daily-briefs">
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Mail class="w-7 h-7 mr-3 text-foreground" />
								Daily Briefs
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									Stay aligned with AI-generated briefings that synthesize your
									project status, priorities, and next actions into actionable
									intelligence.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Brief Types & Customization
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div class="bg-accent/10 rounded-lg p-6">
										<h4 class="font-semibold text-foreground mb-2">
											Individual Project Briefs
										</h4>
										<p class="text-sm text-muted-foreground">
											Deep-dive updates on specific projects with focused
											insights, next actions, and context-aware
											recommendations
										</p>
									</div>
									<div class="bg-muted rounded-lg p-6">
										<h4 class="font-semibold text-foreground mb-2">
											Master Daily Briefings
										</h4>
										<p class="text-sm text-muted-foreground">
											Comprehensive overview of all projects, priorities for
											the day, and strategic alignment across your work
										</p>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Scheduling & Delivery
								</h3>
								<ul
									class="list-disc list-inside space-y-2 text-muted-foreground mb-6"
								>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Daily Frequency:</strong> Perfect
										for active projects needing constant momentum
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Weekly Frequency:</strong> Great
										for longer-term projects and strategic overview
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">Email Delivery:</strong> Briefs
										delivered to your inbox automatically
									</li>
									<li class="text-muted-foreground">
										<strong class="text-foreground">In-App Access:</strong> View
										all briefs on the Briefs page anytime
									</li>
								</ul>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									What's Included in Briefs
								</h3>
								<div class="bg-muted rounded-lg p-6 mb-6">
									<p class="text-muted-foreground mb-4">
										Each brief is generated from your rich project context and
										includes:
									</p>
									<ul
										class="list-disc list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Project Status:</strong>
											Current progress and milestone updates
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Priority Actions:</strong
											> What to focus on today/this week
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Blockers & Challenges:</strong
											> Items needing attention or decisions
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground">Recent Context:</strong>
											Insights from latest brain dumps
										</li>
										<li class="text-muted-foreground">
											<strong class="text-foreground"
												>Strategic Alignment:</strong
											> How projects connect to your bigger goals
										</li>
									</ul>
								</div>

								<div class="bg-accent/10 rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										📧 Smart Intelligence Delivery
									</h4>
									<p class="text-muted-foreground">
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
							<h2 class="text-3xl font-bold text-foreground mb-6 flex items-center">
								<Copy class="w-7 h-7 mr-3 text-accent" />
								LLM Integration: Your AI Collaboration Advantage
							</h2>
							<div class="prose dark:prose-invert max-w-none">
								<p class="text-muted-foreground mb-6">
									BuildOS's most powerful feature is seamless integration with any
									LLM. Copy rich project context to ChatGPT, Claude, or any AI for
									informed collaboration.
								</p>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									The Context Export Workflow
								</h3>
								<div class="space-y-4 mb-8">
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											1
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>One-Click Copy:</strong
												> Export full project context from any project page
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											2
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Paste in Any LLM:</strong
												> Provide rich context to ChatGPT, Claude, Gemini, etc.
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											3
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Collaborate & Create:</strong
												> Get informed AI assistance on strategy, code, content,
												etc.
											</p>
										</div>
									</div>
									<div class="flex items-start space-x-3">
										<div
											class="w-6 h-6 bg-accent text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
										>
											4
										</div>
										<div>
											<p class="text-muted-foreground">
												<strong class="text-foreground"
													>Brain Dump Results:</strong
												> Add new insights back to BuildOS to enrich context
											</p>
										</div>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									Use Cases for LLM Collaboration
								</h3>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
									<div class="bg-accent/10 rounded-lg p-6">
										<h4 class="font-semibold text-foreground mb-2">
											Strategic Planning
										</h4>
										<p class="text-sm text-muted-foreground mb-2">
											Share project context for informed strategy advice
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Market analysis with project specifics
											</li>
											<li class="text-muted-foreground">
												• Risk assessment for current initiatives
											</li>
											<li class="text-muted-foreground">
												• Resource allocation recommendations
											</li>
										</ul>
									</div>
									<div class="bg-muted rounded-lg p-6">
										<h4 class="font-semibold text-foreground mb-2">
											Technical Implementation
										</h4>
										<p class="text-sm text-muted-foreground mb-2">
											Get code and architecture advice with full context
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Code reviews with project requirements
											</li>
											<li class="text-muted-foreground">
												• Architecture decisions with constraints
											</li>
											<li class="text-muted-foreground">
												• Debugging with system context
											</li>
										</ul>
									</div>
									<div class="bg-muted rounded-lg p-6">
										<h4 class="font-semibold text-foreground mb-2">
											Content Creation
										</h4>
										<p class="text-sm text-muted-foreground mb-2">
											Generate aligned content with brand context
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Marketing copy with brand voice
											</li>
											<li class="text-muted-foreground">
												• Documentation with technical context
											</li>
											<li class="text-muted-foreground">
												• Blog posts with strategic alignment
											</li>
										</ul>
									</div>
									<div class="bg-accent/10 rounded-lg p-6">
										<h4 class="font-semibold text-foreground mb-2">
											Problem Solving
										</h4>
										<p class="text-sm text-muted-foreground mb-2">
											Get specific solutions with complete context
										</p>
										<ul class="text-xs text-muted-foreground space-y-1">
											<li class="text-muted-foreground">
												• Troubleshooting with environment details
											</li>
											<li class="text-muted-foreground">
												• Process improvement with current workflows
											</li>
											<li class="text-muted-foreground">
												• Decision making with all constraints
											</li>
										</ul>
									</div>
								</div>

								<h3 class="text-xl font-semibold text-foreground mb-4">
									The Continuous Intelligence Loop
								</h3>
								<div
									class="bg-accent/10 border border-accent/30 rounded-lg p-6 mb-6"
								>
									<h4 class="font-semibold text-foreground mb-3">
										🔄 BuildOS + LLMs = Compound Intelligence
									</h4>
									<p class="text-muted-foreground mb-4">
										Each collaboration cycle makes your projects smarter:
									</p>
									<ol
										class="list-decimal list-inside space-y-2 text-muted-foreground"
									>
										<li class="text-muted-foreground">
											Export rich context → Get better AI advice
										</li>
										<li class="text-muted-foreground">
											Create documents/code/strategies → With informed AI
										</li>
										<li class="text-muted-foreground">
											Brain dump learnings → Context gets richer
										</li>
										<li class="text-muted-foreground">
											Next export includes new insights → Even better advice
										</li>
									</ol>
								</div>

								<div class="bg-muted rounded-lg p-6">
									<h4 class="font-semibold text-foreground mb-3">
										💡 Why This Matters
									</h4>
									<p class="text-muted-foreground">
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
	<section class="py-20 bg-muted">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl font-bold text-foreground mb-6">Ready to Start Building?</h2>
			<p class="text-lg text-muted-foreground mb-8">
				Transform your scattered thoughts into organized action with BuildOS's AI-powered
				project management.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="/auth/register"
					class="inline-flex items-center px-6 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:bg-accent/90 transition-colors shadow-ink pressable"
				>
					Get Started Now <ArrowRight class="w-4 h-4 ml-2" />
				</a>
				<a
					href="/contact"
					class="inline-flex items-center px-6 py-3 bg-card border border-border text-foreground font-semibold rounded-lg hover:bg-muted transition-colors shadow-ink"
				>
					Contact Support <ArrowRight class="w-4 h-4 ml-2" />
				</a>
			</div>
		</div>
	</section>
</div>
