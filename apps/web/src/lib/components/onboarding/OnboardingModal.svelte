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
			<div class="absolute inset-0 bg-primary-500 rounded-full blur-xl opacity-30"></div>
			<div class="relative bg-gradient-to-br from-primary-500 to-violet-500 rounded-full p-4">
				<Sparkles class="w-8 h-8 text-white" />
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="description">
		<p class="text-gray-600 dark:text-gray-300 leading-relaxed">
			Let's personalize your experience. Share a bit about yourself, your goals, and how you
			work to unlock AI-powered insights tailored just for you.
		</p>
	</svelte:fragment>

	<svelte:fragment slot="features">
		<div class="space-y-3 mb-8">
			<div class="flex items-start space-x-3">
				<div
					class="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mt-0.5"
				>
					<div class="w-2 h-2 rounded-full bg-emerald-500"></div>
				</div>
				<p class="text-sm text-gray-600 dark:text-gray-300">
					Get personalized daily briefs aligned with your goals
				</p>
			</div>
			<div class="flex items-start space-x-3">
				<div
					class="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mt-0.5"
				>
					<div class="w-2 h-2 rounded-full bg-emerald-500"></div>
				</div>
				<p class="text-sm text-gray-600 dark:text-gray-300">
					AI understands your work style and preferences
				</p>
			</div>
			<div class="flex items-start space-x-3">
				<div
					class="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mt-0.5"
				>
					<div class="w-2 h-2 rounded-full bg-emerald-500"></div>
				</div>
				<p class="text-sm text-gray-600 dark:text-gray-300">
					Smart task suggestions based on your context
				</p>
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="actions">
		<Button
			on:click={handleStartOnboarding}
			variant="primary"
			size="lg"
			fullWidth
			icon={User}
			iconPosition="left"
			class="bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
		>
			Start Personalization
			<ChevronRight class="w-4 h-4 ml-1" />
		</Button>

		<Button
			on:click={handleDismiss}
			variant="ghost"
			size="lg"
			fullWidth
			class="text-gray-600 dark:text-gray-400"
		>
			I'll do this later
		</Button>
	</svelte:fragment>
</WelcomeModal>
