<!-- apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte -->
<!-- Onboarding Step 2: inline first brain dump -> transformation receipt (tasker/26 WP-1/2/3).
     Capture phase: the user dumps messy thinking into an inline composer; submit hands the
     draft to the agentic project-create chat (the processing vehicle, auto-sent). Receipt
     phase: a compact activation packet proves what BuildOS understood, created, and will
     remember. Non-explore users cannot continue without one created project. -->
<script lang="ts">
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
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { ONBOARDING_V3_CONFIG, type OnboardingIntent } from '$lib/config/onboarding.config';
	import { startCalendarAnalysis } from '$lib/services/calendar-analysis-notification.bridge';
	import { trackLoopEvent } from '$lib/services/loop-telemetry';
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

	type ActivationPacket = {
		project: {
			id: string;
			name: string;
			description: string | null;
			next_step_short: string | null;
		};
		start_here: {
			id: string;
			title: string | null;
			excerpt: string | null;
			truncated: boolean;
		} | null;
		counts: {
			tasks: number;
			goals: number;
			documents: number;
			plans: number;
			milestones: number;
		};
		sample_entities: Array<{ kind: 'task' | 'goal' | 'document'; id: string; name: string }>;
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

	const v3Prompts = $derived(intent ? ONBOARDING_V3_CONFIG.capturePrompts[intent] : null);
	const isExplore = $derived(intent === 'explore');
	const hadProjectsBeforeStep = untrack(() => initialProjects.length > 0);

	const PROMPT_CHIPS = [
		'What are you trying to finish?',
		'What feels messy right now?',
		'What deadlines or meetings matter?',
		'What have you already started?'
	];

	// --- Step substate, persisted across the calendar OAuth redirect ---
	const SUBSTATE_KEY = 'buildos_onboarding_step2_state';
	type Step2Substate = {
		phase: 'capture' | 'receipt';
		projectIds: string[];
		draft: string;
		savedAt: number;
	};

	function loadSubstate(): Step2Substate | null {
		try {
			const raw = sessionStorage.getItem(SUBSTATE_KEY);
			if (!raw) return null;
			const state = JSON.parse(raw) as Step2Substate;
			if (Date.now() - state.savedAt > 30 * 60 * 1000) {
				sessionStorage.removeItem(SUBSTATE_KEY);
				return null;
			}
			return state;
		} catch {
			return null;
		}
	}

	const restored = typeof sessionStorage !== 'undefined' ? loadSubstate() : null;

	let phase = $state<'capture' | 'receipt'>(restored?.phase ?? 'capture');
	let draftText = $state(restored?.draft ?? '');
	let isVoiceRecording = $state(false);
	let createdProjectIds = $state<string[]>(restored?.projectIds ?? []);
	let captureStartedTracked = $state(false);
	let reviewedTracked = $state(false);

	let packet = $state<ActivationPacket | null>(null);
	let packetLoading = $state(false);
	let packetError = $state<string | null>(null);

	$effect(() => {
		// Persist so the calendar OAuth round-trip restores the receipt, not a blank step.
		const state: Step2Substate = {
			phase,
			projectIds: createdProjectIds,
			draft: draftText,
			savedAt: Date.now()
		};
		try {
			sessionStorage.setItem(SUBSTATE_KEY, JSON.stringify(state));
		} catch {
			// sessionStorage may be unavailable (private browsing, etc.)
		}
	});

	function clearSubstate() {
		try {
			sessionStorage.removeItem(SUBSTATE_KEY);
		} catch {
			// ignore
		}
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
		const text = draftText.trim();
		if (!text || isVoiceRecording) return;
		try {
			await ensureChatModal();
		} catch (err) {
			console.error('Failed to load AgentChatModal:', err);
			toastService.error('Could not start processing. Please try again.');
			return;
		}
		track('first_capture_submitted', { capture_length: text.length });
		chatConfig = {
			contextType: 'project_create',
			draft: text,
			autoSend: true
		};
		showChatModal = true;
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

	function handleChatClose(summary?: DataMutationSummary) {
		showChatModal = false;
		const wasAdjusting = chatConfig.contextType === 'project';
		const firstAffectedId = summary?.affectedProjectIds[0];
		if (summary?.hasChanges && firstAffectedId) {
			if (!wasAdjusting) {
				createdProjectIds = summary.affectedProjectIds;
				draftText = '';
				phase = 'receipt';
				track('first_structure_generated', {
					project_count: summary.affectedProjectIds.length
				});
				track('first_project_created', {
					project_id: firstAffectedId,
					is_first: !hadProjectsBeforeStep
				});
				onProjectsCreated(summary.affectedProjectIds);
			}
			void loadPacket(createdProjectIds[0] ?? firstAffectedId);
		}
		// No changes: stay in capture with the draft preserved so retry is one click.
	}

	async function loadPacket(projectId: string | undefined) {
		if (!projectId) return;
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
			packet = loaded;
			// loadPacket also runs on OAuth restore and after adjust-in-chat closes —
			// the review event should count the first reveal only.
			if (!reviewedTracked) {
				reviewedTracked = true;
				track('first_project_reviewed', { project_id: projectId });
			}
			onProjectsCreated(createdProjectIds, {
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
			packetError =
				err instanceof Error ? err.message : 'Failed to load your project summary';
		} finally {
			packetLoading = false;
		}
	}

	function handleOpenProject() {
		const projectId = createdProjectIds[0];
		if (!projectId) return;
		track('first_project_opened', { project_id: projectId });
	}

	function handleExploreSkip() {
		track('first_capture_skipped', { reason: 'explore' });
		clearSubstate();
		onNext();
	}

	function handleContinue() {
		clearSubstate();
		onNext();
	}

	function handleCaptureKeydown(event: KeyboardEvent) {
		// Match the composer's visible "Enter send" hint (and /today's quick capture).
		// Only intercept Enter from the textarea itself — the card also contains the
		// prompt chips and submit button, whose Enter activation must stay native.
		if (
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

	let calendarAnalysisStarted = $state(false);
	let calendarAnalysisCompleted = $state(false);

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

	onMount(() => {
		// Restore the receipt after an OAuth redirect (or any remount mid-step).
		if (phase === 'receipt' && createdProjectIds.length > 0 && !packet) {
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

				toastService.error(errorMessage);

				params.delete('calendar');
				params.delete('error');
				replaceCalendarUrlParams(params);
			}
		}

		void refreshCalendarConnection();
	});

	async function handleStartCalendarAnalysis() {
		try {
			const connected = await checkCalendarConnection();

			if (!connected) {
				toastService.error('Please connect your Google Calendar first.');
				hasCalendarConnected = false;
				showConnectionSuccess = false;
				return;
			}

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
	{#if phase === 'capture'}
		<!-- Header -->
		<div class="mb-8 text-center">
			<h2 class="text-2xl sm:text-3xl font-bold mb-3 text-foreground">
				{v3Prompts?.heading ?? "Dump what's in your head. BuildOS will shape it."}
			</h2>
			<p class="text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
				{isExplore
					? 'Try one real dump if you want to see the product work. You can also skip for now.'
					: "Write it messy. Projects, worries, deadlines, half-formed ideas. We'll turn it into something you can work with."}
			</p>
		</div>

		<!-- Composer -->
		<div
			class="mb-4 p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak"
			onkeydown={handleCaptureKeydown}
			role="presentation"
		>
			<TextareaWithVoice
				bind:value={draftText}
				bind:isRecording={isVoiceRecording}
				placeholder={v3Prompts?.placeholder ??
					"Describe what you're working on. Just write freely — we'll sort it out..."}
				rows={6}
				maxRows={14}
				autoResize={true}
				voiceNoteSource="onboarding_first_braindump"
			/>

			<!-- Prompt chips for blank-state freeze -->
			<div class="mt-3 flex flex-wrap gap-1.5">
				{#each PROMPT_CHIPS as chip}
					<button
						type="button"
						onclick={() => appendChip(chip)}
						class="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{chip}
					</button>
				{/each}
			</div>

			<Button
				variant="primary"
				size="lg"
				onclick={submitCapture}
				disabled={!draftText.trim() || isVoiceRecording || isLoadingChat}
				loading={isLoadingChat}
				class="w-full mt-4 shadow-ink pressable"
			>
				<Sparkles class="w-5 h-5 mr-2" />
				Shape my first project
			</Button>
			<p class="mt-2 text-center text-[11px] text-muted-foreground">
				BuildOS reads your dump and builds a structured project — you'll see exactly what it
				understood before you continue.
			</p>
		</div>

		<!-- Existing projects (returning users): the first win already happened -->
		{#if initialProjects.length > 0}
			<div class="mb-4" in:fade={{ duration: 250 }}>
				<h3 class="text-sm font-semibold text-muted-foreground mb-2">
					Already in your workspace
				</h3>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{#each initialProjects.slice(0, 4) as project (project.id)}
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
									{#if (project.task_count ?? 0) > 0}
										<span
											class="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
										>
											<ListChecks class="w-3 h-3" />
											{project.task_count}
											{project.task_count === 1 ? 'task' : 'tasks'}
										</span>
									{/if}
								</div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Continue / skip: explicit paths only. Non-explore users with no projects
		     must complete the brain dump above — there is no default way past it. -->
		<div class="mt-6 flex justify-center">
			{#if initialProjects.length > 0}
				<Button
					variant="primary"
					size="lg"
					onclick={handleContinue}
					class="min-w-[200px] shadow-ink-strong pressable"
				>
					Continue
					<ArrowRight class="w-4 h-4 ml-2" />
				</Button>
			{:else if isSkippable}
				<button
					type="button"
					onclick={handleExploreSkip}
					class="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
				>
					Skip for now — start with an empty workspace
				</button>
			{/if}
		</div>
	{:else}
		<!-- Receipt: what BuildOS understood, created, and will remember -->
		<div class="mb-6 text-center" in:scale={{ duration: 400, start: 0.95 }}>
			<div class="flex justify-center mb-4">
				<div
					class="w-14 h-14 bg-success rounded-xl flex items-center justify-center shadow-ink-strong tx tx-bloom tx-weak"
				>
					<CheckCircle class="w-7 h-7 text-success-foreground" />
				</div>
			</div>
			<h2 class="text-2xl sm:text-3xl font-bold mb-2 text-foreground">
				Your first project is real
			</h2>
			<p class="text-base text-muted-foreground max-w-xl mx-auto">
				Here's what BuildOS understood, what it created, and what it will remember when you
				come back.
			</p>
		</div>

		{#if packetLoading}
			<div
				class="mb-4 flex items-center gap-3 p-4 bg-card rounded-xl border border-border shadow-ink"
			>
				<LoaderCircle class="w-5 h-5 animate-spin text-accent flex-shrink-0" />
				<span class="text-sm text-foreground">Pulling your project summary together…</span>
			</div>
		{:else if packetError}
			<div
				class="mb-4 p-4 bg-card rounded-xl border border-destructive/30 shadow-ink text-sm"
			>
				<p class="text-destructive mb-3">{packetError}</p>
				<Button
					variant="outline"
					size="sm"
					onclick={() => loadPacket(createdProjectIds[0])}
				>
					Try again
				</Button>
			</div>
		{:else if packet}
			<div class="space-y-3 mb-6" in:fade={{ duration: 250 }}>
				<!-- What it understood -->
				<div
					class="p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak"
				>
					<h3
						class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
					>
						What BuildOS understood
					</h3>
					<p class="text-base font-semibold text-foreground">{packet.project.name}</p>
					{#if packet.project.description}
						<p class="text-sm text-muted-foreground mt-1 leading-relaxed">
							{packet.project.description}
						</p>
					{/if}
				</div>

				<!-- What it created -->
				<div
					class="p-4 bg-card rounded-xl border border-border shadow-ink tx tx-frame tx-weak"
				>
					<h3
						class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
					>
						What it created
					</h3>
					<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground mb-2">
						{#if packet.counts.tasks > 0}
							<span class="inline-flex items-center gap-1.5">
								<ListChecks class="w-4 h-4 text-accent" />
								{packet.counts.tasks}
								{packet.counts.tasks === 1 ? 'task' : 'tasks'}
							</span>
						{/if}
						{#if packet.counts.goals > 0}
							<span class="inline-flex items-center gap-1.5">
								<Target class="w-4 h-4 text-accent" />
								{packet.counts.goals}
								{packet.counts.goals === 1 ? 'goal' : 'goals'}
							</span>
						{/if}
						{#if packet.counts.documents > 0}
							<span class="inline-flex items-center gap-1.5">
								<FolderOpen class="w-4 h-4 text-accent" />
								{packet.counts.documents}
								{packet.counts.documents === 1 ? 'document' : 'documents'}
							</span>
						{/if}
					</div>
					{#if packet.sample_entities.length > 0}
						<ul class="space-y-1">
							{#each packet.sample_entities.slice(0, 5) as entity (entity.id)}
								<li class="flex items-center gap-2 text-sm text-muted-foreground">
									<span
										class="inline-block w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"
									></span>
									<span class="truncate">{entity.name}</span>
									<span class="text-[10px] uppercase text-muted-foreground/70"
										>{entity.kind}</span
									>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- What it will remember -->
				{#if packet.start_here?.excerpt}
					<div
						class="p-4 bg-card rounded-xl border border-border shadow-ink tx tx-grain tx-weak"
					>
						<h3
							class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
						>
							What it will remember
						</h3>
						<p class="text-xs text-muted-foreground mb-2 leading-relaxed">
							This lives in your project's Start Here document — BuildOS reads it
							every time you (or your AI tools) come back, so you never re-explain the
							project.
						</p>
						<div
							class="max-h-44 overflow-y-auto rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed"
						>
							{packet.start_here.excerpt}
						</div>
					</div>
				{/if}

				<!-- Next move -->
				{#if packet.project.next_step_short}
					<div
						class="p-4 bg-accent/5 rounded-xl border border-accent/30 shadow-ink flex items-start gap-3"
					>
						<ArrowRight class="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
						<div>
							<h3
								class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1"
							>
								Next move
							</h3>
							<p class="text-sm text-foreground">{packet.project.next_step_short}</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Receipt actions -->
			<div class="mb-6 flex flex-wrap items-center justify-center gap-3">
				<a
					href={`/projects/${packet.project.id}`}
					target="_blank"
					rel="noopener noreferrer"
					onclick={handleOpenProject}
					class="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-2"
				>
					<ExternalLink class="w-4 h-4" />
					Open my project
				</a>
				<button
					type="button"
					onclick={openAdjustChat}
					class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
				>
					<MessageCircle class="w-4 h-4" />
					Adjust in chat
				</button>
			</div>
		{/if}

		<!-- Calendar follow-up: place the first win in the reality of the week -->
		{#if hasCalendarConnected}
			<div
				class="mb-4 p-5 bg-accent/5 rounded-xl border-2 border-accent/30 shadow-ink tx tx-grain tx-weak"
				in:scale={{ duration: 400, start: 0.95 }}
			>
				<div class="flex items-start gap-3 mb-4">
					<div
						class="w-10 h-10 bg-accent rounded-xl flex items-center justify-center flex-shrink-0 shadow-ink"
					>
						<CheckCircle class="w-5 h-5 text-accent-foreground" />
					</div>
					<div class="flex-1">
						<h3 class="text-base font-bold text-foreground flex items-center gap-2">
							Google Calendar connected
							<span
								class="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium"
							>
								{showConnectionSuccess ? 'Connected just now' : 'Ready'}
							</span>
						</h3>
						<p class="text-sm text-muted-foreground mt-1 leading-relaxed">
							Want BuildOS to scan your calendar for project signals and open time?
						</p>
					</div>
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
						onclick={handleStartCalendarAnalysis}
						class="w-full shadow-ink pressable"
					>
						<Sparkles class="w-4 h-4 mr-2" />
						Analyze my calendar
					</Button>
				{/if}
			</div>
		{:else if !isCheckingConnection}
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
							Connect your calendar so BuildOS can work around real life
						</h3>
						<p class="text-xs text-muted-foreground leading-relaxed">
							Find open time around commitments, detect recurring work from meetings,
							and get scheduling suggestions based on actual availability.
						</p>
					</div>
				</div>

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
					class="w-full shadow-ink pressable"
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
			<Button
				variant="primary"
				size="lg"
				onclick={handleContinue}
				class="min-w-[200px] shadow-ink-strong pressable"
			>
				Continue setup
				<ArrowRight class="w-4 h-4 ml-2" />
			</Button>
		</div>
	{/if}
</div>

<!-- Agentic chat modal: processing vehicle for the first dump, edit surface afterwards -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal
		isOpen={showChatModal}
		contextType={chatConfig.contextType}
		entityId={chatConfig.entityId}
		initialDraft={chatConfig.draft ?? null}
		autoSendInitialDraft={chatConfig.autoSend ?? false}
		onClose={handleChatClose}
	/>
{/if}
