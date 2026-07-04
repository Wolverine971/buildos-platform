<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<script lang="ts">
	import {
		MessagesSquare,
		Calendar,
		LoaderCircle,
		Sparkles,
		CheckCircle,
		FolderPlus,
		FolderOpen,
		ListChecks
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import { ONBOARDING_V3_CONFIG, type OnboardingIntent } from '$lib/config/onboarding.config';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { fade, scale } from 'svelte/transition';
	import { onMount, untrack } from 'svelte';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	type ProjectPreview = {
		id: string;
		name: string;
		description: string | null;
		status: string;
		created_at: string | null;
		task_count?: number;
	};

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
		/** V3: tailor capture prompt based on user intent */
		intent?: OnboardingIntent;
		/** V3: allow skipping the project capture step (for "explore" users) */
		isSkippable?: boolean;
		/** Existing projects loaded server-side. */
		initialProjects?: ProjectPreview[];
	}

	let {
		userContext,
		onNext,
		onProjectsCreated,
		onCalendarAnalyzed,
		intent,
		isSkippable,
		initialProjects = []
	}: Props = $props();

	// Live list of user's projects. Seeded from server, refreshed after chat creates one.
	let projects = $state<ProjectPreview[]>(untrack(() => initialProjects));

	async function refreshProjects() {
		try {
			const res = await fetch('/api/projects?status=active,planning&limit=6', {
				cache: 'no-store'
			});
			if (!res.ok) return;
			const payload = await res.json();
			const list = (payload?.data?.projects ?? payload?.projects ?? []) as ProjectPreview[];
			projects = list.slice(0, 6);
		} catch (err) {
			console.error('Failed to refresh projects:', err);
		}
	}

	// V3 intent-aware prompt configuration
	const v3Prompts = $derived(intent ? ONBOARDING_V3_CONFIG.capturePrompts[intent] : null);

	// Calendar connection state
	let hasCalendarConnected = $state(false);
	let isCheckingConnection = $state(true);
	let connectionError = $state<string | null>(null);
	let isConnectingCalendar = $state(false);
	let showConnectionSuccess = $state(false);

	let calendarAnalysisStarted = $state(false);
	let calendarAnalysisCompleted = $state(false);

	// Agentic chat modal (project_create context)
	let AgentChatModal = $state<any>(null);
	let showChatModal = $state(false);
	let isLoadingChat = $state(false);

	async function handleOpenProjectChat() {
		try {
			if (!AgentChatModal) {
				isLoadingChat = true;
				const module = await import('$lib/components/agent/AgentChatModal.svelte');
				AgentChatModal = module.default;
			}
			showChatModal = true;
		} catch (err) {
			console.error('Failed to load AgentChatModal:', err);
			toastService.error('Could not open the project chat. Please try again.');
		} finally {
			isLoadingChat = false;
		}
	}

	function handleChatClose(summary?: DataMutationSummary) {
		showChatModal = false;
		if (summary?.hasChanges && summary.affectedProjectIds.length > 0) {
			toastService.success('Project created! We saved it to your workspace.', {
				duration: TOAST_DURATION.LONG
			});
			onProjectsCreated(summary.affectedProjectIds);
			void refreshProjects();
		}
	}

	/**
	 * Check if user has Google Calendar connected
	 */
	async function checkCalendarConnection(): Promise<boolean> {
		try {
			isCheckingConnection = true;
			connectionError = null;

			const response = await fetch('/api/calendar', { cache: 'no-store' });

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
			connectionError = null;

			const redirectPath = '/onboarding?v2=true';
			const encodedRedirect = encodeURIComponent(redirectPath);
			const response = await fetch(`/profile/calendar?redirect=${encodedRedirect}`);
			const payload = await response.json().catch(() => null);
			const result = payload?.success === true && 'data' in payload ? payload.data : payload;

			if (!response.ok) {
				throw new Error(
					payload?.error || payload?.message || 'Failed to get calendar auth URL'
				);
			}

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

	function replaceCalendarUrlParams(params: URLSearchParams) {
		if (typeof window === 'undefined') return;
		const query = params.toString();
		const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
		window.history.replaceState({}, '', newUrl);
	}

	async function refreshCalendarConnection(
		options: {
			fromOAuthSuccess?: boolean;
			showSuccessToast?: boolean;
		} = {}
	) {
		const connected = await checkCalendarConnection();
		hasCalendarConnected = connected;

		if (connected) {
			connectionError = null;
			if (options.showSuccessToast) {
				showConnectionSuccess = true;
				toastService.success('Google Calendar connected successfully!');
				setTimeout(() => {
					showConnectionSuccess = false;
				}, 5000);
			}
			return true;
		}

		showConnectionSuccess = false;
		if (options.fromOAuthSuccess) {
			connectionError =
				'Google Calendar did not finish connecting. Please connect it before analyzing your calendar.';
			toastService.error(connectionError);
		}
		return false;
	}

	// Initialize calendar status and handle OAuth callback
	onMount(() => {
		// Check if user just returned from OAuth
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);

			// Handle success callback
			if (params.get('calendar') === '1' && params.get('success') === 'calendar_connected') {
				// Clean up URL params
				params.delete('calendar');
				params.delete('success');
				replaceCalendarUrlParams(params);

				void refreshCalendarConnection({
					fromOAuthSuccess: true,
					showSuccessToast: true
				});
				return;
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
				replaceCalendarUrlParams(params);
			}
		}

		// Check calendar connection status
		void refreshCalendarConnection();
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
				showConnectionSuccess = false;
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
			void completion
				.then(() => {
					if (calendarAnalysisCompleted) return;
					calendarAnalysisCompleted = true;
					onCalendarAnalyzed?.(true);
				})
				.catch(() => {
					calendarAnalysisStarted = false;
					calendarAnalysisCompleted = false;
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

<div class="max-w-3xl mx-auto px-4 py-8 sm:py-10">
	<!-- Header -->
	<div class="mb-8 text-center">
		<div class="flex justify-center mb-4">
			<div
				class="w-14 h-14 bg-muted rounded-xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
			>
				<MessagesSquare class="w-7 h-7 text-accent" />
			</div>
		</div>

		<h2 class="text-2xl sm:text-3xl font-bold mb-3 text-foreground">
			{projects.length > 0
				? 'Your projects'
				: v3Prompts
					? v3Prompts.heading
					: 'Create your first project'}
		</h2>
		<p class="text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
			{projects.length > 0
				? 'You already have projects in BuildOS. Add another anytime or continue setup.'
				: "Open the chat, describe what you're working on, and BuildOS will turn it into a structured project."}
		</p>
	</div>

	<!-- Existing projects preview -->
	{#if projects.length > 0}
		<div class="mb-6" in:fade={{ duration: 250 }}>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{#each projects as project (project.id)}
					<a
						href={`/projects/${project.id}`}
						target="_blank"
						rel="noopener noreferrer"
						class="group relative block p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak hover:border-accent/50 hover:shadow-ink-strong transition-all pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<div class="flex items-start gap-3">
							<div
								class="flex-shrink-0 w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center"
							>
								<FolderOpen class="w-4.5 h-4.5" />
							</div>
							<div class="flex-1 min-w-0">
								<h4
									class="font-semibold text-sm text-foreground truncate group-hover:text-accent transition-colors"
								>
									{project.name}
								</h4>
								{#if project.description}
									<p
										class="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2"
									>
										{project.description}
									</p>
								{/if}
								<div
									class="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground"
								>
									<span
										class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-foreground/80 capitalize font-medium"
									>
										{project.status}
									</span>
									{#if (project.task_count ?? 0) > 0}
										<span class="inline-flex items-center gap-1">
											<ListChecks class="w-3 h-3" />
											{project.task_count}
											{project.task_count === 1 ? 'task' : 'tasks'}
										</span>
									{/if}
								</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- How to create a project -->
	<div class="mb-4 p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak">
		<h3 class="font-semibold mb-2 flex items-center gap-2 text-foreground text-sm">
			<Sparkles class="w-4 h-4 text-accent" />
			{projects.length > 0 ? 'Create another project' : 'This is how you create a project'}
		</h3>
		<p class="text-xs text-muted-foreground mb-3 leading-relaxed">
			Click the <strong class="text-foreground">Ask AI</strong> button in the top nav anytime.
			Describe what you're working on and BuildOS will turn it into a structured project — goals,
			tasks, notes, all in one place.
		</p>

		{#if projects.length === 0}
			<!-- Screenshot: where the chat icon lives — only show for first-time users -->
			<div class="mb-4 bg-muted rounded-lg overflow-hidden border border-border">
				<img
					src="/onboarding-assets/screenshots/agentic-chat-select.webp"
					alt="Arrow pointing to the Ask AI button in the navigation bar"
					loading="lazy"
					class="w-full"
				/>
			</div>
		{/if}

		<!-- Or click here CTA -->
		<Button
			variant="primary"
			size="lg"
			onclick={handleOpenProjectChat}
			disabled={isLoadingChat}
			loading={isLoadingChat}
			class="w-full shadow-ink pressable"
		>
			{#if isLoadingChat}
				Opening...
			{:else}
				<FolderPlus class="w-5 h-5 mr-2" />
				{projects.length > 0
					? 'Create another project'
					: 'Or click here to create a project'}
			{/if}
		</Button>
	</div>

	<!-- Calendar Connection & Analysis Section -->
	{#if hasCalendarConnected}
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
							{showConnectionSuccess ? 'Connected just now' : 'Ready'}
						</span>
					</h3>
					<p class="text-sm text-muted-foreground mt-1 leading-relaxed">
						BuildOS can scan your calendar to automatically detect projects from your
						meetings, recurring events, and upcoming deadlines.
					</p>
				</div>
			</div>

			<!-- Benefits -->
			<div class="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
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
				<div class="flex items-center gap-2 p-3 bg-card rounded-lg border border-border">
					<LoaderCircle class="w-4 h-4 animate-spin text-accent flex-shrink-0" />
					<span class="text-sm text-foreground font-medium">
						Analyzing your calendar — check the notification in the bottom-right corner.
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
	{:else if isCheckingConnection}
		<div
			class="mb-4 p-4 bg-card rounded-xl border border-border shadow-ink tx tx-thread tx-weak"
		>
			<div class="flex items-center gap-3">
				<div
					class="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0"
				>
					<LoaderCircle class="w-5 h-5 animate-spin text-accent" />
				</div>
				<div>
					<h3 class="text-sm font-semibold text-foreground mb-1">
						Checking calendar connection
					</h3>
					<p class="text-xs text-muted-foreground leading-relaxed">
						We are confirming Google Calendar is connected before calendar analysis
						starts.
					</p>
				</div>
			</div>
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
						Connect Google Calendar and BuildOS will automatically detect projects from
						your meetings and events.
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
			{#if connectionError}
				<div
					class="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{connectionError}
				</div>
			{/if}

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
	<div class="mt-6 flex justify-center">
		{#if projects.length > 0}
			<Button
				variant="primary"
				size="lg"
				onclick={onNext}
				class="min-w-[200px] shadow-ink-strong pressable"
			>
				Continue
			</Button>
		{:else}
			<Button variant="ghost" onclick={onNext}>
				{isSkippable ? 'Skip for now' : 'Continue'}
			</Button>
		{/if}
	</div>
</div>

<!-- Agentic chat modal for project creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleChatClose} />
{/if}
