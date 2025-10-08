<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<script lang="ts">
	import { Rocket, Calendar, Loader2, Sparkles, CheckCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
	import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { scale, fade } from 'svelte/transition';

	interface Props {
		userContext?: any; // From previous onboarding inputs
		onNext: () => void;
		onProjectsCreated: (projectIds: string[]) => void;
	}

	let { userContext, onNext, onProjectsCreated }: Props = $props();

	let projectInput = $state('');
	let isProcessing = $state(false);

	// Calendar connection state
	let hasCalendarConnected = $state(false);
	let isCheckingConnection = $state(true);
	let connectionError = $state<string | null>(null);
	let isConnectingCalendar = $state(false);
	let showConnectionSuccess = $state(false);

	let createdProjects = $state<string[]>([]);
	let showSuccess = $state(false);
	let calendarAnalysisStarted = $state(false);

	/**
	 * Check if user has Google Calendar connected
	 * FIXED: Use correct API endpoint
	 */
	async function checkCalendarConnection(): Promise<boolean> {
		try {
			isCheckingConnection = true;
			connectionError = null;

			// FIXED: Correct endpoint is /api/calendar (GET)
			const response = await fetch('/api/calendar');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result = await response.json();

			// Response format: { success: boolean, connected: boolean, userId: string }
			return result.success && result.connected === true;
		} catch (error) {
			console.error('Failed to check calendar connection:', error);
			connectionError = error instanceof Error ? error.message : 'Connection check failed';
			return false;
		} finally {
			isCheckingConnection = false;
		}
	}

	/**
	 * Initiate Google Calendar OAuth connection
	 * Opens OAuth flow in same window (will redirect back to onboarding)
	 */
	async function handleConnectCalendar() {
		try {
			isConnectingCalendar = true;

			// Fetch the calendar auth URL with redirect back to onboarding
			// IMPORTANT: URL-encode the redirect parameter to preserve query params
			const redirectPath = '/onboarding?v2=true';
			const encodedRedirect = encodeURIComponent(redirectPath);
			const response = await fetch(`/profile/calendar?redirect=${encodedRedirect}`);

			if (!response.ok) {
				throw new Error('Failed to get calendar auth URL');
			}

			const result = await response.json();

			if (!result.calendarAuthUrl) {
				throw new Error('No auth URL returned');
			}

			// Navigate to the auth URL (will redirect to Google OAuth, then back to onboarding)
			window.location.href = result.calendarAuthUrl;
		} catch (error) {
			console.error('Calendar connection error:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to connect calendar'
			);
			isConnectingCalendar = false;
		}
	}

	// Initialize calendar status and handle OAuth callback
	$effect(() => {
		// Check if user just returned from OAuth
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);

			// Handle success callback
			if (params.get('calendar') === '1' && params.get('success') === 'calendar_connected') {
				// Calendar was just connected!
				showConnectionSuccess = true;
				toastService.success('Google Calendar connected successfully! 🎉');

				// Auto-hide success message after 5 seconds
				setTimeout(() => {
					showConnectionSuccess = false;
				}, 5000);

				// Clean up URL params
				params.delete('calendar');
				params.delete('success');
				const newUrl = `${window.location.pathname}?${params.toString()}`;
				window.history.replaceState({}, '', newUrl);
			}

			// Handle error callback
			if (params.get('calendar') === '1' && params.get('error')) {
				const error = params.get('error');
				let errorMessage = 'Failed to connect Google Calendar';

				switch (error) {
					case 'access_denied':
						errorMessage = 'Access to Google Calendar was denied';
						break;
					case 'no_authorization_code':
						errorMessage = 'No authorization code received from Google';
						break;
					case 'invalid_state':
						errorMessage = 'Invalid security token. Please try again.';
						break;
					case 'token_exchange_failed':
						errorMessage = 'Failed to exchange authorization code for tokens';
						break;
					default:
						errorMessage = `Calendar connection failed: ${error}`;
				}

				toastService.error(errorMessage);

				// Clean up URL params
				params.delete('calendar');
				params.delete('error');
				const newUrl = `${window.location.pathname}?${params.toString()}`;
				window.history.replaceState({}, '', newUrl);
			}
		}

		// Check calendar connection status
		checkCalendarConnection().then((connected) => {
			hasCalendarConnected = connected;
		});
	});

	/**
	 * Start calendar analysis
	 * Only callable when calendar is connected
	 */
	async function handleStartCalendarAnalysis() {
		try {
			// Double-check connection before analysis
			const connected = await checkCalendarConnection();

			if (!connected) {
				toastService.error('Please connect your Google Calendar first.');
				hasCalendarConnected = false;
				return;
			}

			// Start calendar analysis via notification stack
			const { notificationId } = await startCalendarAnalysis({
				daysBack: 7,
				daysForward: 60,
				expandOnStart: false, // Keep minimized
				expandOnComplete: true // Auto-expand when complete
			});

			calendarAnalysisStarted = true;

			toastService.success(
				'Calendar analysis started! Check the notification in the bottom-right corner.'
			);
		} catch (error) {
			console.error('Calendar analysis error:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to start calendar analysis'
			);
		}
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

		<!-- Calendar Connection & Analysis Section -->
		{#if showConnectionSuccess}
			<!-- Connection Success Animation (Transient State) -->
			<div
				class="mb-6 p-5 bg-green-50 dark:bg-green-900/20 rounded-xl border-2 border-green-200 dark:border-green-800 shadow-sm"
				in:scale={{ duration: 400, start: 0.9 }}
				out:fade={{ duration: 300 }}
			>
				<div class="flex items-center gap-3 mb-4">
					<div
						class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0"
					>
						<CheckCircle class="w-6 h-6 text-white" />
					</div>
					<div class="flex-1">
						<h4 class="font-semibold text-green-900 dark:text-green-100">
							Calendar Connected! 🎉
						</h4>
						<p class="text-sm text-green-700 dark:text-green-300">
							Ready to analyze your schedule
						</p>
					</div>
				</div>

				<Button
					variant="primary"
					size="lg"
					onclick={handleStartCalendarAnalysis}
					disabled={calendarAnalysisStarted}
					class="w-full"
				>
					<Sparkles class="w-5 h-5 mr-2" />
					{calendarAnalysisStarted ? 'Analysis Running...' : 'Analyze My Calendar Now'}
				</Button>
			</div>
		{:else if !hasCalendarConnected && !isCheckingConnection}
			<!-- Calendar Not Connected - Value Proposition CTA -->
			<div
				class="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800 shadow-sm"
			>
				<!-- Header -->
				<div class="flex items-start gap-4 mb-4">
					<div
						class="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0"
					>
						<Calendar class="w-6 h-6 text-white" />
					</div>
					<div class="flex-1">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
							Let us analyze your calendar
						</h3>
						<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
							Connect your Google Calendar and we'll automatically create projects based on
							your meetings and events. No manual entry needed!
						</p>
					</div>
				</div>

				<!-- Benefits -->
				<div class="mb-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
					<div class="flex items-center gap-2">
						<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
						<span>Automatic project detection from recurring meetings</span>
					</div>
					<div class="flex items-center gap-2">
						<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
						<span>Pre-filled tasks with meeting details and dates</span>
					</div>
					<div class="flex items-center gap-2">
						<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
						<span>Smart scheduling around your existing commitments</span>
					</div>
				</div>

				<!-- Demo Preview (Optional Placeholder) -->
				{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
					<div
						class="mb-4 bg-white dark:bg-gray-900 rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700"
					>
						<p class="text-gray-400 text-xs mb-1">
							🎥 [15-second demo: Calendar → Projects transformation]
						</p>
					</div>
				{/if}

				<!-- Primary CTA -->
				<Button
					variant="primary"
					size="lg"
					onclick={handleConnectCalendar}
					disabled={isConnectingCalendar}
					loading={isConnectingCalendar}
					class="w-full mb-3"
				>
					{#if isConnectingCalendar}
						<Loader2 class="w-5 h-5 mr-2 animate-spin" />
						Connecting...
					{:else}
						<Calendar class="w-5 h-5 mr-2" />
						Connect Google Calendar
					{/if}
				</Button>

				<!-- Secondary Action -->
				<button
					class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 w-full text-center transition-colors"
					onclick={skipProjectCapture}
					disabled={isConnectingCalendar}
				>
					Skip for now — I'll connect later
				</button>
			</div>
		{:else if hasCalendarConnected}
			<!-- Calendar Connected - Ready to Analyze -->
			<div
				class="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
			>
				<div class="flex items-start gap-4 mb-4">
					<div
						class="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0"
					>
						<CheckCircle class="w-5 h-5 text-white" />
					</div>
					<div class="flex-1">
						<h4
							class="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"
						>
							Google Calendar Connected
							<span
								class="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full"
							>
								Ready
							</span>
						</h4>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							We can analyze your calendar and automatically suggest projects based on your
							meetings and events.
						</p>
					</div>
				</div>

				<Button
					variant="secondary"
					onclick={handleStartCalendarAnalysis}
					disabled={calendarAnalysisStarted}
					class="w-full sm:w-auto"
				>
					<Calendar class="w-4 h-4 mr-2" />
					{calendarAnalysisStarted ? 'Analysis Running...' : 'Analyze My Calendar'}
				</Button>

				{#if calendarAnalysisStarted}
					<p class="text-xs text-blue-600 dark:text-blue-400 mt-3 flex items-center gap-2">
						<Loader2 class="w-3 h-3 animate-spin" />
						Analysis in progress — Check notification panel (bottom-right corner)
					</p>
				{/if}
			</div>

			<!-- Divider -->
			<div class="mb-6 flex items-center gap-3">
				<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
				<span class="text-sm text-gray-500 dark:text-gray-400 font-medium">OR</span>
				<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
			</div>

			<!-- Manual Brain Dump Label -->
			<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
				Describe your projects manually
			</h4>
		{/if}

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
