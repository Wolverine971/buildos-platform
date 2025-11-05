<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<script lang="ts">
	import {
		Rocket,
		Calendar,
		Loader2,
		Sparkles,
		CheckCircle,
		Mic,
		MicOff,
		Square,
		LoaderCircle,
		Info,
		TriangleAlert
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
	import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { scale, fade } from 'svelte/transition';
	import { voiceRecordingService } from '$lib/services/voiceRecording.service';

	interface Props {
		userContext?: any; // From previous onboarding inputs
		onNext: () => void;
		onProjectsCreated: (projectIds: string[]) => void;
	}

	let { userContext, onNext, onProjectsCreated }: Props = $props();

	let projectInput = $state('');
	let isProcessing = $state(false);

	// Voice recording state - integrated from VoiceRecordingService
	// Follows same patterns as BrainDumpModal (see BrainDumpModal.svelte:173-189)
	let isVoiceSupported = $state(false);
	let isCurrentlyRecording = $state(false);
	let recordingDuration = $state(0);
	let voiceError = $state('');
	let isInitializingRecording = $state(false);
	let canUseLiveTranscript = $state(false);
	let microphonePermissionGranted = $state(false);
	let voiceCapabilitiesChecked = $state(false);

	// Derived voice state (reactive to service updates)
	let accumulatedTranscript = $derived(voiceRecordingService.getCurrentLiveTranscript());
	let isLiveTranscribing = $derived(voiceRecordingService.isLiveTranscribing());

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

	// Initialize voice recording service
	// Follows BrainDumpModal pattern (see BrainDumpModal.svelte:407-444)
	$effect(() => {
		if (typeof window === 'undefined') return;

		// Initialize voice capability
		isVoiceSupported = voiceRecordingService.isVoiceSupported();

		// Initialize service with callbacks
		voiceRecordingService.initialize(
			{
				onTextUpdate: (text: string) => {
					// Respect 5000 character limit
					if (text.length > 5000) {
						projectInput = text.substring(0, 5000);
						toastService.warning('Voice input truncated to 5000 characters');
					} else {
						projectInput = text;
					}
				},
				onError: (error: string) => {
					voiceError = error;
					toastService.error(error);
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					// Could add isTranscribing state if needed for UI feedback
					console.log('[Voice] Phase change:', phase);
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					console.log('[Voice] Microphone permission granted');
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					canUseLiveTranscript = update.canUseLiveTranscript;
					voiceCapabilitiesChecked = true;
					console.log('[Voice] Capabilities updated:', update);
				}
			},
			brainDumpService
		);

		// Set initial capability state
		canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();
		voiceCapabilitiesChecked = true;

		// Subscribe to recording duration
		const durationStore = voiceRecordingService.getRecordingDuration();
		const unsubscribe = durationStore.subscribe((value) => {
			recordingDuration = value;
		});

		// Cleanup on unmount
		return () => {
			unsubscribe();
			voiceRecordingService.cleanup();
		};
	});

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
		// Stop recording before navigating
		if (isCurrentlyRecording) {
			toastService.warning('Please stop recording before continuing');
			return;
		}
		onNext();
	}

	// Voice recording handlers
	// Follows BrainDumpModal pattern (see BrainDumpModal.svelte:1234-1276)
	async function startRecording() {
		if (!isVoiceSupported) return;

		voiceError = '';
		isInitializingRecording = true;

		try {
			await voiceRecordingService.startRecording(projectInput);
			isInitializingRecording = false;
			isCurrentlyRecording = true;
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Unable to access microphone. Please check your permissions.';
			voiceError = errorMessage;
			isInitializingRecording = false;
			isCurrentlyRecording = false;
		}
	}

	async function stopRecording() {
		if (!isCurrentlyRecording) return;

		try {
			await voiceRecordingService.stopRecording(projectInput);
			isCurrentlyRecording = false;
		} catch (error) {
			console.error('Stop recording error:', error);
			isCurrentlyRecording = false;
		}
	}

	function toggleRecording() {
		if (isCurrentlyRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	}

	// Utility functions
	function isIOS(): boolean {
		if (typeof window === 'undefined') return false;
		return /iPad|iPhone|iPod/.test(navigator.userAgent);
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Voice button state machine
	// Follows RecordingView pattern (see RecordingView.svelte:220-286)
	let voiceButtonState = $derived.by(() => {
		// Priority 1: Recording
		if (isCurrentlyRecording) {
			return {
				icon: MicOff,
				ariaLabel: 'Stop recording',
				disabled: false,
				isLoading: false
			};
		}

		// Priority 2: Initializing
		if (isInitializingRecording) {
			return {
				icon: LoaderCircle,
				ariaLabel: 'Initializing microphone...',
				disabled: true,
				isLoading: true
			};
		}

		// Priority 3: Permission needed
		if (!microphonePermissionGranted && voiceCapabilitiesChecked) {
			return {
				icon: Mic,
				ariaLabel: 'Grant microphone access',
				disabled: false,
				isLoading: false
			};
		}

		// Priority 4: Processing
		if (isProcessing) {
			return {
				icon: Mic,
				ariaLabel: 'Processing...',
				disabled: true,
				isLoading: false
			};
		}

		// Default: Ready
		return {
			icon: Mic,
			ariaLabel: 'Start voice recording',
			disabled: false,
			isLoading: false
		};
	});
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
			Step 1: Clarity - Projects & Brain Dumping
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto mb-4">
			To get organized and productive, you first need <strong>clarity</strong>. And clarity
			comes from getting things out of your head and onto the screen.
		</p>
		<p class="text-base text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
			BuildOS works with <strong>projects</strong> — think of them as siloed endeavors with a goal
			or purpose. They can be work projects, personal goals, creative pursuits, fitness journeys,
			learning objectives — anything you're working towards.
		</p>
	</div>

	<!-- Philosophy Reinforcement + Examples -->
	<div
		class="mb-6 p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800"
	>
		<div
			class="mb-4 bg-white dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
		>
			<p class="text-gray-400 text-sm">
				<img src="/onboarding-assets/screenshots/brain-dump-1.png" />
			</p>
		</div>
		<h3 class="font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
			<Sparkles class="w-5 h-5 text-purple-600 dark:text-purple-400" />
			What Makes a Project?
		</h3>
		<p class="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
			Projects are focused endeavors with a <strong>goal</strong>, <strong>purpose</strong>,
			or <strong>vision</strong>. When you think of what you're working on in terms of
			projects, you can organize structure around actually <em>completing and finishing</em> them.
			That's the power of the project framework.
		</p>

		<h4 class="font-semibold text-sm mb-2 text-gray-900 dark:text-white">
			Here are some examples:
		</h4>
		<div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
			<p>
				💼 <strong class="text-purple-600 dark:text-purple-400">Work Project:</strong>
				"Q1 Marketing Campaign — need to coordinate social posts, email sequences, and landing
				pages before Feb 15."
			</p>
			<p>
				🏋️ <strong class="text-purple-600 dark:text-purple-400">Personal Goal:</strong>
				"Get in shape for summer — track workouts, meal prep, and progress photos. Goal: lose
				15 lbs by June."
			</p>
			<p>
				🎨 <strong class="text-purple-600 dark:text-purple-400">Creative Pursuit:</strong>
				"Launch my Etsy shop — design 10 products, set up store, create Instagram presence."
			</p>
			<p>
				📚 <strong class="text-purple-600 dark:text-purple-400">Learning Objective:</strong>
				"Master Spanish — practice daily with Duolingo, watch Spanish shows, find conversation
				partner."
			</p>
		</div>

		<!-- Placeholder for screenshot -->

		<div
			class="mt-4 bg-white dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
		>
			<p class="text-gray-400 text-sm">
				<img src="/onboarding-assets/screenshots/brain-dump-2.png" />
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
		<!-- Voice Error Display -->
		{#if voiceError}
			<div
				class="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-200 dark:border-red-800 rounded-lg shadow-sm"
				transition:fade={{ duration: 200 }}
			>
				<TriangleAlert class="w-4 h-4 flex-shrink-0" />
				<span>{voiceError}</span>
			</div>
		{/if}

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
						<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
							Connect your Google Calendar and we'll automatically create projects
							based on your meetings and events. No manual entry needed!
						</p>
						<div
							class="text-xs text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
						>
							<p class="font-medium mb-1">How it works:</p>
							<p class="leading-relaxed">
								Our AI scans your calendar for patterns — recurring meetings,
								project-related events, and commitments — then intelligently groups
								them into projects. This is perfect if you already have work
								organized in your calendar and want to import that structure into
								BuildOS without retyping everything.
							</p>
						</div>
					</div>
				</div>

				<!-- Benefits -->
				<div class="mb-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
					<div class="flex items-center gap-2">
						<CheckCircle
							class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0"
						/>
						<span>Automatic project detection from recurring meetings</span>
					</div>
					<div class="flex items-center gap-2">
						<CheckCircle
							class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0"
						/>
						<span>Pre-filled tasks with meeting details and dates</span>
					</div>
					<div class="flex items-center gap-2">
						<CheckCircle
							class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0"
						/>
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
							We can analyze your calendar and automatically suggest projects based on
							your meetings and events.
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
					<p
						class="text-xs text-blue-600 dark:text-blue-400 mt-3 flex items-center gap-2"
					>
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
		<div class="flex items-center justify-between gap-4">
			<!-- Left side: Recording Status or Skip Button -->
			<div class="flex-1">
				{#if isCurrentlyRecording}
					<!-- Recording Status Badge -->
					<div
						class="inline-flex items-center gap-2 px-3.5 py-2 bg-red-50/80 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 rounded-full text-sm text-red-700 dark:text-red-300"
						transition:fade={{ duration: 200 }}
					>
						<span class="font-medium">Recording</span>
						<span class="tabular-nums opacity-90">
							{formatDuration(recordingDuration)}
						</span>
						{#if isLiveTranscribing && canUseLiveTranscript}
							<span
								class="hidden sm:inline text-emerald-500 dark:text-emerald-400 text-xs font-semibold"
							>
								• Live
							</span>
						{/if}
					</div>
				{:else}
					<!-- Skip Button -->
					<Button variant="ghost" onclick={skipProjectCapture} disabled={isProcessing}>
						I'll add projects later
					</Button>
				{/if}
			</div>

			<!-- Right side: Voice Button + Continue Button -->
			<div class="flex items-center gap-3">
				<!-- Voice Recording Button -->
				{#if isVoiceSupported && ONBOARDING_V2_CONFIG.features.enableVoiceInput}
					<button
						onclick={toggleRecording}
						disabled={voiceButtonState.disabled}
						aria-label={voiceButtonState.ariaLabel}
						class="relative w-12 h-12 p-0 rounded-full transition-all {isCurrentlyRecording
							? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white scale-110 animate-recording-pulse shadow-lg'
							: 'bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:scale-105 hover:shadow-md text-gray-700 dark:text-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
					>
						{#if voiceButtonState.isLoading}
							<LoaderCircle class="w-5 h-5 mx-auto animate-spin" />
						{:else if isCurrentlyRecording}
							<Square class="w-4 h-4 mx-auto fill-current" />
						{:else}
							{@const Icon = voiceButtonState.icon}
							<Icon class="w-5 h-5 mx-auto" />
						{/if}
					</button>
				{/if}

				<!-- Continue Button -->
				<Button
					variant="primary"
					size="lg"
					onclick={processBrainDump}
					disabled={projectInput.trim().length < 20 ||
						isProcessing ||
						isCurrentlyRecording}
					loading={isProcessing}
					class="min-w-[140px]"
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
		</div>
	{/if}
</div>

<style>
	/* Recording pulse animation for voice button */
	@keyframes recording-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(220, 38, 38, 0.15);
		}
		100% {
			box-shadow: 0 0 0 12px rgba(220, 38, 38, 0);
		}
	}

	:global(.animate-recording-pulse) {
		animation: recording-pulse 2s infinite;
	}
</style>
