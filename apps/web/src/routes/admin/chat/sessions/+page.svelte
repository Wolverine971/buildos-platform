<!-- apps/web/src/routes/admin/chat/sessions/+page.svelte -->
<script lang="ts">
	import {
		Activity,
		AlertCircle,
		Bot,
		ChevronDown,
		ChevronRight,
		Clock,
		Database,
		MessageSquare,
		RefreshCw,
		Search,
		Terminal,
		Wrench,
		XCircle
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	type SessionListItem = {
		id: string;
		title: string;
		user: { id: string; email: string; name: string };
		status: string;
		context_type: string;
		entity_id: string | null;
		message_count: number;
		total_tokens: number;
		tool_call_count: number;
		llm_call_count: number;
		tool_failure_count: number;
		cost_estimate: number;
		has_errors: boolean;
		has_agent_state: boolean;
		has_context_shift: boolean;
		last_tool_at: string | null;
		created_at: string;
		updated_at: string;
		last_message_at: string | null;
	};

	type TimelineType =
		| 'session'
		| 'message'
		| 'tool_execution'
		| 'llm_call'
		| 'operation'
		| 'context_shift'
		| 'timing';

	type TimelineSeverity = 'info' | 'success' | 'warning' | 'error';

	type TimelineEvent = {
		id: string;
		timestamp: string;
		type: TimelineType;
		severity: TimelineSeverity;
		title: string;
		summary: string;
		turn_index: number | null;
		payload: Record<string, unknown>;
	};

	type SessionDetailPayload = {
		session: {
			id: string;
			title: string;
			user: { id: string; email: string; name: string };
			context_type: string;
			context_id: string | null;
			status: string;
			message_count: number;
			total_tokens: number;
			tool_call_count: number;
			llm_call_count: number;
			cost_estimate: number;
			has_errors: boolean;
			created_at: string;
			updated_at: string;
			last_message_at: string | null;
			agent_metadata: Record<string, unknown>;
		};
		metrics: {
			total_tokens: number;
			total_cost_usd: number;
			tool_calls: number;
			tool_failures: number;
			llm_calls: number;
			llm_failures: number;
			messages: number;
		};
		messages: Array<Record<string, unknown>>;
		tool_executions: Array<Record<string, unknown>>;
		llm_calls: Array<Record<string, unknown>>;
		operations: Array<Record<string, unknown>>;
		timeline: TimelineEvent[];
		timing_metrics: Record<string, unknown> | null;
	};

	const PAGE_SIZE = 25;

	let isLoadingSessions = $state(true);
	let sessionsError = $state<string | null>(null);
	let sessions = $state<SessionListItem[]>([]);
	let totalSessions = $state(0);
	let currentPage = $state(1);

	let selectedSessionId = $state<string | null>(null);
	let isLoadingDetail = $state(false);
	let detailError = $state<string | null>(null);
	let sessionDetail = $state<SessionDetailPayload | null>(null);

	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let selectedContextType = $state('all');
	let selectedTimeframe = $state<'24h' | '7d' | '30d'>('7d');
	let selectedSortBy = $state<'updated_at' | 'created_at' | 'last_message_at'>('updated_at');
	let selectedSortOrder = $state<'asc' | 'desc'>('desc');

	let showOnlyErrors = $state(false);
	let timelineSearch = $state('');
	let expandedEventIds = $state<Set<string>>(new Set());
	let eventTypeFilters = $state<Record<TimelineType, boolean>>({
		session: true,
		message: true,
		tool_execution: true,
		llm_call: true,
		operation: true,
		context_shift: true,
		timing: true
	});

	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		selectedStatus;
		selectedContextType;
		selectedSortBy;
		selectedSortOrder;
		currentPage;
		loadSessions();
	});

	$effect(() => {
		if (!browser) return;
		if (!selectedSessionId) {
			sessionDetail = null;
			detailError = null;
			return;
		}
		loadSessionDetail(selectedSessionId);
	});

	const visibleTimeline = $derived.by(() => {
		if (!sessionDetail?.timeline?.length) return [] as TimelineEvent[];
		const query = timelineSearch.trim().toLowerCase();
		return sessionDetail.timeline.filter((event) => {
			if (!eventTypeFilters[event.type]) return false;
			if (showOnlyErrors && event.severity !== 'error') return false;
			if (!query) return true;
			const haystack =
				`${event.title} ${event.summary} ${JSON.stringify(event.payload ?? {})}`.toLowerCase();
			return haystack.includes(query);
		});
	});

	async function loadSessions() {
		isLoadingSessions = true;
		sessionsError = null;

		try {
			const params = new URLSearchParams({
				timeframe: selectedTimeframe,
				page: currentPage.toString(),
				limit: PAGE_SIZE.toString(),
				sort_by: selectedSortBy,
				sort_order: selectedSortOrder
			});

			if (selectedStatus !== 'all') params.append('status', selectedStatus);
			if (selectedContextType !== 'all') params.append('context_type', selectedContextType);
			if (searchQuery.trim()) params.append('search', searchQuery.trim());

			const response = await fetch(`/api/admin/chat/sessions?${params.toString()}`);
			if (!response.ok) throw new Error('Failed to load sessions');

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.message || 'Failed to load sessions');
			}

			sessions = result.data.sessions ?? [];
			totalSessions = result.data.total ?? 0;

			if (sessions.length === 0) {
				selectedSessionId = null;
				sessionDetail = null;
				return;
			}

			const stillExists =
				selectedSessionId && sessions.some((session) => session.id === selectedSessionId);
			if (!stillExists) {
				selectedSessionId = sessions[0].id;
			}
		} catch (err) {
			console.error('Failed loading sessions', err);
			sessionsError = err instanceof Error ? err.message : 'Failed to load sessions';
		} finally {
			isLoadingSessions = false;
		}
	}

	async function loadSessionDetail(sessionId: string) {
		isLoadingDetail = true;
		detailError = null;
		expandedEventIds = new Set();

		try {
			const response = await fetch(`/api/admin/chat/sessions/${sessionId}`);
			if (!response.ok) throw new Error('Failed to load session detail');

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.message || 'Failed to load session detail');
			}

			sessionDetail = result.data as SessionDetailPayload;
		} catch (err) {
			console.error('Failed loading session detail', err);
			detailError = err instanceof Error ? err.message : 'Failed to load session detail';
			sessionDetail = null;
		} finally {
			isLoadingDetail = false;
		}
	}

	function handleSearchSubmit(event: Event) {
		event.preventDefault();
		currentPage = 1;
		loadSessions();
	}

	function previousPage() {
		if (currentPage > 1) currentPage -= 1;
	}

	function nextPage() {
		if (currentPage * PAGE_SIZE < totalSessions) currentPage += 1;
	}

	function toggleEventType(type: TimelineType) {
		eventTypeFilters = {
			...eventTypeFilters,
			[type]: !eventTypeFilters[type]
		};
	}

	function toggleEventExpansion(eventId: string) {
		const next = new Set(expandedEventIds);
		if (next.has(eventId)) {
			next.delete(eventId);
		} else {
			next.add(eventId);
		}
		expandedEventIds = next;
	}

	function eventTypeLabel(type: TimelineType): string {
		switch (type) {
			case 'session':
				return 'Session';
			case 'message':
				return 'Message';
			case 'tool_execution':
				return 'Tool';
			case 'llm_call':
				return 'LLM';
			case 'operation':
				return 'Operation';
			case 'context_shift':
				return 'Context Shift';
			case 'timing':
				return 'Timing';
			default:
				return type;
		}
	}

	function eventIcon(type: TimelineType) {
		switch (type) {
			case 'session':
				return Activity;
			case 'message':
				return MessageSquare;
			case 'tool_execution':
				return Wrench;
			case 'llm_call':
				return Bot;
			case 'operation':
				return Database;
			case 'context_shift':
				return RefreshCw;
			case 'timing':
				return Clock;
			default:
				return Activity;
		}
	}

	function eventSeverityClasses(severity: TimelineSeverity): string {
		switch (severity) {
			case 'success':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
			case 'warning':
				return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
			case 'error':
				return 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20';
			case 'info':
			default:
				return 'bg-accent/10 text-foreground border-accent/30';
		}
	}

	function timelineDotClasses(severity: TimelineSeverity): string {
		switch (severity) {
			case 'success':
				return 'bg-emerald-500';
			case 'warning':
				return 'bg-amber-500';
			case 'error':
				return 'bg-red-500';
			case 'info':
			default:
				return 'bg-accent';
		}
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return '-';
		return new Date(value).toLocaleString();
	}

	function formatNumber(value: number | null | undefined): string {
		return new Intl.NumberFormat('en-US').format(value ?? 0);
	}

	function formatCurrency(value: number | null | undefined): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 4,
			maximumFractionDigits: 4
		}).format(value ?? 0);
	}

	function formatDuration(ms: unknown): string {
		const value = typeof ms === 'number' ? ms : Number(ms);
		if (!Number.isFinite(value) || value <= 0) return '-';
		if (value < 1000) return `${Math.round(value)}ms`;
		return `${(value / 1000).toFixed(2)}s`;
	}

	function statusBadge(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
			case 'archived':
				return 'bg-muted text-muted-foreground';
			case 'compressed':
				return 'bg-accent/15 text-foreground';
			case 'failed':
				return 'bg-red-500/10 text-red-700 dark:text-red-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	function prettyJson(value: unknown): string {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	function payloadField(payload: Record<string, unknown>, key: string): unknown {
		return payload ? payload[key] : undefined;
	}

	function stringValue(value: unknown): string {
		if (typeof value === 'string') return value;
		if (value === null || value === undefined) return '';
		return String(value);
	}
