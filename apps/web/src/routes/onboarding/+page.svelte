<!-- apps/web/src/routes/onboarding/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { fade, scale } from 'svelte/transition';
	import {
		ChevronLeft,
		ChevronRight,
		LoaderCircle,
		CheckCircle,
		Rocket,
		Settings,
		HelpCircle,
		Target,
		Sparkles
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { requireApiSuccess } from '$lib/utils/api-client-helpers';

	// V2 Onboarding Components
	import WelcomeStep from '$lib/components/onboarding-v2/WelcomeStep.svelte';
	import CapabilitiesStep from '$lib/components/onboarding-v2/CapabilitiesStep.svelte';
	import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
	import NotificationsStep from '$lib/components/onboarding-v2/NotificationsStep.svelte';
	import FlexibilityStep from '$lib/components/onboarding-v2/FlexibilityStep.svelte';
	import PreferencesStep from '$lib/components/onboarding-v2/PreferencesStep.svelte';
	import CombinedProfileStep from '$lib/components/onboarding-v2/CombinedProfileStep.svelte';
	import AdminTourStep from '$lib/components/onboarding-v2/AdminTourStep.svelte';
	import SummaryStep from '$lib/components/onboarding-v2/SummaryStep.svelte';
	import ProgressIndicator from '$lib/components/onboarding-v2/ProgressIndicator.svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';

	let { data }: { data: PageData } = $props();

	// Feature flag: Check if v2 onboarding is enabled
	const useV2 = $derived($page.url.searchParams.get('v2') === 'true');

	// V2 State
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

	let v2CurrentStep = $state(0);
	let v2OnboardingData = $state({
		projectsCreated: 0,
		ontologyCounts: undefined as OntologyCounts | undefined,
		calendarAnalyzed: false,
		smsEnabled: false,
		emailEnabled: false,
		archetype: '',
		challenges: [] as string[]
	});

	const v2TotalSteps = Object.values(ONBOARDING_V2_CONFIG.steps).length;
	const v2SummaryStep = v2TotalSteps - 1;

	function handleV2Next() {
		v2CurrentStep++;
	}

	function handleV2ProjectsCreated(projectIds: string[], ontologyCounts?: OntologyCounts) {
		v2OnboardingData.projectsCreated = projectIds.length;
		if (ontologyCounts) {
			v2OnboardingData.ontologyCounts = ontologyCounts;
		}
	}

	function handleV2CalendarAnalyzed(completed: boolean) {
		if (completed) {
			v2OnboardingData.calendarAnalyzed = true;
		}
	}

	function handleV2SMSEnabled(enabled: boolean) {
		v2OnboardingData.smsEnabled = enabled;
	}

	function handleV2EmailEnabled(enabled: boolean) {
		v2OnboardingData.emailEnabled = enabled;
	}

	function handleV2ArchetypeSelected(archetype: string) {
		v2OnboardingData.archetype = archetype;
	}

	function handleV2ChallengesSelected(challenges: string[]) {
		v2OnboardingData.challenges = challenges;
	}

	function handleV2StepClick(stepIndex: number) {
		// Allow navigation to any step by clicking on the progress indicator
		if (stepIndex !== v2CurrentStep) {
			v2CurrentStep = stepIndex;
		}
	}

	let currentStep = $state(data.recommendedStep || 0);
	let showCompletionScreen = $state(false);
	let isSaving = $state(false);
	let saveFailed = $state(false);

	// Voice state for TextareaWithVoice component
	let voiceInputRef = $state<TextareaWithVoiceComponent | null>(null);
	let isVoiceRecording = $state(false);
	let isVoiceInitializing = $state(false);
	let isVoiceTranscribing = $state(false);
	let voiceErrorMessage = $state('');
	let voiceRecordingDuration = $state(0);
	let voiceSupportsLiveTranscript = $state(false);

	// Current step input value (bound to TextareaWithVoice)
	let currentStepInputValue = $state('');

	const steps = [
		{
			id: 'projects',
			icon: Rocket,
			title: 'Current Projects & Initiatives',
			subtitle: 'What are you actively working on?',
			question:
				"Tell me about your current projects, goals, and initiatives. This helps BuildOS understand what you're building and suggest relevant project structures.",
			placeholder:
				"List your active projects, business goals, creative works, personal initiatives, or anything you're currently focused on...",
			examples: [
				'Building a SaaS platform for small businesses, launching by Q2...',
				'Writing a technical blog, aiming for 2 posts per week...',
				'Learning React, goal is to build 3 practice projects...'
			]
		},
		{
			id: 'work_style',
			icon: Settings,
			title: 'Work Style & Preferences',
			subtitle: 'How do you prefer to work?',
			question:
				'Describe your work habits, preferred schedules, tools you use, and how you like to stay organized. This helps BuildOS optimize task scheduling and daily briefs.',
			placeholder:
				'Share your daily routines, peak productivity hours, favorite tools, communication preferences, and work environment...',
			examples: [
				'Deep work best in mornings 9-11am, use Notion for notes, prefer async communication...',
				'Work in 90-minute blocks, love Pomodoro technique, need music to focus...',
				'Night owl, most productive 8pm-12am, prefer collaborative work in afternoons...'
			]
		},
		{
			id: 'challenges',
			icon: HelpCircle,
			title: 'Current Challenges & Blockers',
			subtitle: "What's slowing you down?",
			question:
				'What challenges are you facing with productivity, organization, or project management? BuildOS can provide targeted suggestions and solutions.',
			placeholder:
				'Describe your current productivity challenges, time management issues, organizational problems, or skills you want to develop...',
			examples: [
				'Constantly switching between tasks, hard to maintain focus...',
				'Projects pile up without clear next steps or priorities...',
				'Struggle with time estimation, always running behind schedule...'
			]
		},
		{
			id: 'help_focus',
			icon: Target,
			title: 'BuildOS Focus Areas',
			subtitle: 'How should BuildOS help you most?',
			question:
				'What aspects of productivity and organization do you want BuildOS to focus on? This customizes your daily briefs and AI assistance.',
			placeholder:
				'Tell us which areas you want the most help with: project organization, task scheduling, daily planning, progress tracking, etc...',
			examples: [
				'Focus on project organization and breaking down big goals into tasks...',
				'Help with daily scheduling and time blocking for deep work...',
				'Need assistance with tracking progress and staying motivated...'
			]
		}
	];

	const totalSteps = steps.length;

	// Store the input for each step
	let stepInputs = $state<string[]>(Array.from({ length: totalSteps }, () => ''));

	// Keep a copy of last persisted values
	let lastSavedInputs = $state<string[]>(Array.from({ length: totalSteps }, () => ''));

	// Auto-save state
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	const currentStepData = $derived(steps[currentStep] ?? steps[0]);
	const hasCurrentInput = $derived((stepInputs[currentStep] ?? '').trim().length > 0);
	const isOnLastStep = $derived(currentStep === steps.length - 1);
	const canComplete = $derived(isOnLastStep && hasCurrentInput);
	const hasUnsavedChanges = $derived(
		stepInputs.some((input, index) => input !== lastSavedInputs[index])
	);

	// Make step statuses reactive - explicitly depend on currentStep and stepInputs
	const stepStatuses = $derived(
		steps.map((_, index) => {
			if (index === currentStep) return 'current' as const;
			return (stepInputs[index] ?? '').trim().length > 0
				? ('completed' as const)
				: ('incomplete' as const);
		})
	);

	// Sync currentStepInputValue with stepInputs array (bidirectional)
	// Effect 1: Load from array when step changes
	// Uses untrack for currentStepInputValue so this effect only runs when
	// stepInputs or currentStep change — NOT when the user types.
	$effect(() => {
		const arrayValue = stepInputs[currentStep] ?? '';
		if (untrack(() => currentStepInputValue) !== arrayValue) {
			currentStepInputValue = arrayValue;
		}
	});

	// Effect 2: Save to array when value changes (from typing or voice)
	$effect(() => {
		const value = currentStepInputValue;
		if (value !== untrack(() => stepInputs)[currentStep]) {
			const nextInputs = [...stepInputs];
			nextInputs[currentStep] = value;
			stepInputs = nextInputs;
			triggerAutoSave();
		}
	});

	// Load existing content from server
	function loadExistingContent() {
		if (!data.userContext) return;

		const inputMapping: Record<number, string> = {
			0: 'input_projects',
			1: 'input_work_style',
			2: 'input_challenges',
			3: 'input_help_focus'
		};

		const nextStepInputs = [...stepInputs];
		const nextLastSavedInputs = [...lastSavedInputs];

		steps.forEach((_, index) => {
			const inputField = inputMapping[index];
			if (!inputField || !data.userContext) return;

			const existingInput = data.userContext[inputField as keyof typeof data.userContext];

			if (existingInput && typeof existingInput === 'string' && existingInput.trim()) {
				nextStepInputs[index] = existingInput;
				nextLastSavedInputs[index] = existingInput;
			}
		});

		stepInputs = nextStepInputs;
		lastSavedInputs = nextLastSavedInputs;
	}

	onMount(async () => {
		// Load existing content
		loadExistingContent();
	});

	onDestroy(() => {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}
	});

	// Simplified auto-save
	async function autoSave(): Promise<boolean> {
		if (isSaving) return false;
		if (!hasUnsavedChanges) {
			if (saveFailed) {
				saveFailed = false;
			}
			return true;
		}

		const updates: Record<string, string | null> = {};
		const nextLastSavedInputs = [...lastSavedInputs];

		stepInputs.forEach((input, index) => {
			if (input === lastSavedInputs[index]) return;

			const step = steps[index];
			if (!step) return;

			const trimmed = input.trim();
			updates[step.id] = trimmed.length > 0 ? trimmed : '';
			nextLastSavedInputs[index] = input;
		});

		if (Object.keys(updates).length === 0) {
			return true;
		}

		isSaving = true;

		try {
			const response = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'save_inputs',
					updates
				})
			});

			await requireApiSuccess(response, 'Failed to save inputs');
			lastSavedInputs = nextLastSavedInputs;
			saveFailed = false;
			return true;
		} catch (error) {
			console.error('Auto-save failed:', error);
			if (!saveFailed) {
				toastService.error('Could not save your progress. We will keep retrying.');
			}
			saveFailed = true;
			triggerAutoSave();
			return false;
		} finally {
			isSaving = false;
		}
	}

	// Debounced auto-save
	function triggerAutoSave() {
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}

		autoSaveTimer = setTimeout(() => {
			void autoSave();
		}, 1500);
	}

	// Navigation
	async function handleNext() {
		// Save current step before moving
		const saved = await autoSave();
		if (!saved) return;

		if (isOnLastStep && canComplete) {
			await completeOnboarding();
		} else if (currentStep < steps.length - 1) {
			currentStep++;
			await tick(); // Ensure UI updates
		}
	}

	async function handlePrev() {
		// Save current step before moving
		const saved = await autoSave();
		if (!saved) return;

		if (currentStep > 0) {
			currentStep--;
			await tick(); // Ensure UI updates
		}
	}

	// Complete onboarding
	async function completeOnboarding() {
		const saved = await autoSave();
		if (!saved) return;

		isSaving = true;

		try {
			// Complete onboarding
			await requireApiSuccess(
				await fetch('/api/onboarding', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'complete' })
				}),
				'Failed to complete onboarding'
			);

			showCompletionScreen = true;
			toastService.success('Setup complete! Preparing your personalized experience...');

			// Redirect after showing success
			setTimeout(() => {
				goto('/');
				invalidateAll();
			}, 2000);
		} catch (error) {
			console.error('Error completing onboarding:', error);
			toastService.error('Failed to complete setup. Please try again.');
		} finally {
			isSaving = false;
		}
	}

	// Progress indicator click handler
	async function handleProgressClick(index: number) {
		if (index !== currentStep) {
			// Save current step before switching
			const saved = await autoSave();
			if (!saved) return;
			currentStep = index;
			// Force a tick to ensure reactivity
			await tick();
		}
	}

	// Computed values for UI
	const completedSteps = $derived(stepStatuses.filter((status) => status === 'completed').length);
	const progressPercentage = $derived(Math.round((completedSteps / steps.length) * 100));
