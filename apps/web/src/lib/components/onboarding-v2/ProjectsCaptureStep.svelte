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
		CheckCircle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V3_CONFIG, type OnboardingIntent } from '$lib/config/onboarding.config';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { scale } from 'svelte/transition';

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

	// Calendar connection state
	let hasCalendarConnected = $state(false);
	let isCheckingConnection = $state(true);
	let connectionError = $state<string | null>(null);
	let isConnectingCalendar = $state(false);
	let showConnectionSuccess = $state(false);

	let calendarAnalysisStarted = $state(false);
	let calendarAnalysisCompleted = $state(false);

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
			When you open the chat, you choose how you want to work. Each mode tailors the assistant
			to what you need.
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
		<div class="flex flex-col gap-3 text-xs mb-4">
			<div class="flex gap-2.5 items-start">
				<div
					class="w-5 h-5 rounded bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<MessagesSquare class="w-3 h-3 text-accent" />
				</div>
				<div>
					<strong class="text-foreground">General Chat</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Get the big picture across everything you're working on. Ask about your
						week, compare progress across projects, or get high-level intel on what
						needs attention — without picking a single project first.
					</p>
				</div>
			</div>
			<div class="flex gap-2.5 items-start">
				<div
					class="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<FolderOpen class="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div>
					<strong class="text-foreground">Project Chat</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Dive into a specific project. Update tasks, revise plans, add documents, or
						ask questions — all within the context of that project so the assistant
						knows exactly what you're working on.
					</p>
				</div>
			</div>
			<div class="flex gap-2.5 items-start">
				<div
					class="w-5 h-5 rounded bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<FolderPlus class="w-3 h-3 text-purple-600 dark:text-purple-400" />
				</div>
				<div>
					<strong class="text-foreground">Start a Project</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Got a new idea? Describe it and the assistant will help you shape it into a
						structured project with goals, milestones, and next steps.
					</p>
					<div
						class="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-medium text-muted-foreground"
					>
						<span class="rounded-full border border-border px-2 py-0.5"
							>Home renovation</span
						>
						<span class="rounded-full border border-border px-2 py-0.5"
							>Side business</span
						>
						<span class="rounded-full border border-border px-2 py-0.5"
							>Fitness goal</span
						>
						<span class="rounded-full border border-border px-2 py-0.5">Job search</span
						>
						<span class="rounded-full border border-border px-2 py-0.5">App launch</span
						>
						<span class="rounded-full border border-border px-2 py-0.5"
							>Wedding planning</span
						>
						<span class="rounded-full border border-border px-2 py-0.5"
							>Learning a skill</span
						>
					</div>
				</div>
			</div>
			<div class="flex gap-2.5 items-start">
				<div
					class="w-5 h-5 rounded bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"
				>
					<PenLine class="w-3 h-3 text-violet-600 dark:text-violet-400" />
				</div>
				<div>
					<strong class="text-foreground">Brain Dump</strong>
					<p class="text-muted-foreground leading-snug mt-0.5">
						Just drop a note and go. No back-and-forth, no agent response — think of it
						like quick note-taking. Capture a thought, save a link, log a meeting recap,
						or jot down something before you forget it.
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

	<!-- Calendar Connection & Analysis Section -->
	{#if showConnectionSuccess || hasCalendarConnected}
		<!-- Calendar Connected — prominent CTA to analyze -->
		<div
			class="mb-4 p-5 bg-accent/5 rounded-xl border-2 border-accent/30 shadow-ink tx tx-grain tx-weak"
			in:scale={{ duration: 400, start: 0.95 }}
		>
			<div class="flex items-start gap-3 mb-4">
				<div
					class="w-12 h-12 bg-accent rounded-xl flex items-center justify-center flex-shrink-0 shadow-ink"
				>
					<CheckCircle class="w-6 h-6 text-accent-foreground" />
				</div>
				<div class="flex-1">
					<h3 class="text-base font-bold text-foreground flex items-center gap-2">
						Google Calendar Connected
						<span
							class="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium"
						>
							Ready
						</span>
					</h3>
					<p class="text-sm text-muted-foreground mt-1 leading-relaxed">
						BuildOS can scan your calendar to automatically detect projects from
						your meetings, recurring events, and upcoming deadlines.
					</p>
				</div>
			</div>

			<!-- Benefits -->
			<div
				class="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground"
			>
				<span
					class="flex items-center gap-1.5 bg-card rounded-lg border border-border px-3 py-2"
				>
					<CheckCircle class="w-3.5 h-3.5 text-accent flex-shrink-0" />
					Auto-detect projects from events
				</span>
				<span
					class="flex items-center gap-1.5 bg-card rounded-lg border border-border px-3 py-2"
				>
					<CheckCircle class="w-3.5 h-3.5 text-accent flex-shrink-0" />
					Pre-fill tasks and deadlines
				</span>
				<span
					class="flex items-center gap-1.5 bg-card rounded-lg border border-border px-3 py-2"
				>
					<CheckCircle class="w-3.5 h-3.5 text-accent flex-shrink-0" />
					Smart scheduling suggestions
				</span>
			</div>

			{#if calendarAnalysisStarted}
				<div
					class="flex items-center gap-2 p-3 bg-card rounded-lg border border-border"
				>
					<LoaderCircle class="w-4 h-4 animate-spin text-accent flex-shrink-0" />
					<span class="text-sm text-foreground font-medium">
						Analyzing your calendar — check the notification in the bottom-right
						corner.
					</span>
				</div>
			{:else}
				<Button
					variant="primary"
					size="lg"
					onclick={handleStartCalendarAnalysis}
					class="w-full shadow-ink pressable"
				>
					<Sparkles class="w-5 h-5 mr-2" />
					Analyze My Calendar to Extract Projects
				</Button>
			{/if}
		</div>
	{:else if !hasCalendarConnected && !isCheckingConnection}
		<!-- Calendar Not Connected -->
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
						Shortcut: Analyze your calendar
					</h3>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Connect Google Calendar and BuildOS will automatically detect projects
						from your meetings and events.
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
		</div>
	{/if}

	<!-- Continue -->
	<div class="mt-4 p-2 flex justify-center">
		<Button variant="ghost" onclick={onNext}>
			{isSkippable ? 'Skip for now' : 'Continue'}
		</Button>
	</div>
</div>
