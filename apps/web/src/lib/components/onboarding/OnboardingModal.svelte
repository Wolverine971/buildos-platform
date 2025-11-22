<!-- apps/web/src/lib/components/onboarding/OnboardingModal.svelte -->
<script lang="ts">
	import { Sparkles, User, ChevronRight } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import WelcomeModal from '$lib/components/ui/WelcomeModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let isOpen = false;
	export let onDismiss: () => void = () => {};

	function handleStartOnboarding() {
		goto('/onboarding');
	}

	function handleDismiss() {
		onDismiss();
	}
</script>

<WelcomeModal
	{isOpen}
	title="Welcome to BuildOS!"
	primaryButtonText="Start Personalization"
	secondaryButtonText="I'll do this later"
	showTimeEstimate={true}
	timeEstimate="Takes about 5 minutes • Use voice or text input"
	storageKey="onboarding_modal_dismissed"
	on:primary={handleStartOnboarding}
	on:secondary={handleDismiss}
	on:dismiss={handleDismiss}
>
	<svelte:fragment slot="icon">
		<div class="relative">
			<!-- Animated glow effect -->
			<div
				class="absolute inset-0 dither-gradient rounded-2xl blur-2xl opacity-60 animate-pulse"
				style="animation-duration: 3s;"
			></div>
			<!-- Brain-bolt video with glass effect -->
			<div
				class="relative rounded-2xl dither-soft p-3 backdrop-blur-sm border border-purple-200/50 dark:border-purple-700/50 shadow-xl"
			>
				<video
					autoplay
					loop
					muted
					playsinline
					class="w-20 h-20 object-contain rounded-xl"
					aria-label="BuildOS brain animation"
				>
					<source
						src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
						type="video/mp4"
					/>
					<!-- Fallback -->
					<div
						class="w-20 h-20 dither-gradient rounded-full p-4 flex items-center justify-center"
					>
						<Sparkles class="w-10 h-10 text-white" />
					</div>
				</video>
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="description">
		<p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
			Let's personalize your experience. Share a bit about yourself, your goals, and how you
			work to unlock <span class="font-semibold text-gray-900 dark:text-white"
				>AI-powered insights</span
			> tailored just for you.
		</p>
	</svelte:fragment>

	<svelte:fragment slot="features">
		<div class="space-y-4 mb-8">
			<div class="flex items-start space-x-3 group">
				<div
					class="flex-shrink-0 w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mt-0.5 group-hover:scale-105 transition-transform duration-200"
				>
					<div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
				</div>
				<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
					Get <span class="font-semibold text-gray-900 dark:text-white"
						>personalized daily briefs</span
					> aligned with your goals
				</p>
			</div>
			<div class="flex items-start space-x-3 group">
				<div
					class="flex-shrink-0 w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mt-0.5 group-hover:scale-105 transition-transform duration-200"
				>
					<div class="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
				</div>
				<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
					AI understands your <span class="font-semibold text-gray-900 dark:text-white"
						>work style</span
					> and preferences
				</p>
			</div>
			<div class="flex items-start space-x-3 group">
				<div
					class="flex-shrink-0 w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mt-0.5 group-hover:scale-105 transition-transform duration-200"
				>
					<div class="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
				</div>
				<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
					<span class="font-semibold text-gray-900 dark:text-white"
						>Smart task suggestions</span
					>
					based on your context
				</p>
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="actions">
		<Button
			onclick={handleStartOnboarding}
			variant="primary"
			size="lg"
			fullWidth
			icon={User}
			iconPosition="left"
			class="dither-gradient hover:dither-gradient-hover shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 border-none font-semibold"
		>
			Start Personalization
			<ChevronRight class="w-4 h-4 ml-1" />
		</Button>

		<Button
			onclick={handleDismiss}
			variant="ghost"
			size="lg"
			fullWidth
			class="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200"
		>
			I'll do this later
		</Button>
	</svelte:fragment>
</WelcomeModal>
