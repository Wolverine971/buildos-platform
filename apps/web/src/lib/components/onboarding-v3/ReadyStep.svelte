<!-- apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte -->
<!-- Last review: declare completion only after the server commits it. -->
<script lang="ts">
	import { PROJECT_UPDATE_PROMPT } from '$lib/constants/brand';
	import { onMount, untrack } from 'svelte';
	import { ArrowRight, CheckCircle, FolderOpen } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { goto } from '$app/navigation';
	import { clearOnboardingDrafts, type ActivationPacket } from '$lib/utils/onboarding-state';
	import {
		loadOnboardingNotifications,
		type OnboardingNotifications
	} from '$lib/services/onboarding-notifications';
	import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';

	let {
		userId,
		summary,
		projectId,
		initialPacket = null,
		onboardingStartedAtMs,
		onCompleted
	}: {
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
		projectId: string | null;
		initialPacket?: ActivationPacket | null;
		onboardingStartedAtMs?: number;
		onCompleted?: () => void;
	} = $props();
	let packet = $state<ActivationPacket | null>(untrack(() => initialPacket));
	let notifications = $state<OnboardingNotifications | null>(null);
	let isCompleting = $state(false);
	let completed = $state(false);
	let completionError = $state<string | null>(null);
	let isLoading = $state(true);
	let summaryError = $state(false);
	const destination = $derived(
		projectId ? `/today?activated_project=${encodeURIComponent(projectId)}` : '/today'
	);
	const stats = $derived(
		[
			{
				count: summary.projectsCreated || (projectId ? 1 : 0),
				label: 'project',
				plural: 'projects'
			},
			{ count: packet?.counts.tasks ?? summary.tasksCreated, label: 'task', plural: 'tasks' },
			{ count: packet?.counts.goals ?? summary.goalsCreated, label: 'goal', plural: 'goals' }
		].filter((stat) => stat.count > 0)
	);

	onMount(() => {
		void loadSummary();
	});
	async function loadSummary() {
		isLoading = true;
		summaryError = false;
		const results = await Promise.allSettled([
			loadOnboardingNotifications().then((value) => {
				notifications = value;
			}),
			projectId && !packet
				? fetch(`/api/onto/projects/${projectId}/activation-packet`, {
						cache: 'no-store'
					}).then(async (response) => {
						const result = await response.json();
						if (!response.ok || !result.success) throw new Error('Summary unavailable');
						packet = result.data;
					})
				: Promise.resolve()
		]);
		summaryError = results.some((result) => result.status === 'rejected');
		isLoading = false;
	}

	async function completeOnboarding() {
		if (isCompleting || isLoading) return;
		isCompleting = true;
		completionError = null;
		try {
			if (!completed) {
				const response = await fetch('/api/onboarding', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'complete_v3',
						onboardingData: {
							...summary,
							projectsCreated: summary.projectsCreated || (projectId ? 1 : 0),
							tasksCreated: packet?.counts.tasks ?? summary.tasksCreated,
							goalsCreated: packet?.counts.goals ?? summary.goalsCreated,
							emailEnabled: notifications?.emailEnabled ?? summary.emailEnabled,
							smsEnabled: notifications?.smsEnabled ?? summary.smsEnabled,
							timeSpentSeconds:
								onboardingStartedAtMs == null
									? undefined
									: Math.max(
											0,
											Math.round((Date.now() - onboardingStartedAtMs) / 1000)
										)
						}
					})
				});
				const result = await response.json().catch(() => null);
				if (!response.ok || !result?.success)
					throw new Error(
						typeof result?.error === 'string'
							? result.error
							: 'Setup could not be completed. Please try again.'
					);
				completed = true;
				clearOnboardingDrafts(userId);
				onCompleted?.();
			}
			await goto(destination, { invalidateAll: true, replaceState: true });
		} catch (error) {
			completionError = completed
				? 'Setup is complete. Open Today to continue.'
				: error instanceof Error
					? error.message
					: 'Setup could not be completed. Please try again.';
		} finally {
			isCompleting = false;
		}
	}
