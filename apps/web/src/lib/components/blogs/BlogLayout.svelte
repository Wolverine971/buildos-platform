<!-- apps/web/src/lib/components/blogs/BlogLayout.svelte -->
<script lang="ts">
	import { format } from 'date-fns';
	import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-svelte';

	export let title: string;
	export let description: string;
	export let author: string;
	export let date: string;
	export let category: string;
	export let tags: string[] = [];
	export let readingTime: number = 5;
	export let pic: string = '';

	const formattedDate = format(new Date(date), 'MMMM dd, yyyy');
	const categoryDisplayName = category.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
</script>

<svelte:head>
	<title>{title} - BuildOS Blog</title>
	<meta name="description" content={description} />
	<meta name="author" content={author} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="article" />
	<meta property="article:author" content={author} />
	<meta property="article:published_time" content={date} />
	<meta property="article:section" content={categoryDisplayName} />
	{#each tags as tag}
		<meta property="article:tag" content={tag} />
	{/each}
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Header -->
	<div class="bg-white dark:bg-gray-800 py-8 rounded-md mb-2">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<a
				href="/blogs"
				class="inline-flex items-center text-blue-600 dark:!text-blue-400 hover:underline mb-8 group"
			>
				<ArrowLeft class="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
				Back to Blog
			</a>

			<div class="mb-6">
				<div
					class="flex items-center space-x-4 text-sm text-gray-600 dark:!text-gray-400 mb-4"
				>
					<span
						class="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:!text-blue-300 px-3 py-1 rounded-full font-medium text-center"
					>
						{categoryDisplayName}
					</span>
					<div class="flex items-center">
						<Calendar class="w-4 h-4 mr-1" />
						{formattedDate}
					</div>
					<div class="flex items-center">
						<Clock class="w-4 h-4 mr-1" />
						{readingTime} min read
					</div>
				</div>

				<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:!text-white mb-4">
					{title}
				</h1>

				<p class="text-xl text-gray-600 dark:!text-gray-400 mb-6">
					{description}
				</p>

				{#if tags.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each tags as tag}
							<span
								class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-center font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:!text-gray-200"
							>
								<Tag class="w-3 h-3 mr-1" />
								{tag}
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<div class="text-sm text-gray-500 dark:!text-gray-400">
				By <span class="font-medium text-gray-900 dark:!text-white">{author}</span>
			</div>
		</div>
	</div>

	<!-- Content -->
	<article class="py-12">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<!-- Fixed: Use only prose and dark:prose-invert to avoid conflicts -->
			<div
				class="prose prose-gray dark:prose-invert max-w-none
				prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700
				prose-strong:text-gray-900 prose-a:text-blue-600 prose-blockquote:text-gray-700
				dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300
				dark:prose-strong:text-white dark:prose-a:text-blue-400 dark:prose-blockquote:text-gray-300
				dark:prose-hr:border-gray-700"
			>
				<slot />
			</div>
		</div>
	</article>

	<!-- Footer Navigation -->
	<div class="bg-white dark:bg-gray-800 py-8 rounded-md mt-2">
		<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="border-t border-gray-200 dark:border-gray-700 pt-8">
				<a
					href="/blogs"
					class="inline-flex items-center justify-center w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
				>
					Explore More Articles
				</a>
			</div>
		</div>
	</div>
</div>

<style>
	:global(.heading-link) {
		@apply no-underline;
	}

	:global(.heading-link:hover) {
		@apply underline;
	}

	/* Additional prose styling to ensure proper dark mode */
	:global(.prose) {
		--tw-prose-body: theme('colors.gray.700');
		--tw-prose-headings: theme('colors.gray.900');
		--tw-prose-links: theme('colors.blue.600');
		--tw-prose-bold: theme('colors.gray.900');
		--tw-prose-counters: theme('colors.gray.500');
		--tw-prose-bullets: theme('colors.gray.400');
		--tw-prose-hr: theme('colors.gray.200');
		--tw-prose-quotes: theme('colors.gray.900');
		--tw-prose-quote-borders: theme('colors.gray.200');
		--tw-prose-captions: theme('colors.gray.500');
		--tw-prose-code: theme('colors.gray.900');
		--tw-prose-pre-code: theme('colors.gray.200');
		--tw-prose-pre-bg: theme('colors.gray.800');
		--tw-prose-th-borders: theme('colors.gray.300');
		--tw-prose-td-borders: theme('colors.gray.200');
	}

	:global(.dark .prose) {
		--tw-prose-body: theme('colors.gray.300');
		--tw-prose-headings: theme('colors.white');
		--tw-prose-links: theme('colors.blue.400');
		--tw-prose-bold: theme('colors.white');
		--tw-prose-counters: theme('colors.gray.400');
		--tw-prose-bullets: theme('colors.gray.600');
		--tw-prose-hr: theme('colors.gray.700');
		--tw-prose-quotes: theme('colors.gray.100');
		--tw-prose-quote-borders: theme('colors.gray.700');
		--tw-prose-captions: theme('colors.gray.400');
		--tw-prose-code: theme('colors.white');
		--tw-prose-pre-code: theme('colors.gray.300');
		--tw-prose-pre-bg: theme('colors.gray.900');
		--tw-prose-th-borders: theme('colors.gray.600');
		--tw-prose-td-borders: theme('colors.gray.700');
	}
</style>
