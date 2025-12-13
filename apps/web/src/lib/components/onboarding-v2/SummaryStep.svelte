<!-- apps/web/src/lib/components/onboarding-v2/SummaryStep.svelte -->
<script lang="ts">
	import {
		CheckCircle,
		Sparkles,
		ArrowRight,
		Calendar,
		Bell,
		Brain,
		Target
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';

	interface Props {
		userId: string;
		summary: {
			projectsCreated: number;
			calendarAnalyzed: boolean;
			smsEnabled: boolean;
			emailEnabled: boolean;
			archetype: string;
			challenges: string[];
		};
	}

	let { userId, summary }: Props = $props();

	let isCompleting = $state(false);

	const archetypeLabels: Record<string, string> = {
		second_brain: 'Second Brain',
		ai_task_manager: 'AI Task Manager',
		project_todo_list: 'Project To-Do List'
	};

	// Get challenge labels from config
	const challengeLabels = $derived(
		ONBOARDING_V2_CONFIG.challenges.reduce(
			(acc, c) => {
				acc[c.id] = c.label.split(' — ')[0] || c.label; // Get just the title part
				return acc;
			},
			{} as Record<string, string>
		)
	);

	async function completeOnboarding() {
		isCompleting = true;

		try {
			await onboardingV2Service.completeOnboarding(userId);
			toastService.success('🎉 Welcome to BuildOS!');

			// Invalidate all data to refresh user state
			await invalidateAll();

			// Redirect to workspace after a brief delay
			setTimeout(() => {
				goto('/');
			}, 1500);
		} catch (error) {
			console.error('Failed to complete onboarding:', error);
			toastService.error('Failed to complete setup. Please try again.');
			isCompleting = false;
		}
	}
</script>

<div class="max-w-3xl mx-auto px-4">
	<div class="mb-12 text-center">
		<div class="flex justify-center mb-6">
			<div class="relative">
				<div
					class="absolute inset-0 bg-emerald-500/20 blur-2xl opacity-30 animate-pulse"
				></div>
				<div
					class="relative w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center shadow-ink-strong tx tx-bloom tx-weak"
				>
					<CheckCircle class="w-10 h-10 text-white" />
				</div>
			</div>
		</div>

		<h2 class="text-4xl sm:text-5xl font-bold mb-4 text-emerald-600 dark:text-emerald-400">
			You're All Set!
		</h2>
		<p class="text-xl text-muted-foreground leading-relaxed">
			Here's what we learned about you:
		</p>
	</div>

	<!-- Summary Cards -->
	<div class="space-y-4 mb-12">
		<!-- Projects Created -->
		<div
			class="bg-card rounded-xl border border-emerald-500/30 p-6 shadow-ink tx tx-frame tx-weak"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center shadow-ink"
				>
					<Brain class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div class="flex-1">
					<h3 class="font-semibold text-lg mb-1 text-foreground">Projects Captured</h3>
					<p class="text-muted-foreground">
						{#if summary.projectsCreated > 0}
							Created <strong class="text-foreground"
								>{summary.projectsCreated}</strong
							>
							project{summary.projectsCreated !== 1 ? 's' : ''} from your brain dump
						{:else}
							No projects created yet — you can add them anytime!
						{/if}
					</p>
					{#if summary.calendarAnalyzed}
						<div class="mt-2 flex items-center gap-2 text-sm text-accent">
							<Calendar class="w-4 h-4" />
							<span>Analyzed your Google Calendar</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Notifications Setup -->
		<div class="bg-card rounded-xl border border-accent/30 p-6 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center shadow-ink"
				>
					<Bell class="w-6 h-6 text-accent" />
				</div>
				<div class="flex-1">
					<h3 class="font-semibold text-lg mb-1 text-foreground">Accountability Style</h3>
					<div class="space-y-1 text-sm text-muted-foreground">
						{#if summary.smsEnabled}
							<div class="flex items-center gap-2">
								<CheckCircle
									class="w-4 h-4 text-emerald-600 dark:text-emerald-500"
								/>
								<span>SMS notifications enabled</span>
							</div>
						{/if}
						{#if summary.emailEnabled}
							<div class="flex items-center gap-2">
								<CheckCircle
									class="w-4 h-4 text-emerald-600 dark:text-emerald-500"
								/>
								<span>Email daily briefs enabled</span>
							</div>
						{/if}
						{#if !summary.smsEnabled && !summary.emailEnabled}
							<p>You can set up notifications later in settings</p>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Usage Profile -->
		{#if summary.archetype}
			<div
				class="bg-card rounded-xl border border-purple-500/30 p-6 shadow-ink tx tx-frame tx-weak"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex-shrink-0 w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center shadow-ink"
					>
						<Sparkles class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<div class="flex-1">
						<h3 class="font-semibold text-lg mb-1 text-foreground">Usage Profile</h3>
						<p class="text-muted-foreground">
							You'll use BuildOS as: <strong class="text-foreground"
								>{archetypeLabels[summary.archetype] || summary.archetype}</strong
							>
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Challenges Identified -->
		{#if summary.challenges.length > 0}
			<div
				class="bg-card rounded-xl border border-amber-500/30 p-6 shadow-ink tx tx-frame tx-weak"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex-shrink-0 w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center shadow-ink"
					>
						<Target class="w-6 h-6 text-amber-600 dark:text-amber-400" />
					</div>
					<div class="flex-1">
						<h3 class="font-semibold text-lg mb-1 text-foreground">
							Challenges Identified
						</h3>
						<p class="text-muted-foreground mb-2">BuildOS will help you with:</p>
						<div class="flex flex-wrap gap-2">
							{#each summary.challenges as challengeId}
								<span
									class="inline-flex px-3 py-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm rounded-full border border-amber-500/30"
								>
									{challengeLabels[challengeId] || challengeId.replace(/_/g, ' ')}
								</span>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Call to Action -->
	<div class="text-center">
		<Button
			variant="primary"
			size="lg"
			onclick={completeOnboarding}
			loading={isCompleting}
			disabled={isCompleting}
			class="px-8 py-4 text-lg shadow-ink-strong pressable"
		>
			{#if isCompleting}
				Preparing Your Workspace...
			{:else}
				Enter BuildOS
				<ArrowRight class="w-5 h-5 ml-2" />
			{/if}
		</Button>

		<p class="text-sm text-muted-foreground mt-4">Your personalized workspace is ready!</p>
	</div>
</div>
