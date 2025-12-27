<!-- apps/web/src/routes/onboarding/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { fade, scale, slide } from 'svelte/transition';
	import {
		ChevronLeft,
		ChevronRight,
		Mic,
		MicOff,
		Loader2,
		CheckCircle,
		Rocket,
		Settings,
		HelpCircle,
		Target,
		Sparkles
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		startRecording,
		stopRecording,
		isRecording,
		liveTranscript,
		voiceSupported,
		liveTranscriptSupported,
		getFileExtensionForMimeType
	} from '$lib/utils/voice';
	import { toastService } from '$lib/stores/toast.store';
	import { requireApiSuccess } from '$lib/utils/api-client-helpers';

	// V2 Onboarding Components
	import WelcomeStep from '$lib/components/onboarding-v2/WelcomeStep.svelte';
	import ProjectsCaptureStep from '$lib/components/onboarding-v2/ProjectsCaptureStep.svelte';
	import NotificationsStep from '$lib/components/onboarding-v2/NotificationsStep.svelte';
	import FlexibilityStep from '$lib/components/onboarding-v2/FlexibilityStep.svelte';
	import CombinedProfileStep from '$lib/components/onboarding-v2/CombinedProfileStep.svelte';
	import AdminTourStep from '$lib/components/onboarding-v2/AdminTourStep.svelte';
	import SummaryStep from '$lib/components/onboarding-v2/SummaryStep.svelte';
	import ProgressIndicator from '$lib/components/onboarding-v2/ProgressIndicator.svelte';

	let { data }: { data: PageData } = $props();

	// Feature flag: Check if v2 onboarding is enabled
	const useV2 = $derived($page.url.searchParams.get('v2') === 'true');

	// V2 State
	let v2CurrentStep = $state(0);
	let v2OnboardingData = $state({
		projectsCreated: 0,
		calendarAnalyzed: false,
		smsEnabled: false,
		emailEnabled: false,
		archetype: '',
		challenges: [] as string[]
	});

	function handleV2Next() {
		v2CurrentStep++;
	}

	function handleV2ProjectsCreated(projectIds: string[]) {
		v2OnboardingData.projectsCreated = projectIds.length;
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
	let isTranscribing = $state(false);
	let microphonePermissionGranted = $state(false);
	let canUseLiveTranscript = $state(false);
	let showCompletionScreen = $state(false);
	let isSaving = $state(false);
	let saveFailed = $state(false);

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

		// Check voice capabilities
		if (voiceSupported()) {
			canUseLiveTranscript = liveTranscriptSupported();
			const previouslyGranted = localStorage.getItem('voice_permission_granted') === 'true';
			microphonePermissionGranted = previouslyGranted;
		}
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

	function handleStepInputChange(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		const nextInputs = [...stepInputs];
		nextInputs[currentStep] = target.value ?? '';
		stepInputs = nextInputs;
		triggerAutoSave();
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

	// Voice recording
	async function handleVoiceToggle() {
		if ($isRecording) {
			isTranscribing = true;

			try {
				const audioBlob = await stopRecording();

				if (audioBlob && audioBlob.size > 0) {
					const mimeType = audioBlob.type || 'audio/webm';
					const extension = getFileExtensionForMimeType(mimeType);
					const filename = `recording.${extension}`;
					const audioFile = new File([audioBlob], filename, { type: mimeType });

					const formData = new FormData();
					formData.append('audio', audioFile);

					const response = await fetch('/api/transcribe', {
						method: 'POST',
						body: formData
					});

					if (!response.ok) {
						throw new Error('Transcription failed');
					}

					const result = await response.json();
					const data = result.success && result.data ? result.data : result;

					if (data.transcript) {
						const newTranscript = data.transcript.trim();
						const existingContent = stepInputs[currentStep]?.trim() || '';
						const nextInputs = [...stepInputs];

						nextInputs[currentStep] = existingContent
							? `${existingContent}\n\n${newTranscript}`
							: newTranscript;

						stepInputs = nextInputs;
						liveTranscript.set('');
						triggerAutoSave();
					}
				}
			} catch (error) {
				console.error('Transcription error:', error);
				toastService.error('Could not transcribe audio. Please try again.');
			} finally {
				isTranscribing = false;
			}
		} else {
			try {
				liveTranscript.set('');
				await startRecording();

				if (!microphonePermissionGranted) {
					microphonePermissionGranted = true;
					localStorage.setItem('voice_permission_granted', 'true');
				}
			} catch (error) {
				console.error('Failed to start recording:', error);
				toastService.error('Could not access microphone. Please check permissions.');
			}
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
			<!-- Progress Indicator (show for steps 1-5, not welcome or summary) -->
			{#if v2CurrentStep > 0 && v2CurrentStep < 6}
				<ProgressIndicator currentStep={v2CurrentStep} onStepClick={handleV2StepClick} />
			{/if}

			{#if v2CurrentStep === 0}
				<WelcomeStep onStart={handleV2Next} />
			{:else if v2CurrentStep === 1}
				<ProjectsCaptureStep
					userContext={data.userContext}
					onNext={handleV2Next}
					onProjectsCreated={handleV2ProjectsCreated}
				/>
			{:else if v2CurrentStep === 2}
				<NotificationsStep
					userId={data.user.id}
					onNext={handleV2Next}
					onSMSEnabled={handleV2SMSEnabled}
					onEmailEnabled={handleV2EmailEnabled}
				/>
			{:else if v2CurrentStep === 3}
				<FlexibilityStep onNext={handleV2Next} />
			{:else if v2CurrentStep === 4}
				<CombinedProfileStep
					userId={data.user.id}
					onNext={handleV2Next}
					onArchetypeSelected={handleV2ArchetypeSelected}
					onChallengesSelected={handleV2ChallengesSelected}
				/>
			{:else if v2CurrentStep === 5}
				<AdminTourStep onNext={handleV2Next} onSkip={handleV2Next} />
			{:else if v2CurrentStep === 6}
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

				<!-- Voice recording button -->
				{#if voiceSupported()}
					<div class="text-center mb-4">
						<Button
							onclick={handleVoiceToggle}
							disabled={isTranscribing}
							variant={$isRecording
								? 'danger'
								: hasCurrentInput
									? 'primary'
									: 'secondary'}
							size="lg"
							class="min-w-[200px] shadow-lg hover:shadow-xl transition-all duration-200 {$isRecording
								? 'animate-pulse'
								: ''}"
						>
							{#if isTranscribing}
								<Loader2 class="w-5 h-5 mr-2 animate-spin" />
								Transcribing...
							{:else if $isRecording}
								<MicOff class="w-5 h-5 mr-2" />
								Stop Recording
							{:else}
								<Mic class="w-5 h-5 mr-2" />
								{hasCurrentInput ? 'Add More' : 'Record Answer'}
							{/if}
						</Button>
					</div>
				{/if}

				<!-- Text input -->
				<div class="mb-8">
					<Textarea
						value={stepInputs[currentStep]}
						oninput={handleStepInputChange}
						placeholder={currentStepData?.placeholder}
						rows={8}
						disabled={$isRecording || isTranscribing}
						size="lg"
						class="w-full resize-none shadow-ink-inner"
					/>
					<!-- Live transcript -->
					{#if $isRecording && $liveTranscript}
						<div
							class="mt-4 p-3 bg-accent/10 border border-accent/30 rounded-lg tx tx-pulse tx-weak"
							transition:slide={{ duration: 200 }}
						>
							<p class="text-sm text-accent italic">
								{$liveTranscript}
							</p>
						</div>
					{/if}

					<!-- Save indicator -->
					{#if isSaving}
						<p
							class="text-xs text-muted-foreground mt-2 flex items-center"
							transition:fade
						>
							<Loader2 class="w-3 h-3 mr-1 animate-spin" />
							Saving...
						</p>
					{:else if !hasUnsavedChanges && hasCurrentInput}
						<p class="text-xs text-emerald-600 mt-2 flex items-center" transition:fade>
							<CheckCircle class="w-3 h-3 mr-1" />
							Saved
						</p>
					{/if}

					{#if saveFailed}
						<p class="text-xs text-red-600 mt-2">
							We couldn't save your last changes. We'll retry automatically.
						</p>
					{/if}
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
						class="flex-1 max-w-xs shadow-md hover:shadow-lg transition-all duration-200"
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
