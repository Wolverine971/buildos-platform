<!-- apps/web/src/routes/admin/chat/users/+page.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import { AlertTriangle, Download, RefreshCw, Users } from '$lib/icons/lucide';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import ChatUserDetailDrawer from '$lib/components/admin/chat-users/ChatUserDetailDrawer.svelte';
	import ChatUserFilters from '$lib/components/admin/chat-users/ChatUserFilters.svelte';
	import ChatUserKpiStrip from '$lib/components/admin/chat-users/ChatUserKpiStrip.svelte';
	import ChatUserLeaderboards from '$lib/components/admin/chat-users/ChatUserLeaderboards.svelte';
	import ChatUsersMobileCards from '$lib/components/admin/chat-users/ChatUsersMobileCards.svelte';
	import ChatUsersTable from '$lib/components/admin/chat-users/ChatUsersTable.svelte';
	import {
		entityGroupKeyForAggregate,
		entityGroupKeyForChange,
		formatNumber
	} from '$lib/components/admin/chat-users/chat-user-ui';
	import type {
		ClassificationFilter,
		EntityActionFilter,
		ErrorFilter,
		RedactedSession,
		SessionMetric,
		SortField,
		SortOrder,
		Timeframe,
		ToolBucketFilter,
		UserDetail,
		UsersResponse
	} from '$lib/components/admin/chat-users/chat-user-types';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	const PAGE_SIZE = 50;
	const DEFAULT_TIMEFRAME: Timeframe = '7d';
	const DEFAULT_SORT_BY: SortField = 'last_activity_at';
	const DEFAULT_SORT_ORDER: SortOrder = 'desc';
	const DEFAULT_SLOW_THRESHOLD_MS = '10000';
	const TIMEFRAME_VALUES = new Set<Timeframe>(['24h', '7d', '30d', '90d']);
	const SORT_FIELDS = new Set<SortField>([
		'last_activity_at',
		'session_count',
		'turn_count',
		'message_count',
		'user_message_count',
		'assistant_message_count',
		'tool_call_count',
		'tool_failure_count',
		'tool_failure_rate',
		'llm_failure_count',
		'validation_failure_count',
		'p95_ttfr_ms',
		'max_ttfr_ms',
		'slow_turn_count',
		'created_entity_count',
		'updated_entity_count',
		'total_tokens',
		'total_cost_usd'
	]);
	const SORT_ORDERS = new Set<SortOrder>(['asc', 'desc']);
	const ERROR_FILTERS = new Set<ErrorFilter>(['all', 'only', 'none']);
	const TOOL_BUCKETS = new Set<ToolBucketFilter>(['all', 'none', 'some', 'heavy']);
	const CLASSIFICATION_FILTERS = new Set<ClassificationFilter>([
		'all',
		'classified',
		'missing',
		'stale'
	]);
	const ENTITY_ACTION_FILTERS = new Set<EntityActionFilter>([
		'all',
		'created',
		'updated',
		'deleted'
	]);

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<UsersResponse | null>(null);
	let selectedTimeframe = $state<Timeframe>(DEFAULT_TIMEFRAME);
	let sortBy = $state<SortField>(DEFAULT_SORT_BY);
	let sortOrder = $state<SortOrder>(DEFAULT_SORT_ORDER);
	let page = $state(1);
	let searchDraft = $state('');
	let appliedSearch = $state('');
	let selectedContextType = $state('all');
	let selectedProjectId = $state('all');
	let selectedTopic = $state('all');
	let selectedErrors = $state<ErrorFilter>('all');
	let selectedToolBucket = $state<ToolBucketFilter>('all');
	let selectedClassification = $state<ClassificationFilter>('all');
	let selectedEntityAction = $state<EntityActionFilter>('all');
	let slowThresholdMs = $state(DEFAULT_SLOW_THRESHOLD_MS);
	let autoRefresh = $state(false);
	let requestId = 0;
	let detailRequestId = 0;
	let sessionRequestId = 0;
	let hasHydratedUrlState = $state(false);

	let selectedUserId = $state<string | null>(null);
	let userDetail = $state<UserDetail | null>(null);
	let isLoadingDetail = $state(false);
	let detailError = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);
	let redactedSession = $state<RedactedSession | null>(null);
	let isLoadingSession = $state(false);
	let sessionDetailError = $state<string | null>(null);
	let selectedEntityGroupKey = $state<string | null>(null);
	let isQueueingClassification = $state(false);
	let classificationQueueMessage = $state<string | null>(null);
	let classificationQueueError = $state<string | null>(null);

	const truncatedSources = $derived(
		Object.entries(data?.data_health.truncated ?? {})
			.filter(([, value]) => value)
			.map(([key]) => key)
	);

	function enumParam<T extends string>(
		params: URLSearchParams,
		key: string,
		allowed: Set<T>,
		fallback: T
	): T {
		const value = params.get(key);
		return value && allowed.has(value as T) ? (value as T) : fallback;
	}

	function positivePageParam(params: URLSearchParams): number {
		const parsed = Number.parseInt(params.get('page') ?? '', 10);
		if (!Number.isFinite(parsed) || parsed <= 0) return 1;
		return Math.min(parsed, 10_000);
	}

	function slowThresholdParam(params: URLSearchParams): string {
		const parsed = Number.parseInt(params.get('slow_threshold_ms') ?? '', 10);
		if (!Number.isFinite(parsed)) return DEFAULT_SLOW_THRESHOLD_MS;
		return String(Math.min(Math.max(parsed, 1_000), 120_000));
	}

	function textFilterParam(params: URLSearchParams, key: string, fallback = 'all'): string {
		const value = params.get(key)?.trim();
		return value ? value : fallback;
	}

	function applyUrlState(params: URLSearchParams) {
		selectedTimeframe = enumParam(params, 'timeframe', TIMEFRAME_VALUES, DEFAULT_TIMEFRAME);
		sortBy = enumParam(params, 'sort_by', SORT_FIELDS, DEFAULT_SORT_BY);
		sortOrder = enumParam(params, 'sort_order', SORT_ORDERS, DEFAULT_SORT_ORDER);
		page = positivePageParam(params);
		appliedSearch = params.get('search')?.trim() ?? '';
		searchDraft = appliedSearch;
		selectedContextType = textFilterParam(params, 'context_type');
		selectedProjectId = textFilterParam(params, 'project_id');
		selectedTopic = textFilterParam(params, 'topic');
		selectedErrors = enumParam(params, 'errors', ERROR_FILTERS, 'all');
		selectedToolBucket = enumParam(params, 'tool_bucket', TOOL_BUCKETS, 'all');
		selectedClassification = enumParam(params, 'classification', CLASSIFICATION_FILTERS, 'all');
		selectedEntityAction = enumParam(params, 'entity_action', ENTITY_ACTION_FILTERS, 'all');
		slowThresholdMs = slowThresholdParam(params);
	}

	function setUrlParam(
		params: URLSearchParams,
		key: string,
		value: string | number,
		defaultValue: string | number
	) {
		const normalizedValue = String(value);
		if (normalizedValue === String(defaultValue) || normalizedValue.trim() === '') {
			params.delete(key);
		} else {
			params.set(key, normalizedValue);
		}
	}

	function syncUrlState() {
		if (!browser) return;
		const url = new URL(window.location.href);
		setUrlParam(url.searchParams, 'timeframe', selectedTimeframe, DEFAULT_TIMEFRAME);
		setUrlParam(url.searchParams, 'page', page, 1);
		setUrlParam(url.searchParams, 'sort_by', sortBy, DEFAULT_SORT_BY);
		setUrlParam(url.searchParams, 'sort_order', sortOrder, DEFAULT_SORT_ORDER);
		setUrlParam(url.searchParams, 'search', appliedSearch, '');
		setUrlParam(url.searchParams, 'context_type', selectedContextType, 'all');
		setUrlParam(url.searchParams, 'project_id', selectedProjectId, 'all');
		setUrlParam(url.searchParams, 'topic', selectedTopic, 'all');
		setUrlParam(url.searchParams, 'errors', selectedErrors, 'all');
		setUrlParam(url.searchParams, 'tool_bucket', selectedToolBucket, 'all');
		setUrlParam(url.searchParams, 'classification', selectedClassification, 'all');
		setUrlParam(url.searchParams, 'entity_action', selectedEntityAction, 'all');
		setUrlParam(
			url.searchParams,
			'slow_threshold_ms',
			slowThresholdMs,
			DEFAULT_SLOW_THRESHOLD_MS
		);
		if (url.toString() !== window.location.href) {
			replaceState(url.toString(), {});
		}
	}

	$effect(() => {
		if (!browser) return;
		$pageStore.url.href;
		applyUrlState(new URLSearchParams(window.location.search));
		hasHydratedUrlState = true;
	});

	$effect(() => {
		if (!browser || !hasHydratedUrlState) return;
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
		syncUrlState();
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
			if (currentRequestId !== requestId) return;
			console.error('Failed loading chat user analytics', err);
			error = err instanceof Error ? err.message : 'Failed to load chat user analytics';
		} finally {
			if (currentRequestId === requestId) isLoading = false;
		}
	}

	function clearSelectedSession() {
		sessionRequestId += 1;
		selectedSessionId = null;
		redactedSession = null;
		isLoadingSession = false;
		sessionDetailError = null;
	}

	function clearSelectedEntityGroup() {
		selectedEntityGroupKey = null;
	}

	function clearClassificationQueueStatus() {
		classificationQueueMessage = null;
		classificationQueueError = null;
	}

	async function loadUserDetail(userId: string, resetSession = true) {
		const currentDetailRequestId = ++detailRequestId;
		selectedUserId = userId;
		userDetail = null;
		isLoadingDetail = true;
		detailError = null;
		if (resetSession) {
			clearSelectedSession();
			clearSelectedEntityGroup();
			clearClassificationQueueStatus();
		}
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
			const response = await fetch(
				`/api/admin/chat/users/${encodeURIComponent(userId)}?${params.toString()}`
			);
			if (!response.ok) throw new Error('Failed to load user drilldown');
			const result = await response.json();
			if (!result.success) throw new Error(result.message || 'Failed to load user drilldown');
			if (currentDetailRequestId !== detailRequestId) return;
			userDetail = result.data;
		} catch (err) {
			if (currentDetailRequestId !== detailRequestId) return;
			console.error('Failed loading user detail', err);
			detailError = err instanceof Error ? err.message : 'Failed to load user drilldown';
		} finally {
			if (currentDetailRequestId === detailRequestId) isLoadingDetail = false;
		}
	}

	async function loadRedactedSession(sessionId: string) {
		const userId = selectedUserId;
		if (!userId) return;
		const currentSessionRequestId = ++sessionRequestId;
		selectedSessionId = sessionId;
		redactedSession = null;
		isLoadingSession = true;
		sessionDetailError = null;
		try {
			const params = new URLSearchParams({ slow_threshold_ms: slowThresholdMs });
			const response = await fetch(
				`/api/admin/chat/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`
			);
			if (!response.ok) throw new Error('Failed to load redacted session timeline');
			const result = await response.json();
			if (!result.success)
				throw new Error(result.message || 'Failed to load redacted session timeline');
			if (currentSessionRequestId !== sessionRequestId) return;
			redactedSession = result.data;
		} catch (err) {
			if (currentSessionRequestId !== sessionRequestId) return;
			console.error('Failed loading redacted session timeline', err);
			sessionDetailError =
				err instanceof Error ? err.message : 'Failed to load redacted session timeline';
		} finally {
			if (currentSessionRequestId === sessionRequestId) isLoadingSession = false;
		}
	}

	function queueableClassificationSessions(): SessionMetric[] {
		return (
			userDetail?.sessions.filter(
				(session) =>
					session.classification_state === 'missing' ||
					session.classification_state === 'stale'
			) ?? []
		);
	}

	async function queueVisibleClassificationSessions() {
		const userId = selectedUserId;
		const sessionIds = queueableClassificationSessions().map((session) => session.session_id);
		if (!userId || sessionIds.length === 0) return;

		isQueueingClassification = true;
		clearClassificationQueueStatus();
		try {
			const response = await fetch(
				`/api/admin/chat/users/${encodeURIComponent(userId)}/sessions/classify`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ session_ids: sessionIds })
				}
			);
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.message || 'Failed to queue chat classification');
			}
			const queued = Number(result.data?.queued ?? 0);
			const skipped = Number(result.data?.skipped ?? 0);
			classificationQueueMessage = `${formatNumber(queued)} classification jobs queued, ${formatNumber(skipped)} skipped.`;
			if (queued > 0) {
				void loadUserDetail(userId, false);
			}
		} catch (err) {
			console.error('Failed queueing chat classification', err);
			classificationQueueError =
				err instanceof Error ? err.message : 'Failed to queue chat classification';
		} finally {
			isQueueingClassification = false;
		}
	}

	function applySearch() {
		page = 1;
		appliedSearch = searchDraft.trim();
	}

	function handleFilterChange() {
		page = 1;
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
		selectedTimeframe = DEFAULT_TIMEFRAME;
		sortBy = DEFAULT_SORT_BY;
		sortOrder = DEFAULT_SORT_ORDER;
		selectedContextType = 'all';
		selectedProjectId = 'all';
		selectedTopic = 'all';
		selectedErrors = 'all';
		selectedToolBucket = 'all';
		selectedClassification = 'all';
		selectedEntityAction = 'all';
		slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS;
	}

	function exportTimestamp(): string {
		return new Date().toISOString().replace(/[:.]/g, '-');
	}

	function currentFilterExport() {
		return {
			timeframe: selectedTimeframe,
			page,
			limit: PAGE_SIZE,
			sort_by: sortBy,
			sort_order: sortOrder,
			search: appliedSearch,
			context_type: selectedContextType,
			project_id: selectedProjectId,
			topic: selectedTopic,
			errors: selectedErrors,
			tool_bucket: selectedToolBucket,
			classification: selectedClassification,
			entity_action: selectedEntityAction,
			slow_threshold_ms: slowThresholdMs
		};
	}

	function csvCell(value: string | number | boolean | null | undefined): string {
		if (value === null || value === undefined) return '';
		const text = String(value);
		if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
		return text;
	}

	function csvRows(
		headers: string[],
		rows: Array<Record<string, string | number | boolean | null | undefined>>
	): string {
		return [
			headers.map(csvCell).join(','),
			...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
		].join('\n');
	}

	function downloadTextFile(filename: string, mimeType: string, contents: string) {
		if (!browser) return;
		const blob = new Blob([contents], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	function exportUsersCsv() {
		if (!data) return;
		const headers = [
			'user_id',
			'email',
			'name',
			'last_activity_at',
			'active_day_count',
			'consecutive_day_streak',
			'session_count',
			'project_session_count',
			'global_session_count',
			'turn_count',
			'message_count',
			'user_message_count',
			'assistant_message_count',
			'ttfr_p50_ms',
			'ttfr_p95_ms',
			'ttfr_max_ms',
			'slow_turn_count',
			'tool_call_count',
			'tool_failure_count',
			'tool_failure_rate',
			'llm_call_count',
			'llm_failure_count',
			'validation_failure_count',
			'created_entity_count',
			'updated_entity_count',
			'deleted_entity_count',
			'project_count',
			'top_topics',
			'top_projects',
			'top_tools',
			'preview'
		];
		const rows = data.users.map((user) => ({
			user_id: user.user_id,
			email: user.email,
			name: user.name,
			last_activity_at: user.last_activity_at,
			active_day_count: user.active_day_count,
			consecutive_day_streak: user.consecutive_day_streak,
			session_count: user.session_count,
			project_session_count: user.project_session_count,
			global_session_count: user.global_session_count,
			turn_count: user.turn_count,
			message_count: user.message_count,
			user_message_count: user.user_message_count,
			assistant_message_count: user.assistant_message_count,
			ttfr_p50_ms: user.ttfr_p50_ms,
			ttfr_p95_ms: user.ttfr_p95_ms,
			ttfr_max_ms: user.ttfr_max_ms,
			slow_turn_count: user.slow_turn_count,
			tool_call_count: user.tool_call_count,
			tool_failure_count: user.tool_failure_count,
			tool_failure_rate: user.tool_failure_rate,
			llm_call_count: user.llm_call_count,
			llm_failure_count: user.llm_failure_count,
			validation_failure_count: user.validation_failure_count,
			created_entity_count: user.created_entity_count,
			updated_entity_count: user.updated_entity_count,
			deleted_entity_count: user.deleted_entity_count,
			project_count: user.project_count,
			top_topics: user.top_topics
				.map((topic) => `${topic.topic} (${topic.count})`)
				.join('; '),
			top_projects: user.top_projects
				.map((project) => `${project.name ?? project.project_id} (${project.count})`)
				.join('; '),
			top_tools: user.top_tools
				.map((tool) => `${tool.tool_name} (${tool.count}/${tool.failures} failed)`)
				.join('; '),
			preview: user.preview
		}));
		downloadTextFile(
			`admin-chat-users-${selectedTimeframe}-${exportTimestamp()}.csv`,
			'text/csv;charset=utf-8',
			csvRows(headers, rows)
		);
	}

	function exportUsersJson() {
		if (!data) return;
		downloadTextFile(
			`admin-chat-users-${selectedTimeframe}-${exportTimestamp()}.json`,
			'application/json;charset=utf-8',
			JSON.stringify(
				{
					exported_at: new Date().toISOString(),
					filters: currentFilterExport(),
					data
				},
				null,
				2
			)
		);
	}

	function exportUserDetailJson() {
		if (!userDetail) return;
		downloadTextFile(
			`admin-chat-user-${userDetail.user.id}-${exportTimestamp()}.json`,
			'application/json;charset=utf-8',
			JSON.stringify(
				{
					exported_at: new Date().toISOString(),
					filters: currentFilterExport(),
					user_detail: userDetail,
					selected_entity_group: selectedEntityGroup(),
					visible_entity_changes: visibleEntityChanges(),
					redacted_session: redactedSession
				},
				null,
				2
			)
		);
	}

	function selectedEntityGroup(): UserDetail['entities'][number] | null {
		if (!userDetail || !selectedEntityGroupKey) return null;
		return (
			userDetail.entities.find(
				(entity) => entityGroupKeyForAggregate(entity) === selectedEntityGroupKey
			) ?? null
		);
	}

	function visibleEntityChanges(): UserDetail['entity_changes'] {
		if (!userDetail) return [];
		if (!selectedEntityGroupKey) return userDetail.entity_changes.slice(0, 12);
		return userDetail.entity_changes
			.filter((change) => entityGroupKeyForChange(change) === selectedEntityGroupKey)
			.slice(0, 25);
	}

	function closeDrawer() {
		detailRequestId += 1;
		selectedUserId = null;
		userDetail = null;
		detailError = null;
		clearSelectedSession();
		clearSelectedEntityGroup();
		clearClassificationQueueStatus();
	}
</script>

<svelte:head>
	<title>Chat User Performance | Admin</title>
</svelte:head>

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
				<Button
					onclick={exportUsersCsv}
					disabled={!data || isLoading}
					variant="secondary"
					size="sm"
					icon={Download}
					class="pressable"
				>
					CSV
				</Button>
				<Button
					onclick={exportUsersJson}
					disabled={!data || isLoading}
					variant="secondary"
					size="sm"
					icon={Download}
					class="pressable"
				>
					JSON
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

	<ChatUserKpiStrip kpis={data?.kpis} />

	<ChatUserFilters
		filterOptions={data?.filter_options}
		bind:searchDraft
		bind:selectedContextType
		bind:selectedProjectId
		bind:selectedTopic
		bind:selectedErrors
		bind:selectedToolBucket
		bind:selectedClassification
		bind:selectedEntityAction
		bind:slowThresholdMs
		onApplySearch={applySearch}
		onResetFilters={resetFilters}
		onFilterChange={handleFilterChange}
	/>

	<ChatUserLeaderboards leaderboards={data?.leaderboards} onSelectUser={loadUserDetail} />

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

		<ChatUsersMobileCards
			users={data?.users ?? []}
			isInitialLoading={isLoading && !data}
			{slowThresholdMs}
			onSelectUser={loadUserDetail}
		/>
		<div class="hidden md:block">
			<ChatUsersTable
				users={data?.users ?? []}
				isInitialLoading={isLoading && !data}
				{sortBy}
				{sortOrder}
				{slowThresholdMs}
				onSort={updateSort}
				onSelectUser={loadUserDetail}
			/>
		</div>
	</div>
</div>

<ChatUserDetailDrawer
	isOpen={Boolean(selectedUserId)}
	{selectedUserId}
	{userDetail}
	{isLoadingDetail}
	{detailError}
	{selectedSessionId}
	{redactedSession}
	{isLoadingSession}
	{sessionDetailError}
	bind:selectedEntityGroupKey
	{isQueueingClassification}
	{classificationQueueMessage}
	{classificationQueueError}
	{slowThresholdMs}
	cohortUsers={data?.users ?? []}
	{selectedTimeframe}
	onClose={closeDrawer}
	onExportUserDetailJson={exportUserDetailJson}
	onLoadRedactedSession={loadRedactedSession}
	onQueueVisibleClassificationSessions={queueVisibleClassificationSessions}
/>
