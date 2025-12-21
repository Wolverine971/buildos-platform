<!-- apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte -->
<!--
  Compact daily brief widget for the dashboard with ontology support.

  PERFORMANCE (Dec 2024):
  - Fixed-height container prevents layout shift during state transitions
  - Skeleton loading state matches final card dimensions
  - Brief data deferred - doesn't block initial page render
-->
<script lang="ts">
	import { Sparkles, Loader2, ChevronRight, AlertCircle, Sun } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { getContext, onMount } from 'svelte';
	import {
		BriefClientService,
		streamingStatus,
		streamingBriefData,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import { formatInTimeZone } from 'date-fns-tz';
	import type { DailyBrief, StreamingStatus, StreamingBriefData } from '$lib/types/daily-brief';

	// Props
	interface Props {
		user: { id: string; email?: string; is_admin?: boolean };
		onViewBrief?: (brief: DailyBrief) => void;
	}

	let { user, onViewBrief }: Props = $props();

	// Get supabase client from context
	const supabase = getContext<any>('supabase');

	// State
	let brief = $state<DailyBrief | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let userTimezone = $state(browser ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
	let hasInitialized = $state(false);

	// Streaming state from stores
	let currentStreamingStatus = $state<StreamingStatus | null>(null);
	let currentStreamingData = $state<StreamingBriefData | null>(null);

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

	// Brief snippet - first 150 chars of executive summary
	let briefSnippet = $derived.by(() => {
		const content = brief?.summary_content || brief?.executive_summary || '';
		if (!content) return '';
		// Strip markdown and get first 150 chars
		const stripped = content
			.replace(/#{1,6}\s/g, '')
			.replace(/\*\*/g, '')
			.replace(/\n/g, ' ')
			.trim();
		return stripped.length > 150 ? stripped.slice(0, 150) + '...' : stripped;
	});

	// Subscribe to streaming stores using onMount to avoid repeated subscriptions
	onMount(() => {
		const unsubStatus = streamingStatus.subscribe((value) => {
			currentStreamingStatus = value;
		});

		const unsubData = streamingBriefData.subscribe((value) => {
			currentStreamingData = value;
		});

		const unsubCompletion = briefGenerationCompleted.subscribe((value) => {
			if (value && value.briefDate === todayDate) {
				// Refresh brief when generation completes
				fetchTodaysBrief();
			}
		});

		return () => {
			unsubStatus();
			unsubData();
			unsubCompletion();
		};
	});

	// Initialize data fetching once on mount - DEFERRED to not block initial render
	// Brief data is not critical for initial page visibility
	onMount(() => {
		if (!user?.id) return;

		// Defer initialization to allow projects to render first
		// Use requestIdleCallback if available, otherwise small delay
		if ('requestIdleCallback' in window) {
			requestIdleCallback(
				() => {
					initializeWidget();
				},
				{ timeout: 1000 }
			); // Max 1 second delay
		} else {
			// Fallback: small delay to allow main content to render
			setTimeout(initializeWidget, 100);
		}
	});

	async function initializeWidget() {
		if (hasInitialized) return;
		hasInitialized = true;

		try {
			await fetchUserTimezone();
			await fetchTodaysBrief();
		} catch (err) {
			console.error('Failed to initialize brief widget:', err);
			isLoading = false;
		}
	}

	async function fetchUserTimezone() {
		try {
			const { data } = await supabase
				.from('users')
				.select('timezone')
				.eq('id', user.id)
				.single();

			userTimezone = data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		}
	}

	async function fetchTodaysBrief() {
		if (!todayDate) return;

		isLoading = true;
		error = null;

		try {
			// First try ontology briefs table (use maybeSingle to handle 0 rows gracefully)
			const { data: ontologyBrief, error: ontologyError } = await supabase
				.from('ontology_daily_briefs')
				.select('*')
				.eq('user_id', user.id)
				.eq('brief_date', todayDate)
				.eq('generation_status', 'completed')
				.maybeSingle();

			if (ontologyBrief) {
				brief = {
					id: ontologyBrief.id,
					user_id: ontologyBrief.user_id,
					brief_date: ontologyBrief.brief_date,
					summary_content: ontologyBrief.executive_summary,
					executive_summary: ontologyBrief.executive_summary,
					llm_analysis: ontologyBrief.llm_analysis,
					priority_actions: ontologyBrief.priority_actions || [],
					generation_status: ontologyBrief.generation_status,
					created_at: ontologyBrief.created_at,
					updated_at: ontologyBrief.updated_at
				} as DailyBrief;
			} else if (!ontologyError || ontologyError.code === 'PGRST116') {
				// No ontology brief found, try legacy briefs table
				const { data: legacyBrief, error: legacyError } = await supabase
					.from('daily_briefs')
					.select('*')
					.eq('user_id', user.id)
					.eq('brief_date', todayDate)
					.eq('generation_status', 'completed')
					.maybeSingle();

				if (legacyBrief) {
					brief = legacyBrief as DailyBrief;
				} else {
					brief = null;
				}
			} else {
				// Actual error occurred
				console.error('Error fetching ontology brief:', ontologyError);
				brief = null;
			}
		} catch (err) {
			console.error('Failed to fetch brief:', err);
			// Don't show error for missing briefs - just show generate CTA
			brief = null;
		} finally {
			isLoading = false;
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
		if (brief && onViewBrief) {
			onViewBrief(brief);
		}
	}
</script>

<!-- Fixed-height container prevents layout shift during state transitions -->
<div class="w-full min-h-[48px] sm:min-h-[60px]">
	{#if isLoading}
		<!-- Skeleton Loading State - more compact on mobile -->
		<div
			class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border border-border bg-card/50 animate-pulse"
			aria-hidden="true"
		>
			<div class="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-muted">
				<div class="h-3 w-3 sm:h-4 sm:w-4 bg-muted-foreground/20 rounded"></div>
			</div>
			<div class="flex-1 space-y-1.5 sm:space-y-2">
				<div class="h-3 sm:h-4 bg-muted rounded w-20 sm:w-24"></div>
				<div class="h-2.5 sm:h-3 bg-muted rounded w-32 sm:w-48"></div>
			</div>
		</div>
	{:else if isGenerating}
		<!-- Generating State - compact on mobile -->
		<div class="p-2 sm:p-3 rounded-lg border border-accent/30 bg-accent/5 tx tx-pulse tx-weak">
			<div class="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
				<div class="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-accent/10 border border-accent/20">
					<Loader2 class="h-3 w-3 sm:h-4 sm:w-4 text-accent animate-spin" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-xs sm:text-sm font-medium text-foreground">Generating brief</p>
					<p class="text-[10px] sm:text-xs text-muted-foreground truncate">{statusMessage}</p>
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
		<!-- Error State - compact on mobile -->
		<div class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border border-red-500/30 bg-red-500/5">
			<div class="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-red-500/10">
				<AlertCircle class="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
			</div>
			<div class="flex-1">
				<p class="text-xs sm:text-sm text-red-600 dark:text-red-400">{error}</p>
			</div>
			<button onclick={generateBrief} class="text-[10px] sm:text-xs font-medium text-accent hover:underline">
				Retry
			</button>
		</div>
	{:else if brief}
		<!-- Brief Available - Compact card on mobile -->
		<button
			onclick={handleClick}
			class="w-full text-left p-2 sm:p-3 rounded-lg border border-border bg-card shadow-ink hover:border-accent hover:shadow-ink-strong transition-all duration-200 pressable tx tx-frame tx-weak group"
		>
			<div class="flex items-center sm:items-start gap-2 sm:gap-3">
				<div
					class="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors flex-shrink-0"
				>
					<Sun class="h-3 w-3 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center justify-between gap-1.5 sm:gap-2">
						<h3 class="text-xs sm:text-sm font-semibold text-foreground">Today's Brief</h3>
						<!-- Mobile: Show priority count inline if exists -->
						{#if brief.priority_actions && brief.priority_actions.length > 0}
							<span
								class="sm:hidden px-1 py-0.5 text-[8px] font-bold rounded bg-accent/10 text-accent"
							>
								{brief.priority_actions.length}
							</span>
						{/if}
						<ChevronRight
							class="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground/50 group-hover:text-accent transition-colors flex-shrink-0"
						/>
					</div>
					<!-- Desktop: Show snippet and priority actions -->
					<p class="hidden sm:block text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-1">
						{briefSnippet || 'Your daily brief is ready'}
					</p>
					{#if brief.priority_actions && brief.priority_actions.length > 0}
						<div class="hidden sm:flex mt-2 items-center gap-1.5">
							<span
								class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-accent/10 text-accent border border-accent/20"
							>
								{brief.priority_actions.length} priority {brief.priority_actions
									.length === 1
									? 'action'
									: 'actions'}
							</span>
						</div>
					{/if}
				</div>
			</div>
		</button>
	{:else}
		<!-- No Brief - Compact Generate CTA on mobile -->
		<button
			onclick={generateBrief}
			disabled={isGenerating}
			class="w-full flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border border-dashed border-accent/40 bg-accent/5 hover:border-accent hover:bg-accent/10 transition-all duration-200 pressable group"
		>
			<div
				class="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-accent/10 border border-accent/20 group-hover:bg-accent group-hover:border-accent transition-colors flex-shrink-0"
			>
				<Sparkles
					class="h-3 w-3 sm:h-4 sm:w-4 text-accent group-hover:text-accent-foreground transition-colors"
				/>
			</div>
			<div class="flex-1 text-left min-w-0">
				<h3 class="text-xs sm:text-sm font-semibold text-foreground">Generate Brief</h3>
				<p class="hidden sm:block text-xs text-muted-foreground">Get your AI-powered daily overview</p>
			</div>
			<ChevronRight
				class="h-3 w-3 sm:h-4 sm:w-4 text-accent/50 group-hover:text-accent transition-colors flex-shrink-0"
			/>
		</button>
	{/if}
</div>