</script>

<svelte:head>
	<title>Welcome to BuildOS | Personalize Your Experience</title>
	<meta
		name="description"
		content="Set up your BuildOS in under 5 minutes. Tell us about your projects and work style to get personalized AI assistance."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if showCompletionScreen}
	<div class="min-h-screen bg-background flex items-center justify-center p-4">
		<div class="max-w-md mx-auto text-center" in:scale={{ duration: 500, start: 0.9 }}>
			<div
				class="w-20 h-20 bg-accent rounded-full flex items-center justify-center mx-auto mb-8 shadow-ink-strong tx tx-bloom tx-weak"
			>
				<CheckCircle class="w-10 h-10 text-accent-foreground" />
			</div>
			<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-4">Welcome to BuildOS!</h1>
			<p class="text-muted-foreground mb-8 text-lg leading-relaxed">
				Your personalized workspace is ready. Let's start building amazing things together.
			</p>
		</div>
	</div>
{:else if useV2}
	<!-- V2 Onboarding Flow -->
	<div class="min-h-screen bg-background">
		<div class="container mx-auto py-8 px-4">
			<!-- Progress Indicator (show for steps between welcome and summary) -->
			{#if v2CurrentStep > 0 && v2CurrentStep < v2SummaryStep}
				<ProgressIndicator currentStep={v2CurrentStep} onStepClick={handleV2StepClick} />
			{/if}

			{#if v2CurrentStep === 0}
				<WelcomeStep onStart={handleV2Next} />
			{:else if v2CurrentStep === 1}
				<CapabilitiesStep onNext={handleV2Next} />
			{:else if v2CurrentStep === 2}
				<ProjectsCaptureStep
					userContext={data.userContext}
					onNext={handleV2Next}
					onProjectsCreated={handleV2ProjectsCreated}
					onCalendarAnalyzed={handleV2CalendarAnalyzed}
				/>
			{:else if v2CurrentStep === 3}
				<NotificationsStep
					userId={data.user.id}
					onNext={handleV2Next}
					onSMSEnabled={handleV2SMSEnabled}
					onEmailEnabled={handleV2EmailEnabled}
				/>
			{:else if v2CurrentStep === 4}
				<FlexibilityStep onNext={handleV2Next} />
			{:else if v2CurrentStep === 5}
				<PreferencesStep userId={data.user.id} onNext={handleV2Next} />
			{:else if v2CurrentStep === 6}
				<CombinedProfileStep
					userId={data.user.id}
					onNext={handleV2Next}
					onArchetypeSelected={handleV2ArchetypeSelected}
					onChallengesSelected={handleV2ChallengesSelected}
				/>
			{:else if v2CurrentStep === 7}
				<AdminTourStep onNext={handleV2Next} onSkip={handleV2Next} />
			{:else if v2CurrentStep === v2SummaryStep}
				<SummaryStep userId={data.user.id} summary={v2OnboardingData} />
			{/if}
		</div>
	</div>
{:else}
	<!-- V1 Onboarding Flow -->
	<div class="min-h-screen bg-background">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-4xl">
			<!-- Enhanced Progress Indicator -->
			<div class="mb-10">
				<div class="flex justify-center items-center mb-4">
					<div class="relative">
						<!-- Progress line -->
						<div
							class="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2"
							style="width: calc(100% - 16px); margin-left: 8px;"
						>
							<div
								class="h-full bg-accent transition-all duration-500 ease-out"
								style="width: {progressPercentage}%"
							></div>
						</div>

						<!-- Progress dots -->
						<div class="relative flex items-center space-x-8">
							{#each steps as step, index (`${index}-${stepStatuses[index]}`)}
								<button
									class="relative z-10 w-4 h-4 rounded-full transition-all duration-300 cursor-pointer hover:scale-125 focus:outline-none focus:ring-4 focus:ring-ring/20 pressable
									{stepStatuses[index] === 'completed'
										? 'bg-emerald-600 shadow-ink'
										: stepStatuses[index] === 'current'
											? 'bg-accent shadow-ink animate-pulse scale-125'
											: 'bg-muted hover:bg-muted/80'}"
									onclick={() => handleProgressClick(index)}
									title={step.title}
								>
									{#if stepStatuses[index] === 'completed'}
										<CheckCircle
											class="w-3 h-3 text-white absolute inset-0 m-auto"
										/>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Progress text -->
				<div class="text-center">
					<p class="text-sm font-medium text-foreground">
						Step {currentStep + 1} of {steps.length}
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						{completedSteps} completed · {progressPercentage}% done
					</p>
				</div>
			</div>

			<!-- Main content with animations -->
			<div class="mb-8" in:fade={{ duration: 300, delay: 150 }}>
				<!-- Step header -->
				<div class="mb-8 text-center">
					<div class="flex justify-center mb-4">
						<div
							class="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
							in:scale={{ duration: 300, start: 0.8 }}
						>
							{#if currentStepData?.icon}
								{@const IconComponent = currentStepData.icon}
								<IconComponent class="w-8 h-8 text-accent" />
							{/if}
						</div>
					</div>

					<h1
						class="text-2xl sm:text-3xl font-bold text-foreground mb-3"
						in:fade={{ duration: 300, delay: 200 }}
					>
						{currentStepData?.title}
					</h1>
					<p
						class="text-base sm:text-lg text-muted-foreground mb-4"
						in:fade={{ duration: 300, delay: 250 }}
					>
						{currentStepData?.subtitle}
					</p>

					<!-- Question card -->
					<div
						class="bg-card border border-border rounded-xl shadow-ink p-6 mb-4 text-left tx tx-frame tx-weak"
						in:fade={{ duration: 300, delay: 300 }}
					>
						<p class="text-foreground leading-relaxed">
							{currentStepData?.question}
						</p>
					</div>
				</div>

				<!-- Text input with integrated voice recording (similar to Agentic Chat) -->
				<div class="mb-8">
					<TextareaWithVoice
						bind:this={voiceInputRef}
						bind:value={currentStepInputValue}
						bind:isRecording={isVoiceRecording}
						bind:isInitializing={isVoiceInitializing}
						bind:isTranscribing={isVoiceTranscribing}
						bind:voiceError={voiceErrorMessage}
						bind:recordingDuration={voiceRecordingDuration}
						bind:canUseLiveTranscript={voiceSupportsLiveTranscript}
						voiceNoteSource="onboarding"
						class="w-full"
						containerClass="rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak"
						textareaClass="border-none bg-transparent px-4 py-3 text-base font-medium leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 resize-none"
						placeholder={currentStepData?.placeholder}
						rows={6}
						maxRows={10}
						autoResize
						disabled={false}
						voiceBlocked={isSaving}
						voiceBlockedLabel="Saving..."
						voiceButtonLabel="Record your answer"
						listeningLabel="Listening"
						transcribingLabel="Transcribing..."
						preparingLabel="Preparing mic…"
						liveTranscriptLabel="Live"
						showStatusRow={true}
						showLiveTranscriptPreview={true}
					/>

					<!-- Save indicator -->
					<div class="mt-2 min-h-[1.25rem]">
						{#if isSaving}
							<p
								class="text-xs text-muted-foreground flex items-center"
								transition:fade
							>
								<LoaderCircle class="w-3 h-3 mr-1 animate-spin" />
								Saving...
							</p>
						{:else if !hasUnsavedChanges && hasCurrentInput}
							<p class="text-xs text-emerald-600 flex items-center" transition:fade>
								<CheckCircle class="w-3 h-3 mr-1" />
								Saved
							</p>
						{:else if saveFailed}
							<p class="text-xs text-destructive">
								We couldn't save your last changes. We'll retry automatically.
							</p>
						{/if}
					</div>
				</div>

				<!-- Navigation buttons -->
				<div class="flex items-center justify-between gap-4">
					<Button
						onclick={handlePrev}
						disabled={currentStep === 0}
						variant="outline"
						size="lg"
						class="min-w-[120px]"
					>
						<ChevronLeft class="w-4 h-4 mr-1" />
						Previous
					</Button>

					<Button
						onclick={handleNext}
						disabled={isSaving || (isOnLastStep && !canComplete)}
						loading={isSaving}
						variant={isOnLastStep && canComplete ? 'primary' : 'outline'}
						size="lg"
						class="flex-1 max-w-xs shadow-ink hover:shadow-ink-strong transition-all duration-200"
					>
						{#if isSaving}
							Saving...
						{:else if isOnLastStep && canComplete}
							Complete Setup
							<Sparkles class="w-4 h-4 ml-2" />
						{:else}
							Continue
							<ChevronRight class="w-4 h-4 ml-2" />
						{/if}
					</Button>
				</div>

				<!-- Examples section -->
				<div class="mt-10 pt-8 border-t border-border">
					<p class="text-sm font-medium text-foreground mb-4">Examples to inspire you:</p>
					<div class="space-y-3">
						{#each currentStepData?.examples ?? [] as example, i}
							<div
								class="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3 border border-border"
								in:fade={{ duration: 300, delay: 350 + i * 50 }}
							>
								{example}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Enhanced animations for the onboarding flow */

	/* Smooth progress bar animation */
	:global(.progress-bar) {
		transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Progress dot animations */
	@keyframes pulse-dot {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.2);
			opacity: 0.8;
		}
	}

	:global(.progress-dot-current) {
		animation: pulse-dot 2s ease-in-out infinite;
	}

	/* Completion animation */
	@keyframes success-scale {
		0% {
			transform: scale(0.8);
			opacity: 0;
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	:global(.success-animation) {
		animation: success-scale 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	/* Recording button pulse */
	@keyframes recording-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
		}
	}

	:global(.recording-active) {
		animation: recording-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	/* Content fade animations */
	@keyframes fade-in-up {
		0% {
			opacity: 0;
			transform: translateY(10px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.fade-in-up) {
		animation: fade-in-up 0.4s ease-out forwards;
	}

	/* Save indicator animations */
	@keyframes save-pulse {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	:global(.saving-indicator) {
		animation: save-pulse 1s ease-in-out infinite;
	}

	/* Button hover effects */
	:global(.button-hover-lift) {
		transition: all 0.2s ease-out;
	}

	:global(.button-hover-lift:hover) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	/* Responsive design improvements */
	@media (max-width: 640px) {
		:global(.mobile-compact) {
			padding: 0.5rem;
		}

		:global(.mobile-text-small) {
			font-size: 0.875rem;
		}
	}

	/* Dark mode enhancements - Inkprint accent */
	@media (prefers-color-scheme: dark) {
		:global(.dark-gradient-subtle) {
			background: hsl(24 80% 55% / 0.05); /* accent with low opacity */
		}
	}

	/* Textarea focus enhancement - Inkprint accent */
	:global(textarea:focus) {
		box-shadow: 0 0 0 3px hsl(24 80% 55% / 0.1);
	}

	/* Smooth transitions for all interactive elements */
	:global(*) {
		transition-property:
			color, background-color, border-color, fill, stroke, opacity, box-shadow, transform;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 150ms;
	}

	/* Disable transitions on prefers-reduced-motion */
	@media (prefers-reduced-motion: reduce) {
		:global(*) {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
