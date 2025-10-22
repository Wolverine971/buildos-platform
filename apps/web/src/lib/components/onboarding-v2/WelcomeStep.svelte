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
	<!-- Hero video animation with enhanced styling -->
	<div class="mb-10 relative">
		<!-- Animated glow effect -->
		<div
			class="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-600/30 dark:from-purple-400/20 dark:to-blue-500/20 blur-3xl opacity-60 animate-pulse"
			style="animation-duration: 3s;"
		></div>
		<!-- Video container with glass effect -->
		<div
			class="relative rounded-2xl bg-gradient-to-br from-white/40 to-gray-50/40 dark:from-gray-800/40 dark:to-gray-900/40 p-4 backdrop-blur-sm border border-purple-200/50 dark:border-purple-700/50 shadow-2xl"
		>
			<video
				autoplay
				loop
				muted
				playsinline
				class="w-40 h-40 sm:w-48 sm:h-48 lg:w-56 lg:h-56 object-contain rounded-xl mx-auto"
				aria-label="BuildOS brain animation"
			>
				<source
					src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
					type="video/mp4"
				/>
				<!-- Fallback for browsers that don't support video -->
				<div
					class="w-40 h-40 sm:w-48 sm:h-48 lg:w-56 lg:h-56 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full p-12 shadow-2xl flex items-center justify-center mx-auto"
				>
					<Brain class="w-20 h-20 text-white" />
				</div>
			</video>
		</div>
	</div>

	<!-- Title and subtitle with enhanced typography -->
	<h1
		class="text-4xl sm:text-5xl lg:text-6xl font-bold mb-5 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 dark:from-purple-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent leading-tight tracking-tight"
	>
		Welcome to BuildOS
	</h1>

	<p
		class="text-lg sm:text-xl lg:text-2xl text-gray-700 dark:text-gray-300 mb-10 max-w-2xl leading-relaxed mx-auto"
	>
		Your AI-first project organization tool. Let's set you up so BuildOS works the way
		<em class="text-purple-600 dark:text-purple-400 not-italic font-semibold">you</em> want.
	</p>

	<!-- Philosophy Section - The BuildOS Way with enhanced glass effect -->
	<div class="mb-12 max-w-2xl w-full">
		<div
			class="bg-gradient-to-br from-purple-50/80 to-blue-50/80 dark:from-purple-950/40 dark:to-blue-950/40 rounded-2xl p-8 lg:p-10 border border-purple-200/60 dark:border-purple-700/40 shadow-lg backdrop-blur-sm hover:shadow-xl transition-shadow duration-300"
		>
			<h3
				class="text-2xl lg:text-3xl font-bold mb-8 text-gray-900 dark:text-white text-center flex items-center justify-center gap-3"
			>
				<Sparkles class="w-7 h-7 text-purple-600 dark:text-purple-400 animate-pulse" />
				The BuildOS Way
			</h3>

			<div class="space-y-6 text-left">
				<!-- Step 1: Clarity -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 transition-transform duration-200"
					>
						1
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-gray-900 dark:text-white">
							First, Get Clarity
						</h4>
						<p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
							To get organized and boost productivity, you need <strong
								class="text-gray-900 dark:text-white">clarity</strong
							>. And to get clarity, you need to offload what's in your head and see
							it on the screen. That's where everything begins.
						</p>
					</div>
				</div>

				<!-- Step 2: Projects -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 transition-transform duration-200"
					>
						2
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-gray-900 dark:text-white">
							Then, Organize Into Projects
						</h4>
						<p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
							BuildOS works with <strong class="text-gray-900 dark:text-white"
								>projects</strong
							> — whether that's a work initiative, a personal goal, a creative endeavor,
							or a life milestone.
						</p>
						<p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
							Think of projects as focused endeavors with a clear goal or vision. When
							you organize around projects, you create structure that helps you
							actually
							<em class="font-semibold not-italic text-gray-900 dark:text-white"
								>finish</em
							> things.
						</p>
					</div>
				</div>

				<!-- Step 3: Focus -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 dark:from-emerald-600 dark:to-green-700 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 transition-transform duration-200"
					>
						3
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-gray-900 dark:text-white">
							Then, Stay Focused
						</h4>
						<p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
							Clarity and organization mean nothing without follow-through. BuildOS
							helps you maintain <strong class="text-gray-900 dark:text-white"
								>focus</strong
							> with smart reminders, calendar integration, and daily check-ins.
						</p>
					</div>
				</div>

				<!-- Step 4: Flexibility -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 dark:from-orange-600 dark:to-amber-700 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 transition-transform duration-200"
					>
						4
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-gray-900 dark:text-white">
							Finally, Stay Flexible
						</h4>
						<p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
							Life changes. Priorities shift. BuildOS <strong
								class="text-gray-900 dark:text-white">adapts</strong
							> with you. Whether you need to reschedule tasks, regenerate plans, or reorganize
							projects—BuildOS makes it effortless to pivot without losing momentum.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA Button with enhanced styling -->
	<Button
		variant="primary"
		size="lg"
		on:click={onStart}
		class="px-10 py-4 text-lg font-semibold shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 hover:from-purple-700 hover:via-blue-700 hover:to-indigo-700 border-none"
	>
		<span class="flex items-center gap-3">
			Start Setting Up
			<Sparkles class="w-5 h-5 animate-pulse" />
		</span>
	</Button>

	<p class="text-sm text-gray-500 dark:text-gray-400 mt-6 flex items-center justify-center gap-2">
		<span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
		Takes about 5 minutes
		<span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
	</p>
</div>