</script>

<div class="mx-auto max-w-xl px-4 py-8 sm:py-12">
	<div class="mb-6 text-center">
		<div
			class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-success/10 text-success"
		>
			{#if completed}<CheckCircle class="h-7 w-7" />{:else}<FolderOpen class="h-7 w-7" />{/if}
		</div>
		<p class="micro-label mb-2 text-muted-foreground">
			{completed ? 'Setup complete' : 'One last step'}
		</p>
		<h1 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
			{completed
				? 'You’re set up.'
				: projectId
					? 'Your work has a home.'
					: 'Room for what’s next.'}
		</h1>
		<p class="mt-3 text-base leading-relaxed text-muted-foreground">
			{projectId
				? 'Your project is saved. Open it and choose your next step.'
				: 'Start with one project. Tell BuildOS what you’re working on when you’re ready.'}
		</p>
	</div>

	{#if packet}
		<div class="mb-6 rounded-lg border border-border bg-card p-4 shadow-ink sm:p-5">
			<p class="micro-label mb-2 text-muted-foreground">Pick up here</p>
			<h2 class="text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
				{packet.project.name}
			</h2>
			<p class="mt-2 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
				{packet.project.next_step_short ?? 'Open your project and choose your first task.'}
			</p>
			{#if packet.start_here?.excerpt}<p
					class="mt-3 text-xs leading-relaxed text-muted-foreground"
				>
					Your Start Here context is saved for your next session.
				</p>{/if}
		</div>
	{/if}
	{#if projectId}
		<div class="mb-6 rounded-lg border border-border bg-card p-4 sm:p-5">
			<p class="micro-label mb-2 text-accent">When you come back</p>
			<p class="text-sm leading-relaxed text-foreground">{PROJECT_UPDATE_PROMPT}</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Open that same project and continue in its chat.
			</p>
		</div>
	{/if}
	{#if stats.length}
		<div class="mb-6 flex flex-wrap justify-center gap-6" aria-label="Saved project structure">
			{#each stats as stat (stat.label)}<div class="text-center">
					<p class="text-2xl font-semibold tabular-nums text-foreground">{stat.count}</p>
					<p class="text-sm text-muted-foreground">
						{stat.count === 1 ? stat.label : stat.plural}
					</p>
				</div>{/each}
		</div>
	{/if}
	{#if notifications}
		<p class="mb-6 text-center text-sm text-muted-foreground">
			Email briefs {notifications.emailEnabled ? 'on' : 'off'} · Text reminders {notifications.smsRemindersEnabled
				? 'on'
				: 'off'} · Brief texts {notifications.smsBriefEnabled ? 'on' : 'off'}. You can
			change these in Profile.
		</p>
	{/if}
	{#if isLoading}<p class="mb-4 text-center text-sm text-muted-foreground" role="status">
			Checking your saved setup…
		</p>{/if}
	{#if summaryError}
		<div
			class="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
			role="alert"
		>
			<p class="text-foreground">
				Part of your saved summary couldn’t be loaded. Your project and settings are
				unchanged.
			</p>
			<Button variant="ghost" size="sm" onclick={loadSummary} class="mt-2"
				>Refresh summary</Button
			>
		</div>
	{/if}
	{#if completionError}<p
			class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
			role="alert"
		>
			{completionError}
		</p>{/if}
	{#if completed}
		<a
			href={destination}
			class="flex min-h-11 items-center justify-center rounded-md bg-accent px-5 py-3 font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>Open Today <ArrowRight class="ml-2 h-4 w-4" /></a
		>
	{:else}
		<Button
			variant="primary"
			size="lg"
			onclick={completeOnboarding}
			loading={isCompleting}
			disabled={isCompleting || isLoading}
			class="w-full shadow-ink"
		>
			{isCompleting
				? 'Finishing setup…'
				: completionError
					? 'Retry finishing setup'
					: 'Finish setup and start today'}
			<ArrowRight class="ml-2 h-4 w-4" />
		</Button>
	{/if}
</div>
