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
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
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

	type SessionTurnRun = SessionDetailPayload['turn_runs'][number];
	type TimelineGroupKind = 'standalone' | 'turn';
	type TimelineGroupCounts = {
		total: number;
		messages: number;
		promptSnapshots: number;
		llmCalls: number;
		toolExecutions: number;
		turnEvents: number;
		operations: number;
		evalRuns: number;
		errors: number;
	};
	type TimelineGroup = {
		id: string;
		kind: TimelineGroupKind;
		title: string;
		summary: string;
		timestamp: string;
		severity: TimelineSeverity;
		turnIndex: number | null;
		run: SessionTurnRun | null;
		items: TimelineEvent[];
		counts: TimelineGroupCounts;
	};

	type ToolLifecycleDisplayState = {
		outcomeEvent: TimelineEvent | null;
		hideEvent: boolean;
		displayPayload: Record<string, unknown>;
		displayRawPayload: Record<string, unknown>;
		displayTitle: string;
		displaySummary: string;
		displaySeverity: TimelineSeverity;
		displayTimestamp: string;
		displayBadgeLabel: string;
		displayIconType: TimelineType;
		displayEventId: string;
	};

	const PAGE_SIZE = 25;
	const CHAT_SESSION_QUERY_PARAM = 'chat_session_id';

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
	let sessionDetailRequestId = 0;
	let isSessionDetailModalOpen = $state(false);

	function currentSessionIdFromUrl(): string | null {
		const sourceUrl = browser ? new URL(window.location.href) : new URL($page.url);
		return sourceUrl.searchParams.get(CHAT_SESSION_QUERY_PARAM)?.trim() || null;
	}

	$effect(() => {
		if (!browser) return;

		// Shallow replaceState updates the address bar without mutating $page.url.
		// Track the page store so real navigations rerun this effect, but read the
		// browser location so modal state follows the actual visible URL.
		$page.url.href;

		const urlSessionId = currentSessionIdFromUrl();
		const currentSessionId = untrack(() => selectedSessionId);
		if (urlSessionId !== currentSessionId) {
			selectedSessionId = urlSessionId;
		}
		isSessionDetailModalOpen = Boolean(urlSessionId);
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
			sessionDetailRequestId += 1;
			isLoadingDetail = false;
			sessionDetail = null;
			detailError = null;
			return;
		}
		loadSessionDetail(selectedSessionId);
	});

	$effect(() => {
		if (!browser || hasLoadedEvalScenarios) return;
		hasLoadedEvalScenarios = true;
		loadEvalScenarios();
	});

	function turnEventName(event: TimelineEvent): string {
		if (event.type !== 'turn_event') return '';
		return stringValue(payloadField(event.payload ?? {}, 'event_type'));
	}

	function isReplayVisibleEvent(event: TimelineEvent): boolean {
		if (event.type !== 'turn_event') return true;
		return turnEventName(event) !== 'prompt_snapshot_created';
	}

	const replayTimeline = $derived.by(() => {
		if (!sessionDetail?.timeline?.length) return [] as TimelineEvent[];
		return sessionDetail.timeline.filter(isReplayVisibleEvent);
	});

	const visibleTimeline = $derived.by(() => {
		if (!replayTimeline.length) return [] as TimelineEvent[];
		const query = timelineSearch.trim().toLowerCase();
		return replayTimeline.filter((event) => {
			if (!eventTypeFilters[event.type]) return false;
			if (showOnlyErrors && event.severity !== 'error') return false;
			if (!query) return true;
			const haystack =
				`${event.title} ${event.summary} ${JSON.stringify(event.payload ?? {})}`.toLowerCase();
			return haystack.includes(query);
		});
	});

	const visibleTimelineGroups = $derived.by(() => {
		if (!sessionDetail) return [] as TimelineGroup[];

		const turnGroups = new Map<number, TimelineGroup>();
		const turnRunByIndex = new Map<number, SessionTurnRun>(
			sessionDetail.turn_runs.map((run) => [run.turn_index, run])
		);
		const groups: TimelineGroup[] = [];

		for (const event of [...visibleTimeline].sort(compareTimelineEvents)) {
			if (event.turn_index === null) {
				groups.push(createStandaloneTimelineGroup(event));
				continue;
			}

			let group = turnGroups.get(event.turn_index);
			if (!group) {
				group = createTurnTimelineGroup(
					event.turn_index,
					turnRunByIndex.get(event.turn_index) ?? null,
					event.type === 'turn_run' ? event : null
				);
				turnGroups.set(event.turn_index, group);
				groups.push(group);
			}

			if (event.type === 'turn_run') {
				group.title = event.title;
				group.summary = event.summary;
				group.timestamp = event.timestamp;
				group.severity = event.severity;
				continue;
			}

			group.items.push(event);
			applyEventToTimelineGroup(group.counts, event);
		}

		return groups.sort(compareTimelineGroups);
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
			const requestedSessionId = browser
				? currentSessionIdFromUrl()
				: $page.url.searchParams.get(CHAT_SESSION_QUERY_PARAM)?.trim() || null;

			if (sessions.length === 0) {
				if (selectedSessionId && selectedSessionId === requestedSessionId) {
					return;
				}
				clearSessionDetailSelection();
				return;
			}

			if (
				selectedSessionId &&
				!requestedSessionId &&
				!sessions.some((session) => session.id === selectedSessionId)
			) {
				clearSessionDetailSelection();
			}
		} catch (err) {
			console.error('Failed loading sessions', err);
			sessionsError = err instanceof Error ? err.message : 'Failed to load sessions';
		} finally {
			isLoadingSessions = false;
		}
	}

	async function loadSessionDetail(sessionId: string) {
		const requestId = ++sessionDetailRequestId;
		isLoadingDetail = true;
		detailError = null;
		expandedEventIds = new Set();

		try {
			const detail = await fetchChatSessionAuditPayload(sessionId);
			if (requestId !== sessionDetailRequestId || selectedSessionId !== sessionId) {
				return;
			}
			sessionDetail = detail;
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
			if (requestId !== sessionDetailRequestId || selectedSessionId !== sessionId) {
				return;
			}
			console.error('Failed loading session detail', err);
			detailError = err instanceof Error ? err.message : 'Failed to load session detail';
			sessionDetail = null;
		} finally {
			if (requestId === sessionDetailRequestId && selectedSessionId === sessionId) {
				isLoadingDetail = false;
			}
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
				selectSessionDetail(sessionId);
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

	function sessionDetailUrl(sessionId: string | null) {
		const url = browser ? new URL(window.location.href) : new URL($page.url);
		if (sessionId) {
			url.searchParams.set(CHAT_SESSION_QUERY_PARAM, sessionId);
		} else {
			url.searchParams.delete(CHAT_SESSION_QUERY_PARAM);
		}
		return `${url.pathname}${url.search}${url.hash}`;
	}

	function syncSessionDetailUrl(sessionId: string | null) {
		if (!browser) return;
		const currentSessionId = currentSessionIdFromUrl();
		if (currentSessionId === sessionId) return;
		try {
			replaceState(sessionDetailUrl(sessionId), $page.state);
		} catch (err) {
			console.error('Failed syncing chat session detail URL', err);
		}
	}

	function selectSessionDetail(sessionId: string) {
		selectedSessionId = sessionId;
		isSessionDetailModalOpen = true;
		syncSessionDetailUrl(sessionId);
	}

	function clearSessionDetailSelection() {
		isSessionDetailModalOpen = false;
		selectedSessionId = null;
		sessionDetail = null;
		syncSessionDetailUrl(null);
	}

	function openSessionDetail(sessionId: string) {
		selectSessionDetail(sessionId);
	}

	function closeSessionDetail() {
		clearSessionDetailSelection();
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

	function toNumericValue(value: unknown): number | null {
		const numericValue = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(numericValue) ? numericValue : null;
	}

	function truncateText(value: string, max = 220): string {
		const normalized = value.replace(/\s+/g, ' ').trim();
		if (!normalized) return '';
		if (normalized.length <= max) return normalized;
		return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
	}

	function pluralize(count: number, singular: string, plural = `${singular}s`): string {
		return count === 1 ? singular : plural;
	}

	function timelineEventPriority(event: TimelineEvent): number {
		switch (event.type) {
			case 'session':
				return 0;
			case 'message':
				return 1;
			case 'prompt_snapshot':
				return 2;
			case 'llm_call':
				return 3;
			case 'turn_event':
				return 4;
			case 'tool_execution':
				return 5;
			case 'operation':
				return 6;
			case 'eval_run':
				return 7;
			case 'context_shift':
				return 8;
			case 'timing':
				return 9;
			case 'turn_run':
			default:
				return 10;
		}
	}

	function timelineEventSequence(event: TimelineEvent): number | null {
		const payload = event.payload ?? {};
		return toNumericValue(payloadField(payload, 'sequence_index'));
	}

	function compareTimelineEvents(a: TimelineEvent, b: TimelineEvent): number {
		if (a.timestamp !== b.timestamp) {
			return a.timestamp < b.timestamp ? -1 : 1;
		}

		const aSequence = timelineEventSequence(a);
		const bSequence = timelineEventSequence(b);
		if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
			return aSequence - bSequence;
		}
		if (aSequence !== null && bSequence === null) return -1;
		if (aSequence === null && bSequence !== null) return 1;

		const priorityDifference = timelineEventPriority(a) - timelineEventPriority(b);
		if (priorityDifference !== 0) return priorityDifference;

		return a.id.localeCompare(b.id);
	}

	function compareTimelineGroups(a: TimelineGroup, b: TimelineGroup): number {
		if (a.timestamp !== b.timestamp) {
			return a.timestamp < b.timestamp ? -1 : 1;
		}

		if (a.turnIndex !== null && b.turnIndex !== null && a.turnIndex !== b.turnIndex) {
			return a.turnIndex - b.turnIndex;
		}

		if (a.turnIndex === null && b.turnIndex !== null) return -1;
		if (a.turnIndex !== null && b.turnIndex === null) return 1;

		return a.id.localeCompare(b.id);
	}

	function createEmptyTimelineGroupCounts(): TimelineGroupCounts {
		return {
			total: 0,
			messages: 0,
			promptSnapshots: 0,
			llmCalls: 0,
			toolExecutions: 0,
			turnEvents: 0,
			operations: 0,
			evalRuns: 0,
			errors: 0
		};
	}

	function applyEventToTimelineGroup(counts: TimelineGroupCounts, event: TimelineEvent): void {
		counts.total += 1;

		switch (event.type) {
			case 'message':
				counts.messages += 1;
				break;
			case 'prompt_snapshot':
				counts.promptSnapshots += 1;
				break;
			case 'llm_call':
				counts.llmCalls += 1;
				break;
			case 'tool_execution':
				counts.toolExecutions += 1;
				break;
			case 'turn_event':
				counts.turnEvents += 1;
				break;
			case 'operation':
				counts.operations += 1;
				break;
			case 'eval_run':
				counts.evalRuns += 1;
				break;
		}

		if (event.severity === 'error') {
			counts.errors += 1;
		}
	}

	function createStandaloneTimelineGroup(event: TimelineEvent): TimelineGroup {
		const counts = createEmptyTimelineGroupCounts();
		applyEventToTimelineGroup(counts, event);

		return {
			id: `standalone:${event.id}`,
			kind: 'standalone',
			title: event.title,
			summary: event.summary,
			timestamp: event.timestamp,
			severity: event.severity,
			turnIndex: event.turn_index,
			run: null,
			items: [event],
			counts
		};
	}

	function createTurnTimelineGroup(
		turnIndex: number,
		run: SessionTurnRun | null,
		headerEvent: TimelineEvent | null
	): TimelineGroup {
		return {
			id: `turn:${turnIndex}`,
			kind: 'turn',
			title: headerEvent?.title ?? `Turn ${turnIndex}: ${run?.status ?? 'recorded'}`,
			summary: headerEvent?.summary ?? '',
			timestamp: headerEvent?.timestamp ?? run?.started_at ?? '',
			severity:
				headerEvent?.severity ??
				(run?.status === 'failed'
					? 'error'
					: run?.status === 'cancelled'
						? 'warning'
						: 'info'),
			turnIndex,
			run,
			items: [],
			counts: createEmptyTimelineGroupCounts()
		};
	}

	function groupRequestPreview(group: TimelineGroup): string {
		if (group.kind !== 'turn') {
			return truncateText(group.summary || group.items[0]?.summary || '');
		}

		const userMessage = group.items.find((event) => {
			if (event.type !== 'message') return false;
			return stringValue(payloadField(event.payload ?? {}, 'role')) === 'user';
		});

		const requestText =
			stringValue(payloadField(userMessage?.payload ?? {}, 'content')) ||
			group.run?.request_message ||
			group.summary;

		return truncateText(requestText, 260);
	}

	function toolTracePayload(payload: Record<string, unknown>): Record<string, unknown> | null {
		const traceEntry = payloadField(payload, 'trace_entry');
		if (!traceEntry || typeof traceEntry !== 'object' || Array.isArray(traceEntry)) {
			return null;
		}
		return traceEntry as Record<string, unknown>;
	}

	function preferredToolPayloadValue(payload: Record<string, unknown>, keys: string[]): unknown {
		for (const key of keys) {
			const directValue = payloadField(payload, key);
			if (directValue !== undefined && directValue !== null && directValue !== '') {
				return directValue;
			}
		}

		const tracePayload = toolTracePayload(payload);
		if (!tracePayload) return undefined;

		for (const key of keys) {
			const traceValue = tracePayload[key];
			if (traceValue !== undefined && traceValue !== null && traceValue !== '') {
				return traceValue;
			}
		}

		return undefined;
	}

	function toolDisplayName(payload: Record<string, unknown>): string {
		return (
			stringValue(preferredToolPayloadValue(payload, ['tool_name', 'op', 'gateway_op'])) ||
			'-'
		);
	}

	function toolDisplaySuccess(payload: Record<string, unknown>): boolean | null {
		const successValue = preferredToolPayloadValue(payload, ['success']);
		return typeof successValue === 'boolean' ? successValue : null;
	}

	function toolDisplayDuration(payload: Record<string, unknown>): unknown {
		return preferredToolPayloadValue(payload, ['execution_time_ms', 'duration_ms']);
	}

	function toolDisplayTokens(payload: Record<string, unknown>): number {
		return toNumericValue(preferredToolPayloadValue(payload, ['tokens_consumed'])) ?? 0;
	}

	function toolDisplayArguments(payload: Record<string, unknown>): unknown {
		const argumentsValue = payloadField(payload, 'arguments');
		if (argumentsValue !== undefined) return argumentsValue;
		return preferredToolPayloadValue(payload, ['args', 'arguments']);
	}

	function toolDisplayResult(payload: Record<string, unknown>): unknown {
		const resultValue = payloadField(payload, 'result');
		if (resultValue !== undefined) return resultValue;
		return preferredToolPayloadValue(payload, ['result']);
	}

	function toolDisplayError(payload: Record<string, unknown>): string {
		return stringValue(preferredToolPayloadValue(payload, ['error_message', 'error'])) || '';
	}

	function isTraceToolPayload(payload: Record<string, unknown>): boolean {
		return stringValue(payloadField(payload, 'source')) === 'assistant_message_metadata';
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

	function timelineEventToolCallId(event: TimelineEvent): string {
		return stringValue(payloadField(event.payload ?? {}, 'tool_call_id'));
	}

	function isToolCallEmittedEvent(event: TimelineEvent): boolean {
		return event.type === 'turn_event' && turnEventName(event) === 'tool_call_emitted';
	}

	function isToolOutcomeEvent(event: TimelineEvent): boolean {
		if (event.type !== 'turn_event') return false;
		const eventName = turnEventName(event);
		return eventName === 'tool_result_received' || eventName === 'tool_call_validation_failed';
	}

	function isToolDetailTurnEvent(event: TimelineEvent): boolean {
		if (event.type !== 'turn_event') return false;
		const eventName = turnEventName(event);
		return (
			eventName === 'tool_call_emitted' ||
			eventName === 'tool_result_received' ||
			eventName === 'tool_call_validation_failed'
		);
	}

	function findMatchingToolOutcomeEvent(
		events: TimelineEvent[],
		emittedIndex: number
	): TimelineEvent | null {
		const emittedEvent = events[emittedIndex];
		if (!emittedEvent || !isToolCallEmittedEvent(emittedEvent)) return null;
		const toolCallId = timelineEventToolCallId(emittedEvent);
		if (!toolCallId) return null;

		for (let index = emittedIndex + 1; index < events.length; index += 1) {
			const candidate = events[index];
			if (!candidate || !isToolOutcomeEvent(candidate)) continue;
			if (timelineEventToolCallId(candidate) !== toolCallId) continue;
			return candidate;
		}

		return null;
	}

	function shouldHideMergedToolOutcomeEvent(
		events: TimelineEvent[],
		outcomeIndex: number
	): boolean {
		const outcomeEvent = events[outcomeIndex];
		if (!outcomeEvent || !isToolOutcomeEvent(outcomeEvent)) return false;
		const toolCallId = timelineEventToolCallId(outcomeEvent);
		if (!toolCallId) return false;

		for (let index = outcomeIndex - 1; index >= 0; index -= 1) {
			const candidate = events[index];
			if (!candidate || !isToolCallEmittedEvent(candidate)) continue;
			if (timelineEventToolCallId(candidate) !== toolCallId) continue;
			return findMatchingToolOutcomeEvent(events, index)?.id === outcomeEvent.id;
		}

		return false;
	}

	function mergeToolLifecyclePayload(
		emittedEvent: TimelineEvent,
		outcomeEvent: TimelineEvent | null
	): Record<string, unknown> {
		const emittedPayload = (emittedEvent.payload ?? {}) as Record<string, unknown>;
		if (!outcomeEvent) {
			return emittedPayload;
		}

		const outcomePayload = (outcomeEvent.payload ?? {}) as Record<string, unknown>;
		return {
			...emittedPayload,
			...outcomePayload,
			arguments:
				payloadField(emittedPayload, 'arguments') ??
				payloadField(outcomePayload, 'arguments'),
			result: payloadField(outcomePayload, 'result'),
			error: payloadField(outcomePayload, 'error'),
			success: payloadField(outcomePayload, 'success'),
			duration_ms: payloadField(outcomePayload, 'duration_ms'),
			tool_result_source: payloadField(outcomePayload, 'tool_result_source'),
			emitted_event_type: turnEventName(emittedEvent),
			outcome_event_type: turnEventName(outcomeEvent),
			emitted_sequence_index: payloadField(emittedPayload, 'sequence_index'),
			outcome_sequence_index: payloadField(outcomePayload, 'sequence_index'),
			emitted_phase: payloadField(emittedPayload, 'phase'),
			outcome_phase: payloadField(outcomePayload, 'phase'),
			emitted_at: emittedEvent.timestamp,
			outcome_at: outcomeEvent.timestamp
		};
	}

	function mergeToolLifecycleRawPayload(
		emittedEvent: TimelineEvent,
		outcomeEvent: TimelineEvent | null
	): Record<string, unknown> {
		return {
			tool_call_emitted: emittedEvent.payload ?? null,
			tool_outcome: outcomeEvent?.payload ?? null
		};
	}

	function toolLifecycleTitle(
		payload: Record<string, unknown>,
		outcomeEvent: TimelineEvent | null
	): string {
		const toolName = toolDisplayName(payload);
		if (!outcomeEvent) {
			return `Tool Call: ${toolName}`;
		}

		const success = toolDisplaySuccess(payload);
		if (success === false) {
			return `Tool Call Failed: ${toolName}`;
		}

		if (success === true) {
			return `Tool Call Completed: ${toolName}`;
		}

		return `Tool Call: ${toolName}`;
	}

	function toolLifecycleSummary(
		payload: Record<string, unknown>,
		outcomeEvent: TimelineEvent | null
	): string {
		const parts = [
			stringValue(payloadField(payload, 'canonical_op'))
				? `op=${stringValue(payloadField(payload, 'canonical_op'))}`
				: null,
			toolDisplaySuccess(payload) === true
				? 'completed'
				: toolDisplaySuccess(payload) === false
					? 'failed'
					: outcomeEvent
						? 'returned'
						: 'pending',
			toolDisplayDuration(payload) ? formatDuration(toolDisplayDuration(payload)) : null,
			toolDisplayError(payload) ? `error=${toolDisplayError(payload)}` : null
		]
			.filter(Boolean)
			.join(' • ');

		return parts || 'Tool call';
	}

	function toolLifecycleDisplayState(
		events: TimelineEvent[],
		index: number
	): ToolLifecycleDisplayState {
		const event = events[index];
		const payload = (event?.payload ?? {}) as Record<string, unknown>;

		if (!event) {
			return {
				outcomeEvent: null,
				hideEvent: false,
				displayPayload: payload,
				displayRawPayload: payload,
				displayTitle: '',
				displaySummary: '',
				displaySeverity: 'info',
				displayTimestamp: '',
				displayBadgeLabel: 'Event',
				displayIconType: 'turn_event',
				displayEventId: ''
			};
		}

		if (shouldHideMergedToolOutcomeEvent(events, index)) {
			return {
				outcomeEvent: null,
				hideEvent: true,
				displayPayload: payload,
				displayRawPayload: payload,
				displayTitle: event.title,
				displaySummary: event.summary,
				displaySeverity: event.severity,
				displayTimestamp: event.timestamp,
				displayBadgeLabel: eventTypeLabel(event.type),
				displayIconType: event.type,
				displayEventId: event.id
			};
		}

		if (!isToolCallEmittedEvent(event)) {
			return {
				outcomeEvent: null,
				hideEvent: false,
				displayPayload: payload,
				displayRawPayload: payload,
				displayTitle: event.title,
				displaySummary: event.summary,
				displaySeverity: event.severity,
				displayTimestamp: event.timestamp,
				displayBadgeLabel: eventTypeLabel(event.type),
				displayIconType: event.type,
				displayEventId: event.id
			};
		}

		const outcomeEvent = findMatchingToolOutcomeEvent(events, index);
		const mergedPayload = mergeToolLifecyclePayload(event, outcomeEvent);

		return {
			outcomeEvent,
			hideEvent: false,
			displayPayload: mergedPayload,
			displayRawPayload: mergeToolLifecycleRawPayload(event, outcomeEvent),
			displayTitle: toolLifecycleTitle(mergedPayload, outcomeEvent),
			displaySummary: toolLifecycleSummary(mergedPayload, outcomeEvent),
			displaySeverity: outcomeEvent?.severity ?? event.severity,
			displayTimestamp: event.timestamp,
			displayBadgeLabel: 'Tool',
			displayIconType: 'tool_execution',
			displayEventId: outcomeEvent ? `tool-pair:${event.id}:${outcomeEvent.id}` : event.id
		};
	}

	function displayedGroupItemCount(group: TimelineGroup): number {
		return group.items.reduce((count, _event, index) => {
			return count + (toolLifecycleDisplayState(group.items, index).hideEvent ? 0 : 1);
		}, 0);
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

	<div class="sessions-workspace min-w-0">
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
				<div class="text-xs text-muted-foreground">Page {currentPage} · Opens in modal</div>
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
							aria-haspopup="dialog"
							aria-expanded={selectedSessionId === session.id}
							onclick={() => openSessionDetail(session.id)}
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

		<Modal
			bind:isOpen={isSessionDetailModalOpen}
			title="Chat Session Detail"
			size="xl"
			ariaLabel="Chat session detail"
			customClasses="!max-h-[94dvh] xl:!max-w-7xl"
			onClose={closeSessionDetail}
		>
			{#if isLoadingDetail}
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
				<div class="flex flex-col">
					<div class="p-3 border-b border-border space-y-3 bg-card">
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
										sessionDetail.turn_runs.filter(
											(run) => !!run.prompt_snapshot
										).length
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

						<div class="rounded-lg border border-border bg-background px-3 py-2">
							<div
								class="text-xs font-semibold text-foreground/60 uppercase tracking-wide"
							>
								Replay View
							</div>
							<div class="mt-1 text-xs text-muted-foreground">
								Grouped by session event and turn. Open a turn to inspect the
								request, prompt snapshot, LLM calls, tool activity, and raw payloads
								together.
							</div>
						</div>

						<div class="rounded-lg border border-border bg-background p-2.5 space-y-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div>
									<div
										class="text-xs font-semibold text-foreground/60 uppercase tracking-wide"
									>
										Replay Filters
									</div>
									<div class="mt-1 text-xs text-muted-foreground">
										Showing {formatNumber(visibleTimeline.length)} of {formatNumber(
											replayTimeline.length
										)} events across {formatNumber(
											visibleTimelineGroups.length
										)}
										expandable sections
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

					<div class="p-3">
						{#if visibleTimeline.length === 0}
							<div class="text-sm text-muted-foreground text-center py-8">
								No timeline events match the current filters.
							</div>
						{:else}
							<div class="space-y-3">
								{#each visibleTimelineGroups as group}
									{@const run = group.run}
									<details
										class="rounded-xl border border-border bg-background shadow-ink overflow-hidden"
									>
										<summary class="cursor-pointer list-none p-3">
											<div
												class="flex flex-wrap items-start justify-between gap-3"
											>
												{#if group.kind === 'turn' && run}
													<div class="min-w-0 flex-1">
														<div
															class="flex flex-wrap items-center gap-1.5"
														>
															<span
																class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground/80"
															>
																Turn {group.turnIndex}
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
															{#if run.first_canonical_op}
																<span
																	class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-background border border-border text-foreground/80"
																>
																	op={run.first_canonical_op}
																</span>
															{/if}
															{#if run.validation_failure_count > 0}
																<span
																	class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300"
																>
																	{formatNumber(
																		run.validation_failure_count
																	)}
																	validation
																</span>
															{/if}
														</div>
														<div
															class="mt-2 text-sm font-semibold text-foreground"
														>
															{group.title}
														</div>
														<div
															class="mt-1 text-sm text-foreground/80 line-clamp-2"
														>
															{groupRequestPreview(group) ||
																'(empty request)'}
														</div>
														<div
															class="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground"
														>
															<span
																class="rounded-full bg-muted px-2 py-0.5"
															>
																{formatNumber(run.tool_call_count)}
																{pluralize(
																	run.tool_call_count,
																	'tool call'
																)}
															</span>
															<span
																class="rounded-full bg-muted px-2 py-0.5"
															>
																{formatNumber(run.llm_pass_count)} LLM
																{pluralize(
																	run.llm_pass_count,
																	'pass',
																	'passes'
																)}
															</span>
															<span
																class="rounded-full bg-muted px-2 py-0.5"
															>
																{formatNumber(
																	displayedGroupItemCount(group)
																)} visible
																{pluralize(
																	displayedGroupItemCount(group),
																	'event'
																)}
															</span>
															{#if group.counts.errors > 0}
																<span
																	class="rounded-full bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300"
																>
																	{formatNumber(
																		group.counts.errors
																	)}
																	{pluralize(
																		group.counts.errors,
																		'error'
																	)}
																</span>
															{/if}
														</div>
													</div>
												{:else}
													{@const headerEvent = group.items[0]}
													{@const HeaderIcon = eventIcon(
														headerEvent?.type ?? 'session'
													)}
													<div class="min-w-0 flex-1">
														<div
															class="flex flex-wrap items-center gap-1.5"
														>
															<span
																class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium {eventSeverityClasses(
																	group.severity
																)}"
															>
																<HeaderIcon class="h-3 w-3" />
																{eventTypeLabel(
																	headerEvent?.type ?? 'session'
																)}
															</span>
														</div>
														<div
															class="mt-2 text-sm font-semibold text-foreground"
														>
															{group.title}
														</div>
														<div
															class="mt-1 text-sm text-foreground/75 line-clamp-2"
														>
															{group.summary}
														</div>
													</div>
												{/if}
												<div class="shrink-0 text-right">
													<div class="text-xs text-muted-foreground">
														{formatDateTime(group.timestamp)}
													</div>
												</div>
											</div>
										</summary>

										<div
											class="border-t border-border bg-card/40 p-3 space-y-3"
										>
											{#if group.kind === 'turn' && run}
												<div
													class="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
												>
													<div class="flex flex-wrap gap-x-3 gap-y-1">
														{#if run.first_skill_path}
															<span class="break-all">
																<span class="text-foreground/60"
																	>First skill:</span
																>
																{run.first_skill_path}
															</span>
														{/if}
														{#if run.history_strategy}
															<span>
																<span class="text-foreground/60"
																	>History:</span
																>
																{run.history_strategy} / {formatNumber(
																	run.history_for_model_count
																)}
															</span>
														{/if}
														{#if run.cache_source}
															<span>
																<span class="text-foreground/60"
																	>Cache:</span
																>
																{run.cache_source} / {formatNumber(
																	run.cache_age_seconds
																)}s
															</span>
														{/if}
														{#if run.finished_reason}
															<span>
																<span class="text-foreground/60"
																	>Reason:</span
																>
																{run.finished_reason}
															</span>
														{/if}
													</div>
													<div
														class="mt-1 flex flex-wrap gap-x-3 gap-y-1"
													>
														<span>
															<span class="text-foreground/60"
																>Started:</span
															>
															{formatDateTime(run.started_at)}
														</span>
														{#if run.finished_at}
															<span>
																<span class="text-foreground/60"
																	>Finished:</span
																>
																{formatDateTime(run.finished_at)}
															</span>
														{/if}
													</div>
												</div>
											{/if}

											{#if group.items.length > 0}
												<div class="relative pl-2">
													<div
														class="absolute left-[8px] top-0 bottom-0 w-px bg-border"
													></div>
													<div class="space-y-2">
														{#each group.items as event, eventIndex}
															{@const lifecycleState =
																toolLifecycleDisplayState(
																	group.items,
																	eventIndex
																)}
															{#if !lifecycleState.hideEvent}
																{@const EventIcon = eventIcon(
																	lifecycleState.displayIconType
																)}
																{@const payload =
																	lifecycleState.displayPayload}
																{@const rawPayload =
																	lifecycleState.displayRawPayload}
																{@const isMergedToolLifecycle =
																	isToolCallEmittedEvent(event) &&
																	!!lifecycleState.outcomeEvent}
																{@const isToolDisplay =
																	event.type ===
																		'tool_execution' ||
																	isMergedToolLifecycle}
																{@const isStandaloneToolTurnEvent =
																	isToolDetailTurnEvent(event) &&
																	!isMergedToolLifecycle}
																{@const toolSuccess = isToolDisplay
																	? toolDisplaySuccess(payload)
																	: null}
																{@const toolArguments =
																	isToolDisplay
																		? toolDisplayArguments(
																				payload
																			)
																		: undefined}
																{@const toolResult = isToolDisplay
																	? toolDisplayResult(payload)
																	: undefined}
																{@const toolError = isToolDisplay
																	? toolDisplayError(payload)
																	: ''}
																{@const turnEventToolSuccess =
																	isStandaloneToolTurnEvent
																		? toolDisplaySuccess(
																				payload
																			)
																		: null}
																{@const turnEventToolArguments =
																	isStandaloneToolTurnEvent
																		? toolDisplayArguments(
																				payload
																			)
																		: undefined}
																{@const turnEventToolResult =
																	isStandaloneToolTurnEvent
																		? toolDisplayResult(payload)
																		: undefined}
																{@const turnEventToolError =
																	isStandaloneToolTurnEvent
																		? toolDisplayError(payload)
																		: ''}
																{@const turnEventToolResultSource =
																	isStandaloneToolTurnEvent
																		? stringValue(
																				payloadField(
																					payload,
																					'tool_result_source'
																				)
																			)
																		: ''}
																<div class="relative pl-7">
																	<div
																		class="absolute left-[2px] top-3.5 h-3 w-3 rounded-full ring-2 ring-card {timelineDotClasses(
																			lifecycleState.displaySeverity
																		)}"
																	></div>
																	<div
																		class="rounded-lg border border-border bg-background p-2.5 shadow-ink"
																	>
																		<div
																			class="flex flex-wrap items-center justify-between gap-2 mb-1.5"
																		>
																			<div
																				class="flex items-center gap-2"
																			>
																				<span
																					class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium {eventSeverityClasses(
																						lifecycleState.displaySeverity
																					)}"
																				>
																					<EventIcon
																						class="h-3 w-3"
																					/>
																					{lifecycleState.displayBadgeLabel}
																				</span>
																				{#if event.turn_index}
																					<span
																						class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground/70"
																					>
																						Turn {event.turn_index}
																					</span>
																				{/if}
																			</div>
																			<span
																				class="text-xs text-muted-foreground"
																			>
																				{formatDateTime(
																					lifecycleState.displayTimestamp
																				)}
																			</span>
																		</div>

																		<div
																			class="text-sm font-semibold text-foreground"
																		>
																			{lifecycleState.displayTitle}
																		</div>
																		<div
																			class="text-sm text-foreground/75 mt-1 whitespace-pre-wrap break-words"
																		>
																			{lifecycleState.displaySummary}
																		</div>

																		{#if event.type === 'message'}
																			<div
																				class="mt-2 rounded-lg border px-2.5 py-2 text-sm whitespace-pre-wrap break-words {stringValue(
																					payloadField(
																						payload,
																						'role'
																					)
																				) === 'user'
																					? 'bg-accent/8 border-accent/20'
																					: stringValue(
																								payloadField(
																									payload,
																									'role'
																								)
																						  ) ===
																						  'assistant'
																						? 'bg-emerald-500/8 border-emerald-500/20'
																						: 'bg-muted/40 border-border'}"
																			>
																				<div
																					class="text-xs text-foreground/60 uppercase tracking-wide font-semibold mb-1"
																				>
																					{stringValue(
																						payloadField(
																							payload,
																							'role'
																						)
																					) || 'message'}
																				</div>
																				{stringValue(
																					payloadField(
																						payload,
																						'content'
																					)
																				) || '(empty)'}
																			</div>
																			<div
																				class="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/70"
																			>
																				<span>
																					Tokens: {formatNumber(
																						Number(
																							payloadField(
																								payload,
																								'total_tokens'
																							) || 0
																						)
																					)}
																				</span>
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

																		{#if isToolDisplay}
																			<div
																				class="mt-2 flex flex-wrap items-center gap-1.5"
																			>
																				{#if isTraceToolPayload(payload)}
																					<span
																						class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground/70"
																					>
																						Trace
																					</span>
																				{/if}
																				{#if toolError}
																					<span
																						class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-700 dark:text-red-300"
																					>
																						Error
																					</span>
																				{/if}
																			</div>
																			<div
																				class="mt-2 grid grid-cols-2 gap-1.5 text-xs"
																			>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Tool
																					</div>
																					<div
																						class="font-semibold text-foreground break-all"
																					>
																						{toolDisplayName(
																							payload
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Duration
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatDuration(
																							toolDisplayDuration(
																								payload
																							)
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Success
																					</div>
																					<div
																						class="font-semibold {toolSuccess ===
																						false
																							? 'text-red-600 dark:text-red-400'
																							: toolSuccess ===
																								  true
																								? 'text-emerald-600 dark:text-emerald-400'
																								: 'text-foreground'}"
																					>
																						{toolSuccess ===
																						null
																							? '-'
																							: toolSuccess
																								? 'true'
																								: 'false'}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Tool Tokens
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatNumber(
																							toolDisplayTokens(
																								payload
																							)
																						)}
																					</div>
																				</div>
																			</div>
																			{#if toolError}
																				<div
																					class="mt-2 text-xs text-red-600 dark:text-red-400"
																				>
																					{toolError}
																				</div>
																			{/if}
																			{#if toolArguments !== undefined}
																				<details
																					class="mt-2 rounded border border-border bg-card p-2 text-xs"
																				>
																					<summary
																						class="cursor-pointer font-medium text-foreground"
																					>
																						Tool
																						Arguments
																					</summary>
																					<pre
																						class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
																							toolArguments
																						)}</pre>
																				</details>
																			{/if}
																			{#if toolResult !== undefined}
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
																							toolResult
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
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Model
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{stringValue(
																							payloadField(
																								payload,
																								'model_used'
																							)
																						) || '-'}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Provider
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{stringValue(
																							payloadField(
																								payload,
																								'provider'
																							)
																						) || '-'}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Tokens
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatNumber(
																							Number(
																								payloadField(
																									payload,
																									'total_tokens'
																								) ||
																									0
																							)
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Cost
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatCurrency(
																							Number(
																								payloadField(
																									payload,
																									'total_cost_usd'
																								) ||
																									0
																							)
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Latency
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
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
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Lane
																					</div>
																					<div
																						class="font-semibold text-foreground break-all"
																					>
																						{stringValue(
																							payloadField(
																								payload,
																								'first_lane'
																							)
																						) || '-'}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
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
																					<div
																						class="text-foreground/60 font-medium"
																					>
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
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Validation
																						Failures
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatNumber(
																							Number(
																								payloadField(
																									payload,
																									'validation_failure_count'
																								) ||
																									0
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
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Approx
																						Tokens
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatNumber(
																							Number(
																								payloadField(
																									payload,
																									'approx_prompt_tokens'
																								) ||
																									0
																							)
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						System Chars
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatNumber(
																							Number(
																								payloadField(
																									payload,
																									'system_prompt_chars'
																								) ||
																									0
																							)
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Message
																						Chars
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{formatNumber(
																							Number(
																								payloadField(
																									payload,
																									'message_chars'
																								) ||
																									0
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
																						Rendered
																						Prompt Dump
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
																			{#if isMergedToolLifecycle}
																				<div
																					class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
																				>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Emitted
																							Seq
																						</div>
																						<div
																							class="font-semibold text-foreground"
																						>
																							{formatNumber(
																								Number(
																									payloadField(
																										payload,
																										'emitted_sequence_index'
																									) ||
																										0
																								)
																							)}
																						</div>
																					</div>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Returned
																							Seq
																						</div>
																						<div
																							class="font-semibold text-foreground"
																						>
																							{formatNumber(
																								Number(
																									payloadField(
																										payload,
																										'outcome_sequence_index'
																									) ||
																										0
																								)
																							)}
																						</div>
																					</div>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Tool
																							Call ID
																						</div>
																						<div
																							class="font-semibold text-foreground break-all"
																						>
																							{stringValue(
																								payloadField(
																									payload,
																									'tool_call_id'
																								)
																							) ||
																								'-'}
																						</div>
																					</div>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Result
																							Source
																						</div>
																						<div
																							class="font-semibold text-foreground break-all"
																						>
																							{stringValue(
																								payloadField(
																									payload,
																									'tool_result_source'
																								)
																							) ||
																								'-'}
																						</div>
																					</div>
																				</div>
																				<div
																					class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
																				>
																					<span>
																						Started: {formatDateTime(
																							stringValue(
																								payloadField(
																									payload,
																									'emitted_at'
																								)
																							)
																						)}
																					</span>
																					{#if payloadField(payload, 'outcome_at')}
																						<span>
																							Returned:
																							{formatDateTime(
																								stringValue(
																									payloadField(
																										payload,
																										'outcome_at'
																									)
																								)
																							)}
																						</span>
																					{/if}
																				</div>
																			{:else}
																				<div
																					class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
																				>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Phase
																						</div>
																						<div
																							class="font-semibold text-foreground"
																						>
																							{stringValue(
																								payloadField(
																									payload,
																									'phase'
																								)
																							) ||
																								'-'}
																						</div>
																					</div>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Sequence
																						</div>
																						<div
																							class="font-semibold text-foreground"
																						>
																							{formatNumber(
																								Number(
																									payloadField(
																										payload,
																										'sequence_index'
																									) ||
																										0
																								)
																							)}
																						</div>
																					</div>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Event
																							Type
																						</div>
																						<div
																							class="font-semibold text-foreground break-all"
																						>
																							{stringValue(
																								payloadField(
																									payload,
																									'event_type'
																								)
																							) ||
																								'-'}
																						</div>
																					</div>
																					<div
																						class="rounded border border-border bg-card px-2 py-1.5"
																					>
																						<div
																							class="text-foreground/60 font-medium"
																						>
																							Stream
																							Run
																						</div>
																						<div
																							class="font-semibold text-foreground break-all"
																						>
																							{stringValue(
																								payloadField(
																									payload,
																									'stream_run_id'
																								)
																							) ||
																								'-'}
																						</div>
																					</div>
																				</div>
																				{#if isStandaloneToolTurnEvent && (stringValue(payloadField(payload, 'tool_name')) || turnEventToolArguments !== undefined || turnEventToolResult !== undefined || turnEventToolError)}
																					<div
																						class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
																					>
																						<div
																							class="rounded border border-border bg-card px-2 py-1.5"
																						>
																							<div
																								class="text-foreground/60 font-medium"
																							>
																								Tool
																							</div>
																							<div
																								class="font-semibold text-foreground break-all"
																							>
																								{toolDisplayName(
																									payload
																								)}
																							</div>
																						</div>
																						<div
																							class="rounded border border-border bg-card px-2 py-1.5"
																						>
																							<div
																								class="text-foreground/60 font-medium"
																							>
																								Success
																							</div>
																							<div
																								class="font-semibold {turnEventToolSuccess ===
																								false
																									? 'text-red-600 dark:text-red-400'
																									: turnEventToolSuccess ===
																										  true
																										? 'text-emerald-600 dark:text-emerald-400'
																										: 'text-foreground'}"
																							>
																								{turnEventToolSuccess ===
																								null
																									? '-'
																									: turnEventToolSuccess
																										? 'true'
																										: 'false'}
																							</div>
																						</div>
																						<div
																							class="rounded border border-border bg-card px-2 py-1.5"
																						>
																							<div
																								class="text-foreground/60 font-medium"
																							>
																								Duration
																							</div>
																							<div
																								class="font-semibold text-foreground"
																							>
																								{formatDuration(
																									toolDisplayDuration(
																										payload
																									)
																								)}
																							</div>
																						</div>
																						<div
																							class="rounded border border-border bg-card px-2 py-1.5"
																						>
																							<div
																								class="text-foreground/60 font-medium"
																							>
																								Result
																								Source
																							</div>
																							<div
																								class="font-semibold text-foreground break-all"
																							>
																								{turnEventToolResultSource ||
																									'-'}
																							</div>
																						</div>
																					</div>
																					{#if turnEventToolError}
																						<div
																							class="mt-2 text-xs text-red-600 dark:text-red-400"
																						>
																							{turnEventToolError}
																						</div>
																					{/if}
																					{#if turnEventToolArguments !== undefined}
																						<details
																							class="mt-2 rounded border border-border bg-card p-2 text-xs"
																						>
																							<summary
																								class="cursor-pointer font-medium text-foreground"
																							>
																								Tool
																								Arguments
																							</summary>
																							<pre
																								class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
																									turnEventToolArguments
																								)}</pre>
																						</details>
																					{/if}
																					{#if turnEventToolResult !== undefined}
																						<details
																							class="mt-2 rounded border border-border bg-card p-2 text-xs"
																						>
																							<summary
																								class="cursor-pointer font-medium text-foreground"
																							>
																								Tool
																								Result
																							</summary>
																							<pre
																								class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
																									turnEventToolResult
																								)}</pre>
																						</details>
																					{/if}
																				{/if}
																			{/if}
																		{/if}

																		{#if event.type === 'eval_run'}
																			<div
																				class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs"
																			>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
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
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Status
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{stringValue(
																							payloadField(
																								payload,
																								'status'
																							)
																						) || '-'}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Passed
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
																						{payloadSummaryAssertionCount(
																							payload,
																							'passed'
																						)}
																					</div>
																				</div>
																				<div
																					class="rounded border border-border bg-card px-2 py-1.5"
																				>
																					<div
																						class="text-foreground/60 font-medium"
																					>
																						Failed
																					</div>
																					<div
																						class="font-semibold text-foreground"
																					>
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
																				onclick={() =>
																					toggleEventExpansion(
																						lifecycleState.displayEventId
																					)}
																				class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
																			>
																				{#if expandedEventIds.has(lifecycleState.displayEventId)}
																					<ChevronDown
																						class="h-3 w-3"
																					/>
																					Hide Raw Payload
																				{:else}
																					<ChevronRight
																						class="h-3 w-3"
																					/>
																					Show Raw Payload
																				{/if}
																			</button>
																			{#if expandedEventIds.has(lifecycleState.displayEventId)}
																				<pre
																					class="mt-2 bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap break-words overflow-x-auto">{prettyJson(
																						rawPayload
																					)}</pre>
																			{/if}
																		</div>
																	</div>
																</div>
															{/if}
														{/each}
													</div>
												</div>
											{:else}
												<div class="text-sm text-muted-foreground">
													No visible timeline events inside this section
													for the current filters.
												</div>
											{/if}

											{#if group.kind === 'turn' && run}
												<div
													class="rounded-lg border border-border bg-background p-2.5 space-y-2"
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
																	<option value={scenario.slug}
																		>{scenario.title}</option
																	>
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
											{/if}
										</div>
									</details>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="p-8 text-center text-sm text-muted-foreground">
					<Activity class="h-10 w-10 mb-3 mx-auto opacity-60" />
					No session detail available.
				</div>
			{/if}
		</Modal>
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
