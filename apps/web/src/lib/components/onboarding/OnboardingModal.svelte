<!-- apps/web/src/lib/components/onboarding/OnboardingModal.svelte -->
<script lang="ts">
	import { Sparkles, User, ChevronRight } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import WelcomeModal from '$lib/components/ui/WelcomeModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		isOpen?: boolean;
		onDismiss?: () => void;
	}

	let { isOpen = $bindable(false), onDismiss = () => {} }: Props = $props();

	function handleStartOnboarding() {
		isOpen = false;
		goto('/onboarding');
	}

	function handleDismiss() {
		isOpen = false;
		onDismiss();
	}
</script>

<WelcomeModal
	bind:isOpen
	title="Welcome to BuildOS!"
	primaryButtonText="Start Personalization"
	secondaryButtonText="I'll do this later"
	showTimeEstimate={true}
	timeEstimate="Takes about 5 minutes"
	storageKey="onboarding_modal_dismissed"
	onPrimary={handleStartOnboarding}
	onSecondary={handleDismiss}
	onDismiss={handleDismiss}
>
	{#snippet icon()}
		<div class="relative">
			<!-- Subtle glow effect using Inkprint accent -->
			<div class="absolute inset-0 bg-accent/20 rounded-xl blur-lg"></div>
			<!-- Brain-bolt video with Inkprint styling -->
			<div
				class="relative rounded-xl bg-card p-2 border border-border shadow-ink tx tx-bloom tx-weak"
			>
				<video
					autoplay
					loop
					muted
					playsinline
					class="w-14 h-14 object-contain rounded-lg"
					aria-label="BuildOS brain animation"
				>
					<source
						src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
						type="video/mp4"
					/>
					<!-- Fallback -->
					<div
						class="w-14 h-14 bg-accent/10 rounded-full p-3 flex items-center justify-center"
					>
						<Sparkles class="w-8 h-8 text-accent" />
					</div>
				</video>
			</div>
		</div>
	{/snippet}

	{#snippet description()}
		<p class="text-sm text-muted-foreground leading-snug">
			Share a bit about yourself and your goals to unlock
			<span class="font-semibold text-foreground">AI-powered insights</span> tailored for you.
		</p>
	{/snippet}

	{#snippet features()}
		<div class="space-y-2 mb-4">
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full bg-emerald-500"></div>
				<p class="text-xs text-muted-foreground">
					<span class="font-medium text-foreground">Personalized daily briefs</span> aligned
					with your goals
				</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full bg-blue-500"></div>
				<p class="text-xs text-muted-foreground">
					AI understands your <span class="font-medium text-foreground">work style</span>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full bg-accent"></div>
				<p class="text-xs text-muted-foreground">
					<span class="font-medium text-foreground">Smart task suggestions</span> based on
					context
				</p>
			</div>
		</div>
	{/snippet}

	{#snippet actions()}
		<Button
			onclick={handleStartOnboarding}
			variant="primary"
			size="md"
			fullWidth
			class="shadow-ink-strong pressable"
		>
			<span class="flex items-center justify-center gap-2">
				<User class="w-4 h-4" />
				<span>Start Personalization</span>
				<ChevronRight class="w-4 h-4" />
			</span>
		</Button>

		<Button
			onclick={handleDismiss}
			variant="ghost"
			size="sm"
			fullWidth
			class="text-muted-foreground hover:text-foreground"
		>
			I'll do this later
		</Button>
	{/snippet}
</WelcomeModal>
