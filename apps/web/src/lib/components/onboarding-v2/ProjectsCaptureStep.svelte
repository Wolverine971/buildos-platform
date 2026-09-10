<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<!-- Onboarding Step 2: inline first brain dump -> transformation receipt (tasker/26 WP-1/2/3).
     Capture phase: the user dumps messy thinking into an inline composer; submit hands the
     draft to the agentic project-create chat (the processing vehicle, auto-sent). Receipt
     phase: a compact activation packet proves what BuildOS understood, created, and will
     remember. Non-explore users cannot continue without one created project. -->
<script lang="ts">
	import { BRAND_TAGLINE, FIRST_PROJECT_PROMPT } from '$lib/constants/brand';
	import {
		ArrowRight,
		Calendar,
		CheckCircle,
		ExternalLink,
		FolderOpen,
		ListChecks,
		LoaderCircle,
		MessageCircle,
		Sparkles,
		Target
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import ActivationReceipt from '$lib/components/onboarding-v3/ActivationReceipt.svelte';
	import ProjectCreationRecovery from '$lib/components/agent/ProjectCreationRecovery.svelte';
	import {
		readOnboardingDraft,
		writeOnboardingDraft,
		type ActivationPacket
	} from '$lib/utils/onboarding-state';
	import { notificationStore } from '$lib/stores/notification.store';
	import type { CalendarAnalysisNotification } from '$lib/types/notification.types';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V3_CONFIG, type OnboardingIntent } from '$lib/config/onboarding.config';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { trackLoopEvent } from '$lib/services/loop-telemetry';
	import { fade, scale } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
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
		userId: string;
		savedProjectId?: string | null;
		busy?: boolean;
		onPacket?: (packet: ActivationPacket) => void;
		onNext: () => void | Promise<void>;
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
		) => void | Promise<void>;
		onCalendarAnalyzed?: (completed: boolean) => void;
		/** V3: tailor capture prompt based on user intent */
		intent?: OnboardingIntent;
		/** V3: allow skipping the project capture step (for "explore" users) */
		isSkippable?: boolean;
		/** Existing projects loaded server-side. */
		initialProjects?: ProjectPreview[];
	}

	let {
		userId,
		savedProjectId = null,
		busy = false,
		onPacket,
		onNext,
		onProjectsCreated,
		onCalendarAnalyzed,
		intent,
		isSkippable,
		initialProjects = []
	}: Props = $props();

	const v3Prompts = $derived(intent ? ONBOARDING_V3_CONFIG.capturePrompts[intent] : null);
	const isExplore = $derived(intent === 'explore');
	const hadProjectsBeforeStep = untrack(() => initialProjects.length > 0);

	function fadeIn(duration = 250) {
		return { duration: prefersReducedMotion.current ? 0 : duration };
	}

	function scaleIn() {
		return prefersReducedMotion.current
			? { duration: 0, start: 1 }
			: { duration: 320, start: 0.96 };
	}

	const PROMPT_CHIPS = [
		'What are you trying to finish?',
		'What feels messy right now?',
		'What deadlines or meetings matter?',
		'What have you already started?'
	];

	// Raw input stays on this device, under this account. The project/milestone also live on the server.
	type CaptureDraft = {
		phase: 'capture' | 'receipt';
		projectIds: string[];
		draft: string;
		source: string;
		notificationId?: string | null;
		creationSessionId?: string | null;
		submittedSource?: string;
	};
	const restored = untrack(() => readOnboardingDraft<CaptureDraft>(userId, 'capture'));
	const initialProjectId = untrack(() => savedProjectId ?? initialProjects[0]?.id ?? null);
	const restoredIds = Array.isArray(restored?.projectIds)
		? restored.projectIds.filter((id) => typeof id === 'string')
		: [];
	let createdProjectIds = $state<string[]>(initialProjectId ? [initialProjectId] : restoredIds);
	let phase = $state<'capture' | 'receipt'>(
		initialProjectId || restoredIds.length ? 'receipt' : 'capture'
	);
	let draftText = $state(typeof restored?.draft === 'string' ? restored.draft : '');
	let creationSessionId = $state<string | null>(restored?.creationSessionId ?? null);
	let submittedSource = $state(restored?.submittedSource ?? '');
	let sourceText = $state(
		(!initialProjectId || restoredIds[0] === initialProjectId) &&
			typeof restored?.source === 'string'
			? restored.source
			: ''
	);
	let calendarNotificationId = $state<string | null>(restored?.notificationId ?? null);
	let isVoiceRecording = $state(false);
	let captureStartedTracked = false;
	let reviewedTracked = false;
	let packet = $state<ActivationPacket | null>(null);
	let packetLoading = $state(false);
	let packetError = $state<string | null>(null);
	let packetRequest = 0;

	$effect(() => {
		writeOnboardingDraft(userId, 'capture', {
			phase,
			projectIds: createdProjectIds,
			draft: draftText,
			source: sourceText,
			notificationId: calendarNotificationId,
			creationSessionId,
			submittedSource
		});
	});

	async function reviewProject(projectId: string) {
		createdProjectIds = [projectId];
		sourceText = '';
		packet = null;
		phase = 'receipt';
		await onProjectsCreated(createdProjectIds);
		await loadPacket(projectId);
	}
	function track(
		event: Parameters<typeof trackLoopEvent>[0],
		props: Record<string, string | number | boolean | null> = {}
	) {
		trackLoopEvent(event, 'onboarding', { intent: intent ?? null, ...props });
	}

	$effect(() => {
		if (!captureStartedTracked && draftText.trim().length > 0) {
			captureStartedTracked = true;
			track('first_capture_started');
		}
	});

	function appendChip(chip: string) {
		draftText = draftText.trim() ? `${draftText.trimEnd()}\n\n${chip}\n` : `${chip}\n`;
	}

	// --- Agentic chat modal (project_create context, the processing vehicle) ---
	let AgentChatModal = $state<any>(null);
	let showChatModal = $state(false);
	let isLoadingChat = $state(false);
	let chatConfig = $state<{
		contextType: 'project_create' | 'project';
		entityId?: string;
		sessionId?: string;
		draft?: string | null;
		autoSend?: boolean;
	}>({ contextType: 'project_create' });

	async function ensureChatModal() {
		if (AgentChatModal) return;
		isLoadingChat = true;
		try {
			const module = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModal = module.default;
		} finally {
			isLoadingChat = false;
		}
	}

	async function submitCapture() {
		if (creationSessionId) return resumeCreation();
		const text = draftText.trim();
		if (!text || isVoiceRecording || isLoadingChat || showChatModal || busy) return;
		try {
			await ensureChatModal();
		} catch (err) {
			console.error('Failed to load AgentChatModal:', err);
			toastService.error('Could not start processing. Please try again.');
			return;
		}
		track('first_capture_submitted', { capture_length: text.length });
		submittedSource = text;
		chatConfig = {
			contextType: 'project_create',
			draft: text,
			autoSend: true
		};
		showChatModal = true;
	}

	async function resumeCreation() {
		if (!creationSessionId || isLoadingChat || showChatModal || busy) return;
		try {
			await ensureChatModal();
			chatConfig = { contextType: 'project_create', sessionId: creationSessionId };
			showChatModal = true;
		} catch {
			toastService.error(
				'Could not reopen setup. Your draft is still saved; please try again.'
			);
		}
	}

	async function handleCreationRecovered(projectIds: string[]) {
		const projectId = projectIds[0];
		if (!projectId) return;
		createdProjectIds = projectIds;
		sourceText = submittedSource || draftText;
		if (draftText.trim() === sourceText.trim()) draftText = '';
		creationSessionId = null;
		submittedSource = '';
		phase = 'receipt';
		track('first_structure_generated', { project_count: projectIds.length });
		track('first_project_created', {
			project_id: projectId,
			is_first: !hadProjectsBeforeStep
		});
		// loadPacket also persists progress; a failed save stays retryable in the receipt.
		await loadPacket(projectId);
	}

	async function openAdjustChat() {
		const projectId = createdProjectIds[0];
		if (!projectId) return;
		try {
			await ensureChatModal();
		} catch (err) {
			console.error('Failed to load AgentChatModal:', err);
			toastService.error('Could not open the project chat. Please try again.');
			return;
		}
		chatConfig = { contextType: 'project', entityId: projectId };
		showChatModal = true;
	}

	async function handleChatClose(summary?: DataMutationSummary) {
		showChatModal = false;
		const wasAdjusting = chatConfig.contextType === 'project';
		if (!wasAdjusting && (creationSessionId || summary?.sessionId)) {
			creationSessionId = creationSessionId ?? summary?.sessionId ?? null;
			return;
		}
		const firstAffectedId = summary?.affectedProjectIds[0];
		if (summary?.hasChanges && firstAffectedId) {
			if (!wasAdjusting) {
				createdProjectIds = summary.affectedProjectIds;
				sourceText = draftText;
				draftText = '';
				phase = 'receipt';
				track('first_structure_generated', {
					project_count: summary.affectedProjectIds.length
				});
				track('first_project_created', {
					project_id: firstAffectedId,
					is_first: !hadProjectsBeforeStep
				});
				await onProjectsCreated(summary.affectedProjectIds);
			}
			void loadPacket(createdProjectIds[0] ?? firstAffectedId);
		}
		// No changes: stay in capture with the draft preserved so retry is one click.
	}

	async function loadPacket(projectId: string | undefined) {
		if (!projectId) return;
		const requestId = ++packetRequest;
		packetLoading = true;
		packetError = null;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/activation-packet`, {
				cache: 'no-store'
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to load your project summary');
			}
			const loaded = (payload?.data ?? payload) as ActivationPacket;
			if (requestId !== packetRequest) return;
			packet = loaded;
			onPacket?.(loaded);
			// loadPacket also runs on OAuth restore and after adjust-in-chat closes —
			// the review event should count the first reveal only.
			if (!reviewedTracked) {
				reviewedTracked = true;
				track('first_project_reviewed', { project_id: projectId });
			}
			await onProjectsCreated(createdProjectIds, {
				goals: loaded.counts.goals,
				requirements: 0,
				plans: loaded.counts.plans,
				tasks: loaded.counts.tasks,
				documents: loaded.counts.documents,
				sources: 0,
				metrics: 0,
				milestones: loaded.counts.milestones,
				risks: 0,
				edges: 0
			});
		} catch (err) {
			console.error('Failed to load activation packet:', err);
			if (requestId !== packetRequest) return;
			packetError =
				err instanceof Error ? err.message : 'Failed to load your project summary';
		} finally {
			if (requestId === packetRequest) packetLoading = false;
		}
	}

	function handleOpenProject() {
		const projectId = createdProjectIds[0];
		if (!projectId) return;
		track('first_project_opened', { project_id: projectId });
	}

	async function handleExploreSkip() {
		if (busy) return;
		track('first_capture_skipped', { reason: 'explore' });
		createdProjectIds = [];
		sourceText = '';
		await onProjectsCreated([]);
		await onNext();
	}

	function handleContinue() {
		if (!busy) void onNext();
	}

	function handleCaptureKeydown(event: KeyboardEvent) {
		// Match the composer's visible "Enter send" hint (and /today's quick capture).
		// Only intercept Enter from the textarea itself — the card also contains the
		// prompt chips and submit button, whose Enter activation must stay native.
		if (
			!event.isComposing &&
			event.key === 'Enter' &&
			!event.shiftKey &&
			event.target instanceof HTMLTextAreaElement
		) {
			event.preventDefault();
			void submitCapture();
		}
	}

	// --- Calendar connection state (follow-up CTA after the first win) ---
	let hasCalendarConnected = $state(false);
	let isCheckingConnection = $state(true);
	let connectionError = $state<string | null>(null);
	let isConnectingCalendar = $state(false);
	let showConnectionSuccess = $state(false);

	let startingAnalysis = $state(false);
	const calendarNotification = $derived(
		calendarNotificationId
			? ($notificationStore.notifications.get(calendarNotificationId) as
					| CalendarAnalysisNotification
					| undefined)
			: undefined
	);
	const calendarAnalysisStarted = $derived(
		startingAnalysis || calendarNotification?.status === 'processing'
	);
	const calendarAnalysisCompleted = $derived(
		calendarNotification?.status === 'success' || calendarNotification?.status === 'warning'
	);
	let analysisError = $state<string | null>(null);

	async function checkCalendarConnection(): Promise<boolean> {
		try {
			isCheckingConnection = true;
			connectionError = null;

			const response = await fetch('/api/calendar', { cache: 'no-store' });

			if (!response.ok) {
				throw new Error(
					'Could not check your calendar connection. Retry or continue without it.'
				);
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

	async function handleConnectCalendar() {
		try {
			isConnectingCalendar = true;
			connectionError = null;

			const redirectPath = '/onboarding';
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
			connectionError =
				'Calendar could not be connected. Please try again, or continue without it.';
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

	onMount(() => {
		// Restore the receipt after an OAuth redirect (or any remount mid-step).
		if (phase === 'receipt' && createdProjectIds.length > 0 && !packet) {
			void onProjectsCreated(createdProjectIds);
			void loadPacket(createdProjectIds[0]);
		}

		// Check if user just returned from OAuth
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);

			// Handle success callback
			if (params.get('calendar') === '1' && params.get('success') === 'calendar_connected') {
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

				connectionError = errorMessage;

				params.delete('calendar');
				params.delete('error');
				replaceCalendarUrlParams(params);
				void refreshCalendarConnection().then(() => {
					connectionError = errorMessage;
				});
				return;
			}
		}

		void refreshCalendarConnection();
	});

	async function handleStartCalendarAnalysis() {
		if (calendarAnalysisStarted) return;
		startingAnalysis = true;
		analysisError = null;
		try {
			const connected = await checkCalendarConnection();
			if (!connected) {
				hasCalendarConnected = false;
				return;
			}
			const { notificationId, completion } = await startCalendarAnalysis({
				daysBack: 7,
				daysForward: 60,
				expandOnStart: false,
				expandOnComplete: false
			});
			calendarNotificationId = notificationId;
			await completion;
			onCalendarAnalyzed?.(true);
		} catch {
			analysisError =
				'Calendar analysis couldn’t finish. Your project is safe. Retry or continue setup.';
		} finally {
			startingAnalysis = false;
		}
	}
</script>

<div class="max-w-3xl mx-auto px-4 py-8 sm:py-10">
	{#if phase === 'capture'}
		<!-- Header -->
		<div class="mb-8 text-center">
			<p class="micro-label mb-3 text-accent">{BRAND_TAGLINE}</p>
			<h1 class="text-2xl sm:text-3xl font-bold mb-3 text-foreground">
				{v3Prompts?.heading ?? 'Tell BuildOS what you’re working on.'}
			</h1>
			<p class="text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
				{isExplore
					? 'Try one project to see how a conversation becomes a workspace. You can also skip for now.'
					: 'Start with one project. Paste your notes or describe what you have so far. BuildOS will organize the pieces into tasks, documents, and next steps.'}
			</p>
		</div>

		{#if creationSessionId}
			<div class="mb-4">
				<ProjectCreationRecovery
					sessionId={creationSessionId}
					paused={showChatModal}
					busy={isLoadingChat || busy}
					onResume={resumeCreation}
					onCreated={handleCreationRecovered}
				/>
			</div>
		{/if}
		<!-- Composer -->
		<div
			class="mb-4 rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak"
			onkeydown={handleCaptureKeydown}
			role="presentation"
		>
			<TextareaWithVoice
				bind:value={draftText}
				bind:isRecording={isVoiceRecording}
				placeholder={v3Prompts?.placeholder ?? FIRST_PROJECT_PROMPT}
				rows={6}
				maxRows={14}
				autoResize={true}
				disabled={Boolean(creationSessionId)}
				voiceNoteSource="onboarding_first_braindump"
			/>

			<!-- Prompt chips for blank-state freeze -->
			<div class="mt-3 flex flex-wrap gap-1.5">
				{#each PROMPT_CHIPS as chip (chip)}
					<button
						type="button"
						onclick={() => appendChip(chip)}
						disabled={Boolean(creationSessionId)}
						class="inline-flex min-h-11 items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						{chip}
					</button>
				{/each}
			</div>

			<Button
				variant="primary"
				size="lg"
				onclick={submitCapture}
				disabled={Boolean(creationSessionId) ||
					!draftText.trim() ||
					isVoiceRecording ||
					isLoadingChat ||
					busy}
				loading={isLoadingChat}
				class="mt-4 w-full shadow-ink"
			>
				<Sparkles class="w-5 h-5 mr-2" />
				Shape my first project
			</Button>
			<p class="mt-2 text-center text-2xs text-muted-foreground">
				BuildOS reads your dump and builds a structured project — you'll see exactly what it
				understood before you continue.
			</p>
		</div>

		<!-- Existing projects (returning users): the first win already happened -->
		{#if initialProjects.length > 0}
			<div class="mb-4" in:fade={fadeIn()}>
				<h3 class="text-sm font-semibold text-muted-foreground mb-2">
					Already in your workspace
				</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each initialProjects.slice(0, 4) as project (project.id)}
						<button
							type="button"
							onclick={() => reviewProject(project.id)}
							class="group relative block w-full text-left rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak pressable hover:border-accent/50 hover:shadow-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
									{#if (project.task_count ?? 0) > 0}
										<span
											class="mt-2 inline-flex items-center gap-1 text-2xs text-muted-foreground"
										>
											<ListChecks class="w-3 h-3" />
											{project.task_count}
											{project.task_count === 1 ? 'task' : 'tasks'}
										</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Continue / skip: explicit paths only. Non-explore users with no projects
		     must complete the brain dump above — there is no default way past it. -->
		<div class="mt-6 flex justify-center">
			{#if initialProjects.length > 0}
				<Button
					variant="outline"
					size="lg"
					onclick={() => {
						const project = initialProjects[0];
						if (project) void reviewProject(project.id);
					}}
					class="min-w-[200px]"
				>
					Review my saved project
					<ArrowRight class="w-4 h-4 ml-2" />
				</Button>
			{:else if isSkippable}
				<button
					type="button"
					onclick={handleExploreSkip}
					class="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					Skip for now — start with an empty workspace
				</button>
			{/if}
		</div>
	{:else}
		<!-- Receipt: what BuildOS understood, created, and will remember -->
		<div class="mb-6 text-center" in:scale={scaleIn()}>
			<div class="flex justify-center mb-4">
				<div
					class="flex h-14 w-14 items-center justify-center rounded-lg bg-success shadow-ink-strong tx tx-bloom tx-weak"
				>
					<CheckCircle class="w-7 h-7 text-success-foreground" />
				</div>
			</div>
			<h1 class="text-2xl sm:text-3xl font-bold mb-2 text-foreground">
				Your project is ready
			</h1>
			<p class="text-base text-muted-foreground max-w-xl mx-auto">
				Review what BuildOS created. Open a task or document, then use chat to tell BuildOS
				what you want to change.
			</p>
		</div>

		<ActivationReceipt
			{packet}
			{sourceText}
			loading={packetLoading}
			error={packetError}
			onRetry={() => loadPacket(createdProjectIds[0])}
		/>

		{#if packet}
			<!-- Receipt actions -->
			<div class="mb-6 flex flex-wrap items-center justify-center gap-3">
				<a
					href={`/projects/${packet.project.id}`}
					target="_blank"
					rel="noopener noreferrer"
					onclick={handleOpenProject}
					class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent underline-offset-2 hover:bg-accent/10 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ExternalLink class="w-4 h-4" />
					Open my project
				</a>
				<button
					type="button"
					onclick={openAdjustChat}
					class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<MessageCircle class="w-4 h-4" />
					Adjust in chat
				</button>
			</div>
		{/if}

		<section
			class="mt-6 rounded-lg border border-border bg-card p-4 sm:p-5"
			aria-label="Optional calendar connection"
		>
			<p class="micro-label mb-2 text-muted-foreground">Optional · your real week</p>
			{#if isCheckingConnection}
				<p class="text-sm text-muted-foreground" role="status">
					Checking your calendar connection…
				</p>
			{:else if hasCalendarConnected}
				<h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
					<CheckCircle class="h-5 w-5 text-success" /> Google Calendar connected
				</h3>
				{#if showConnectionSuccess}<p class="mt-1 text-xs text-success" role="status">
						Connected just now. Your project is right where you left it.
					</p>{/if}
				{#if calendarAnalysisCompleted}
					<p class="mt-2 text-sm text-foreground" role="status">
						{calendarNotification?.data.partial
							? 'Some calendars were unavailable. '
							: ''}Reviewed {calendarNotification?.data.eventCount ?? 'your'} events and
						found {calendarNotification?.data.suggestions?.length ?? 0} suggestions.
					</p>
					{#if calendarNotification?.data.suggestions?.length}
						<Button
							variant="outline"
							size="sm"
							class="mt-3"
							onclick={() =>
								calendarNotificationId &&
								notificationStore.expand(calendarNotificationId)}
							>Review calendar suggestions</Button
						>
					{/if}
				{:else if calendarAnalysisStarted}
					<p
						class="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
						role="status"
					>
						<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" /> Looking
						for project signals and open time. You can continue while this runs.
					</p>
				{:else}
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						Find project signals and open time around your existing commitments.
					</p>
					<Button variant="outline" class="mt-3" onclick={handleStartCalendarAnalysis}
						>Analyze my calendar</Button
					>
				{/if}
				{#if analysisError || calendarNotification?.status === 'error'}<p
						class="mt-3 text-sm text-destructive"
						role="alert"
					>
						{analysisError ?? 'Calendar analysis failed. Retry when you’re ready.'}
					</p>{/if}
			{:else}
				<h3 class="text-base font-semibold text-foreground">Make room for this project</h3>
				<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
					Connect Google Calendar to find open time around real commitments. You can do
					this later in Profile.
				</p>
				<Button
					variant="outline"
					class="mt-3"
					onclick={handleConnectCalendar}
					loading={isConnectingCalendar}
					disabled={isConnectingCalendar || busy}>Connect Google Calendar</Button
				>
			{/if}
			{#if connectionError}<p class="mt-3 text-sm text-destructive" role="alert">
					{connectionError}
				</p>{/if}
		</section>
		<!-- Continue -->
		<div class="mt-6 flex justify-center">
			<Button
				variant="primary"
				size="lg"
				onclick={handleContinue}
				loading={busy}
				disabled={busy}
				class="w-full sm:w-auto sm:min-w-[240px] shadow-ink"
			>
				{hasCalendarConnected ? 'Continue setup' : 'Continue without calendar'}
				<ArrowRight class="w-4 h-4 ml-2" />
			</Button>
		</div>
		<div class="mt-2 flex justify-center">
			<Button variant="ghost" size="sm" disabled={busy} onclick={() => (phase = 'capture')}
				>Choose a different project</Button
			>
		</div>
	{/if}
</div>

<!-- Agentic chat modal: processing vehicle for the first dump, edit surface afterwards -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal
		isOpen={showChatModal}
		contextType={chatConfig.contextType}
		entityId={chatConfig.entityId}
		initialChatSessionId={chatConfig.sessionId ?? null}
		onSessionChange={(sessionId: string | null) => {
			if (sessionId && chatConfig.contextType === 'project_create')
				creationSessionId = sessionId;
		}}
		initialDraft={chatConfig.draft ?? null}
		autoSendInitialDraft={chatConfig.autoSend ?? false}
		onClose={handleChatClose}
	/>
{/if}
