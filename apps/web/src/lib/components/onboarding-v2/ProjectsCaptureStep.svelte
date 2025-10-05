<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<script lang="ts">
	import { Rocket, Calendar, Loader2, Sparkles, CheckCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import CalendarAnalysisModal from '$lib/components/calendar/CalendarAnalysisModal.svelte';
	import CalendarAnalysisResults from '$lib/components/calendar/CalendarAnalysisResults.svelte';
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
	import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';

	interface Props {
		userContext?: any; // From previous onboarding inputs
		onNext: () => void;
		onProjectsCreated: (projectIds: string[]) => void;
	}

	let { userContext, onNext, onProjectsCreated }: Props = $props();

	let projectInput = $state('');
	let isProcessing = $state(false);
	let showCalendarAnalysis = $state(false);
	let showCalendarResults = $state(false);
	let calendarAnalysisId = $state<string | undefined>(undefined);
	let calendarSuggestions = $state<any[]>([]);
	let calendarErrorMessage = $state<string | null>(null);
	let hasCalendarConnected = $state(false);
	let createdProjects = $state<string[]>([]);
	let showSuccess = $state(false);

	// Check if user has Google Calendar connected
	async function checkCalendarConnection(): Promise<boolean> {
		try {
			const response = await fetch('/api/calendar/status');
			const result = await response.json();
			return result.success && result.data?.connected;
		} catch (error) {
			console.error('Failed to check calendar connection:', error);
			return false;
		}
	}

	// Initialize calendar status
	$effect(() => {
		checkCalendarConnection().then((connected) => {
			hasCalendarConnected = connected;
		});
	});

	async function handleStartCalendarAnalysis(options: { daysBack: number; daysForward: number }) {
		try {
			const response = await fetch('/api/calendar/analyze', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					daysBack: options.daysBack,
					daysForward: options.daysForward
				})
			});

			const result = await response.json();

			if (!result.success) {
				if (result.error?.includes('not connected')) {
					calendarErrorMessage =
						'Please connect your Google Calendar first from the Profile page.';
				} else {
					calendarErrorMessage = result.error || 'Failed to analyze calendar';
				}
				throw new Error(result.error || 'Failed to analyze calendar');
			}

			const data = result.data;
			calendarAnalysisId = data.analysisId;
			calendarSuggestions = data.suggestions || [];

			if (calendarSuggestions.length === 0) {
				toastService.info('No project patterns found in your calendar');
			}
		} catch (error) {
			console.error('Calendar analysis error:', error);
			// Error message already set above if it's a connection issue
			if (!calendarErrorMessage) {
				toastService.error(
					error instanceof Error ? error.message : 'Failed to analyze calendar events'
				);
			}
		}
	}

	function showCalendarAnalysisModal() {
		calendarErrorMessage = null; // Reset error message
		showCalendarAnalysis = true;
		showCalendarResults = true;
	}

	function handleCalendarClose() {
		showCalendarResults = false;
		showCalendarAnalysis = false;
	}

	async function processBrainDump() {
		if (projectInput.trim().length < 20) {
			toastService.error(
				'Please provide more details about your projects (at least 20 characters)'
			);
			return;
		}

		isProcessing = true;

		// Build context from user_context if available
		const context: DisplayedBrainDumpQuestion[] = [];

		if (userContext?.input_work_style) {
			context.push({
				question: "What's your work style?",
				answer: userContext.input_work_style
			});
		}

		if (userContext?.input_challenges) {
			context.push({
				question: 'What challenges are you facing?',
				answer: userContext.input_challenges
			});
		}

		try {
			await brainDumpService.parseBrainDumpWithStream(
				projectInput,
				null, // New project
				undefined,
				context,
				{
					autoAccept: true, // Auto-create without review
					onProgress: (status) => {
						console.log('Processing:', status);
					},
					onComplete: (result) => {
						if (result.projectInfo) {
							createdProjects.push(result.projectInfo.id);
							showSuccess = true;
							toastService.success(`🎉 Created "${result.projectInfo.name}"!`);

							// Wait a moment to show success, then continue
							setTimeout(() => {
								onProjectsCreated(createdProjects);
								onNext();
							}, 1500);
						} else {
							toastService.warning(
								'No projects created, but you can add them later!'
							);
							onNext();
						}
					},
					onError: (error) => {
						toastService.error(`Processing failed: ${error}`);
						isProcessing = false;
					}
				}
			);
		} catch (error) {
			console.error('Brain dump error:', error);
			toastService.error('Failed to process. Please try again.');
			isProcessing = false;
		}
	}

	function skipProjectCapture() {
		onNext();
	}
