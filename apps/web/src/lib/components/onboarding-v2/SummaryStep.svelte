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
					class="absolute inset-0 dither-gradient blur-2xl opacity-30 animate-pulse"
				></div>
				<div
					class="relative w-20 h-20 dither-gradient rounded-full flex items-center justify-center shadow-xl"
				>
					<CheckCircle class="w-10 h-10 text-white" />
				</div>
			</div>
		</div>

		<h2
			class="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent"
		>
			You're All Set!
		</h2>
		<p class="text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
			Here's what we learned about you:
		</p>
	</div>

	<!-- Summary Cards -->
	<div class="space-y-4 mb-12">
		<!-- Projects Created -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl border-2 border-green-200 dark:border-green-800 p-6 shadow-sm"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center"
				>
					<Brain class="w-6 h-6 text-green-600 dark:text-green-400" />
				</div>
				<div class="flex-1">
					<h3 class="font-semibold text-lg mb-1 text-gray-900 dark:text-white">
						Projects Captured
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						{#if summary.projectsCreated > 0}
							Created <strong>{summary.projectsCreated}</strong>
							project{summary.projectsCreated !== 1 ? 's' : ''} from your brain dump
						{:else}
							No projects created yet — you can add them anytime!
						{/if}
					</p>
					{#if summary.calendarAnalyzed}
						<div
							class="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400"
						>
							<Calendar class="w-4 h-4" />
							<span>Analyzed your Google Calendar</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Notifications Setup -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6 shadow-sm"
		>
			<div class="flex items-start gap-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"
				>
					<Bell class="w-6 h-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div class="flex-1">
					<h3 class="font-semibold text-lg mb-1 text-gray-900 dark:text-white">
						Accountability Style
					</h3>
					<div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
						{#if summary.smsEnabled}
							<div class="flex items-center gap-2">
								<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-500" />
								<span>SMS notifications enabled</span>
							</div>
						{/if}
						{#if summary.emailEnabled}
							<div class="flex items-center gap-2">
								<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-500" />
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
				class="bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-200 dark:border-purple-800 p-6 shadow-sm"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"
					>
						<Sparkles class="w-6 h-6 text-purple-600 dark:text-purple-400" />
					</div>
					<div class="flex-1">
						<h3 class="font-semibold text-lg mb-1 text-gray-900 dark:text-white">
							Usage Profile
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							You'll use BuildOS as: <strong
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
				class="bg-white dark:bg-gray-800 rounded-xl border-2 border-amber-200 dark:border-amber-800 p-6 shadow-sm"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center"
					>
						<Target class="w-6 h-6 text-amber-600 dark:text-amber-400" />
					</div>
					<div class="flex-1">
						<h3 class="font-semibold text-lg mb-1 text-gray-900 dark:text-white">
							Challenges Identified
						</h3>
						<p class="text-gray-600 dark:text-gray-400 mb-2">
							BuildOS will help you with:
						</p>
						<div class="flex flex-wrap gap-2">
							{#each summary.challenges as challengeId}
								<span
									class="inline-flex px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm rounded-full border border-amber-200 dark:border-amber-700"
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
			class="px-8 py-4 text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200"
		>
			{#if isCompleting}
				Preparing Your Workspace...
			{:else}
				Enter BuildOS
				<ArrowRight class="w-5 h-5 ml-2" />
			{/if}
		</Button>

		<p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
			Your personalized workspace is ready!
		</p>
	</div>
</div>
