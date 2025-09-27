<!-- src/routes/help/+page.svelte -->
<script lang="ts">
	import {
		Brain,
		Target,
		FolderOpen,
		Calendar,
		StickyNote,
		Search,
		Book,
		MessageCircle,
		Mail,
		ArrowRight
	} from 'lucide-svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
</script>

<SEOHead
	title="Help Center - BuildOS | Guides, Tutorials & Support"
	description="Get help with BuildOS. Comprehensive tutorials, guides, and answers to common questions about transforming brain dumps into organized projects with AI."
	canonical="https://build-os.com/help"
	keywords="BuildOS help, brain dump tutorial, project organization guide, daily briefs, AI productivity, getting started, support documentation"
	author="DJ Wayne"
/>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="bg-white dark:bg-gray-800 py-20 rounded-lg">
		<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="flex justify-center mb-8">
				<div
					class="flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl"
				>
					<Book class="w-8 h-8 text-blue-600 dark:text-blue-400" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
				How can we help you?
			</h1>
			<p class="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
				Get the most out of BuildOS with our guides, tutorials, and support resources.
			</p>

			<!-- Search Bar -->
			<div class="relative max-w-2xl mx-auto">
				<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<Search class="h-5 w-5 text-gray-400" />
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
				<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
					Quick Start Guide
				</h2>
				<p class="text-lg text-gray-600 dark:text-gray-400">
					Get up and running with BuildOS in minutes
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
				<a
					href="/blogs/getting-started/effective-brain-dumping"
					class="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl mb-4 group-hover:scale-110 transition-transform"
					>
						<Brain class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">1. Brain Dump</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Start by capturing all your thoughts and ideas
					</p>
				</a>

				<a
					href="/blogs/getting-started/first-project-setup"
					class="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl mb-4 group-hover:scale-110 transition-transform"
					>
						<FolderOpen class="w-6 h-6 text-blue-600 dark:text-blue-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">2. Organize</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Let AI help structure your thoughts into projects
					</p>
				</a>

				<a
					href="/blogs/getting-started/understanding-life-goals"
					class="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl mb-4 group-hover:scale-110 transition-transform"
					>
						<Target class="w-6 h-6 text-green-600 dark:text-green-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">3. Set Goals</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Define your life goals and connect them to tasks
					</p>
				</a>

				<a
					href="/blogs/getting-started/daily-brief-guide"
					class="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl mb-4 group-hover:scale-110 transition-transform"
					>
						<Calendar class="w-6 h-6 text-orange-600 dark:text-orange-400" />
					</div>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-2">4. Execute</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Use daily briefs to stay on track
					</p>
				</a>
			</div>
		</div>
	</section>

	<!-- Popular Articles -->
	<section class="py-20 bg-white dark:bg-gray-800 rounded-lg">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
					Popular Help Articles
				</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				<article
					class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-shadow"
				>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						How to effectively brain dump
					</h3>
					<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
						Learn the best practices for capturing your thoughts and ideas in BuildOS.
					</p>
					<a
						href="/blogs/getting-started/effective-brain-dumping"
						class="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-shadow"
				>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						Setting up your first project
					</h3>
					<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
						A step-by-step guide to creating and organizing your first project in Build
						OS.
					</p>
					<a
						href="/blogs/getting-started/first-project-setup"
						class="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-shadow"
				>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						Understanding life goals vs projects
					</h3>
					<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
						Learn the difference between strategic life goals and tactical projects.
					</p>
					<a
						href="/blogs/getting-started/understanding-life-goals"
						class="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-shadow"
				>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						Using daily briefs effectively
					</h3>
					<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
						Make the most of your daily AI-generated briefs and insights.
					</p>
					<a
						href="/blogs/getting-started/daily-brief-guide"
						class="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-shadow"
				>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						Task management best practices
					</h3>
					<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
						Learn how to organize and prioritize your tasks for maximum productivity.
					</p>
					<a
						href="/blogs/productivity-tips/task-management-best-practices"
						class="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>

				<article
					class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 hover:shadow-lg transition-shadow"
				>
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">
						Troubleshooting common issues
					</h3>
					<p class="text-gray-600 dark:text-gray-400 text-sm mb-4">
						Solutions to the most common problems users encounter with BuildOS.
					</p>
					<a
						href="/blogs/advanced-guides/troubleshooting-common-issues"
						class="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center"
					>
						Read more <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</article>
			</div>
		</div>
	</section>

	<!-- Categories -->
	<section class="py-20 bg-gray-50 dark:bg-gray-900 rounded-lg">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
					Browse by Category
				</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
					<div
						class="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl mb-6"
					>
						<Brain class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
						Getting Started
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-6">
						Learn the basics of BuildOS and how to set up your personal operating
						system.
					</p>
					<a
						href="/blogs/getting-started"
						class="text-purple-600 dark:text-purple-400 font-medium hover:underline flex items-center"
					>
						View articles <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</div>

				<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
					<div
						class="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl mb-6"
					>
						<FolderOpen class="w-6 h-6 text-blue-600 dark:text-blue-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
						Productivity Tips
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-6">
						Master advanced techniques and optimize your workflow with BuildOS.
					</p>
					<a
						href="/blogs/productivity-tips"
						class="text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center"
					>
						View articles <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</div>

				<div class="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
					<div
						class="flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl mb-6"
					>
						<StickyNote class="w-6 h-6 text-red-600 dark:text-red-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
						Advanced Guides
					</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-6">
						Deep-dive tutorials and troubleshooting for power users.
					</p>
					<a
						href="/blogs/advanced-guides"
						class="text-red-600 dark:text-red-400 font-medium hover:underline flex items-center"
					>
						View articles <ArrowRight class="w-4 h-4 ml-1" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- Still Need Help -->
	<section class="py-20 bg-white dark:bg-gray-800 rounded-lg">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">Still need help?</h2>
			<p class="text-lg text-gray-600 dark:text-gray-400 mb-12">
				Can't find what you're looking for? We're here to help.
			</p>

			<div class="grid grid-cols-1">
				<a
					href="/feedback"
					class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-2xl p-8 hover:shadow-lg transition-all duration-300 group"
				>
					<div
						class="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl mb-4 mx-auto group-hover:scale-110 transition-transform"
					>
						<MessageCircle class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
						Send Feedback
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Share your thoughts or request new features
					</p>
				</a>
			</div>
		</div>
	</section>

	<!-- Beta Notice -->
	<section class=" my-4 py-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<div class="bg-white bg-opacity-10 rounded-2xl p-8">
				<h3 class="text-2xl font-bold text-white mb-4">BuildOS is in Beta</h3>
				<p class="text-blue-100 mb-6">
					We're constantly improving and adding new features. If you encounter any issues
					or have suggestions, please let us know!
				</p>
				<a
					href="/feedback"
					class="inline-flex items-center px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
				>
					<MessageCircle class="w-5 h-5 mr-2" />
					Give Feedback
				</a>
			</div>
		</div>
	</section>
</div>
