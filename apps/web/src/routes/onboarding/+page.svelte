<!-- apps/web/src/routes/onboarding/+page.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import type { PageData } from './$types';
	import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';

	// V3 Onboarding Components
	import IntentStakesStep from '$lib/components/onboarding-v3/IntentStakesStep.svelte';
	import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
	import NotificationsStepV3 from '$lib/components/onboarding-v3/NotificationsStepV3.svelte';
	import ReadyStep from '$lib/components/onboarding-v3/ReadyStep.svelte';
	import ProgressIndicatorV3 from '$lib/components/onboarding-v3/ProgressIndicatorV3.svelte';

	let { data }: { data: PageData } = $props();

	// --- Session state persistence (survives OAuth redirects) ---
	const SESSION_KEY = 'buildos_onboarding_state';

	type SavedOnboardingState = {
		currentStep: number;
		v3Data: typeof v3Data;
		savedAt: number;
	};

	function saveStateToSession() {
		if (!browser) return;
		const state: SavedOnboardingState = {
			currentStep,
			v3Data: { ...v3Data },
			savedAt: Date.now()
		};
		try {
			sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
		} catch {
			// sessionStorage may be unavailable (private browsing, etc.)
		}
	}

	function loadStateFromSession(): SavedOnboardingState | null {
		if (!browser) return null;
		try {
			const raw = sessionStorage.getItem(SESSION_KEY);
			if (!raw) return null;
			const state = JSON.parse(raw) as SavedOnboardingState;
			// Expire after 30 minutes to avoid stale state
			if (Date.now() - state.savedAt > 30 * 60 * 1000) {
				sessionStorage.removeItem(SESSION_KEY);
				return null;
			}
			return state;
		} catch {
			return null;
		}
	}

	function clearSessionState() {
		if (!browser) return;
		try {
			sessionStorage.removeItem(SESSION_KEY);
		} catch {
			// ignore
		}
	}

	// --- Initialize state: restore from session or database ---
	const totalSteps = 4;
	const onboardingStartTime = Date.now();

	// Try to restore from sessionStorage first (OAuth redirect scenario)
	const savedSession = loadStateFromSession();

	let currentStep = $state(savedSession?.currentStep ?? 0);
	let v3Data = $state(
		savedSession?.v3Data ?? {
			intent: null as OnboardingIntent | null,
			stakes: null as OnboardingStakes | null,
			projectsCreated: 0,
			tasksCreated: 0,
			goalsCreated: 0,
			smsEnabled: false,
			emailEnabled: false
		}
	);

	// If no session state, check if intent/stakes were saved to the database
	// (user completed step 0, then got redirected by OAuth)
	if (!savedSession && (data.savedIntent || data.savedStakes)) {
		v3Data.intent = (data.savedIntent as OnboardingIntent) ?? null;
		v3Data.stakes = (data.savedStakes as OnboardingStakes) ?? null;
		// They already completed step 0, jump to step 1
		currentStep = 1;
	}

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

	// Persist state to sessionStorage whenever it changes
	$effect(() => {
		// Access reactive values to track them
		void currentStep;
		void v3Data.intent;
		void v3Data.stakes;
		void v3Data.projectsCreated;
		saveStateToSession();
	});

	// Step navigation
	function goToStep(step: number) {
		currentStep = step;
	}

	function goBack() {
		if (currentStep > 0) {
			currentStep = currentStep - 1;
		}
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
		clearSessionState();
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
			onBack={goBack}
			onProjectsCreated={handleProjectsCreated}
			onCalendarAnalyzed={handleCalendarAnalyzed}
			intent={v3Data.intent ?? undefined}
			isSkippable={isExploreUser}
		/>
	{:else if currentStep === 2}
		<NotificationsStepV3
			userId={data.user.id}
			onNext={handleNotificationsDone}
			onBack={goBack}
			onSMSEnabled={handleSMSEnabled}
			onEmailEnabled={handleEmailEnabled}
		/>
	{:else if currentStep === 3}
		<ReadyStep
			userId={data.user.id}
			summary={v3Data}
			onBack={goBack}
			onboardingStartedAtMs={onboardingStartTime}
		/>
	{/if}
</div>
