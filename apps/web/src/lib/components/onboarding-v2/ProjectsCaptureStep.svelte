<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<script lang="ts">
	import {
		MessagesSquare,
		FolderOpen,
		FolderPlus,
		PenLine,
		Calendar,
		LoaderCircle,
		Sparkles,
		CheckCircle,
		TriangleAlert
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { attachVoiceNoteGroup } from '$lib/services/voice-note-groups.service';
	import { toastService } from '$lib/stores/toast.store';
	import {
		ONBOARDING_V2_CONFIG,
		ONBOARDING_V3_CONFIG,
		type OnboardingIntent
	} from '$lib/config/onboarding.config';
	import type { DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { scale, fade } from 'svelte/transition';

	interface Props {
		userContext?: any; // From previous onboarding inputs
		onNext: () => void;
		onProjectsCreated: (
			projectIds: string[],
			ontologyCounts?: {
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
			}
		) => void;
		onCalendarAnalyzed?: (completed: boolean) => void;
		/** V3: tailor brain dump prompt based on user intent */
		intent?: OnboardingIntent;
		/** V3: allow skipping the brain dump (for "explore" users) */
		isSkippable?: boolean;
	}

	let { userContext, onNext, onProjectsCreated, onCalendarAnalyzed, intent, isSkippable }: Props =
		$props();

	// V3 intent-aware prompt configuration
	const v3Prompts = $derived(intent ? ONBOARDING_V3_CONFIG.brainDumpPrompts[intent] : null);

	let projectInput = $state('');
	let isProcessing = $state(false);

	// Voice state from TextareaWithVoice (bindable)
	let isRecording = $state(false);
	let voiceError = $state('');
	let voiceNoteGroupId = $state<string | null>(null);

	// Calendar connection state
	let hasCalendarConnected = $state(false);
	let isCheckingConnection = $state(true);
	let connectionError = $state<string | null>(null);
	let isConnectingCalendar = $state(false);
	let showConnectionSuccess = $state(false);

	let createdProjects = $state<string[]>([]);
	let showSuccess = $state(false);
	let calendarAnalysisStarted = $state(false);
	let calendarAnalysisCompleted = $state(false);

	// Reference to TextareaWithVoice for cleanup
	let textareaWithVoiceRef = $state<TextareaWithVoice | null>(null);

	function handleVoiceNoteError(message: string) {
		if (!message) return;
		toastService.error(message);
	}

	/**
	 * Check if user has Google Calendar connected
	 */
	async function checkCalendarConnection(): Promise<boolean> {
		try {
			isCheckingConnection = true;
			connectionError = null;

			const response = await fetch('/api/calendar');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result = await response.json();
			const connected =
				(result?.data && typeof result.data === 'object'
					? (result.data as { connected?: boolean }).connected
					: undefined) ?? result?.connected;
			return result.success && connected === true;
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
	 */
	async function handleConnectCalendar() {
		try {
			isConnectingCalendar = true;

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
			const { completion } = await startCalendarAnalysis({
				daysBack: 7,
				daysForward: 60,
				expandOnStart: false, // Keep minimized
				expandOnComplete: true // Auto-expand when complete
			});

			calendarAnalysisStarted = true;
			void completion.finally(() => {
				if (!calendarAnalysisCompleted) {
					calendarAnalysisCompleted = true;
					onCalendarAnalyzed?.(true);
				}
			});

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
		const minimumLength = isSkippable ? 10 : 20;
		if (projectInput.trim().length < minimumLength) {
			toastService.error(
				`Please provide more details about your projects (at least ${minimumLength} characters)`
			);
			return;
		}

		isProcessing = true;
		let brainDumpId: string | null = null;

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
			try {
				const draftResponse = await brainDumpService.saveDraft(
					projectInput,
					undefined,
					null,
					{
						forceNew: true
					}
				);
				brainDumpId = draftResponse?.data?.brainDumpId ?? null;
			} catch (error) {
				console.warn('Failed to create braindump draft for voice attachments:', error);
			}

			await brainDumpService.parseBrainDumpWithStream(
				projectInput,
				null, // New project
				brainDumpId ?? undefined,
				context,
				{
					autoAccept: true, // Auto-create without review
					onProgress: (status) => {
						console.log('Processing:', status);
					},
					onComplete: (result) => {
						const createdProjectId =
							result.ontology?.project_id || result.projectInfo?.id;
						const projectName = result.projectInfo?.name || 'Project';

						if (voiceNoteGroupId && brainDumpId) {
							void attachVoiceNoteGroup(voiceNoteGroupId, {
								linkedEntityType: 'brain_dump',
								linkedEntityId: brainDumpId,
								status: 'attached'
							}).catch((error) => {
								console.warn('Failed to attach voice notes to braindump:', error);
							});
						}
						voiceNoteGroupId = null;

						if (createdProjectId) {
							createdProjects.push(createdProjectId);
							showSuccess = true;
							toastService.success(`🎉 Created "${projectName}"!`);

							// Wait a moment to show success, then continue
							setTimeout(() => {
								onProjectsCreated(createdProjects, result.ontology?.counts);
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

	async function skipProjectCapture() {
		// Stop recording before navigating
		if (isRecording) {
			await textareaWithVoiceRef?.stopRecording();
		}
		onNext();
	}
</script>

<div class="max-w-3xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-6 text-center">
		<div class="flex justify-center mb-4">
			<div
				class="w-14 h-14 bg-muted rounded-xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
			>
				<MessagesSquare class="w-7 h-7 text-accent" />
			</div>
		</div>

		<h2 class="text-2xl sm:text-3xl font-bold mb-2 text-foreground">
			{v3Prompts ? v3Prompts.heading : 'Meet Your AI Assistant'}
		</h2>
		{#if v3Prompts}
			<p class="text-base text-muted-foreground leading-relaxed max-w-xl mx-auto mb-2">
				Just write freely — BuildOS will turn your thoughts into organized projects and
				tasks.
			</p>
		{:else}
			<p class="text-base text-muted-foreground leading-relaxed max-w-xl mx-auto mb-2">
				Everything in BuildOS happens through the <strong class="text-foreground"
					>Agentic Chat</strong
				>.
			</p>
			<p class="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto">
				Here's how it works — then we'll capture your first project below.
			</p>
		{/if}
	</div>

	<!-- Agentic Chat Overview -->
	<div class="mb-4 p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak">
		<h3 class="font-semibold mb-2 flex items-center gap-2 text-foreground text-sm">
			<Sparkles class="w-4 h-4 text-accent" />
			Where to Find It
		</h3>
		<p class="text-xs text-muted-foreground mb-3 leading-relaxed">
			Look for the <strong class="text-foreground">Brain Dump & Chat</strong> button in the top
			navigation bar. Open it anytime to work with your AI assistant.
		</p>

		<!-- Screenshot: Where to find the chat -->
		<div class="mb-4 bg-muted rounded-lg overflow-hidden border border-border">
			<img
				src="/onboarding-assets/screenshots/agentic-chat-select.png"
				alt="Arrow pointing to the Brain Dump & Chat button in the navigation bar"
				loading="lazy"
				class="w-full"
			/>
		</div>

		<!-- Chat modes heading -->
		<h3 class="font-semibold mb-2 flex items-center gap-2 text-foreground text-sm">
			<Sparkles class="w-4 h-4 text-accent" />
			Four Ways to Work
		</h3>
		<p class="text-xs text-muted-foreground mb-3 leading-relaxed">
			When you open the chat, you choose how you want to work. Each mode tailors the
			assistant to what you need.
		</p>

		<!-- Screenshot: The 4 chat modes -->
		<div class="mb-3 bg-muted rounded-lg overflow-hidden border border-border">
			<img
				src="/onboarding-assets/screenshots/agentic-chat-options.png"
				alt="The four chat mode options: General Chat, Project Chat, Start a Project, and Brain Dump"
				loading="lazy"
				class="w-full"
			/>
		</div>

		<!-- Mode descriptions -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-4">
			<div class="flex gap-2 items-start">
				<div
					class="w-5 h-5 rounded bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<MessagesSquare class="w-3 h-3 text-accent" />
				</div>
				<div>
					<strong class="text-foreground">General Chat</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Talk about anything across all your projects, calendar, and tasks at once.
					</p>
				</div>
			</div>
			<div class="flex gap-2 items-start">
				<div
					class="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<FolderOpen class="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div>
					<strong class="text-foreground">Project Chat</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Pick a specific project and get focused help — plan, update, or review
						progress.
					</p>
				</div>
			</div>
			<div class="flex gap-2 items-start">
				<div
					class="w-5 h-5 rounded bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<FolderPlus class="w-3 h-3 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<strong class="text-foreground">Start a Project</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Guided setup to define a new project with goals, milestones, and structure.
					</p>
				</div>
			</div>
			<div class="flex gap-2 items-start">
				<div
					class="w-5 h-5 rounded bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<PenLine class="w-3 h-3 text-violet-600 dark:text-violet-400" />
				</div>
				<div>
					<strong class="text-foreground">Brain Dump</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Jot down thoughts or ideas — quick one-way capture, no conversation needed.
					</p>
				</div>
			</div>
		</div>

		<!-- Voice transcription hint -->
		<div class="border-t border-border pt-3">
			<h3 class="font-semibold mb-2 flex items-center gap-2 text-foreground text-sm">
				<Sparkles class="w-4 h-4 text-accent" />
				Talk Instead of Type
			</h3>
			<p class="text-xs text-muted-foreground mb-3 leading-relaxed">
				Use the <strong class="text-foreground">voice button</strong> in any chat to talk instead
				of type. It's faster for brain dumps, project updates, and when you're on the go.
			</p>
			<div class="bg-muted rounded-lg overflow-hidden border border-border">
				<img
					src="/onboarding-assets/screenshots/agentic-chat-voice-transcription.png"
					alt="Voice transcription button highlighted in the chat input area"
					loading="lazy"
					class="w-full"
				/>
			</div>
		</div>
	</div>

	<!-- Transition to project capture -->
	<div class="mb-4 flex items-center gap-3">
		<div class="flex-1 h-px bg-border"></div>
		<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
			>Now let's capture your first project</span
		>
		<div class="flex-1 h-px bg-border"></div>
	</div>

	{#if showSuccess}
		<!-- Success animation - Compact -->
		<div
			class="mb-4 p-4 bg-accent/10 rounded-lg border border-accent/30 animate-in fade-in slide-in-from-top-2 tx tx-grain tx-weak"
		>
			<div class="flex items-center gap-2 text-accent">
				<CheckCircle class="w-5 h-5" />
				<p class="font-medium text-sm">Project created! Moving to next step...</p>
			</div>
		</div>
	{:else}
		<!-- Voice Error Display - Compact -->
		{#if voiceError}
			<div
				class="mb-3 flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive text-xs border border-destructive/30 rounded-lg tx tx-static tx-weak"
				transition:fade={{ duration: 200 }}
			>
				<TriangleAlert class="w-3.5 h-3.5 flex-shrink-0" />
				<span>{voiceError}</span>
			</div>
		{/if}

		<!-- Calendar Connection & Analysis Section -->
		{#if showConnectionSuccess}
			<!-- Connection Success - Compact -->
			<div
				class="mb-4 p-4 bg-accent/10 rounded-lg border border-accent/30 shadow-ink tx tx-grain tx-weak"
				in:scale={{ duration: 400, start: 0.9 }}
				out:fade={{ duration: 300 }}
			>
				<div class="flex items-center gap-3 mb-3">
					<div
						class="w-9 h-9 bg-accent rounded-lg flex items-center justify-center flex-shrink-0"
					>
						<CheckCircle class="w-5 h-5 text-accent-foreground" />
					</div>
					<div class="flex-1">
						<h4 class="font-semibold text-sm text-foreground">Calendar Connected!</h4>
						<p class="text-xs text-muted-foreground">Ready to analyze your schedule</p>
					</div>
				</div>

				<Button
					variant="primary"
					onclick={handleStartCalendarAnalysis}
					disabled={calendarAnalysisStarted}
					class="w-full shadow-ink pressable"
				>
					<Sparkles class="w-4 h-4 mr-2" />
					{calendarAnalysisStarted ? 'Analysis Running...' : 'Analyze My Calendar Now'}
				</Button>
			</div>
		{:else if !hasCalendarConnected && !isCheckingConnection}
			<!-- Calendar Not Connected - Compact CTA -->
			<div
				class="mb-4 p-4 bg-card rounded-xl border border-border shadow-ink tx tx-thread tx-weak"
			>
				<div class="flex items-start gap-3 mb-3">
					<div
						class="w-10 h-10 bg-accent rounded-lg flex items-center justify-center flex-shrink-0 shadow-ink"
					>
						<Calendar class="w-5 h-5 text-accent-foreground" />
					</div>
					<div class="flex-1">
						<h3 class="text-sm font-semibold text-foreground mb-1">
							Analyze your calendar
						</h3>
						<p class="text-xs text-muted-foreground leading-relaxed">
							Connect Google Calendar to automatically create projects from your
							meetings and events.
						</p>
					</div>
				</div>

				<!-- Benefits - Compact inline -->
				<div class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
					<span class="flex items-center gap-1">
						<CheckCircle class="w-3 h-3 text-accent flex-shrink-0" />
						Auto-detect projects
					</span>
					<span class="flex items-center gap-1">
						<CheckCircle class="w-3 h-3 text-accent flex-shrink-0" />
						Pre-fill tasks
					</span>
					<span class="flex items-center gap-1">
						<CheckCircle class="w-3 h-3 text-accent flex-shrink-0" />
						Smart scheduling
					</span>
				</div>

				<!-- Primary CTA -->
				<Button
					variant="primary"
					onclick={handleConnectCalendar}
					disabled={isConnectingCalendar}
					loading={isConnectingCalendar}
					class="w-full mb-2 shadow-ink pressable"
				>
					{#if isConnectingCalendar}
						Connecting...
					{:else}
						<Calendar class="w-4 h-4 mr-2" />
						Connect Google Calendar
					{/if}
				</Button>

				<!-- Secondary Action -->
				<button
					class="text-xs text-muted-foreground hover:text-foreground w-full text-center transition-colors"
					onclick={skipProjectCapture}
					disabled={isConnectingCalendar}
				>
					Skip — I'll connect later
				</button>
			</div>
		{:else if hasCalendarConnected}
			<!-- Calendar Connected - Compact -->
			<div
				class="mb-4 p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak"
			>
				<div class="flex items-center gap-3 mb-3">
					<div
						class="w-9 h-9 bg-accent rounded-lg flex items-center justify-center flex-shrink-0 shadow-ink"
					>
						<CheckCircle class="w-5 h-5 text-accent-foreground" />
					</div>
					<div class="flex-1">
						<h4 class="font-semibold text-sm text-foreground flex items-center gap-2">
							Google Calendar Connected
							<span
								class="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium"
							>
								Ready
							</span>
						</h4>
						<p class="text-xs text-muted-foreground">
							Analyze to auto-suggest projects from your events
						</p>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Button
						variant="secondary"
						onclick={handleStartCalendarAnalysis}
						disabled={calendarAnalysisStarted}
						class="shadow-ink pressable"
					>
						<Calendar class="w-4 h-4 mr-1.5" />
						{calendarAnalysisStarted ? 'Analyzing...' : 'Analyze Calendar'}
					</Button>

					{#if calendarAnalysisStarted}
						<span class="text-xs text-muted-foreground flex items-center gap-1">
							<LoaderCircle class="w-3 h-3 animate-spin" />
							Check notifications
						</span>
					{/if}
				</div>
			</div>

			<!-- Divider -->
			<div class="mb-3 flex items-center gap-2">
				<div class="flex-1 h-px bg-border"></div>
				<span class="text-xs text-muted-foreground">OR</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<!-- Manual Brain Dump Label -->
			<p class="text-xs font-medium text-muted-foreground mb-2">
				Describe your projects manually:
			</p>
		{/if}

		<!-- Brain Dump Input with Voice -->
		<div class="mb-4">
			<TextareaWithVoice
				bind:this={textareaWithVoiceRef}
				bind:value={projectInput}
				bind:isRecording
				bind:voiceError
				bind:voiceNoteGroupId
				voiceNoteSource="onboarding_projects"
				onVoiceNoteSegmentError={handleVoiceNoteError}
				placeholder={v3Prompts?.placeholder ||
					"Tell me about your projects, goals, and what you're working on. For example: 'I'm launching a new product next month, need to coordinate marketing, finish the website, and hire a designer...'"}
				rows={5}
				maxRows={8}
				autoResize
				disabled={isProcessing}
				enableVoice={ONBOARDING_V2_CONFIG.features.enableVoiceInput}
				showStatusRow
				showLiveTranscriptPreview
				idleHint="Type or use voice to describe your projects"
				containerClass="bg-card border border-border rounded-xl shadow-ink-inner"
				textareaClass="min-h-[120px] resize-none"
				vocabularyTerms="project, goal, task, milestone, deadline"
			/>
		</div>

		<!-- Actions -->
		<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
			<!-- Skip Button -->
			<Button
				variant="ghost"
				onclick={skipProjectCapture}
				disabled={isProcessing || isRecording}
				class="order-2 sm:order-1"
			>
				{isSkippable ? 'Skip for now' : "I'll add projects later"}
			</Button>

			<!-- Continue Button -->
			<Button
				variant="primary"
				size="lg"
				onclick={processBrainDump}
				disabled={projectInput.trim().length < (isSkippable ? 10 : 20) ||
					isProcessing ||
					isRecording}
				loading={isProcessing}
				class="min-w-[160px] order-1 sm:order-2 shadow-ink pressable"
			>
				{#if isProcessing}
					Creating Projects...
				{:else}
					Continue
					<Sparkles class="w-5 h-5 ml-2" />
				{/if}
			</Button>
		</div>
	{/if}
</div>
