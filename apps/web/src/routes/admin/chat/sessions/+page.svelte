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
		Download,
		MessageSquare,
		RefreshCw,
		Search,
		Terminal,
		Wrench,
		XCircle
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		downloadChatSessionAuditMarkdown,
		fetchChatSessionAuditPayload,
		type AuditTimelineEvent as TimelineEvent,
		type AuditTimelineSeverity as TimelineSeverity,
		type AuditTimelineType as TimelineType,
		type ChatSessionAuditPayload as SessionDetailPayload
	} from '$lib/services/admin/chat-session-audit-export';

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

	type PromptEvalScenario = {
		slug: string;
		version: string;
		title: string;
		description: string;
		category: string;
		replayRequest?: {
			message: string;
			contextType?: string;
			entityId?: string | null;
		};
	};

	const PAGE_SIZE = 25;
	const CHAT_SESSION_QUERY_PARAM = 'chat_session_id';

	let hasInitializedFromUrl = $state(false);
	let lastUrlSessionIdWritten = $state<string | null>(null);
	let isLoadingSessions = $state(true);
	let sessionsError = $state<string | null>(null);
	let sessions = $state<SessionListItem[]>([]);
	let totalSessions = $state(0);
	let currentPage = $state(1);

	let selectedSessionId = $state<string | null>(null);
	let isLoadingDetail = $state(false);
	let detailError = $state<string | null>(null);
	let sessionDetail = $state<SessionDetailPayload | null>(null);
	let evalScenarios = $state<PromptEvalScenario[]>([]);
	let isLoadingEvalScenarios = $state(false);
	let selectedEvalScenarioByTurnId = $state<Record<string, string>>({});
	let runningEvalByTurnId = $state<Record<string, boolean>>({});
	let evalErrorByTurnId = $state<Record<string, string | null>>({});
	let selectedReplayScenarioSlug = $state('');
	let isRunningReplay = $state(false);
	let replayError = $state<string | null>(null);
	let lastReplayResult = $state<{
		sessionId: string | null;
		turnRunId: string;
		status: string;
		scenarioSlug: string;
	} | null>(null);

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
		timing: true,
		turn_run: true,
		prompt_snapshot: true,
		turn_event: true,
		eval_run: true
	});

	let hasLoadedEvalScenarios = false;

	$effect(() => {
		if (!browser) return;
		const urlSessionId = $page.url.searchParams.get(CHAT_SESSION_QUERY_PARAM)?.trim() || null;

		if (!hasInitializedFromUrl) {
			selectedSessionId = urlSessionId;
			lastUrlSessionIdWritten = urlSessionId;
			hasInitializedFromUrl = true;
			return;
		}

		if (urlSessionId !== lastUrlSessionIdWritten && urlSessionId !== selectedSessionId) {
			selectedSessionId = urlSessionId;
		}
	});

	$effect(() => {
		if (!browser) return;
		if (!hasInitializedFromUrl) return;
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

	$effect(() => {
		if (!browser || !hasInitializedFromUrl) return;
		const url = new URL($page.url);
		const currentSessionId = url.searchParams.get(CHAT_SESSION_QUERY_PARAM)?.trim() || null;
		if (currentSessionId === selectedSessionId) {
			lastUrlSessionIdWritten = currentSessionId;
			return;
		}
		if (selectedSessionId) {
			url.searchParams.set(CHAT_SESSION_QUERY_PARAM, selectedSessionId);
		} else {
			url.searchParams.delete(CHAT_SESSION_QUERY_PARAM);
		}
		lastUrlSessionIdWritten = selectedSessionId;
		replaceState(url.toString(), {});
	});

	$effect(() => {
		if (!browser || hasLoadedEvalScenarios) return;
		hasLoadedEvalScenarios = true;
		loadEvalScenarios();
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

	const selectedReplayScenario = $derived.by(
		() => evalScenarios.find((scenario) => scenario.slug === selectedReplayScenarioSlug) ?? null
	);

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
			const requestedSessionId =
				$page.url.searchParams.get(CHAT_SESSION_QUERY_PARAM)?.trim() || null;

			if (sessions.length === 0) {
				if (selectedSessionId && selectedSessionId === requestedSessionId) {
					return;
				}
				selectedSessionId = null;
				sessionDetail = null;
				return;
			}

			const stillExists =
				selectedSessionId && sessions.some((session) => session.id === selectedSessionId);
			const firstSession = sessions[0];
			if (!stillExists && firstSession && selectedSessionId !== requestedSessionId) {
				selectedSessionId = firstSession.id;
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
			sessionDetail = await fetchChatSessionAuditPayload(sessionId);
			if (evalScenarios.length > 0) {
				const nextSelections = { ...selectedEvalScenarioByTurnId };
				for (const run of sessionDetail.turn_runs ?? []) {
					if (!nextSelections[run.id]) {
						nextSelections[run.id] = evalScenarios[0]?.slug ?? '';
					}
				}
				selectedEvalScenarioByTurnId = nextSelections;
			}
		} catch (err) {
			console.error('Failed loading session detail', err);
			detailError = err instanceof Error ? err.message : 'Failed to load session detail';
			sessionDetail = null;
		} finally {
			isLoadingDetail = false;
		}
	}

	async function loadEvalScenarios() {
		isLoadingEvalScenarios = true;
		try {
			const response = await fetch('/api/admin/chat/evals/scenarios');
			if (!response.ok) throw new Error('Failed to load eval scenarios');
			const result = await response.json();
			if (!result.success) throw new Error(result.message || 'Failed to load eval scenarios');
			evalScenarios = result.data.scenarios ?? [];
			if (sessionDetail?.turn_runs?.length) {
				const nextSelections = { ...selectedEvalScenarioByTurnId };
				for (const run of sessionDetail.turn_runs) {
					if (!nextSelections[run.id]) {
						nextSelections[run.id] = evalScenarios[0]?.slug ?? '';
					}
				}
				selectedEvalScenarioByTurnId = nextSelections;
			}
			if (!selectedReplayScenarioSlug && (result.data.scenarios?.length ?? 0) > 0) {
				selectedReplayScenarioSlug = result.data.scenarios[0].slug;
			}
		} catch (err) {
			console.error('Failed loading eval scenarios', err);
		} finally {
			isLoadingEvalScenarios = false;
		}
	}

	async function runPromptEval(turnRunId: string) {
		const scenarioSlug = selectedEvalScenarioByTurnId[turnRunId];
		if (!scenarioSlug || !selectedSessionId) return;
		runningEvalByTurnId = { ...runningEvalByTurnId, [turnRunId]: true };
		evalErrorByTurnId = { ...evalErrorByTurnId, [turnRunId]: null };
		try {
			const response = await fetch('/api/admin/chat/evals/run', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					turn_run_id: turnRunId,
					scenario_slug: scenarioSlug
				})
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.message || 'Failed to run prompt eval');
			}
			await loadSessionDetail(selectedSessionId);
		} catch (err) {
			console.error('Failed running prompt eval', err);
			evalErrorByTurnId = {
				...evalErrorByTurnId,
				[turnRunId]: err instanceof Error ? err.message : 'Failed to run prompt eval'
			};
		} finally {
			runningEvalByTurnId = { ...runningEvalByTurnId, [turnRunId]: false };
		}
	}

	async function runScenarioReplay() {
		if (!selectedReplayScenarioSlug) return;
		isRunningReplay = true;
		replayError = null;
		try {
			const response = await fetch('/api/admin/chat/evals/replay', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					scenario_slug: selectedReplayScenarioSlug
				})
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.message || 'Failed to replay prompt scenario');
			}
			const sessionId =
				typeof result.data?.session_id === 'string' ? result.data.session_id : null;
			const turnRunId =
				typeof result.data?.turn_run?.id === 'string' ? result.data.turn_run.id : '';
			const status =
				typeof result.data?.eval_run?.status === 'string'
					? result.data.eval_run.status
					: 'unknown';
			lastReplayResult = {
				sessionId,
				turnRunId,
				status,
				scenarioSlug: selectedReplayScenarioSlug
			};
			await loadSessions();
			if (sessionId) {
				selectedSessionId = sessionId;
				await loadSessionDetail(sessionId);
			}
		} catch (err) {
			console.error('Failed replaying prompt scenario', err);
			replayError = err instanceof Error ? err.message : 'Failed to replay prompt scenario';
		} finally {
			isRunningReplay = false;
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

	function resetTimelineFilters() {
		timelineSearch = '';
		showOnlyErrors = false;
		eventTypeFilters = {
			session: true,
			message: true,
			tool_execution: true,
			llm_call: true,
			operation: true,
			context_shift: true,
			timing: true,
			turn_run: true,
			prompt_snapshot: true,
			turn_event: true,
			eval_run: true
		};
	}

	function exportSessionAudit() {
		if (!browser || !sessionDetail) return;
		try {
			downloadChatSessionAuditMarkdown(sessionDetail);
			toastService.success('Session audit exported as markdown');
		} catch (err) {
			console.error('Failed exporting session audit markdown', err);
			toastService.error(
				err instanceof Error ? err.message : 'Failed to export session audit markdown'
			);
		}
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
			case 'turn_run':
				return 'Turn Run';
			case 'prompt_snapshot':
				return 'Prompt Snapshot';
			case 'turn_event':
				return 'Turn Event';
			case 'eval_run':
				return 'Eval Run';
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
			case 'turn_run':
				return Activity;
			case 'prompt_snapshot':
				return Database;
			case 'turn_event':
				return Bot;
			case 'eval_run':
				return RefreshCw;
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

	function updateSelectedEvalScenario(turnRunId: string, value: string) {
		selectedEvalScenarioByTurnId = {
			...selectedEvalScenarioByTurnId,
			[turnRunId]: value
		};
	}

	function evalAssertionCount(summary: unknown, key: 'passed' | 'failed'): string {
		if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return '0';
		const assertionCounts = (summary as Record<string, unknown>).assertion_counts;
		if (
			!assertionCounts ||
			typeof assertionCounts !== 'object' ||
			Array.isArray(assertionCounts)
		) {
			return '0';
		}
		return stringValue((assertionCounts as Record<string, unknown>)[key] ?? 0);
	}

	function payloadSummaryAssertionCount(
		payload: Record<string, unknown>,
		key: 'passed' | 'failed'
	): string {
		return evalAssertionCount(payloadField(payload, 'summary'), key);
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

	<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr),minmax(23rem,0.95fr)] gap-3">
		<div class="bg-card border border-border rounded-lg p-3 shadow-ink">
			<form onsubmit={handleSearchSubmit} class="flex flex-wrap items-end gap-2">
				<div class="relative flex-1 min-w-[220px]">
					<Search
						class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by session id, title, or user..."
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

		<div class="bg-card border border-border rounded-lg p-3 shadow-ink space-y-2">
			<div class="flex flex-wrap items-start gap-2">
				<div class="min-w-[9rem] pt-1">
					<div class="text-sm font-semibold text-foreground">Replay Scenario</div>
					<div class="text-xs text-muted-foreground">Run one audited prompt.</div>
				</div>
				<select
					class="min-w-[240px] flex-1 text-sm border border-border bg-background rounded-lg px-3 py-2 text-foreground"
					value={selectedReplayScenarioSlug}
					onchange={(event) =>
						(selectedReplayScenarioSlug = (event.currentTarget as HTMLSelectElement)
							.value)}
					disabled={isLoadingEvalScenarios || isRunningReplay}
				>
					<option value="">
						{isLoadingEvalScenarios ? 'Loading scenarios...' : 'Select replay scenario'}
					</option>
					{#each evalScenarios as scenario}
						<option value={scenario.slug}>{scenario.title}</option>
					{/each}
				</select>
				<Button
					onclick={runScenarioReplay}
					disabled={!selectedReplayScenarioSlug || isRunningReplay}
					loading={isRunningReplay}
					icon={RefreshCw}
					variant="secondary"
					size="sm"
					class="pressable shrink-0"
				>
					Replay
				</Button>
			</div>
			{#if selectedReplayScenario}
				<div class="rounded-lg border border-border bg-background px-3 py-2">
					<div class="text-xs font-medium text-foreground">
						{selectedReplayScenario.title}
					</div>
					<div class="mt-0.5 text-xs text-muted-foreground line-clamp-2">
						{selectedReplayScenario.description}
					</div>
					{#if selectedReplayScenario.replayRequest?.message}
						<div class="mt-1 text-xs text-foreground/80 truncate">
							Prompt: "{selectedReplayScenario.replayRequest.message}"
						</div>
					{/if}
				</div>
			{/if}
			{#if replayError}
				<div class="text-xs text-red-600 dark:text-red-400">{replayError}</div>
			{/if}
			{#if lastReplayResult}
				<div class="text-xs text-muted-foreground">
					Last replay: {lastReplayResult.scenarioSlug} -> {lastReplayResult.status} on turn
					{lastReplayResult.turnRunId}
					{#if lastReplayResult.sessionId}
						(session {lastReplayResult.sessionId})
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<div
		class="sessions-workspace grid grid-cols-1 xl:grid-cols-[22rem,minmax(0,1fr)] 2xl:grid-cols-[24rem,minmax(0,1fr)] gap-3 items-stretch min-w-0"
	>
		<div
			class="bg-card border border-border rounded-lg shadow-ink overflow-hidden flex flex-col min-h-[24rem] xl:h-full"
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
				<div class="flex-1 overflow-y-auto overscroll-contain p-2 space-y-1.5">
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
			class="bg-card border border-border rounded-lg shadow-ink flex flex-col min-h-[32rem] min-w-0 overflow-hidden xl:h-full"
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
				<div class="p-3 border-b border-border space-y-3 shrink-0 bg-card">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<h2
								class="text-base font-semibold text-foreground leading-tight truncate"
							>
								{sessionDetail.session.title}
							</h2>
							<div class="mt-0.5 text-xs text-muted-foreground">
								{sessionDetail.session.user.email} · {sessionDetail.session
									.context_type}
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground">
								Created {formatDateTime(sessionDetail.session.created_at)} · Updated
								{formatDateTime(sessionDetail.session.updated_at)}
							</div>
						</div>
						<div class="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
							<Button
								onclick={exportSessionAudit}
								icon={Download}
								variant="secondary"
								size="sm"
								class="pressable"
							>
								Export Markdown
							</Button>
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

					<div
						class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9 gap-1.5"
					>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Turns</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(sessionDetail.turn_runs.length)}
							</div>
						</div>
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
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Prompt Snapshots</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(
									sessionDetail.turn_runs.filter((run) => !!run.prompt_snapshot)
										.length
								)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-background p-2">
							<div class="text-xs text-foreground/70">Validation Failures</div>
							<div class="text-sm font-semibold text-foreground">
								{formatNumber(
									sessionDetail.turn_runs.reduce(
										(sum, run) => sum + (run.validation_failure_count ?? 0),
										0
									)
								)}
							</div>
						</div>
					</div>

					{#if sessionDetail.turn_runs.length > 0}
						<details class="rounded-lg border border-border bg-background">
							<summary
								class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 p-2.5"
							>
								<div>
									<div
										class="text-xs font-semibold text-foreground/60 uppercase tracking-wide"
									>
										Turn Runs
									</div>
									<div class="mt-1 text-xs text-muted-foreground">
										{formatNumber(sessionDetail.turn_runs.length)} turns with prompt
										snapshots, tool traces, and eval runs.
									</div>
								</div>
								<div class="text-xs text-muted-foreground">Expand</div>
							</summary>
							<div class="border-t border-border p-2.5">
								<div
									class="space-y-2 max-h-72 overflow-y-auto overscroll-contain pr-1"
								>
									{#each sessionDetail.turn_runs as run}
										<details
											class="rounded-lg border border-border bg-card p-2.5"
										>
											<summary
												class="cursor-pointer list-none flex flex-wrap items-start justify-between gap-2"
											>
												<div class="min-w-0 flex-1">
													<div
														class="flex flex-wrap items-center gap-1.5"
													>
														<span
															class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground/80"
														>
															Turn {run.turn_index}
														</span>
														<span
															class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {statusBadge(
																run.status
															)}"
														>
															{run.status}
														</span>
														{#if run.first_lane}
															<span
																class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-foreground"
															>
																{run.first_lane}
															</span>
														{/if}
													</div>
													<div
														class="mt-1 truncate text-sm font-semibold text-foreground"
													>
														{run.request_message}
													</div>
													<div
														class="mt-0.5 text-xs text-muted-foreground"
													>
														{formatDateTime(run.started_at)} · {formatNumber(
															run.tool_call_count
														)} tools · {formatNumber(
															run.llm_pass_count
														)} LLM passes
													</div>
												</div>
											</summary>

											<div class="mt-3 space-y-2">
												<div
													class="grid grid-cols-2 lg:grid-cols-4 gap-1.5 text-xs"
												>
													<div
														class="rounded border border-border bg-background px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															First Skill
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{run.first_skill_path || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-background px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															First Op
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{run.first_canonical_op || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-background px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															History
														</div>
														<div class="font-semibold text-foreground">
															{run.history_strategy || '-'} / {formatNumber(
																run.history_for_model_count
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-background px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Cache
														</div>
														<div class="font-semibold text-foreground">
															{run.cache_source || '-'} / {formatNumber(
																run.cache_age_seconds
															)}s
														</div>
													</div>
												</div>

												{#if run.prompt_snapshot}
													<details
														class="rounded border border-border bg-background p-2 text-xs"
													>
														<summary
															class="cursor-pointer font-medium text-foreground"
														>
															Prompt Snapshot
														</summary>
														<div
															class="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/70"
														>
															<span
																>Approx tokens: {formatNumber(
																	Number(
																		run.prompt_snapshot
																			.approx_prompt_tokens ||
																			0
																	)
																)}</span
															>
															<span
																>System chars: {formatNumber(
																	Number(
																		run.prompt_snapshot
																			.system_prompt_chars ||
																			0
																	)
																)}</span
															>
															<span
																>Message chars: {formatNumber(
																	Number(
																		run.prompt_snapshot
																			.message_chars || 0
																	)
																)}</span
															>
														</div>
														{#if run.prompt_snapshot.rendered_dump_text}
															<pre
																class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{stringValue(
																	run.prompt_snapshot
																		.rendered_dump_text
																)}</pre>
														{/if}
													</details>
												{/if}

												{#if run.events.length > 0}
													<details
														class="rounded border border-border bg-background p-2 text-xs"
													>
														<summary
															class="cursor-pointer font-medium text-foreground"
														>
															Turn Events ({run.events.length})
														</summary>
														<pre
															class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
																run.events
															)}</pre>
													</details>
												{/if}

												<div
													class="rounded border border-border bg-background p-2 space-y-2"
												>
													<div
														class="flex flex-wrap items-center justify-between gap-2"
													>
														<div
															class="text-xs font-medium text-foreground"
														>
															Prompt Eval
														</div>
														<div
															class="flex flex-wrap items-center gap-2"
														>
															<select
																class="min-w-[220px] text-xs border border-border bg-card rounded px-2 py-1.5 text-foreground"
																value={selectedEvalScenarioByTurnId[
																	run.id
																] ?? ''}
																onchange={(event) =>
																	updateSelectedEvalScenario(
																		run.id,
																		(
																			event.currentTarget as HTMLSelectElement
																		).value
																	)}
																disabled={isLoadingEvalScenarios ||
																	runningEvalByTurnId[run.id]}
															>
																<option value="">
																	{isLoadingEvalScenarios
																		? 'Loading scenarios...'
																		: 'Select scenario'}
																</option>
																{#each evalScenarios as scenario}
																	<option value={scenario.slug}>
																		{scenario.title}
																	</option>
																{/each}
															</select>
															<Button
																variant="secondary"
																size="sm"
																class="pressable"
																disabled={!selectedEvalScenarioByTurnId[
																	run.id
																] || runningEvalByTurnId[run.id]}
																loading={runningEvalByTurnId[
																	run.id
																]}
																onclick={() =>
																	runPromptEval(run.id)}
															>
																Run Eval
															</Button>
														</div>
													</div>
													{#if evalErrorByTurnId[run.id]}
														<div
															class="text-xs text-red-600 dark:text-red-400"
														>
															{evalErrorByTurnId[run.id]}
														</div>
													{/if}
													{#if run.eval_runs.length > 0}
														<div class="space-y-2">
															{#each run.eval_runs as evalRun}
																<details
																	class="rounded border border-border bg-card p-2 text-xs"
																>
																	<summary
																		class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2"
																	>
																		<div class="min-w-0 flex-1">
																			<div
																				class="flex flex-wrap items-center gap-1.5"
																			>
																				<span
																					class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground/80"
																				>
																					{evalRun.scenario_slug}
																				</span>
																				<span
																					class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium {evalRun.status ===
																					'passed'
																						? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
																						: evalRun.status ===
																							  'failed'
																							? 'bg-red-500/10 text-red-700 dark:text-red-300'
																							: 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}"
																				>
																					{evalRun.status}
																				</span>
																			</div>
																			<div
																				class="mt-1 text-xs text-muted-foreground"
																			>
																				{formatDateTime(
																					evalRun.started_at
																				)} · {stringValue(
																					evalAssertionCount(
																						evalRun.summary,
																						'passed'
																					)
																				)} passed · {stringValue(
																					evalAssertionCount(
																						evalRun.summary,
																						'failed'
																					)
																				)} failed
																			</div>
																		</div>
																	</summary>
																	<div class="mt-2 space-y-2">
																		<pre
																			class="whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground bg-background border border-border rounded p-2">{prettyJson(
																				evalRun.summary
																			)}</pre>
																		{#if evalRun.assertions.length > 0}
																			<pre
																				class="whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground bg-background border border-border rounded p-2">{prettyJson(
																					evalRun.assertions
																				)}</pre>
																		{/if}
																	</div>
																</details>
															{/each}
														</div>
													{:else}
														<div class="text-xs text-muted-foreground">
															No evals recorded for this turn yet.
														</div>
													{/if}
												</div>
											</div>
										</details>
									{/each}
								</div>
							</div>
						</details>
					{/if}

					<div class="rounded-lg border border-border bg-background p-2.5 space-y-2">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<div
									class="text-xs font-semibold text-foreground/60 uppercase tracking-wide"
								>
									Timeline Filters
								</div>
								<div class="mt-1 text-xs text-muted-foreground">
									Showing {formatNumber(visibleTimeline.length)} of {formatNumber(
										sessionDetail.timeline.length
									)} events
								</div>
							</div>
							<button
								type="button"
								class="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
								onclick={resetTimelineFilters}
							>
								Reset filters
							</button>
						</div>
						<div class="flex flex-wrap items-center gap-1.5">
							{#each Object.keys(eventTypeFilters) as rawType}
								{@const type = rawType as TimelineType}
								<button
									type="button"
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
								type="button"
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
								placeholder="Search timeline events, payloads, tool names..."
								class="w-full text-sm pl-8 pr-3 py-1.5 border border-border bg-card rounded-lg shadow-ink-inner focus:ring-2 focus:ring-ring focus:border-accent text-foreground"
							/>
						</div>
					</div>
				</div>

				<div class="min-h-0 p-3 flex-1 overflow-y-auto overscroll-contain">
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

											{#if event.type === 'turn_run'}
												<div
													class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
												>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Lane
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{stringValue(
																payloadField(payload, 'first_lane')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															First Skill
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{stringValue(
																payloadField(
																	payload,
																	'first_skill_path'
																)
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															First Op
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{stringValue(
																payloadField(
																	payload,
																	'first_canonical_op'
																)
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Validation Failures
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'validation_failure_count'
																	) || 0
																)
															)}
														</div>
													</div>
												</div>
											{/if}

											{#if event.type === 'prompt_snapshot'}
												<div
													class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs"
												>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Approx Tokens
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'approx_prompt_tokens'
																	) || 0
																)
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															System Chars
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'system_prompt_chars'
																	) || 0
																)
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Message Chars
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'message_chars'
																	) || 0
																)
															)}
														</div>
													</div>
												</div>
												{#if payloadField(payload, 'rendered_dump_text')}
													<details
														class="mt-2 rounded border border-border bg-card p-2 text-xs"
													>
														<summary
															class="cursor-pointer font-medium text-foreground"
														>
															Rendered Prompt Dump
														</summary>
														<pre
															class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{stringValue(
																payloadField(
																	payload,
																	'rendered_dump_text'
																)
															)}</pre>
													</details>
												{/if}
											{/if}

											{#if event.type === 'turn_event'}
												<div
													class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
												>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Phase
														</div>
														<div class="font-semibold text-foreground">
															{stringValue(
																payloadField(payload, 'phase')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Sequence
														</div>
														<div class="font-semibold text-foreground">
															{formatNumber(
																Number(
																	payloadField(
																		payload,
																		'sequence_index'
																	) || 0
																)
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Event Type
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{stringValue(
																payloadField(payload, 'event_type')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Stream Run
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{stringValue(
																payloadField(
																	payload,
																	'stream_run_id'
																)
															) || '-'}
														</div>
													</div>
												</div>
											{/if}

											{#if event.type === 'eval_run'}
												<div
													class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
												>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Scenario
														</div>
														<div
															class="font-semibold text-foreground break-all"
														>
															{stringValue(
																payloadField(
																	payload,
																	'scenario_slug'
																)
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Status
														</div>
														<div class="font-semibold text-foreground">
															{stringValue(
																payloadField(payload, 'status')
															) || '-'}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Passed
														</div>
														<div class="font-semibold text-foreground">
															{payloadSummaryAssertionCount(
																payload,
																'passed'
															)}
														</div>
													</div>
													<div
														class="rounded border border-border bg-card px-2 py-1.5"
													>
														<div class="text-foreground/60 font-medium">
															Failed
														</div>
														<div class="font-semibold text-foreground">
															{payloadSummaryAssertionCount(
																payload,
																'failed'
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
	.sessions-page {
		min-height: 0;
	}

	.sessions-workspace {
		min-height: 0;
	}

	@media (min-width: 1280px) {
		.sessions-workspace {
			height: calc(100dvh - 12.5rem);
			min-height: 48rem;
		}
	}
</style>
