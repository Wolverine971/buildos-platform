<!-- apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte -->
<!--
  Daily brief chip for the dashboard Today row, with ontology support.
  States: loading skeleton → generating (progress %) → brief ready (opens the
  brief modal; the summary is the hover title) / generate CTA / retry on error.

  PERFORMANCE (Dec 2024):
  - Skeleton chip matches the final chip height, so the row doesn't shift
  - Brief data deferred - doesn't block initial page render
-->
<script lang="ts">
	import { Sparkles, LoaderCircle, AlertCircle, Sun, Volume2 } from 'lucide-svelte';
	import TodayChip from './TodayChip.svelte';
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

<!-- One chip in the dashboard Today row; the brief itself opens in the brief modal. -->
{#if isLoading}
	<span
		class="inline-flex h-8 w-36 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
		aria-hidden="true"
	></span>
{:else if isGenerating}
	<TodayChip
		icon={LoaderCircle}
		spin
		iconClass="text-accent"
		label="Generating brief"
		detail="{progress}%"
		title={statusMessage}
	/>
{:else if error}
	<TodayChip
		icon={AlertCircle}
		tone="danger"
		label="Brief failed"
		detail="Retry"
		title={error}
		onclick={generateBrief}
	/>
{:else if brief}
	{@const priorityCount = brief.priority_actions?.length ?? 0}
	<TodayChip
		icon={Sun}
		iconClass="text-warning"
		label="Today's brief"
		detail={priorityCount > 0
			? `${priorityCount} ${priorityCount === 1 ? 'priority' : 'priorities'}`
			: undefined}
		trailingIcon={brief.audio_status === 'ready' && brief.audio_storage_path
			? Volume2
			: undefined}
		trailingLabel="Audio narration ready"
		title={briefSnippet || 'Your daily brief is ready'}
		onclick={handleClick}
		onpreload={onpreloadbrief}
	/>
{:else}
	<TodayChip
		icon={Sparkles}
		tone="dashed"
		label="Generate brief"
		title="See what matters today — so nothing slips"
		onclick={generateBrief}
	/>
{/if}
