<!-- apps/web/src/routes/admin/chat/users/+page.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		AlertTriangle,
		ArrowDown,
		ArrowUp,
		Clock,
		Database,
		RefreshCw,
		Search,
		User,
		Users,
		Wrench,
		X
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';

	type Timeframe = '24h' | '7d' | '30d' | '90d';
	type SortOrder = 'asc' | 'desc';
	type SortField =
		| 'last_activity_at'
		| 'session_count'
		| 'turn_count'
		| 'message_count'
		| 'user_message_count'
		| 'assistant_message_count'
		| 'tool_call_count'
		| 'tool_failure_count'
		| 'tool_failure_rate'
		| 'llm_failure_count'
		| 'validation_failure_count'
		| 'p95_ttfr_ms'
		| 'max_ttfr_ms'
		| 'slow_turn_count'
		| 'created_entity_count'
		| 'updated_entity_count'
		| 'total_tokens'
		| 'total_cost_usd';

	type UserMetric = {
		user_id: string;
		email: string;
		name: string | null;
		first_chat_at: string | null;
		last_activity_at: string | null;
		active_day_count: number;
		consecutive_day_streak: number;
		session_count: number;
		project_session_count: number;
		global_session_count: number;
		turn_count: number;
		completed_turn_count: number;
		failed_turn_count: number;
		cancelled_turn_count: number;
		running_turn_count: number;
		message_count: number;
		user_message_count: number;
		assistant_message_count: number;
		message_error_count: number;
		tool_call_count: number;
		tool_failure_count: number;
		tool_failure_rate: number;
		llm_call_count: number;
		llm_failure_count: number;
		validation_failure_count: number;
		ttfr_p50_ms: number | null;
		ttfr_p95_ms: number | null;
		ttfr_max_ms: number | null;
		slow_turn_count: number;
		total_tokens: number;
		total_cost_usd: number;
		created_entity_count: number;
		updated_entity_count: number;
		deleted_entity_count: number;
		project_count: number;
		top_topics: Array<{ topic: string; count: number }>;
		top_projects: Array<{ project_id: string; name: string | null; count: number }>;
		top_tools: Array<{ tool_name: string; count: number; failures: number }>;
		preview: string;
	};

	type SessionMetric = {
		session_id: string;
		user_id: string;
		user_email: string;
		user_name: string | null;
		title: string;
		context_type: string;
		entity_id: string | null;
		project_ids: string[];
		project_names: string[];
		status: string;
		created_at: string;
		last_activity_at: string | null;
		last_classified_at: string | null;
		classification_state: 'classified' | 'missing' | 'stale';
		topics: string[];
		summary_preview: string | null;
		turn_count: number;
		message_count: number;
		user_message_count: number;
		assistant_message_count: number;
		tool_call_count: number;
		tool_failure_count: number;
		llm_call_count: number;
		llm_failure_count: number;
		validation_failure_count: number;
		ttfr_p50_ms: number | null;
		ttfr_p95_ms: number | null;
		ttfr_max_ms: number | null;
		slow_turn_count: number;
		duration_ms: number | null;
		total_tokens: number;
		total_cost_usd: number;
		created_entity_count: number;
		updated_entity_count: number;
		deleted_entity_count: number;
		has_errors: boolean;
		has_slow_response: boolean;
	};

	type UsersResponse = {
		kpis: {
			active_users: number;
			sessions: number;
			turns: number;
			user_messages: number;
			assistant_responses: number;
			ttfr_p50_ms: number | null;
			ttfr_p95_ms: number | null;
			slow_turns: number;
			error_impacted_users: number;
			chat_created_entities: number;
		};
		leaderboards: {
			most_sessions: UserMetric[];
			slowest_first_responses: UserMetric[];
			most_tool_calls: UserMetric[];
			longest_threads: SessionMetric[];
			most_requests_responses: UserMetric[];
			most_created_entities: UserMetric[];
			most_error_impacted: UserMetric[];
		};
		users: UserMetric[];
		pagination: { page: number; limit: number; total: number; total_pages: number };
		filter_options: {
			context_types: string[];
			topics: string[];
			tools: string[];
			gateway_ops: string[];
			projects: Array<{ project_id: string; name: string | null }>;
		};
		data_health: {
			truncated: Record<string, boolean>;
			classification_missing_sessions: number;
			classification_stale_sessions: number;
			raw_message_content_returned: false;
		};
	};

	type UserDetail = {
		user: { id: string; email: string; name: string | null };
		summary: UserMetric;
		timeline: Array<{
			date: string;
			session_count: number;
			turn_count: number;
			message_count: number;
			slow_turn_count: number;
			error_count: number;
			created_entity_count: number;
			top_topics: string[];
			project_names: string[];
		}>;
		sessions: SessionMetric[];
		errors: Array<{
			source: string;
			session_id: string | null;
			turn_run_id: string | null;
			error_message: string;
			severity: string | null;
			created_at: string;
		}>;
		tools: Array<{
			tool_name: string;
			gateway_op: string | null;
			count: number;
			failures: number;
			p95_execution_time_ms: number | null;
		}>;
		entities: Array<{
			project_id: string;
			project_name: string | null;
			entity_type: string;
			action: string;
			count: number;
		}>;
	};

	type RedactedTurn = {
		turn_run_id: string;
		session_id: string;
		turn_index: number;
		status: string;
		finished_reason: string | null;
		started_at: string;
		finished_at: string | null;
		duration_ms: number | null;
		ttfr_ms: number | null;
		ttfe_ms: number | null;
		tool_round_count: number;
		tool_call_count: number;
		tool_failure_count: number;
		validation_failure_count: number;
		llm_pass_count: number;
		first_lane: string | null;
		first_skill_path: string | null;
		first_canonical_op: string | null;
		cache_source: string | null;
		prepared_prompt_hit: boolean | null;
		error_summaries: Array<{
			source: 'message' | 'tool' | 'llm' | 'turn' | 'validation';
			message: string;
		}>;
		entity_changes: Array<{
			action: string;
			entity_type: string;
			entity_id: string;
			entity_title: string | null;
			project_id: string | null;
		}>;
	};

	type RedactedTimelineEvent = {
		id: string;
		timestamp: string;
		type:
			| 'session'
			| 'turn'
			| 'timing'
			| 'tool'
			| 'llm'
			| 'entity_change'
			| 'error'
			| 'context_shift';
		severity: 'info' | 'success' | 'warning' | 'error';
		turn_index: number | null;
		title: string;
		summary: string;
	};

	type RedactedSession = {
		session: SessionMetric;
		turns: RedactedTurn[];
		timeline: RedactedTimelineEvent[];
		privacy: {
			raw_message_content_returned: false;
			raw_assistant_content_returned: false;
			raw_request_message_returned: false;
			raw_tool_arguments_returned: false;
			raw_tool_results_returned: false;
			prompt_snapshot_returned: false;
		};
	};

	const PAGE_SIZE = 50;
	const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric'
	});

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<UsersResponse | null>(null);
	let selectedTimeframe = $state<Timeframe>('7d');
	let sortBy = $state<SortField>('last_activity_at');
	let sortOrder = $state<SortOrder>('desc');
	let page = $state(1);
	let searchDraft = $state('');
	let appliedSearch = $state('');
	let selectedContextType = $state('all');
	let selectedProjectId = $state('all');
	let selectedTopic = $state('all');
	let selectedErrors = $state<'all' | 'only' | 'none'>('all');
	let selectedToolBucket = $state<'all' | 'none' | 'some' | 'heavy'>('all');
	let selectedClassification = $state<'all' | 'classified' | 'missing' | 'stale'>('all');
	let selectedEntityAction = $state<'all' | 'created' | 'updated' | 'deleted'>('all');
	let slowThresholdMs = $state('10000');
	let autoRefresh = $state(false);
	let requestId = 0;

	let selectedUserId = $state<string | null>(null);
	let userDetail = $state<UserDetail | null>(null);
	let isLoadingDetail = $state(false);
	let detailError = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);
	let redactedSession = $state<RedactedSession | null>(null);
	let isLoadingSession = $state(false);
	let sessionDetailError = $state<string | null>(null);

	const truncatedSources = $derived(
		Object.entries(data?.data_health.truncated ?? {})
			.filter(([, value]) => value)
			.map(([key]) => key)
	);

	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		sortBy;
		sortOrder;
		page;
		appliedSearch;
		selectedContextType;
		selectedProjectId;
		selectedTopic;
		selectedErrors;
		selectedToolBucket;
		selectedClassification;
		selectedEntityAction;
		slowThresholdMs;
		loadUsers();
	});

	$effect(() => {
		if (!browser || !autoRefresh) return;
		const timer = window.setInterval(() => {
			void loadUsers();
			if (selectedUserId) {
				const currentSessionId = selectedSessionId;
				void loadUserDetail(selectedUserId, false);
				if (currentSessionId) void loadRedactedSession(currentSessionId);
			}
		}, 60_000);
		return () => window.clearInterval(timer);
	});

	async function loadUsers() {
		const currentRequestId = ++requestId;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				timeframe: selectedTimeframe,
				page: page.toString(),
				limit: PAGE_SIZE.toString(),
				sort_by: sortBy,
				sort_order: sortOrder,
				slow_threshold_ms: slowThresholdMs
			});
			if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
			if (selectedContextType !== 'all') params.set('context_type', selectedContextType);
			if (selectedProjectId !== 'all') params.set('project_id', selectedProjectId);
			if (selectedTopic !== 'all') params.set('topic', selectedTopic);
			if (selectedErrors !== 'all') params.set('errors', selectedErrors);
			if (selectedToolBucket !== 'all') params.set('tool_bucket', selectedToolBucket);
			if (selectedClassification !== 'all')
				params.set('classification', selectedClassification);
			if (selectedEntityAction !== 'all') params.set('entity_action', selectedEntityAction);

			const response = await fetch(`/api/admin/chat/users?${params.toString()}`);
			if (!response.ok) throw new Error('Failed to load chat user analytics');
			const result = await response.json();
			if (!result.success)
				throw new Error(result.message || 'Failed to load chat user analytics');
			if (currentRequestId !== requestId) return;
			data = result.data;
		} catch (err) {
			console.error('Failed loading chat user analytics', err);
			error = err instanceof Error ? err.message : 'Failed to load chat user analytics';
		} finally {
			if (currentRequestId === requestId) isLoading = false;
		}
	}

	function clearSelectedSession() {
		selectedSessionId = null;
		redactedSession = null;
		isLoadingSession = false;
		sessionDetailError = null;
	}

	async function loadUserDetail(userId: string, resetSession = true) {
		selectedUserId = userId;
		userDetail = null;
		isLoadingDetail = true;
		detailError = null;
		if (resetSession) clearSelectedSession();
		try {
			const params = new URLSearchParams({
				timeframe: selectedTimeframe,
				session_page: '1',
				session_limit: '25',
				session_sort_by: 'last_activity_at',
				session_sort_order: 'desc',
				slow_threshold_ms: slowThresholdMs
			});
			if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
			const response = await fetch(`/api/admin/chat/users/${userId}?${params.toString()}`);
			if (!response.ok) throw new Error('Failed to load user drilldown');
			const result = await response.json();
			if (!result.success) throw new Error(result.message || 'Failed to load user drilldown');
			userDetail = result.data;
		} catch (err) {
			console.error('Failed loading user detail', err);
			detailError = err instanceof Error ? err.message : 'Failed to load user drilldown';
		} finally {
			isLoadingDetail = false;
		}
	}

	async function loadRedactedSession(sessionId: string) {
		const userId = selectedUserId;
		if (!userId) return;
		selectedSessionId = sessionId;
		redactedSession = null;
		isLoadingSession = true;
		sessionDetailError = null;
		try {
			const response = await fetch(
				`/api/admin/chat/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`
			);
			if (!response.ok) throw new Error('Failed to load redacted session timeline');
			const result = await response.json();
			if (!result.success)
				throw new Error(result.message || 'Failed to load redacted session timeline');
			redactedSession = result.data;
		} catch (err) {
			console.error('Failed loading redacted session timeline', err);
			sessionDetailError =
				err instanceof Error ? err.message : 'Failed to load redacted session timeline';
		} finally {
			isLoadingSession = false;
		}
	}

	function applySearch() {
		page = 1;
		appliedSearch = searchDraft.trim();
	}

	function updateSort(field: SortField) {
		if (sortBy === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortOrder = 'desc';
		}
		page = 1;
	}

	function resetFilters() {
		page = 1;
		searchDraft = '';
		appliedSearch = '';
		selectedContextType = 'all';
		selectedProjectId = 'all';
		selectedTopic = 'all';
		selectedErrors = 'all';
		selectedToolBucket = 'all';
		selectedClassification = 'all';
		selectedEntityAction = 'all';
		slowThresholdMs = '10000';
	}

	function formatNumber(value: number | null | undefined): string {
		return new Intl.NumberFormat('en-US').format(value ?? 0);
	}

	function formatMs(value: number | null | undefined): string {
		if (value === null || value === undefined) return '-';
		if (value < 1000) return `${Math.round(value)}ms`;
		return `${(value / 1000).toFixed(1)}s`;
	}

	function formatDate(value: string | null | undefined): string {
		if (!value) return '-';
		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) ? dateTimeFormatter.format(parsed) : '-';
	}

	function formatDay(value: string): string {
		const parsed = new Date(`${value}T00:00:00.000Z`);
		return Number.isFinite(parsed.getTime()) ? dateFormatter.format(parsed) : value;
	}

	function eventTypeLabel(value: string): string {
		return value.replaceAll('_', ' ');
	}

	function severityClass(severity: RedactedTimelineEvent['severity']): string {
		if (severity === 'error') return 'border-destructive/30 bg-destructive/10 text-destructive';
		if (severity === 'warning') return 'border-warning/30 bg-warning/10 text-warning';
		if (severity === 'success') return 'border-success/30 bg-success/10 text-success';
		return 'border-border bg-muted text-muted-foreground';
	}

	function closeDrawer() {
		selectedUserId = null;
		userDetail = null;
		detailError = null;
		clearSelectedSession();
	}
