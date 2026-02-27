<!-- apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte -->
<script lang="ts">
	import { CheckCircle, ArrowRight, ArrowLeft, FolderOpen, MessageCircle, Mail } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		userId: string;
		summary: {
			intent: OnboardingIntent | null;
			stakes: OnboardingStakes | null;
			projectsCreated: number;
			tasksCreated: number;
			goalsCreated: number;
			smsEnabled: boolean;
			emailEnabled: boolean;
		};
		onBack?: () => void;
		onboardingStartedAtMs?: number;
	}

	let { userId, summary, onBack, onboardingStartedAtMs }: Props = $props();

	let isCompleting = $state(false);

	// Stats to display (only non-zero)
	const stats = $derived(
		[
			{ count: summary.projectsCreated, label: 'project', plural: 'projects' },
			{ count: summary.tasksCreated, label: 'task', plural: 'tasks' },
			{ count: summary.goalsCreated, label: 'goal', plural: 'goals' }
		].filter((s) => s.count > 0)
	);

	const hasNotifications = $derived(summary.smsEnabled || summary.emailEnabled);

	async function completeOnboarding() {
		isCompleting = true;
		const timeSpentSeconds =
			onboardingStartedAtMs != null
				? Math.max(0, Math.round((Date.now() - onboardingStartedAtMs) / 1000))
				: undefined;

		try {
			const response = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'complete_v3',
					onboardingData: {
						intent: summary.intent,
						stakes: summary.stakes,
						projectsCreated: summary.projectsCreated,
						tasksCreated: summary.tasksCreated,
						goalsCreated: summary.goalsCreated,
						smsEnabled: summary.smsEnabled,
						emailEnabled: summary.emailEnabled,
						timeSpentSeconds
					}
				})
			});

			const result = await response.json();
			if (!response.ok || !result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to complete');
			}

			toastService.success('Welcome to BuildOS!');
			await invalidateAll();
			setTimeout(() => goto('/'), 1000);
		} catch (error) {
			console.error('Failed to complete onboarding:', error);
			toastService.error('Failed to complete setup. Please try again.');
			isCompleting = false;
		}
	}
</script>

<div class="max-w-2xl mx-auto px-4 py-8 sm:py-16">
	{#if onBack}
		<button
			class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
			onclick={onBack}
		>
			<ArrowLeft class="w-4 h-4" />
			Back
		</button>
	{/if}

	<!-- Success icon -->
	<div class="text-center mb-10" in:scale={{ duration: 400, start: 0.8 }}>
		<div class="flex justify-center mb-6">
			<div class="relative">
				<div
					class="absolute inset-0 bg-emerald-500/20 blur-2xl opacity-40 animate-pulse"
				></div>
				<div
					class="relative w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center shadow-ink-strong tx tx-bloom tx-weak"
				>
					<CheckCircle class="w-10 h-10 text-white" />
				</div>
			</div>
		</div>

		<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">You're set up!</h1>

		{#if stats.length > 0}
			<p class="text-lg text-muted-foreground" in:fade={{ delay: 200, duration: 300 }}>
				Here's what we created:
			</p>
		{:else}
			<p class="text-lg text-muted-foreground" in:fade={{ delay: 200, duration: 300 }}>
				You're ready to start using BuildOS
			</p>
		{/if}
	</div>

	<!-- Stats row -->
	{#if stats.length > 0}
		<div
			class="flex justify-center gap-6 sm:gap-10 mb-12"
			in:fade={{ delay: 300, duration: 300 }}
		>
			{#each stats as stat}
				<div class="text-center">
					<div class="text-3xl sm:text-4xl font-bold text-accent">{stat.count}</div>
					<div class="text-sm text-muted-foreground mt-1">
						{stat.count === 1 ? stat.label : stat.plural}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Next actions -->
	<div
		class="bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak mb-10"
		in:fade={{ delay: 400, duration: 300 }}
	>
		<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
			What to do next
		</h3>
		<div class="space-y-3">
			{#if summary.projectsCreated > 0}
				<div class="flex items-center gap-3 text-foreground">
					<FolderOpen class="w-5 h-5 text-accent flex-shrink-0" />
					<span>Open a project to see your tasks</span>
				</div>
			{/if}
			<div class="flex items-center gap-3 text-foreground">
				<MessageCircle class="w-5 h-5 text-accent flex-shrink-0" />
				<span>Chat with BuildOS to update anything</span>
			</div>
			{#if hasNotifications}
				<div class="flex items-center gap-3 text-foreground">
					<Mail class="w-5 h-5 text-accent flex-shrink-0" />
					<span>Check your daily brief tomorrow morning</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- CTA -->
	<div class="text-center" in:fade={{ delay: 500, duration: 300 }}>
		<Button
			variant="primary"
			size="lg"
			onclick={completeOnboarding}
			loading={isCompleting}
			disabled={isCompleting}
			class="px-10 py-4 text-lg shadow-ink-strong pressable"
		>
			{#if isCompleting}
				Preparing Your Workspace...
			{:else}
				Go to Dashboard
				<ArrowRight class="w-5 h-5 ml-2" />
			{/if}
		</Button>
	</div>
</div>
