<!-- apps/web/src/lib/components/onboarding-v2/WelcomeStep.svelte -->
<script lang="ts">
	import { Brain, Calendar, MessageSquare, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		onStart: () => void;
	}

	let { onStart }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center min-h-[600px] text-center px-4">
	<!-- Hero video animation -->
	<div class="mb-8 relative">
		<div
			class="absolute inset-0 bg-gradient-to-br from-purple-400 to-blue-600 blur-3xl opacity-20 animate-pulse"
		></div>
		<div class="relative rounded-md">
			<video
				autoplay
				loop
				muted
				playsinline
				class="w-32 h-32 sm:w-40 sm:h-40 object-contain rounded-md"
				aria-label="BuildOS brain animation"
			>
				<source
					src="/onboarding-assets/animations/brain-bolt-electric.mp4"
					type="video/mp4"
				/>
				<!-- Fallback for browsers that don't support video -->
				<div
					class="w-32 h-32 sm:w-40 sm:h-40 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full p-8 shadow-2xl flex items-center justify-center"
				>
					<Brain class="w-16 h-16 text-white" />
				</div>
			</video>
		</div>
	</div>

	<!-- Title and subtitle -->
	<h1
		class="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent"
	>
		Welcome to BuildOS
	</h1>

	<p class="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl leading-relaxed">
		Your AI-first project organization tool. Let's set you up so BuildOS works the way
		<em class="text-purple-600 dark:text-purple-400 not-italic">you</em> want.
	</p>

	<!-- Feature highlights -->
	<div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 max-w-3xl w-full">
		<div
			class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 dark:border-gray-700"
		>
			<div
				class="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg flex items-center justify-center mb-3"
			>
				<Brain class="w-6 h-6 text-purple-600 dark:text-purple-400" />
			</div>
			<h3 class="font-semibold text-gray-900 dark:text-white mb-2">Brain Dump</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
				Turn thoughts into projects
			</p>
		</div>

		<div
			class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 dark:border-gray-700"
		>
			<div
				class="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg flex items-center justify-center mb-3"
			>
				<Calendar class="w-6 h-6 text-blue-600 dark:text-blue-400" />
			</div>
			<h3 class="font-semibold text-gray-900 dark:text-white mb-2">Calendar Sync</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
				Extract projects from events
			</p>
		</div>

		<div
			class="flex flex-col items-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 dark:border-gray-700"
		>
			<div
				class="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 rounded-lg flex items-center justify-center mb-3"
			>
				<MessageSquare class="w-6 h-6 text-green-600 dark:text-green-400" />
			</div>
			<h3 class="font-semibold text-gray-900 dark:text-white mb-2">Smart Reminders</h3>
			<p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
				Stay on track with AI
			</p>
		</div>
	</div>

	<!-- CTA Button -->
	<Button
		variant="primary"
		size="lg"
		on:click={onStart}
		class="px-8 py-4 text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
	>
		Start Setting Up
		<Sparkles class="w-5 h-5 ml-2" />
	</Button>

	<p class="text-sm text-gray-500 dark:text-gray-400 mt-4">Takes about 5 minutes</p>
</div>