</script>

<svelte:head>
	<title>Chat User Performance | Admin</title>
</svelte:head>

{#snippet sortHeader(field: SortField, label: string)}
	<button class="inline-flex items-center gap-1" onclick={() => updateSort(field)}>
		{label}
		{#if sortBy === field && sortOrder === 'asc'}
			<ArrowUp class="h-3 w-3" />
		{:else}
			<ArrowDown class={`h-3 w-3 ${sortBy === field ? '' : 'opacity-40'}`} />
		{/if}
	</button>
{/snippet}

<div class="space-y-6 pb-8">
	<AdminPageHeader
		title="Chat User Performance"
		description="Recent BuildOS chat usage, response timing, tool activity, and redacted per-user drilldowns."
		icon={Users}
		showBack={true}
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				<Select
					bind:value={selectedTimeframe}
					onchange={(value) => {
						selectedTimeframe = String(value) as Timeframe;
						page = 1;
					}}
					size="md"
					aria-label="Select time range"
				>
					<option value="24h">Last 24 Hours</option>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
					<option value="90d">Last 90 Days</option>
				</Select>
				<label
					class="flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-ink"
				>
					<input
						type="checkbox"
						bind:checked={autoRefresh}
						class="rounded border-border"
					/>
					<span>Auto-refresh</span>
				</label>
				<Button
					onclick={loadUsers}
					disabled={isLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
					class="pressable"
				>
					Refresh
				</Button>
			</div>
		{/snippet}
	</AdminPageHeader>

	{#if error}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 tx tx-static tx-weak"
		>
			<div class="flex items-center gap-2">
				<AlertTriangle class="h-5 w-5 shrink-0 text-destructive" />
				<p class="text-sm text-destructive">{error}</p>
			</div>
		</div>
	{/if}

	{#if truncatedSources.length > 0}
		<div class="rounded-lg border border-warning/30 bg-warning/10 p-3 tx tx-static tx-weak">
			<p class="text-sm text-warning">
				Some analytics sources hit the phase-1 row cap: {truncatedSources.join(', ')}.
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-10">
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Active Users</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.active_users)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Sessions</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.sessions)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">User Msgs</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.user_messages)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Responses</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.assistant_responses)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Turns</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.turns)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">p50 TTFR</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatMs(data?.kpis.ttfr_p50_ms)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">p95 TTFR</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatMs(data?.kpis.ttfr_p95_ms)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Slow Turns</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.slow_turns)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Error Users</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.error_impacted_users)}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Entities</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">
				{formatNumber(data?.kpis.chat_created_entities)}
			</p>
		</div>
	</div>

	<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grid tx-weak">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
			<div class="xl:col-span-2">
				<TextInput
					bind:value={searchDraft}
					icon={Search}
					type="search"
					placeholder="Search users, topics, projects, tools"
					aria-label="Search chat users"
					onkeydown={(event) => {
						if (event.key === 'Enter') applySearch();
					}}
				/>
			</div>
			<Select
				bind:value={selectedContextType}
				onchange={(value) => {
					selectedContextType = String(value);
					page = 1;
				}}
				size="sm"
				aria-label="Filter by context type"
			>
				<option value="all">All Contexts</option>
				{#each data?.filter_options.context_types ?? [] as contextType}
					<option value={contextType}>{contextType}</option>
				{/each}
			</Select>
			<Select
				bind:value={selectedProjectId}
				onchange={(value) => {
					selectedProjectId = String(value);
					page = 1;
				}}
				size="sm"
				aria-label="Filter by project"
			>
				<option value="all">All Projects</option>
				{#each data?.filter_options.projects ?? [] as project}
					<option value={project.project_id}>{project.name ?? project.project_id}</option>
				{/each}
			</Select>
			<Select
				bind:value={selectedTopic}
				onchange={(value) => {
					selectedTopic = String(value);
					page = 1;
				}}
				size="sm"
				aria-label="Filter by topic"
			>
				<option value="all">All Topics</option>
				{#each data?.filter_options.topics ?? [] as topic}
					<option value={topic}>{topic}</option>
				{/each}
			</Select>
			<Select
				bind:value={selectedErrors}
				onchange={(value) => {
					selectedErrors = String(value) as 'all' | 'only' | 'none';
					page = 1;
				}}
				size="sm"
				aria-label="Filter by errors"
			>
				<option value="all">All Error States</option>
				<option value="only">Errors Only</option>
				<option value="none">No Errors</option>
			</Select>
			<Select
				bind:value={selectedToolBucket}
				onchange={(value) => {
					selectedToolBucket = String(value) as 'all' | 'none' | 'some' | 'heavy';
					page = 1;
				}}
				size="sm"
				aria-label="Filter by tool use"
			>
				<option value="all">All Tool Use</option>
				<option value="none">No Tools</option>
				<option value="some">Any Tools</option>
				<option value="heavy">Heavy Tools</option>
			</Select>
			<Select
				bind:value={selectedClassification}
				onchange={(value) => {
					selectedClassification = String(value) as
						| 'all'
						| 'classified'
						| 'missing'
						| 'stale';
					page = 1;
				}}
				size="sm"
				aria-label="Filter by classification"
			>
				<option value="all">All Classification</option>
				<option value="classified">Classified</option>
				<option value="missing">Missing</option>
				<option value="stale">Stale</option>
			</Select>
			<Select
				bind:value={selectedEntityAction}
				onchange={(value) => {
					selectedEntityAction = String(value) as
						| 'all'
						| 'created'
						| 'updated'
						| 'deleted';
					page = 1;
				}}
				size="sm"
				aria-label="Filter by entity action"
			>
				<option value="all">All Entity Impact</option>
				<option value="created">Created</option>
				<option value="updated">Updated</option>
				<option value="deleted">Deleted</option>
			</Select>
			<Select bind:value={slowThresholdMs} size="sm" aria-label="Slow response threshold">
				<option value="5000">Slow: 5s</option>
				<option value="10000">Slow: 10s</option>
				<option value="20000">Slow: 20s</option>
				<option value="30000">Slow: 30s</option>
			</Select>
			<div class="flex gap-2 md:col-span-2 xl:col-span-2">
				<Button
					onclick={applySearch}
					variant="secondary"
					size="sm"
					icon={Search}
					class="pressable"
				>
					Search
				</Button>
				<Button onclick={resetFilters} variant="ghost" size="sm" class="pressable">
					Reset
				</Button>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 xl:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				Most Sessions
			</h2>
			<div class="mt-3 space-y-3">
				{#each data?.leaderboards.most_sessions ?? [] as user (user.user_id)}
					<button class="w-full text-left" onclick={() => loadUserDetail(user.user_id)}>
						<p class="truncate text-sm font-semibold text-foreground">
							{user.name ?? user.email}
						</p>
						<p class="text-xs text-muted-foreground">
							{formatNumber(user.session_count)} sessions · {formatDate(
								user.last_activity_at
							)}
						</p>
					</button>
				{/each}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				Slowest First Responses
			</h2>
			<div class="mt-3 space-y-3">
				{#each data?.leaderboards.slowest_first_responses ?? [] as user (user.user_id)}
					<button class="w-full text-left" onclick={() => loadUserDetail(user.user_id)}>
						<p class="truncate text-sm font-semibold text-foreground">
							{user.name ?? user.email}
						</p>
						<p class="text-xs text-muted-foreground">
							p95 {formatMs(user.ttfr_p95_ms)} · max {formatMs(user.ttfr_max_ms)}
						</p>
					</button>
				{/each}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				Most Tool Calls
			</h2>
			<div class="mt-3 space-y-3">
				{#each data?.leaderboards.most_tool_calls ?? [] as user (user.user_id)}
					<button class="w-full text-left" onclick={() => loadUserDetail(user.user_id)}>
						<p class="truncate text-sm font-semibold text-foreground">
							{user.name ?? user.email}
						</p>
						<p class="text-xs text-muted-foreground">
							{formatNumber(user.tool_call_count)} calls · {user.tool_failure_rate.toFixed(
								1
							)}% failed
						</p>
					</button>
				{/each}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				Longest Threads
			</h2>
			<div class="mt-3 space-y-3">
				{#each data?.leaderboards.longest_threads ?? [] as session (session.session_id)}
					<button
						class="w-full text-left"
						onclick={() => loadUserDetail(session.user_id)}
					>
						<p class="truncate text-sm font-semibold text-foreground">
							{session.title}
						</p>
						<p class="text-xs text-muted-foreground">
							{formatNumber(session.turn_count)} turns · {formatNumber(
								session.message_count
							)} messages
						</p>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<div class="overflow-hidden rounded-lg border border-border bg-card shadow-ink">
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"
		>
			<div>
				<h2 class="text-base font-semibold text-foreground">Recent Chat Users</h2>
				<p class="text-sm text-muted-foreground">
					{formatNumber(data?.pagination.total)} users · {data?.data_health
						.classification_missing_sessions ?? 0} missing classifications · {data
						?.data_health.classification_stale_sessions ?? 0} stale
				</p>
			</div>
			<div class="flex items-center gap-2">
				<Button
					onclick={() => (page = Math.max(1, page - 1))}
					disabled={page <= 1 || isLoading}
					variant="ghost"
					size="sm"
				>
					Prev
				</Button>
				<span class="text-sm text-muted-foreground">
					Page {data?.pagination.page ?? page} / {data?.pagination.total_pages ?? 1}
				</span>
				<Button
					onclick={() =>
						(page = Math.min(data?.pagination.total_pages ?? page, page + 1))}
					disabled={isLoading || page >= (data?.pagination.total_pages ?? 1)}
					variant="ghost"
					size="sm"
				>
					Next
				</Button>
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="min-w-[1500px] w-full text-left text-sm">
				<thead
					class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
				>
					<tr>
						<th class="px-4 py-3">User</th>
						<th class="px-4 py-3">
							{@render sortHeader('last_activity_at', 'Last Chat')}
						</th>
						<th class="px-4 py-3">Cadence</th>
						<th class="px-4 py-3">
							{@render sortHeader('session_count', 'Sessions')}
						</th>
						<th class="px-4 py-3">
							{@render sortHeader('message_count', 'Messages')}
						</th>
						<th class="px-4 py-3">
							{@render sortHeader('turn_count', 'Turns')}
						</th>
						<th class="px-4 py-3">
							{@render sortHeader('p95_ttfr_ms', 'First Response')}
						</th>
						<th class="px-4 py-3">
							{@render sortHeader('tool_call_count', 'Tools')}
						</th>
						<th class="px-4 py-3">Errors</th>
						<th class="px-4 py-3">Project Impact</th>
						<th class="px-4 py-3">Preview</th>
					</tr>
				</thead>
				<tbody>
					{#if isLoading && !data}
						{#each Array.from({ length: 8 }) as _, index}
							<tr class="border-b border-border/60" aria-hidden="true">
								<td class="px-4 py-4" colspan="11">
									<div
										class="h-5 animate-pulse rounded bg-muted"
										style={`width: ${60 + index * 4}%`}
									></div>
								</td>
							</tr>
						{/each}
					{:else if (data?.users.length ?? 0) === 0}
						<tr>
							<td class="px-4 py-10 text-center text-muted-foreground" colspan="11">
								No chat users matched the current filters.
							</td>
						</tr>
					{:else}
						{#each data?.users ?? [] as user (user.user_id)}
							<tr
								class="border-b border-border/60 align-top transition-colors hover:bg-muted/30"
							>
								<td class="px-4 py-4">
									<button
										class="max-w-[240px] text-left"
										onclick={() => loadUserDetail(user.user_id)}
									>
										<span class="block truncate font-semibold text-foreground"
											>{user.name ?? user.email}</span
										>
										<span class="block truncate text-xs text-muted-foreground"
											>{user.email}</span
										>
										<span
											class="block truncate font-mono text-[11px] text-muted-foreground"
											>{user.user_id}</span
										>
									</button>
								</td>
								<td class="px-4 py-4 text-muted-foreground"
									>{formatDate(user.last_activity_at)}</td
								>
								<td class="px-4 py-4">
									<p class="text-foreground">
										{formatNumber(user.active_day_count)} active days
									</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.consecutive_day_streak)} day streak
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">
										{formatNumber(user.session_count)}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.project_session_count)} project · {formatNumber(
											user.global_session_count
										)} global
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">
										{formatNumber(user.message_count)}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.user_message_count)} user · {formatNumber(
											user.assistant_message_count
										)} assistant
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">{formatNumber(user.turn_count)}</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.completed_turn_count)} done · {formatNumber(
											user.failed_turn_count +
												user.cancelled_turn_count +
												user.running_turn_count
										)} other
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">p95 {formatMs(user.ttfr_p95_ms)}</p>
									<p class="text-xs text-muted-foreground">
										p50 {formatMs(user.ttfr_p50_ms)} · max {formatMs(
											user.ttfr_max_ms
										)} · {formatNumber(user.slow_turn_count)} slow
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">
										{formatNumber(user.tool_call_count)} calls
									</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.tool_failure_count)} failed · {user.tool_failure_rate.toFixed(
											1
										)}%
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">
										{formatNumber(
											user.message_error_count +
												user.tool_failure_count +
												user.llm_failure_count +
												user.validation_failure_count
										)}
									</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.llm_failure_count)} LLM · {formatNumber(
											user.validation_failure_count
										)} validation
									</p>
								</td>
								<td class="px-4 py-4">
									<p class="text-foreground">
										{formatNumber(user.created_entity_count)} created
									</p>
									<p class="text-xs text-muted-foreground">
										{formatNumber(user.updated_entity_count)} updated · {formatNumber(
											user.project_count
										)} projects
									</p>
								</td>
								<td class="max-w-[360px] px-4 py-4">
									<p class="line-clamp-3 text-sm text-muted-foreground">
										{user.preview}
									</p>
									<div class="mt-2 flex flex-wrap gap-1">
										{#each user.top_topics.slice(0, 3) as topic}
											<span
												class="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
												>{topic.topic}</span
											>
										{/each}
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if selectedUserId}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
		aria-label="Close user drilldown"
		onclick={closeDrawer}
	></button>
	<aside
		class="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-border bg-background shadow-ink-strong"
	>
		<div class="flex items-start justify-between gap-4 border-b border-border p-5">
			<div>
				<p class="text-xs uppercase tracking-wide text-muted-foreground">User Drilldown</p>
				<h2 class="mt-1 text-xl font-semibold text-foreground">
					{userDetail?.user.name ?? userDetail?.user.email ?? selectedUserId}
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">{userDetail?.user.email ?? ''}</p>
			</div>
			<Button
				onclick={closeDrawer}
				variant="ghost"
				size="sm"
				icon={X}
				aria-label="Close user drilldown"
			/>
		</div>

		<div class="flex-1 overflow-y-auto p-5">
			{#if isLoadingDetail}
				<div class="space-y-3">
					{#each Array.from({ length: 8 }) as _}
						<div class="h-8 animate-pulse rounded bg-muted"></div>
					{/each}
				</div>
			{:else if detailError}
				<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
					<p class="text-sm text-destructive">{detailError}</p>
				</div>
			{:else if userDetail}
				<div class="space-y-6">
					<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
						<div class="rounded-lg border border-border bg-card p-3">
							<User class="h-4 w-4 text-muted-foreground" />
							<p class="mt-2 text-xl font-semibold">
								{formatNumber(userDetail.summary.session_count)}
							</p>
							<p class="text-xs text-muted-foreground">Sessions</p>
						</div>
						<div class="rounded-lg border border-border bg-card p-3">
							<Clock class="h-4 w-4 text-muted-foreground" />
							<p class="mt-2 text-xl font-semibold">
								{formatMs(userDetail.summary.ttfr_p95_ms)}
							</p>
							<p class="text-xs text-muted-foreground">p95 TTFR</p>
						</div>
						<div class="rounded-lg border border-border bg-card p-3">
							<Wrench class="h-4 w-4 text-muted-foreground" />
							<p class="mt-2 text-xl font-semibold">
								{formatNumber(userDetail.summary.tool_call_count)}
							</p>
							<p class="text-xs text-muted-foreground">Tool Calls</p>
						</div>
						<div class="rounded-lg border border-border bg-card p-3">
							<Database class="h-4 w-4 text-muted-foreground" />
							<p class="mt-2 text-xl font-semibold">
								{formatNumber(userDetail.summary.created_entity_count)}
							</p>
							<p class="text-xs text-muted-foreground">Created</p>
						</div>
					</div>

					<section>
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Activity
						</h3>
						<div class="mt-3 space-y-2">
							{#each userDetail.timeline.slice(0, 14) as day}
								<div class="grid grid-cols-[72px_1fr] items-center gap-3 text-sm">
									<span class="text-muted-foreground">{formatDay(day.date)}</span>
									<div class="rounded-lg border border-border bg-card px-3 py-2">
										<p class="text-foreground">
											{formatNumber(day.session_count)} sessions · {formatNumber(
												day.turn_count
											)} turns · {formatNumber(day.message_count)} messages
										</p>
										<p class="truncate text-xs text-muted-foreground">
											{day.top_topics.join(', ') ||
												day.project_names.join(', ') ||
												'No classifier topic'}
										</p>
									</div>
								</div>
							{/each}
						</div>
					</section>

					<section>
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Recent Sessions
						</h3>
						<div class="mt-3 space-y-3">
							{#each userDetail.sessions as session}
								<div class="rounded-lg border border-border bg-card p-3">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p class="font-semibold text-foreground">
												{session.title}
											</p>
											<p class="text-xs text-muted-foreground">
												{formatDate(session.last_activity_at)} · {session.context_type}
												· {session.classification_state}
											</p>
										</div>
										<div class="flex flex-wrap items-center justify-end gap-3">
											<button
												type="button"
												class="text-xs font-semibold text-accent hover:underline disabled:cursor-wait disabled:opacity-60"
												disabled={isLoadingSession &&
													selectedSessionId === session.session_id}
												onclick={() =>
													loadRedactedSession(session.session_id)}
											>
												{selectedSessionId === session.session_id
													? isLoadingSession
														? 'Loading timeline'
														: 'Timeline selected'
													: 'Inspect redacted timeline'}
											</button>
											<a
												class="text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
												href={`/admin/chat/sessions?chat_session_id=${session.session_id}`}
											>
												Open full session audit
											</a>
										</div>
									</div>
									<div
										class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-5"
									>
										<span>{formatNumber(session.turn_count)} turns</span>
										<span>{formatNumber(session.message_count)} messages</span>
										<span>{formatMs(session.ttfr_p95_ms)} p95</span>
										<span>{formatNumber(session.tool_call_count)} tools</span>
										<span
											>{formatNumber(session.created_entity_count)} created</span
										>
									</div>
								</div>
							{/each}
						</div>
					</section>

					{#if selectedSessionId || isLoadingSession || sessionDetailError || redactedSession}
						<section>
							<div class="flex flex-wrap items-end justify-between gap-3">
								<div>
									<h3
										class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
									>
										Redacted Session Timeline
									</h3>
									{#if redactedSession}
										<p class="mt-1 text-sm text-muted-foreground">
											{redactedSession.session.title} · {formatDate(
												redactedSession.session.last_activity_at
											)}
										</p>
									{/if}
								</div>
								{#if redactedSession}
									<a
										class="text-xs font-semibold text-muted-foreground hover:text-accent hover:underline"
										href={`/admin/chat/sessions?chat_session_id=${redactedSession.session.session_id}`}
									>
										Open full session audit
									</a>
								{/if}
							</div>

							{#if isLoadingSession}
								<div class="mt-3 space-y-2">
									{#each Array.from({ length: 4 }) as _}
										<div class="h-10 animate-pulse rounded bg-muted"></div>
									{/each}
								</div>
							{:else if sessionDetailError}
								<div
									class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
								>
									<p class="text-sm text-destructive">{sessionDetailError}</p>
								</div>
							{:else if redactedSession}
								<div class="mt-3 rounded-lg border border-border bg-card p-3">
									<div class="grid grid-cols-2 gap-2 text-xs md:grid-cols-6">
										<div>
											<p class="text-muted-foreground">Turns</p>
											<p class="text-sm font-semibold text-foreground">
												{formatNumber(redactedSession.session.turn_count)}
											</p>
										</div>
										<div>
											<p class="text-muted-foreground">Messages</p>
											<p class="text-sm font-semibold text-foreground">
												{formatNumber(
													redactedSession.session.message_count
												)}
											</p>
										</div>
										<div>
											<p class="text-muted-foreground">Tools</p>
											<p class="text-sm font-semibold text-foreground">
												{formatNumber(
													redactedSession.session.tool_call_count
												)}
											</p>
										</div>
										<div>
											<p class="text-muted-foreground">LLM</p>
											<p class="text-sm font-semibold text-foreground">
												{formatNumber(
													redactedSession.session.llm_call_count
												)}
											</p>
										</div>
										<div>
											<p class="text-muted-foreground">p95 TTFR</p>
											<p class="text-sm font-semibold text-foreground">
												{formatMs(redactedSession.session.ttfr_p95_ms)}
											</p>
										</div>
										<div>
											<p class="text-muted-foreground">Entities</p>
											<p class="text-sm font-semibold text-foreground">
												{formatNumber(
													redactedSession.session.created_entity_count +
														redactedSession.session
															.updated_entity_count +
														redactedSession.session.deleted_entity_count
												)}
											</p>
										</div>
									</div>
									<div class="mt-3 flex flex-wrap gap-2 text-[11px]">
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>Content hidden</span
										>
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>Tool payloads hidden</span
										>
										<span
											class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
											>Prompts hidden</span
										>
									</div>
								</div>

								<div class="mt-3 space-y-3">
									{#if redactedSession.turns.length === 0}
										<div
											class="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
										>
											No turn runs were recorded for this session.
										</div>
									{:else}
										{#each redactedSession.turns as turn (turn.turn_run_id)}
											<div
												class="rounded-lg border border-border bg-card p-3"
											>
												<div
													class="flex flex-wrap items-start justify-between gap-3"
												>
													<div>
														<p class="font-semibold text-foreground">
															Turn {turn.turn_index} · {turn.status}
														</p>
														<p class="text-xs text-muted-foreground">
															{formatDate(turn.started_at)} -> {formatDate(
																turn.finished_at
															)}
														</p>
													</div>
													<span
														class={`rounded border px-2 py-0.5 text-[11px] ${
															turn.error_summaries.length > 0
																? 'border-destructive/30 bg-destructive/10 text-destructive'
																: 'border-success/30 bg-success/10 text-success'
														}`}
													>
														{turn.error_summaries.length > 0
															? `${formatNumber(turn.error_summaries.length)} issues`
															: 'clean'}
													</span>
												</div>
												<div
													class="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-6"
												>
													<span>TTFR {formatMs(turn.ttfr_ms)}</span>
													<span>TTFE {formatMs(turn.ttfe_ms)}</span>
													<span
														>{formatNumber(turn.tool_call_count)} tools</span
													>
													<span
														>{formatNumber(turn.llm_pass_count)} LLM</span
													>
													<span
														>{formatNumber(
															turn.validation_failure_count
														)} validation</span
													>
													<span
														>{formatMs(turn.duration_ms)} duration</span
													>
												</div>
												{#if turn.first_lane || turn.first_skill_path || turn.first_canonical_op || turn.cache_source || turn.prepared_prompt_hit !== null}
													<div
														class="mt-3 flex flex-wrap gap-1 text-[11px]"
													>
														{#if turn.first_lane}
															<span
																class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
																>lane {turn.first_lane}</span
															>
														{/if}
														{#if turn.first_skill_path}
															<span
																class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
																>{turn.first_skill_path}</span
															>
														{/if}
														{#if turn.first_canonical_op}
															<span
																class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
																>{turn.first_canonical_op}</span
															>
														{/if}
														{#if turn.cache_source}
															<span
																class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
																>cache {turn.cache_source}</span
															>
														{/if}
														{#if turn.prepared_prompt_hit !== null}
															<span
																class="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground"
																>prepared {turn.prepared_prompt_hit
																	? 'hit'
																	: 'miss'}</span
															>
														{/if}
													</div>
												{/if}
												{#if turn.error_summaries.length > 0}
													<div class="mt-3 space-y-1">
														<p
															class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
														>
															Errors
														</p>
														{#each turn.error_summaries as item}
															<p
																class="text-xs text-muted-foreground"
															>
																<span
																	class="font-semibold text-foreground"
																	>{item.source}</span
																>
																· {item.message}
															</p>
														{/each}
													</div>
												{/if}
												{#if turn.entity_changes.length > 0}
													<div class="mt-3 space-y-1">
														<p
															class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
														>
															Entity Changes
														</p>
														<div class="flex flex-wrap gap-1">
															{#each turn.entity_changes as change}
																<span
																	class="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
																	>{change.action}
																	{change.entity_type}
																	{change.entity_title ??
																		change.entity_id}</span
																>
															{/each}
														</div>
													</div>
												{/if}
											</div>
										{/each}
									{/if}
								</div>

								<div class="mt-4">
									<h4
										class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
									>
										Events
									</h4>
									<div class="mt-2 space-y-2">
										{#each redactedSession.timeline.slice(0, 60) as event (event.id)}
											<div class="grid grid-cols-[88px_1fr] gap-3 text-xs">
												<span class="pt-2 text-muted-foreground"
													>{formatDate(event.timestamp)}</span
												>
												<div
													class={`rounded-lg border px-3 py-2 ${severityClass(event.severity)}`}
												>
													<div
														class="flex flex-wrap items-center justify-between gap-2"
													>
														<p class="font-semibold">{event.title}</p>
														<span class="uppercase tracking-wide">
															{eventTypeLabel(event.type)}
															{#if event.turn_index}
																· T{event.turn_index}
															{/if}
														</span>
													</div>
													<p class="mt-1">{event.summary}</p>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</section>
					{/if}

					<section class="grid gap-4 md:grid-cols-2">
						<div>
							<h3
								class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Tools
							</h3>
							<div class="mt-3 space-y-2">
								{#each userDetail.tools.slice(0, 8) as tool}
									<div
										class="rounded-lg border border-border bg-card p-3 text-sm"
									>
										<p class="font-semibold text-foreground">
											{tool.tool_name}
										</p>
										<p class="text-xs text-muted-foreground">
											{tool.gateway_op ?? 'no op'} · {formatNumber(
												tool.count
											)} calls · {formatNumber(tool.failures)} failed · p95 {formatMs(
												tool.p95_execution_time_ms
											)}
										</p>
									</div>
								{/each}
							</div>
						</div>
						<div>
							<h3
								class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Errors
							</h3>
							<div class="mt-3 space-y-2">
								{#each userDetail.errors.slice(0, 8) as item}
									<div
										class="rounded-lg border border-border bg-card p-3 text-sm"
									>
										<p class="font-semibold text-foreground">
											{item.source} · {item.severity ?? 'unknown'}
										</p>
										<p class="line-clamp-2 text-xs text-muted-foreground">
											{item.error_message}
										</p>
										<p class="mt-1 text-[11px] text-muted-foreground">
											{formatDate(item.created_at)}
										</p>
									</div>
								{/each}
							</div>
						</div>
					</section>

					<section>
						<h3
							class="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Entity Changes
						</h3>
						<div class="mt-3 grid gap-2 md:grid-cols-2">
							{#each userDetail.entities.slice(0, 12) as entity}
								<div class="rounded-lg border border-border bg-card p-3 text-sm">
									<p class="font-semibold text-foreground">
										{entity.entity_type} · {entity.action}
									</p>
									<p class="text-xs text-muted-foreground">
										{entity.project_name ??
											(entity.project_id || 'Unknown project')} · {formatNumber(
											entity.count
										)} changes
									</p>
								</div>
							{/each}
						</div>
					</section>
				</div>
			{/if}
		</div>
	</aside>
{/if}
