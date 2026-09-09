<!-- apps/web/src/routes/onboarding/+page.svelte -->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { captureEvent } from '$lib/services/posthog';
	import type { PageData } from './$types';
	import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';
	import type { ActivationPacket } from '$lib/utils/onboarding-state';
	import IntentStakesStep from '$lib/components/onboarding-v3/IntentStakesStep.svelte';
	import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
	import NotificationsStepV3 from '$lib/components/onboarding-v3/NotificationsStepV3.svelte';
	import ReadyStep from '$lib/components/onboarding-v3/ReadyStep.svelte';
	import ProgressIndicatorV3 from '$lib/components/onboarding-v3/ProgressIndicatorV3.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data }: { data: PageData } = $props();
	const initial = untrack(() => data);
	let currentStep = $state(initial.calendarReturn ? 1 : initial.savedStep);
	let committedStep = $state(initial.savedStep);
	// Fresh loader data may include a later milestone saved in another tab.
	const maxStepReached = $derived(Math.max(committedStep, data.savedStep));
	let projectId = $state<string | null>(initial.savedProjectId);
	let packet = $state<ActivationPacket | null>(null);
	let progressError = $state<string | null>(null);
	let isSaving = $state(false);
	let completed = $state(false);
	let stepContent = $state<HTMLDivElement>();
	let progressAlert = $state<HTMLDivElement>();
	let pendingStep = $state<number | null>(null);
	const onboardingStartTime = Date.now();
	let v3Data = $state({
		intent: initial.savedIntent as OnboardingIntent | null,
		stakes: initial.savedStakes as OnboardingStakes | null,
		projectsCreated: initial.savedProjectId ? 1 : 0,
		tasksCreated: 0,
		goalsCreated: 0,
		smsEnabled: false,
		emailEnabled: false
	});

	onMount(() => {
		if (!initial.savedIntent) captureEvent('onboarding_started');
	});

	async function focusStep() {
		await tick();
		const heading = stepContent?.querySelector('h1');
		heading?.setAttribute('tabindex', '-1');
		heading?.focus({ preventScroll: true });
		window.scrollTo({ top: 0, behavior: 'instant' });
	}

	// Only committed milestones unlock navigation. Failed saves keep the current surface intact.
	async function persistProgress(step: number, advance = true) {
		if (isSaving) return;
		isSaving = true;
		progressError = null;
		pendingStep = advance ? step : null;
		try {
			const response = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'save_progress', step, projectId })
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success)
				throw new Error(
					typeof result?.error === 'string'
						? result.error
						: 'Could not save your progress. Please try again.'
				);
			committedStep = Math.max(committedStep, step);
			if (advance) {
				currentStep = step;
				void focusStep();
			}
			pendingStep = null;
			await invalidate('app:onboarding');
		} catch (error) {
			progressError =
				error instanceof Error
					? error.message
					: 'Could not save your progress. Please try again.';
			await tick();
			progressAlert?.focus();
		} finally {
			isSaving = false;
		}
	}

	function goToStep(step: number) {
		if (isSaving || step < 0 || step > maxStepReached) return;
		progressError = null;
		currentStep = step;
		void focusStep();
	}

	async function handleIntentStakesDone() {
		committedStep = Math.max(committedStep, 1);
		currentStep = 1;
		void focusStep();
		await invalidate('app:onboarding');
	}

	async function handleProjectsCreated(ids: string[], counts?: { tasks: number; goals: number }) {
		const changed = projectId !== (ids[0] ?? null);
		projectId = ids[0] ?? null;
		if (changed) packet = null;
		v3Data.projectsCreated = ids.length;
		if (!ids.length) {
			v3Data.tasksCreated = 0;
			v3Data.goalsCreated = 0;
		}
		if (counts) {
			v3Data.tasksCreated = counts.tasks;
			v3Data.goalsCreated = counts.goals;
		}
		// Save the project immediately, before the optional OAuth round-trip.
		if (changed && projectId) await persistProgress(1, false);
	}
</script>

<svelte:head>
	<title>Welcome to BuildOS | Get Started</title>
	<meta
		name="description"
		content="Turn what’s on your mind into a project with a clear next move."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="sticky top-0 z-20 border-b border-border/60 bg-background px-4 py-4">
		<ProgressIndicatorV3
			{currentStep}
			totalSteps={4}
			{maxStepReached}
			{completed}
			onStepClick={goToStep}
			onBack={() => goToStep(currentStep - 1)}
			disabled={isSaving || completed}
		/>
	</div>

	{#if progressError}
		<div
			bind:this={progressAlert}
			tabindex="-1"
			class="mx-auto mt-4 max-w-2xl px-4 focus:outline-none"
			role="alert"
		>
			<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
				<p class="text-foreground">{progressError}</p>
				<p class="mt-1 text-muted-foreground">Your work is still here.</p>
				<Button
					variant="outline"
					size="sm"
					class="mt-3"
					loading={isSaving}
					onclick={() => persistProgress(pendingStep ?? 1, pendingStep !== null)}
					>Retry saving progress</Button
				>
			</div>
		</div>
	{/if}
	{#if isSaving}<p class="sr-only" role="status">Saving your setup progress…</p>{/if}

	<div bind:this={stepContent}>
		{#if currentStep === 0}
			<IntentStakesStep
				onNext={handleIntentStakesDone}
				onIntentSelected={(intent) => (v3Data.intent = intent)}
				onStakesSelected={(stakes) => (v3Data.stakes = stakes)}
				defaultIntent={v3Data.intent ?? undefined}
				defaultStakes={v3Data.stakes ?? undefined}
			/>
		{:else if currentStep === 1}
			<ProjectsCaptureStep
				userId={data.user.id}
				savedProjectId={projectId}
				onNext={() => persistProgress(2)}
				onProjectsCreated={handleProjectsCreated}
				onPacket={(value) => (packet = value)}
				busy={isSaving}
				intent={v3Data.intent ?? undefined}
				isSkippable={v3Data.intent === 'explore'}
				initialProjects={data.existingProjects ?? []}
			/>
		{:else if currentStep === 2}
			<NotificationsStepV3
				userId={data.user.id}
				onNext={() => persistProgress(3)}
				onSMSEnabled={(enabled) => (v3Data.smsEnabled = enabled)}
				onEmailEnabled={(enabled) => (v3Data.emailEnabled = enabled)}
			/>
		{:else}
			<ReadyStep
				userId={data.user.id}
				summary={v3Data}
				{projectId}
				initialPacket={packet}
				onboardingStartedAtMs={onboardingStartTime}
				onCompleted={() => (completed = true)}
			/>
		{/if}
	</div>
</div>