</script>

<svelte:head>
	<title>Chat Session Audit - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="sessions-page admin-page">
	<AdminPageHeader
		title="Chat Session Audit"
		description="Replay complete agentic chat sessions with tool calls, LLM events, and payload traces."
		icon={Terminal}
		showBack={true}
	>
		<div slot="actions" class="flex flex-wrap items-center gap-2">
			<Select
				bind:value={selectedTimeframe}
				onchange={(value) => (selectedTimeframe = String(value) as '24h' | '7d' | '30d')}
				size="md"
			>
				<option value="24h">Last 24 Hours</option>
				<option value="7d">Last 7 Days</option>
				<option value="30d">Last 30 Days</option>
			</Select>
			<Button
				onclick={loadSessions}
				disabled={isLoadingSessions}
				loading={isLoadingSessions}
				icon={RefreshCw}
				variant="secondary"
				size="sm"
				class="pressable"
			>
				Refresh
			</Button>
		</div>
	</AdminPageHeader>

	<div class="bg-card border border-border rounded-lg p-3 shadow-ink">
		<form onsubmit={handleSearchSubmit} class="flex flex-wrap items-end gap-2">
			<div class="relative flex-1 min-w-[180px]">
				<Search
					class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by session id/title..."
					class="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:ring-2 focus:ring-ring focus:border-accent text-foreground"
				/>
			</div>
			<Select
				bind:value={selectedStatus}
				onchange={(value) => (selectedStatus = String(value))}
				size="md"
				aria-label="Status filter"
			>
				<option value="all">All Statuses</option>
				<option value="active">Active</option>
				<option value="archived">Archived</option>
				<option value="compressed">Compressed</option>
				<option value="failed">Failed</option>
			</Select>
			<Select
				bind:value={selectedContextType}
				onchange={(value) => (selectedContextType = String(value))}
				size="md"
				aria-label="Context filter"
			>
				<option value="all">All Contexts</option>
				<option value="global">Global</option>
				<option value="general">General</option>
				<option value="project">Project</option>
				<option value="project_create">Project Create</option>
				<option value="project_audit">Project Audit</option>
				<option value="project_forecast">Project Forecast</option>
				<option value="calendar">Calendar</option>
				<option value="daily_brief">Daily Brief</option>
				<option value="daily_brief_update">Daily Brief Update</option>
				<option value="brain_dump">Brain Dump</option>
				<option value="ontology">Ontology</option>
			</Select>
			<Select
				bind:value={selectedSortBy}
				onchange={(value) =>
					(selectedSortBy = String(value) as
						| 'updated_at'
						| 'created_at'
						| 'last_message_at')}
				size="md"
				aria-label="Sort field"
			>
				<option value="updated_at">Sort: Updated</option>
				<option value="created_at">Sort: Created</option>
				<option value="last_message_at">Sort: Last Message</option>
			</Select>
			<Select
				bind:value={selectedSortOrder}
				onchange={(value) => (selectedSortOrder = String(value) as 'asc' | 'desc')}
				size="md"
				aria-label="Sort order"
			>
				<option value="desc">Newest</option>
				<option value="asc">Oldest</option>
			</Select>
			<Button type="submit" variant="primary" size="md" class="pressable">Apply</Button>
		</form>
	</div>

	<div class="grid grid-cols-1 xl:grid-cols-[300px,1fr] gap-3 items-start min-w-0">
		<div
			class="bg-card border border-border rounded-lg shadow-ink overflow-hidden flex flex-col xl:max-h-[calc(100vh-220px)]"
		>
			<div
				class="p-3 border-b border-border flex items-center justify-between gap-2 shrink-0"
			>
				<div>
					<div class="text-sm font-semibold text-foreground">Sessions</div>
					<div class="text-xs text-muted-foreground">
						{formatNumber(totalSessions)} total
					</div>
				</div>
				<div class="text-xs text-muted-foreground">Page {currentPage}</div>
			</div>

			{#if isLoadingSessions}
				<div class="p-2 space-y-2">
					{#each Array(6) as _}
						<div class="border border-border rounded-lg p-2.5 animate-pulse">
							<div class="h-3 bg-muted rounded w-3/4 mb-2"></div>
							<div class="h-2.5 bg-muted rounded w-1/2"></div>
						</div>
					{/each}
				</div>
			{:else if sessionsError}
				<div class="p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
					<AlertCircle class="h-4 w-4 mt-0.5 shrink-0" />
					<span>{sessionsError}</span>
				</div>
			{:else if sessions.length === 0}
				<div class="p-6 text-center text-sm text-muted-foreground">
					<MessageSquare class="h-8 w-8 mx-auto mb-2 opacity-60" />
					No sessions found for current filters.
				</div>
			{:else}
				<div class="flex-1 overflow-y-auto p-2 space-y-1.5">
					{#each sessions as session}
						<button
							class="w-full text-left rounded-lg border p-2.5 transition-all pressable {selectedSessionId ===
							session.id
								? 'border-accent/60 bg-accent/10 shadow-ink-strong'
								: 'border-border bg-background hover:border-accent/40'}"
							onclick={() => (selectedSessionId = session.id)}
						>
							<div class="flex items-start justify-between gap-2 mb-1">
								<div
									class="text-sm font-semibold text-foreground leading-tight line-clamp-2"
								>
									{session.title}
								</div>
								{#if session.has_errors}
									<span
										class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300 shrink-0"
									>
										<XCircle class="h-3 w-3" />
										Error
									</span>
								{/if}
							</div>
							<div class="text-xs text-muted-foreground truncate">
								{session.user.email}
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground">
								{formatDateTime(session.updated_at)}
							</div>
							<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
								<span
									class="px-1.5 py-0.5 rounded-full text-xs font-medium {statusBadge(
										session.status
									)}"
								>
									{session.status}
								</span>
								<span
									class="px-1.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
								>
									{session.context_type}
								</span>
								<span class="text-xs text-foreground/70">
									{formatNumber(session.message_count)} msg
								</span>
								<span class="text-xs text-foreground/70">
									{formatNumber(session.tool_call_count)} tools
								</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<div
				class="p-2.5 border-t border-border flex items-center justify-between gap-2 shrink-0"
			>
				<Button
					onclick={previousPage}
					disabled={currentPage === 1}
					variant="secondary"
					size="sm"
					class="pressable"
				>
					Prev
				</Button>
				<div class="text-xs text-muted-foreground">
					{Math.min((currentPage - 1) * PAGE_SIZE + 1, totalSessions)}-{Math.min(
						currentPage * PAGE_SIZE,
						totalSessions
					)} / {formatNumber(totalSessions)}
				</div>
				<Button
					onclick={nextPage}
					disabled={currentPage * PAGE_SIZE >= totalSessions}
					variant="secondary"
					size="sm"
					class="pressable"
				>
					Next
				</Button>
			</div>
		</div>

		<div
			class="bg-card border border-border rounded-lg shadow-ink xl:max-h-[calc(100vh-220px)] flex flex-col min-w-0 overflow-hidden"
		>
			{#if !selectedSessionId}
				<div
					class="p-8 text-center text-sm text-muted-foreground flex-1 flex flex-col items-center justify-center"
				>
					<Activity class="h-10 w-10 mb-3 opacity-60" />
					Select a session to inspect the complete event timeline.
				</div>
			{:else if isLoadingDetail}
				<div class="p-3 space-y-2">
					{#each Array(8) as _}
						<div class="border border-border rounded-lg p-2.5 animate-pulse">
							<div class="h-3 bg-muted rounded w-1/3 mb-2"></div>
							<div class="h-2.5 bg-muted rounded w-5/6"></div>
						</div>
					{/each}
				</div>
			{:else if detailError}
				<div class="p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
					<AlertCircle class="h-4 w-4 mt-0.5 shrink-0" />
					<span>{detailError}</span>
				</div>
			{:else if sessionDetail}
				<div class="p-3 border-b border-border space-y-2.5 shrink-0">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0 flex-1">
							<h2
								class="text-base font-semibold text-foreground leading-tight truncate"
							>
								{sessionDetail.session.title}
							</h2>
							<div class="text-xs text-muted-foreground mt-0.5">
								{sessionDetail.session.user.email} · {sessionDetail.session
									.context_type}
							</div>
							<div class="text-xs text-muted-foreground mt-0.5">
								Created {formatDateTime(sessionDetail.session.created_at)} · Updated
								{formatDateTime(sessionDetail.session.updated_at)}
							</div>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<span
								class="px-2 py-0.5 rounded-full text-xs font-medium {statusBadge(
									sessionDetail.session.status
								)}"
							>
								{sessionDetail.session.status}
							</span>
							{#if sessionDetail.session.has_errors}
								<span
									class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300"
								>
									Errors
								</span>
							{/if}
						</div>
					</div>

					<div class="grid grid-cols-3 lg:grid-cols-6 gap-1.5">
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Messages</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(sessionDetail.metrics.messages)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Tool Calls</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(sessionDetail.metrics.tool_calls)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">LLM Calls</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(sessionDetail.metrics.llm_calls)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Tokens</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(sessionDetail.metrics.total_tokens)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Cost</div>
							<div class="text-sm font-semibold text-foreground">
								{formatCurrency(sessionDetail.metrics.total_cost_usd)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Failures</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(
									sessionDetail.metrics.tool_failures +
										sessionDetail.metrics.llm_failures
								)}
							</div>
						</div>
					</div>

					<div class="rounded-lg border border-border bg-background p-2.5 space-y-2">
						<div class="flex flex-wrap items-center gap-1.5">
							<span
								class="text-xs font-semibold text-foreground/60 uppercase tracking-wide"
							>
								Filters
							</span>
							{#each Object.keys(eventTypeFilters) as rawType}
								{@const type = rawType as TimelineType}
								<button
									class="px-2 py-1 rounded-full border text-xs font-medium transition-colors {eventTypeFilters[
										type
									]
										? 'border-accent bg-accent/15 text-foreground'
										: 'border-border bg-card text-foreground/50 hover:text-foreground/70'}"
									onclick={() => toggleEventType(type)}
								>
									{eventTypeLabel(type)}
								</button>
							{/each}
							<button
								class="px-2 py-1 rounded-full border text-xs font-medium transition-colors {showOnlyErrors
									? 'border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300'
									: 'border-border bg-card text-foreground/50 hover:text-foreground/70'}"
								onclick={() => (showOnlyErrors = !showOnlyErrors)}
							>
								Errors Only
							</button>
						</div>
						<div class="relative">
							<Search
								class="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
							/>
							<input
								type="text"
								bind:value={timelineSearch}
								placeholder="Search timeline events..."
								class="w-full text-sm pl-8 pr-3 py-1.5 border border-border bg-card rounded-lg shadow-ink-inner focus:ring-2 focus:ring-ring focus:border-accent text-foreground"
							/>
						</div>
					</div>
				</div>

				<div class="p-3 flex-1 overflow-y-auto">
					{#if visibleTimeline.length === 0}
						<div class="text-sm text-muted-foreground text-center py-8">
							No timeline events match the current filters.
						</div>
					{:else}
						<div class="relative pl-2">
							<div class="absolute left-[8px] top-0 bottom-0 w-px bg-border"></div>
							<div class="space-y-2">
								{#each visibleTimeline as event}
									{@const EventIcon = eventIcon(event.type)}
									{@const payload = event.payload ?? {}}
									<div class="relative pl-7">
										<div
											class="absolute left-[2px] top-3.5 h-3 w-3 rounded-full ring-2 ring-card {timelineDotClasses(
												event.severity
											)}"
										></div>
										<div
											class="rounded-lg border border-border bg-background p-2.5 shadow-ink"
										>
											<div
												class="flex flex-wrap items-center justify-between gap-2 mb-1.5"
											>
												<div class="flex items-center gap-2">
													<span
														class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium {eventSeverityClasses(
															event.severity
														)}"
													>
														<EventIcon class="h-3 w-3" />
														{eventTypeLabel(event.type)}
													</span>
													{#if event.turn_index}
														<span
															class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground/70"
														>
															Turn {event.turn_index}
														</span>
													{/if}
												</div>
												<span class="text-xs text-muted-foreground">
													{formatDateTime(event.timestamp)}
												</span>
											</div>

											<div class="text-sm font-semibold text-foreground">
												{event.title}
											</div>
											<div
												class="text-sm text-foreground/75 mt-1 whitespace-pre-wrap break-words"
											>
												{event.summary}
											</div>

											{#if event.type === 'message'}
												<div
													class="mt-2 rounded-lg border px-2.5 py-2 text-sm whitespace-pre-wrap break-words {stringValue(
														payloadField(payload, 'role')
													) === 'user'
														? 'bg-accent/8 border-accent/20'
														: stringValue(
																	payloadField(payload, 'role')
															  ) === 'assistant'
															? 'bg-emerald-500/8 border-emerald-500/20'
															: 'bg-muted/40 border-border'}"
												>
													<div
														class="text-xs text-foreground/60 uppercase tracking-wide font-semibold mb-1"
													>
														{stringValue(
															payloadField(payload, 'role')
														) || 'message'}
													</div>
													{stringValue(
														payloadField(payload, 'content')
													) || '(empty)'}
												</div>
												<div
													class="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/70"
												>
													<span
														>Tokens: {formatNumber(
															Number(
																payloadField(
																	payload,
																	'total_tokens'
																) || 0
															)
														)}</span
													>
													{#if payloadField(payload, 'error_message')}
														<span
															class="text-red-600 dark:text-red-400"
														>
															Error: {stringValue(
																payloadField(
																	payload,
																	'error_message'
																)
															)}
														</span>
													{/if}
												</div>
											{/if}

											{#if event.type === 'tool_execution'}
												<div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Tool
														</div>
														<div class="font-semibold text-foreground">
															{stringValue(
																payloadField(payload, 'tool_name')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Duration
														</div>
														<div class="font-semibold text-foreground">
															{formatDuration(
																payloadField(
																	payload,
																	'execution_time_ms'
																)
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Success
														</div>
														<div
															class="font-semibold {payloadField(
																payload,
																'success'
															) === false
																? 'text-red-600 dark:text-red-400'
																: 'text-emerald-600 dark:text-emerald-400'}"
														>
															{payloadField(payload, 'success') ===
															false
																? 'false'
																: 'true'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Tool Tokens
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'tokens_consumed'
																	) || 0
																)
															)}
														</div>
													</div>
												</div>
												{#if payloadField(payload, 'arguments') !== undefined}
													<details
														class="mt-2 rounded border border-border bg-card p-2 text-xs"
													>
														<summary
															class="cursor-pointer font-medium text-foreground"
														>
															Tool Arguments
														</summary>
														<pre
															class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
																payloadField(payload, 'arguments')
															)}</pre>
													</details>
												{/if}
												{#if payloadField(payload, 'result') !== undefined}
													<details
														class="mt-2 rounded border border-border bg-card p-2 text-xs"
													>
														<summary
															class="cursor-pointer font-medium text-foreground"
														>
															Tool Result
														</summary>
														<pre
															class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
																payloadField(payload, 'result')
															)}</pre>
													</details>
												{/if}
											{/if}

											{#if event.type === 'llm_call'}
												<div
													class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs"
												>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Model
														</div>
														<div class="font-semibold text-foreground">
															{stringValue(
																payloadField(payload, 'model_used')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Provider
														</div>
														<div class="font-semibold text-foreground">
															{stringValue(
																payloadField(payload, 'provider')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Tokens
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'total_tokens'
																	) || 0
																)
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Cost
														</div>
														<div class="font-semibold text-foreground">
															{formatCurrency(
																Number(
																	payloadField(
																		payload,
																		'total_cost_usd'
																	) || 0
																)
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Latency
														</div>
														<div class="font-semibold text-foreground">
															{formatDuration(
																payloadField(
																	payload,
																	'response_time_ms'
																)
															)}
														</div>
													</div>
												</div>
											{/if}

											<div class="mt-2">
												<button
													type="button"
													onclick={() => toggleEventExpansion(event.id)}
													class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
												>
													{#if expandedEventIds.has(event.id)}
														<ChevronDown class="h-3 w-3" />
														Hide Raw Payload
													{:else}
														<ChevronRight class="h-3 w-3" />
														Show Raw Payload
													{/if}
												</button>
												{#if expandedEventIds.has(event.id)}
													<pre
														class="mt-2 bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap break-words overflow-x-auto">{prettyJson(
															payload
														)}</pre>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Override AdminShell's max-w-7xl so the split-panel layout uses full available width */
	:global(.max-w-7xl:has(> .sessions-page)) {
		max-width: none;
	}
</style>
