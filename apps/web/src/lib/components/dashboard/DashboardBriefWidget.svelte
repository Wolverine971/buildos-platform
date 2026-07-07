<!-- apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte -->
<!--
  Compact daily brief widget for the dashboard with ontology support.

  PERFORMANCE (Dec 2024):
  - Fixed-height container prevents layout shift during state transitions
  - Skeleton loading state matches final card dimensions
  - Brief data deferred - doesn't block initial page render
-->
<script lang="ts">
	import { Sparkles, LoaderCircle, ChevronRight, AlertCircle, Sun, Volume2 } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { getContext, onDestroy, onMount } from 'svelte';
	import {
		BriefClientService,
		streamingStatus,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import { formatInTimeZone } from 'date-fns-tz';
	import type { DailyBrief, StreamingStatus } from '$lib/types/daily-brief';

	// Props
	interface Props {
		user: { id: string; email?: string; is_admin?: boolean; timezone?: string | null };
		onviewbrief?: (brief: DailyBrief) => void;
		onpreloadbrief?: () => void;
	}

	type EnsureTodayResponse = {
		state:
			| 'completed'
			| 'in_flight'
			| 'queued'
			| 'skipped_no_actor'
			| 'skipped_no_projects'
			| 'skipped_recent_failure';
		briefDate: string;
		timezone: string;
		queued: boolean;
		brief?: DailyBrief | null;
		job?: {
			queue_job_id?: string | null;
			status?: string;
			scheduled_for?: string;
		} | null;
	};

	let { user, onviewbrief, onpreloadbrief }: Props = $props();

	function getInitialTimezone(): string {
		return browser ? user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
	}

	// Get supabase client from context
	const supabase = getContext<any>('supabase');

	// State
	let brief = $state<DailyBrief | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let userTimezone = $state(getInitialTimezone());
	let hasInitialized = $state(false);
	let briefRequestToken = 0;
	let ensureRequestToken = 0;

	// Streaming state from stores
	let currentStreamingStatus = $state<StreamingStatus | null>(null);

	// Computed
	let isGenerating = $derived(currentStreamingStatus?.isGenerating ?? false);
	let progress = $derived(
		currentStreamingStatus
			? Math.round(
					(currentStreamingStatus.progress.projects.completed /
						Math.max(1, currentStreamingStatus.progress.projects.total)) *
						100
				)
			: 0
	);
	let statusMessage = $derived(currentStreamingStatus?.message ?? 'Generating...');

	// Get today's date in user's timezone - only compute once userTimezone is set
	let todayDate = $derived.by(() => {
		if (!browser) return '';
		return formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
	});

	// Brief snippet - CSS handles the final truncation based on available width.
	let briefSnippet = $derived.by(() => {
		const content = brief?.summary_content || brief?.executive_summary || '';
		if (!content) return '';
		return content
			.replace(/#{1,6}\s/g, '')
			.replace(/\*\*/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	});

	// Subscribe to streaming stores using onMount to avoid repeated subscriptions
	onMount(() => {
		const unsubStatus = streamingStatus.subscribe((value) => {
			currentStreamingStatus = value;
		});

		const unsubCompletion = briefGenerationCompleted.subscribe((value) => {
			if (value && value.briefDate === todayDate) {
				// Refresh brief when generation completes
				void fetchTodaysBrief();
			}
		});

		return () => {
			unsubStatus();
			unsubCompletion();
		};
	});

	// Initialize data fetching on mount
	onMount(() => {
		if (!user?.id) return;
		void initializeWidget();
	});

	onDestroy(() => {
		briefRequestToken += 1;
		ensureRequestToken += 1;
	});

	async function initializeWidget() {
		if (hasInitialized) return;
		hasInitialized = true;

		try {
			await fetchTodaysBrief();
			if (!brief) {
				await ensureTodaysBrief();
			}
		} catch (err) {
			console.error('Failed to initialize brief widget:', err);
			isLoading = false;
		}
	}

	async function fetchTodaysBrief() {
		if (!todayDate) return;

		const requestToken = ++briefRequestToken;
		isLoading = true;
		error = null;

		try {
			let nextBrief: DailyBrief | null = null;
			// First try ontology briefs table (use maybeSingle to handle 0 rows gracefully)
			const { data: ontologyBrief, error: ontologyError } = await supabase
				.from('ontology_daily_briefs')
				.select('*')
				.eq('user_id', user.id)
				.eq('brief_date', todayDate)
				.eq('generation_status', 'completed')
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (ontologyBrief) {
				nextBrief = {
					id: ontologyBrief.id,
					user_id: ontologyBrief.user_id,
					brief_date: ontologyBrief.brief_date,
					summary_content: ontologyBrief.executive_summary,
					executive_summary: ontologyBrief.executive_summary,
					llm_analysis: ontologyBrief.llm_analysis,
					priority_actions: ontologyBrief.priority_actions || [],
					generation_status: ontologyBrief.generation_status,
					created_at: ontologyBrief.created_at,
					updated_at: ontologyBrief.updated_at,
					audio_status: ontologyBrief.audio_status,
					audio_storage_path: ontologyBrief.audio_storage_path,
					audio_voice: ontologyBrief.audio_voice,
					audio_model: ontologyBrief.audio_model,
					audio_duration_ms: ontologyBrief.audio_duration_ms,
					audio_generation_ms: ontologyBrief.audio_generation_ms,
					audio_requested_at: ontologyBrief.audio_requested_at,
					audio_generation_started_at: ontologyBrief.audio_generation_started_at,
					audio_generated_at: ontologyBrief.audio_generated_at,
					audio_error: ontologyBrief.audio_error
				} as DailyBrief;
			} else if (!ontologyError || ontologyError.code === 'PGRST116') {
				nextBrief = null;
			} else {
				// Actual error occurred
				console.error('Error fetching ontology brief:', ontologyError);
				nextBrief = null;
			}
			if (requestToken !== briefRequestToken) return;
			brief = nextBrief;
		} catch (err) {
			console.error('Failed to fetch brief:', err);
			// Don't show error for missing briefs - just show generate CTA
			if (requestToken !== briefRequestToken) return;
			brief = null;
		} finally {
			if (requestToken === briefRequestToken) {
				isLoading = false;
			}
		}
	}

	async function ensureTodaysBrief() {
		if (!todayDate || !user?.id) return;

		const requestToken = ++ensureRequestToken;
		try {
			const response = await fetch('/api/daily-briefs/ensure-today', {
				method: 'POST'
			});

			if (!response.ok) {
				console.warn('Daily brief ensure request failed:', response.status);
				return;
			}

			const payload = await response.json();
			const result = payload?.data as EnsureTodayResponse | undefined;
			if (!result) return;
			if (requestToken !== ensureRequestToken) return;

			// The server resolves the canonical brief date from users.timezone; adopt
			// it so todayDate (and the completion-event comparison against it) can't
			// drift from the ensured brief when the local fallback timezone differs.
			if (result.timezone && result.timezone !== userTimezone) {
				userTimezone = result.timezone;
			}

			if (result.state === 'completed' && result.brief) {
				brief = result.brief;
				return;
			}

			const jobId = result.job?.queue_job_id;
			if ((result.state === 'queued' || result.state === 'in_flight') && jobId) {
				await BriefClientService.monitorQueuedGeneration({
					briefDate: result.briefDate || todayDate,
					jobId,
					user: {
						id: user.id,
						email: user.email || '',
						is_admin: user.is_admin || false
					},
					timezone: result.timezone || userTimezone,
					supabaseClient: supabase
				});
			}
		} catch (err) {
			console.warn('Unable to auto-start daily brief generation:', err);
		}
	}

	async function generateBrief() {
		if (!user || isGenerating) return;

		error = null;

		try {
			await BriefClientService.startStreamingGeneration({
				briefDate: todayDate,
				forceRegenerate: false,
				user: { id: user.id, email: user.email || '', is_admin: user.is_admin || false },
				timezone: userTimezone,
				supabaseClient: supabase,
				useOntology: true // Use ontology-based generation
			});
		} catch (err) {
			console.error('Failed to start generation:', err);
			error = 'Failed to generate brief';
		}
	}

	function handleClick() {
		if (brief && onviewbrief) {
			onviewbrief(brief);
		}
	}
</script>

<!-- Fixed-height container prevents layout shift during state transitions -->
<div class="w-full min-h-[52px] sm:min-h-[72px] transition-[min-height] duration-200">
	{#if isLoading}
		<!-- Skeleton Loading State - ghost weight for ephemeral state -->
		<div
			class="flex items-center gap-2 sm:gap-3 wt-ghost p-2 sm:p-3 animate-pulse motion-reduce:animate-none"
			aria-hidden="true"
		>
			<div class="p-1.5 sm:p-2 rounded-md bg-muted">
				<div class="h-3 w-3 sm:h-4 sm:w-4 bg-muted-foreground/20 rounded"></div>
			</div>
			<div class="flex-1 space-y-1.5 sm:space-y-2">
				<div class="h-3 sm:h-4 bg-muted rounded w-20 sm:w-24"></div>
				<div class="h-2.5 sm:h-3 bg-muted rounded w-32 sm:w-48"></div>
			</div>
		</div>
	{:else if isGenerating}
		<!-- Generating State - paper weight with pulse texture -->
		<div class="wt-paper p-2 sm:p-3 border-accent/30 bg-accent/5 tx tx-pulse tx-weak">
			<div class="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
				<div class="p-1.5 sm:p-2 rounded-md bg-accent/10 border border-accent/20">
					<LoaderCircle
						class="h-3 w-3 sm:h-4 sm:w-4 text-accent animate-spin motion-reduce:animate-none"
					/>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-xs sm:text-sm font-medium text-foreground">Generating brief</p>
					<p class="text-[10px] sm:text-xs text-muted-foreground truncate">
						{statusMessage}
					</p>
				</div>
				<span class="text-[10px] sm:text-xs font-bold text-accent">{progress}%</span>
			</div>
			<!-- Progress bar -->
			<div class="h-0.5 sm:h-1 bg-accent/20 rounded-full overflow-hidden">
				<div
					class="h-full bg-accent rounded-full transition-all duration-300"
					style="width: {progress}%"
				></div>
			</div>
		</div>
	{:else if error}
		<!-- Error State - paper weight with static texture -->
		<div class="flex items-center gap-2 sm:gap-3 wt-paper p-2 sm:p-3 tx tx-static tx-weak">
			<div class="p-1.5 sm:p-2 rounded-md bg-destructive/10">
				<AlertCircle class="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
			</div>
			<div class="flex-1">
				<p class="text-xs sm:text-sm text-destructive">{error}</p>
			</div>
			<button
				onclick={generateBrief}
				class="rounded-sm text-[10px] sm:text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
			>
				Retry
			</button>
		</div>
	{:else if brief}
		<!-- Brief Available - paper weight with frame texture -->
		<button
			onclick={handleClick}
			onpointerdown={onpreloadbrief}
			onpointerenter={onpreloadbrief}
			onfocus={onpreloadbrief}
			class="w-full text-left wt-paper p-2 sm:p-3 hover:border-accent pressable tx tx-frame tx-weak group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
		>
			<div class="flex items-center sm:items-start gap-2 sm:gap-3">
				<div
					class="p-1.5 sm:p-2 rounded-md bg-warning/10 border border-warning/20 group-hover:bg-warning/20 transition-colors flex-shrink-0"
				>
					<Sun class="h-3 w-3 sm:h-4 sm:w-4 text-warning" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
						<div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
							<h3 class="shrink-0 text-xs sm:text-sm font-semibold text-foreground">
								Today's Brief
							</h3>
							{#if brief.priority_actions && brief.priority_actions.length > 0}
								<span
									class="inline-flex shrink-0 items-center gap-0.5 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold rounded bg-accent/10 text-accent border border-accent/20"
									title="{brief.priority_actions.length} priority action{brief
										.priority_actions.length === 1
										? ''
										: 's'}"
								>
									<AlertCircle class="w-2.5 h-2.5 sm:hidden" />
									<span class="sm:hidden">{brief.priority_actions.length}</span>
									<span class="hidden sm:inline">
										{brief.priority_actions.length} priority {brief
											.priority_actions.length === 1
											? 'action'
											: 'actions'}
									</span>
								</span>
							{/if}
							{#if brief.audio_status === 'ready' && brief.audio_storage_path}
								<span
									class="inline-flex shrink-0 items-center justify-center rounded bg-muted px-1.5 py-0.5 text-muted-foreground border border-border"
									title="Audio narration ready"
								>
									<Volume2 class="h-3 w-3" />
								</span>
							{/if}
						</div>
						<ChevronRight
							class="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground/50 group-hover:text-accent transition-colors flex-shrink-0"
						/>
					</div>
					<p
						class="mt-0.5 sm:mt-1 w-full min-w-0 truncate text-[11px] sm:text-xs text-muted-foreground leading-snug sm:leading-relaxed"
					>
						{briefSnippet || 'Your daily brief is ready'}
					</p>
				</div>
			</div>
		</button>
	{:else}
		<!-- No Brief - Compact Generate CTA on mobile - ghost weight for suggestion/CTA -->
		<button
			onclick={generateBrief}
			disabled={isGenerating}
			class="w-full flex items-center gap-2 sm:gap-3 wt-ghost border-dashed border-accent/50 p-2 sm:p-3 hover:border-accent hover:bg-accent/10 pressable group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
		>
			<div
				class="p-1.5 sm:p-2 rounded-md bg-accent/10 border border-accent/20 group-hover:bg-accent group-hover:border-accent transition-colors flex-shrink-0"
			>
				<Sparkles
					class="h-3 w-3 sm:h-4 sm:w-4 text-accent group-hover:text-accent-foreground transition-colors"
				/>
			</div>
			<div class="flex-1 text-left min-w-0">
				<h3 class="text-xs sm:text-sm font-semibold text-foreground">Generate Brief</h3>
				<p class="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
					See what matters today — so nothing slips
				</p>
			</div>
			<ChevronRight
				class="h-3 w-3 sm:h-4 sm:w-4 text-accent/50 group-hover:text-accent transition-colors flex-shrink-0"
			/>
		</button>
	{/if}
</div>
