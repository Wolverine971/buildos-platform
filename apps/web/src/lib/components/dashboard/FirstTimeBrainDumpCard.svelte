<!-- apps/web/src/lib/components/dashboard/FirstTimeBrainDumpCard.svelte -->
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
	<!-- Full first-time user card with brain-bolt animation -->
	<div
		class="relative overflow-hidden bg-gradient-to-br from-blue-50/80 via-indigo-50/80 to-purple-50/80
		dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30
		rounded-2xl p-6 sm:p-8 lg:p-10 border border-purple-200/60 dark:border-purple-700/40
		shadow-xl backdrop-blur-sm transition-all duration-300 hover:shadow-2xl"
	>
		<!-- Decorative animated glow in background -->
		<div
			class="absolute top-0 right-0 -mt-8 -mr-8 opacity-10 dark:opacity-5 pointer-events-none"
		>
			<div
				class="w-48 h-48 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full blur-3xl animate-pulse"
				style="animation-duration: 4s;"
			></div>
		</div>

		<div class="relative z-10 max-w-2xl mx-auto text-center">
			<!-- Brain-bolt video animation -->
			<div class="flex justify-center mb-6">
				<div class="relative">
					<!-- Glow effect behind video -->
					<div
						class="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-600/30 dark:from-purple-400/20 dark:to-blue-500/20 rounded-2xl blur-2xl animate-pulse"
						style="animation-duration: 3s;"
					></div>
					<!-- Video container -->
					<div
						class="relative rounded-2xl bg-gradient-to-br from-white/50 to-gray-50/50 dark:from-gray-800/50 dark:to-gray-900/50 p-3 backdrop-blur-sm border border-purple-200/50 dark:border-purple-700/50 shadow-xl"
					>
						<video
							autoplay
							loop
							muted
							playsinline
							class="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 object-contain rounded-xl"
							aria-label="BuildOS brain animation"
						>
							<source
								src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
								type="video/mp4"
							/>
							<!-- Fallback for browsers that don't support video -->
							<div
								class="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full p-6 shadow-xl flex items-center justify-center"
							>
								<Brain class="w-12 h-12 text-white" />
							</div>
						</video>
					</div>
				</div>
			</div>

			<h2
				class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 dark:from-purple-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent leading-tight tracking-tight"
			>
				Start with a Brain Dump
			</h2>

			<p
				class="text-base sm:text-lg lg:text-xl text-gray-700 dark:text-gray-300 mb-8 leading-relaxed"
			>
				Tell BuildOS about <span class="font-semibold text-gray-900 dark:text-white"
					>one project</span
				> you're working on. We'll help you organize everything into actionable tasks and milestones.
			</p>

			<!-- Framework guidance section with enhanced styling -->
			<div
				class="bg-white/60 dark:bg-gray-800/60 rounded-xl p-5 sm:p-6 mb-8 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm"
			>
				<p class="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-5">
					Think about your project holistically. Consider sharing:
				</p>

				<div class="space-y-4 text-left max-w-md mx-auto">
					{#each frameworkHints as hint}
						{@const HintIcon = hint.icon}
						<div class="flex items-start gap-3 group">
							<div
								class="flex-shrink-0 mt-0.5 p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:scale-105 transition-transform duration-200"
							>
								<HintIcon class="w-4 h-4 text-purple-600 dark:text-purple-400" />
							</div>
							<span class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
								{hint.text}
							</span>
						</div>
					{/each}
				</div>

				<div
					class="mt-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl border border-blue-200/50 dark:border-blue-700/50"
				>
					<p class="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
						<strong class="font-semibold">Pro tip:</strong> Focus on one project at a time.
						The more context you provide, the better BuildOS can help you plan and execute.
					</p>
				</div>
			</div>

			<!-- Examples to inspire with enhanced styling -->
			<div class="mb-8">
				<p
					class="text-xs text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider font-semibold"
				>
					Example projects
				</p>
				<div class="flex flex-wrap justify-center gap-2">
					{#each ['Launch a product', 'Write a book', 'Learn a skill', 'Plan an event', 'Start a business'] as example}
						<span
							class="px-3 py-1.5 bg-white/80 dark:bg-gray-700/80 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-600/50 hover:bg-white dark:hover:bg-gray-700 transition-colors duration-200"
						>
							{example}
						</span>
					{/each}
				</div>
			</div>

			<!-- CTA Button with enhanced gradient -->
			<Button
				on:click={handleStartBrainDump}
				variant="primary"
				size="lg"
				class="w-full sm:w-auto min-w-[240px] px-8 py-4 text-base font-semibold shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 border-none"
			>
				<Brain class="w-5 h-5 mr-2" />
				Start Your First Brain Dump
				<ArrowRight class="w-5 h-5 ml-2" />
			</Button>

			<!-- Additional help text with improved spacing -->
			<div
				class="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-600 dark:text-gray-400"
			>
				<span class="flex items-center gap-1.5">
					<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
					2-3 minutes
				</span>
				<span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
				<span class="flex items-center gap-1.5">
					<span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
					Voice or text input
				</span>
				<span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
				<span class="flex items-center gap-1.5">
					<span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
					AI-powered
				</span>
			</div>
		</div>
	</div>
{:else}
	<!-- Compact version with brain-bolt animation -->
	<div
		class="bg-gradient-to-r from-purple-50/80 to-indigo-50/80 dark:from-purple-900/20 dark:to-indigo-900/20
		rounded-xl p-4 sm:p-5 border border-purple-200/60 dark:border-purple-700/40
		shadow-md hover:shadow-lg transition-all duration-300 backdrop-blur-sm"
	>
		<div class="flex items-start gap-4">
			<div class="flex-shrink-0">
				<!-- Small brain-bolt video for compact version -->
				<div
					class="rounded-xl bg-gradient-to-br from-white/50 to-gray-50/50 dark:from-gray-800/50 dark:to-gray-900/50 p-2 border border-purple-200/50 dark:border-purple-700/50"
				>
					<video
						autoplay
						loop
						muted
						playsinline
						class="w-10 h-10 object-contain rounded-lg"
						aria-label="BuildOS brain animation"
					>
						<source
							src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
							type="video/mp4"
						/>
						<!-- Fallback -->
						<Brain class="w-5 h-5 text-purple-600 dark:text-purple-400" />
					</video>
				</div>
			</div>
			<div class="flex-1">
				<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2">
					Quick Capture
				</h3>
				<p class="text-sm text-gray-700 dark:text-gray-300 mb-4">
					Have another project in mind? Brain dump it to get started.
				</p>
				<Button
					on:click={handleStartBrainDump}
					variant="outline"
					size="sm"
					class="hover:bg-purple-50 dark:hover:bg-purple-900/30 border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300 font-medium transition-all duration-200"
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