</script>

<div class="max-w-3xl mx-auto px-4">
	<div class="mb-8 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<Rocket class="w-8 h-8 text-purple-600 dark:text-purple-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			Capture Current Projects
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
			Let's start by getting everything out of your head. What projects are you working on
			right now?
		</p>
	</div>

	<!-- Examples section -->
	<div
		class="mb-6 p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800"
	>
		<h3 class="font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
			<Sparkles class="w-5 h-5 text-purple-600 dark:text-purple-400" />
			Examples to inspire you:
		</h3>
		<div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
			<p>
				🏋️ <strong class="text-purple-600 dark:text-purple-400">Fitness Project:</strong>
				"Keep track of my workout routine, meal planning, and schedule."
			</p>
			<p>
				💻 <strong class="text-purple-600 dark:text-purple-400">Side Project:</strong>
				"I'm trying to bootstrap a small app and need to track milestones."
			</p>
			<p>
				📚 <strong class="text-purple-600 dark:text-purple-400">Writing a Book:</strong>
				"Capture all my ideas, research, and outlines in one place."
			</p>
		</div>

		<!-- Placeholder for screenshot -->
		<div
			class="mt-4 bg-white dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
		>
			<p class="text-gray-400 text-sm">
				📸 [Screenshot: Brain dump example with highlighted sections]
			</p>
		</div>
	</div>

	{#if showSuccess}
		<!-- Success animation -->
		<div
			class="mb-6 p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border-2 border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-top-2"
		>
			<div class="flex items-center gap-3 text-green-700 dark:text-green-300">
				<CheckCircle class="w-6 h-6" />
				<p class="font-semibold">Project created successfully! Moving to next step...</p>
			</div>
		</div>
	{:else}
		<!-- Brain dump textarea -->
		<div class="mb-6">
			<Textarea
				bind:value={projectInput}
				placeholder="Don't worry about structure — just brain dump. What are you building? What goals do you have? What's on your mind?"
				rows={8}
				disabled={isProcessing}
				class="w-full"
			/>
			<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
				Minimum 20 characters • {projectInput.length} characters
			</p>
		</div>

		<!-- Calendar analysis CTA -->
		<div
			class="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
		>
			<div class="flex items-start gap-4">
				<Calendar class="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
				<div class="flex-1">
					<h4 class="font-semibold mb-2 text-gray-900 dark:text-white">
						Want BuildOS to analyze your Google Calendar?
					</h4>
					<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
						We can automatically suggest projects based on your meetings and events.
					</p>

					<!-- Placeholder for video demo -->
					<div
						class="mb-4 bg-gray-100 dark:bg-gray-900 rounded-lg p-6 text-center border border-gray-300 dark:border-gray-600"
					>
						<p class="text-gray-400 text-sm mb-1">
							🎥 [Demo video: Calendar analysis in action - 15 seconds]
						</p>
						<p class="text-xs text-gray-500">
							See how BuildOS finds projects from your calendar
						</p>
					</div>

					<Button
						variant="secondary"
						on:click={showCalendarAnalysisModal}
						class="w-full sm:w-auto"
						disabled={isProcessing}
					>
						<Calendar class="w-4 h-4 mr-2" />
						Analyze My Calendar
					</Button>
				</div>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
			<Button
				variant="ghost"
				on:click={skipProjectCapture}
				disabled={isProcessing}
				class="order-2 sm:order-1"
			>
				I'll add projects later
			</Button>

			<Button
				variant="primary"
				size="lg"
				on:click={processBrainDump}
				disabled={projectInput.trim().length < 20 || isProcessing}
				loading={isProcessing}
				class="flex-1 sm:flex-initial min-w-[200px] order-1 sm:order-2"
			>
				{#if isProcessing}
					<Loader2 class="w-5 h-5 mr-2 animate-spin" />
					Creating Projects...
				{:else}
					Continue
					<Sparkles class="w-5 h-5 ml-2" />
				{/if}
			</Button>
		</div>
	{/if}
</div>

<!-- Calendar Analysis Modal -->
<CalendarAnalysisResults
	bind:isOpen={showCalendarResults}
	bind:analysisId={calendarAnalysisId}
	bind:suggestions={calendarSuggestions}
	autoStart={showCalendarAnalysis}
	onClose={handleCalendarClose}
	onStartAnalysis={handleStartCalendarAnalysis}
	errorMessage={calendarErrorMessage}
/>
