<!-- apps/web/src/lib/components/onboarding/OnboardingModal.svelte -->
<script lang="ts">
	import { User, ChevronRight } from 'lucide-svelte';
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
	primaryButtonText="Start Setup"
	secondaryButtonText="I'll do this later"
	showTimeEstimate={true}
	timeEstimate="Takes about 5 minutes"
	storageKey="onboarding_modal_dismissed"
	onPrimary={handleStartOnboarding}
	onSecondary={handleDismiss}
	onDismiss={handleDismiss}
>
	{#snippet icon()}
		<div class="rounded-xl border border-border bg-card p-3 shadow-ink tx tx-frame tx-weak">
			<div
				class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted shadow-ink-inner"
			>
				<video
					autoplay
					loop
					muted
					playsinline
					class="h-full w-full object-contain"
					aria-label="BuildOS brain animation"
				>
					<source
						src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
						type="video/mp4"
					/>
				</video>
			</div>
		</div>
	{/snippet}

	{#snippet description()}
		<p class="text-sm text-muted-foreground leading-snug">
			Set up how you work so BuildOS can keep your briefs, suggestions, and project context
			useful from the start.
		</p>
	{/snippet}

	{#snippet features()}
		<div class="space-y-2 mb-4">
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full bg-accent"></div>
				<p class="text-xs text-muted-foreground">
					<span class="font-medium text-foreground">Daily briefs</span> stay aligned with your
					goals
				</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full bg-foreground/60"></div>
				<p class="text-xs text-muted-foreground">
					Project memory stays grounded in how
					<span class="font-medium text-foreground">you actually work</span>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-2 h-2 rounded-full bg-muted-foreground"></div>
				<p class="text-xs text-muted-foreground">
					<span class="font-medium text-foreground">Suggestions and next steps</span>
					start with the right context
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
				<span>Start Setup</span>
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
