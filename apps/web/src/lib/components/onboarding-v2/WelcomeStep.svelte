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

	<!-- Philosophy Section - The BuildOS Way -->
	<div class="mb-10 max-w-2xl w-full">
		<div
			class="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-2xl p-8 border-2 border-purple-200 dark:border-purple-800 shadow-sm"
		>
			<h3
				class="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center flex items-center justify-center gap-2"
			>
				<Sparkles class="w-6 h-6 text-purple-600 dark:text-purple-400" />
				The BuildOS Way
			</h3>

			<div class="space-y-5 text-left">
				<!-- Step 1: Clarity -->
				<div class="flex gap-4 items-start">
					<div
						class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold shadow-md"
					>
						1
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-lg mb-2 text-gray-900 dark:text-white">
							First, Get Clarity
						</h4>
						<p class="text-gray-700 dark:text-gray-300 leading-relaxed">
							To get organized and boost productivity, you need <strong
								>clarity</strong
							>. And to get clarity, you need to offload what's in your head and see
							it on the screen. That's where everything begins.
						</p>
					</div>
				</div>

				<!-- Step 2: Projects -->
				<div class="flex gap-4 items-start">
					<div
						class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold shadow-md"
					>
						2
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-lg mb-2 text-gray-900 dark:text-white">
							Then, Organize Into Projects
						</h4>
						<p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
							BuildOS works with <strong>projects</strong> — whether that's a work initiative,
							a personal goal, a creative endeavor, or a life milestone.
						</p>
						<p class="text-gray-700 dark:text-gray-300 leading-relaxed">
							Think of projects as focused endeavors with a clear goal or vision. When
							you organize around projects, you create structure that helps you
							actually
							<em>finish</em> things.
						</p>
					</div>
				</div>

				<!-- Step 3: Focus -->
				<div class="flex gap-4 items-start">
					<div
						class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-md"
					>
						3
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-lg mb-2 text-gray-900 dark:text-white">
							Finally, Stay Focused
						</h4>
						<p class="text-gray-700 dark:text-gray-300 leading-relaxed">
							Clarity and organization mean nothing without follow-through. BuildOS
							helps you maintain <strong>focus</strong> with smart reminders and daily
							check-ins.
						</p>
					</div>
				</div>
			</div>
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
