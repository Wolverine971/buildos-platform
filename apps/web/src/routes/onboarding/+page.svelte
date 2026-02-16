<!-- apps/web/src/routes/onboarding/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';

	// V3 Onboarding Components
	import IntentStakesStep from '$lib/components/onboarding-v3/IntentStakesStep.svelte';
	import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
	import NotificationsStepV3 from '$lib/components/onboarding-v3/NotificationsStepV3.svelte';
	import ReadyStep from '$lib/components/onboarding-v3/ReadyStep.svelte';
	import ProgressIndicatorV3 from '$lib/components/onboarding-v3/ProgressIndicatorV3.svelte';

	let { data }: { data: PageData } = $props();

	// Step tracking
	let currentStep = $state(0);
	const totalSteps = 4;

	// Onboarding timing
	const onboardingStartTime = Date.now();

	// Collected data across steps
	let v3Data = $state({
		intent: null as OnboardingIntent | null,
		stakes: null as OnboardingStakes | null,
		projectsCreated: 0,
		tasksCreated: 0,
		goalsCreated: 0,
		smsEnabled: false,
		emailEnabled: false
	});

	type OntologyCounts = {
		goals: number;
		requirements: number;
		plans: number;
		tasks: number;
		documents: number;
		sources: number;
		metrics: number;
		milestones: number;
		risks: number;
		edges: number;
	};

	// Step navigation
	function goToStep(step: number) {
		currentStep = step;
	}

	// Step 0: Intent + Stakes
	function handleIntentSelected(intent: OnboardingIntent) {
		v3Data.intent = intent;
	}

	function handleStakesSelected(stakes: OnboardingStakes) {
		v3Data.stakes = stakes;
	}

	function handleIntentStakesDone() {
		goToStep(1);
	}

	// Step 1: Brain Dump / Projects
	function handleProjectsCreated(projectIds: string[], ontologyCounts?: OntologyCounts) {
		v3Data.projectsCreated = projectIds.length;
		if (ontologyCounts) {
			v3Data.tasksCreated = ontologyCounts.tasks;
			v3Data.goalsCreated = ontologyCounts.goals;
		}
	}

	function handleCalendarAnalyzed(_completed: boolean) {
		// Tracked for analytics but doesn't affect flow
	}

	function handleBrainDumpDone() {
		goToStep(2);
	}

	// Step 2: Notifications
	function handleSMSEnabled(enabled: boolean) {
		v3Data.smsEnabled = enabled;
	}

	function handleEmailEnabled(enabled: boolean) {
		v3Data.emailEnabled = enabled;
	}

	function handleNotificationsDone() {
		goToStep(3);
	}

	const isExploreUser = $derived(v3Data.intent === 'explore');
</script>

<svelte:head>
	<title>Welcome to BuildOS | Get Started</title>
	<meta
		name="description"
		content="Set up BuildOS in under 5 minutes. Tell us what you need and get started with your first project."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Progress indicator: show on steps 1 and 2 (brain dump and notifications) -->
	{#if currentStep === 1 || currentStep === 2}
		<div class="pt-6 px-4">
			<ProgressIndicatorV3 {currentStep} {totalSteps} />
		</div>
	{/if}

	<!-- Step content -->
	{#if currentStep === 0}
		<IntentStakesStep
			onNext={handleIntentStakesDone}
			onIntentSelected={handleIntentSelected}
			onStakesSelected={handleStakesSelected}
		/>
	{:else if currentStep === 1}
		<ProjectsCaptureStep
			userContext={data.userContext}
			onNext={handleBrainDumpDone}
			onProjectsCreated={handleProjectsCreated}
			onCalendarAnalyzed={handleCalendarAnalyzed}
			intent={v3Data.intent ?? undefined}
			isSkippable={isExploreUser}
		/>
	{:else if currentStep === 2}
		<NotificationsStepV3
			userId={data.user.id}
			onNext={handleNotificationsDone}
			onSMSEnabled={handleSMSEnabled}
			onEmailEnabled={handleEmailEnabled}
		/>
	{:else if currentStep === 3}
		<ReadyStep
			userId={data.user.id}
			summary={v3Data}
			onboardingStartedAtMs={onboardingStartTime}
		/>
	{/if}
</div>
