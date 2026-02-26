<!-- apps/web/src/routes/help/+page.svelte -->
<script lang="ts">
	import {
		Brain,
		Target,
		FolderOpen,
		Calendar,
		StickyNote,
		Search,
		MessageCircle,
		ArrowRight
	} from 'lucide-svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Help Center - BuildOS | Guides, Tutorials & Support"
	description="Get help with BuildOS. Comprehensive tutorials, guides, and answers to common questions about transforming brain dumps into organized projects with AI."
	canonical="https://build-os.com/help"
	keywords="BuildOS help, brain dump tutorial, project collaboration guide, daily briefs, AI productivity, getting started, support documentation"
	author="DJ Wayne"
/>

<div class="min-h-screen bg-background">
	<!-- Header -->
	<div class="bg-card py-20 rounded-lg">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="flex justify-center mb-8">
				<video
					src="/onboarding-assets/animations/brain-bolt-electric.mp4"
					class="w-16 h-16 rounded-md"
					autoplay
					loop
					muted
					playsinline
					aria-label="BuildOS Icon"
				></video>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-6">
				How can we help you?
			</h1>
			<p class="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
				Get the most out of BuildOS with our guides, tutorials, and support resources.
			</p>

			<!-- Search Bar -->
			<div class="relative max-w-2xl mx-auto">
				<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<Search class="h-5 w-5 text-muted-foreground" />
				</div>
				<TextInput
					type="text"
					placeholder="Search help articles..."
					class="pl-10"
					size="md"
				/>
			</div>
		</div>
	</div>

	<!-- Quick Start -->
	<section class="py-20 rounded-lg">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl font-bold text-foreground mb-4">Quick Start Guide</h2>
				<p class="text-lg text-muted-foreground">
					Get up and running with BuildOS in minutes
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
				<a
					href="/blogs/getting-started/effective-brain-dumping"
					class="group bg-card rounded-lg border border-border shadow-ink p-6 hover:shadow-ink-strong transition-all duration-300 hover:scale-105 tx tx-grain tx-weak pressable"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-lg mb-4 group-hover:scale-110 transition-transform"
					>
						<Brain class="w-6 h-6 text-accent" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">1. Brain Dump</h3>
					<p class="text-sm text-muted-foreground">
						Start by capturing all your thoughts and ideas
					</p>
				</a>

				<a
					href="/blogs/getting-started/first-project-setup"
					class="group bg-card rounded-lg border border-border shadow-ink p-6 hover:shadow-ink-strong transition-all duration-300 hover:scale-105 tx tx-grain tx-weak pressable"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg mb-4 group-hover:scale-110 transition-transform"
					>
						<FolderOpen class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">2. Organize</h3>
					<p class="text-sm text-muted-foreground">
						Let AI help structure your thoughts into projects
					</p>
				</a>

				<a
					href="/blogs/getting-started/understanding-life-goals"
					class="group bg-card rounded-lg border border-border shadow-ink p-6 hover:shadow-ink-strong transition-all duration-300 hover:scale-105 tx tx-grain tx-weak pressable"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg mb-4 group-hover:scale-110 transition-transform"
					>
						<Target class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">3. Set Goals</h3>
					<p class="text-sm text-muted-foreground">
						Define your life goals and connect them to tasks
					</p>
				</a>

				<a
					href="/blogs/getting-started/daily-brief-guide"
					class="group bg-card rounded-lg border border-border shadow-ink p-6 hover:shadow-ink-strong transition-all duration-300 hover:scale-105 tx tx-grain tx-weak pressable"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg mb-4 group-hover:scale-110 transition-transform"
					>
						<Calendar class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="font-semibold text-foreground mb-2">4. Execute</h3>
					<p class="text-sm text-muted-foreground">Use daily briefs to stay on track</p>
				</a>
			</div>
		</div>
	</section>

	<!-- Popular Articles -->
	<section class="py-20 bg-card rounded-lg">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl font-bold text-foreground mb-4">Popular Help Articles</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				<article
					class="bg-background rounded-lg p-6 hover:shadow-ink transition-shadow border border-border"
				>
					<h3 class="font-semibold text-foreground mb-3">
						How to effectively brain dump
					</h3>
					<p class="text-muted-foreground text-sm mb-4">
						Learn the best practices for capturing your thoughts and ideas in BuildOS.
					</p>
					<a
						href="/blogs/getting-started/effective-brain-dumping"
						class="text-accent text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-background rounded-lg p-6 hover:shadow-ink transition-shadow border border-border"
				>
					<h3 class="font-semibold text-foreground mb-3">
						Setting up your first project
					</h3>
					<p class="text-muted-foreground text-sm mb-4">
						A step-by-step guide to creating and organizing your first project in Build
						OS.
					</p>
					<a
						href="/blogs/getting-started/first-project-setup"
						class="text-accent text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-background rounded-lg p-6 hover:shadow-ink transition-shadow border border-border"
				>
					<h3 class="font-semibold text-foreground mb-3">
						Understanding life goals vs projects
					</h3>
					<p class="text-muted-foreground text-sm mb-4">
						Learn the difference between strategic life goals and tactical projects.
					</p>
					<a
						href="/blogs/getting-started/understanding-life-goals"
						class="text-accent text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-background rounded-lg p-6 hover:shadow-ink transition-shadow border border-border"
				>
					<h3 class="font-semibold text-foreground mb-3">
						Using daily briefs effectively
					</h3>
					<p class="text-muted-foreground text-sm mb-4">
						Make the most of your daily AI-generated briefs and insights.
					</p>
					<a
						href="/blogs/getting-started/daily-brief-guide"
						class="text-accent text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-background rounded-lg p-6 hover:shadow-ink transition-shadow border border-border"
				>
					<h3 class="font-semibold text-foreground mb-3">
						Task management best practices
					</h3>
					<p class="text-muted-foreground text-sm mb-4">
						Learn how to organize and prioritize your tasks for maximum productivity.
					</p>
					<a
						href="/blogs/productivity-tips/task-management-best-practices"
						class="text-accent text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-background rounded-lg p-6 hover:shadow-ink transition-shadow border border-border"
				>
					<h3 class="font-semibold text-foreground mb-3">
						Troubleshooting common issues
					</h3>
					<p class="text-muted-foreground text-sm mb-4">
						Solutions to the most common problems users encounter with BuildOS.
					</p>
					<a
						href="/blogs/advanced-guides/troubleshooting-common-issues"
						class="text-accent text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>
			</div>
		</div>
	</section>

	<!-- Categories -->
	<section class="py-20 bg-background rounded-lg">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl font-bold text-foreground mb-4">Browse by Category</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				<div
					class="bg-card rounded-lg border border-border shadow-ink p-8 tx tx-frame tx-weak"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-lg mb-6"
					>
						<Brain class="w-6 h-6 text-accent" />
					</div>
					<h3 class="text-xl font-bold text-foreground mb-4">Getting Started</h3>
					<p class="text-muted-foreground mb-6">
						Learn the basics of BuildOS and how to set up your personal operating
						system.
					</p>
					<a
						href="/blogs/getting-started"
						class="text-accent font-medium hover:underline flex items-center"
					>
						View articles <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</div>

				<div
					class="bg-card rounded-lg border border-border shadow-ink p-8 tx tx-frame tx-weak"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg mb-6"
					>
						<FolderOpen class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="text-xl font-bold text-foreground mb-4">Productivity Tips</h3>
					<p class="text-muted-foreground mb-6">
						Master advanced techniques and optimize your workflow with BuildOS.
					</p>
					<a
						href="/blogs/productivity-tips"
						class="text-accent font-medium hover:underline flex items-center"
					>
						View articles <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</div>

				<div
					class="bg-card rounded-lg border border-border shadow-ink p-8 tx tx-frame tx-weak"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-muted rounded-lg mb-6"
					>
						<StickyNote class="w-6 h-6 text-foreground" />
					</div>
					<h3 class="text-xl font-bold text-foreground mb-4">Advanced Guides</h3>
					<p class="text-muted-foreground mb-6">
						Deep-dive tutorials and troubleshooting for power users.
					</p>
					<a
						href="/blogs/advanced-guides"
						class="text-accent font-medium hover:underline flex items-center"
					>
						View articles <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- Still Need Help -->
	<section class="py-20 bg-card rounded-lg">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl font-bold text-foreground mb-6">Still need help?</h2>
			<p class="text-lg text-muted-foreground mb-12">
				Can't find what you're looking for? We're here to help.
			</p>

			<div class="grid grid-cols-1">
				<a
					href="/feedback"
					class="bg-accent/10 border border-accent/30 rounded-lg p-8 hover:shadow-ink transition-all duration-300 group tx tx-bloom tx-weak pressable"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-lg mb-4 mx-auto group-hover:scale-110 transition-transform"
					>
						<MessageCircle class="w-6 h-6 text-accent" />
					</div>
					<h3 class="text-xl font-bold text-foreground mb-3">Send Feedback</h3>
					<p class="text-muted-foreground">Share your thoughts or request new features</p>
				</a>
			</div>
		</div>
	</section>

	<!-- Beta Notice -->
	<section class="my-4 py-16 bg-accent rounded-lg">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="bg-card/10 rounded-lg p-8 tx tx-grain tx-weak">
				<h3 class="text-2xl font-bold text-accent-foreground mb-4">BuildOS is in Beta</h3>
				<p class="text-accent-foreground/80 mb-6">
					We're constantly improving and adding new features. If you encounter any issues
					or have suggestions, please let us know!
				</p>
				<a
					href="/feedback"
					class="inline-flex items-center px-6 py-3 bg-card text-accent font-semibold rounded-lg hover:bg-card/90 transition-colors shadow-ink"
				>
					<MessageCircle class="w-5 h-5 mr-2" />
					Give Feedback
				</a>
			</div>
		</div>
	</section>
</div>
