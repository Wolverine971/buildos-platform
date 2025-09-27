<!-- src/lib/components/dashboard/FirstTimeBrainDumpCard.svelte -->
<script lang="ts">
	import { Brain, ArrowRight, Lightbulb, Target, Users } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let isCompact: boolean = false;

	const dispatch = createEventDispatcher();

	function handleStartBrainDump() {
		dispatch('startBrainDump');
	}

	// Framework hints to guide users
	const frameworkHints = [
		{ icon: Lightbulb, text: 'Current situation & problems to solve' },
		{ icon: Target, text: 'Goals & what success looks like' },
		{ icon: Users, text: "Who's involved & key deliverables" }
	];
</script>

{#if !isCompact}
	<!-- Full first-time user card -->
	<div
		class="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50
		dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20
		rounded-2xl p-6 sm:p-8 lg:p-10 border border-blue-200/50 dark:border-blue-800/50
		shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl"
	>
		<!-- Decorative background elements -->
		<div class="absolute top-0 right-0 -mt-4 -mr-4 opacity-10">
			<Brain class="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 text-purple-600" />
		</div>

		<div class="relative z-10 max-w-2xl mx-auto text-center">
			<!-- Icon and Title -->
			<div class="flex justify-center mb-4">
				<div class="relative">
					<div
						class="absolute inset-0 animate-pulse bg-purple-400/20 rounded-full blur-xl"
					></div>
					<div class="relative p-4 bg-white dark:bg-gray-800 rounded-full shadow-md">
						<Brain
							class="w-8 h-8 sm:w-10 sm:h-10 text-purple-600 dark:text-purple-400"
						/>
					</div>
				</div>
			</div>

			<h2
				class="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
			>
				Start with a Brain Dump
			</h2>

			<p class="text-base sm:text-lg text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
				Tell BuildOS about <span class="font-semibold">one project</span> you're working on.
				We'll help you organize everything into actionable tasks and milestones.
			</p>

			<!-- Framework guidance section -->
			<div
				class="bg-white/50 dark:bg-gray-800/50 rounded-xl p-4 sm:p-5 mb-6 backdrop-blur-sm"
			>
				<p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
					Think about your project holistically. Consider sharing:
				</p>

				<div class="space-y-3 text-left max-w-md mx-auto">
					{#each frameworkHints as hint}
						<div class="flex items-start gap-3">
							<div class="flex-shrink-0 mt-0.5">
								<svelte:component
									this={hint.icon}
									class="w-5 h-5 text-purple-600 dark:text-purple-400"
								/>
							</div>
							<span class="text-sm text-gray-600 dark:text-gray-400">
								{hint.text}
							</span>
						</div>
					{/each}
				</div>

				<div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
					<p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
						<strong>Pro tip:</strong> Focus on one project at a time. The more context you
						provide, the better BuildOS can help you plan and execute.
					</p>
				</div>
			</div>

			<!-- Examples to inspire -->
			<div class="mb-6">
				<p class="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
					Example projects
				</p>
				<div class="flex flex-wrap justify-center gap-2">
					{#each ['Launch a product', 'Write a book', 'Learn a skill', 'Plan an event', 'Start a business'] as example}
						<span
							class="px-3 py-1 bg-white/70 dark:bg-gray-700/70 rounded-full text-xs text-gray-600 dark:text-gray-300"
						>
							{example}
						</span>
					{/each}
				</div>
			</div>

			<!-- CTA Button -->
			<Button
				on:click={handleStartBrainDump}
				variant="primary"
				size="lg"
				class="w-full sm:w-auto min-w-[200px] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
			>
				<Brain class="w-5 h-5 mr-2" />
				Start Your First Brain Dump
				<ArrowRight class="w-5 h-5 ml-2" />
			</Button>

			<!-- Additional help text -->
			<p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
				Takes about 2-3 minutes • Voice or text input • AI-powered organization
			</p>
		</div>
	</div>
{:else}
	<!-- Compact version for users with some data -->
	<div
		class="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10
		rounded-xl p-4 sm:p-5 border border-purple-200/50 dark:border-purple-800/50
		shadow-sm hover:shadow-md transition-all duration-200"
	>
		<div class="flex items-start gap-4">
			<div class="flex-shrink-0">
				<div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
					<Brain class="w-5 h-5 text-purple-600 dark:text-purple-400" />
				</div>
			</div>
			<div class="flex-1">
				<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
					Quick Capture
				</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
					Have another project in mind? Brain dump it to get started.
				</p>
				<Button
					on:click={handleStartBrainDump}
					variant="outline"
					size="sm"
					class="hover:bg-purple-50 dark:hover:bg-purple-900/20"
				>
					<Brain class="w-4 h-4 mr-1.5" />
					New Brain Dump
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Add any additional styles if needed */
	:global(.dark) {
		--tw-gradient-from: rgb(30 27 75 / 0.2);
		--tw-gradient-via: rgb(49 46 129 / 0.2);
		--tw-gradient-to: rgb(88 28 135 / 0.2);
	}
</style>
