<!-- apps/web/src/routes/admin/chat/sessions/+page.svelte -->
<script lang="ts">
	import { RefreshCw, Terminal } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import ReplayScenarioPanel from '$lib/components/admin/chat/ReplayScenarioPanel.svelte';
	import SessionDetailModal from '$lib/components/admin/chat/SessionDetailModal.svelte';
	import SessionFilters from '$lib/components/admin/chat/SessionFilters.svelte';
	import SessionList from '$lib/components/admin/chat/SessionList.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		downloadChatSessionAuditMarkdown,
		fetchChatSessionAuditPayload
	} from '$lib/services/admin/chat-session-audit-export';
	import { downloadChatSessionAuditBundle } from '$lib/services/admin/chat-session-audit-bundle';
	import type {
		AuditTimelineType as TimelineType,
		ChatSessionAuditPayload as SessionDetailPayload,
		PromptEvalScenario,
		SessionListItem
	} from '$lib/services/admin/chat-session-audit-types';
	import { buildConversationTurns } from '$lib/services/admin/chat-session-audit-conversation';
	import {
		buildLibriExtractionDisplay,
		buildLibriHandoffDisplay
	} from '$lib/services/admin/chat-session-audit-libri';
	import {
		buildReplayTimeline,
		buildVisibleTimeline,
		buildVisibleTimelineGroups
	} from '$lib/services/admin/chat-session-audit-timeline';

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
	const libriExtraction = $derived(
		buildLibriExtractionDisplay(sessionDetail?.session.extracted_entities)
	);
	const libriHandoff = $derived(
		sessionDetail ? buildLibriHandoffDisplay(sessionDetail.session.agent_metadata) : null
	);
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

	const replayTimeline = $derived.by(() => buildReplayTimeline(sessionDetail?.timeline));

	const visibleTimeline = $derived.by(() =>
		buildVisibleTimeline(replayTimeline, {
			eventTypeFilters,
			showOnlyErrors,
			search: timelineSearch
		})
	);

	const visibleTimelineGroups = $derived.by(() =>
		sessionDetail ? buildVisibleTimelineGroups(visibleTimeline, sessionDetail.turn_runs) : []
	);

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

	function handleSearchSubmit() {
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

	function exportSessionBundle() {
		if (!browser || !sessionDetail) return;
		try {
			downloadChatSessionAuditBundle(sessionDetail);
			toastService.success('Session audit bundle exported as zip');
		} catch (err) {
			console.error('Failed exporting session audit bundle', err);
			toastService.error(
				err instanceof Error ? err.message : 'Failed to export session audit bundle'
			);
		}
	}

	function updateSelectedEvalScenario(turnRunId: string, value: string) {
		selectedEvalScenarioByTurnId = {
			...selectedEvalScenarioByTurnId,
			[turnRunId]: value
		};
	}

	const conversationTurns = $derived.by(() =>
		sessionDetail ? buildConversationTurns({ detail: sessionDetail, replayTimeline }) : []
	);
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
		{#snippet actions()}
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
		{/snippet}
	</AdminPageHeader>

	<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr),minmax(23rem,0.95fr)] gap-3">
		<SessionFilters
			bind:searchQuery
			bind:selectedStatus
			bind:selectedContextType
			bind:selectedSortBy
			bind:selectedSortOrder
			onApply={handleSearchSubmit}
		/>
		<ReplayScenarioPanel
			{evalScenarios}
			{selectedReplayScenario}
			bind:selectedReplayScenarioSlug
			{isLoadingEvalScenarios}
			{isRunningReplay}
			{replayError}
			{lastReplayResult}
			onRun={runScenarioReplay}
		/>
	</div>
	<div class="sessions-workspace min-w-0">
		<SessionList
			{sessions}
			{isLoadingSessions}
			{sessionsError}
			{totalSessions}
			{currentPage}
			pageSize={PAGE_SIZE}
			{selectedSessionId}
			onOpenSession={openSessionDetail}
			onPreviousPage={previousPage}
			onNextPage={nextPage}
		/>
		<SessionDetailModal
			bind:isOpen={isSessionDetailModalOpen}
			{isLoadingDetail}
			{detailError}
			{sessionDetail}
			{libriExtraction}
			{libriHandoff}
			{conversationTurns}
			{visibleTimeline}
			{replayTimeline}
			{visibleTimelineGroups}
			{evalScenarios}
			{isLoadingEvalScenarios}
			{selectedEvalScenarioByTurnId}
			{runningEvalByTurnId}
			{evalErrorByTurnId}
			bind:showOnlyErrors
			bind:timelineSearch
			{expandedEventIds}
			{eventTypeFilters}
			{closeSessionDetail}
			{exportSessionAudit}
			{exportSessionBundle}
			{resetTimelineFilters}
			{toggleEventType}
			{toggleEventExpansion}
			{updateSelectedEvalScenario}
			{runPromptEval}
		/>
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
