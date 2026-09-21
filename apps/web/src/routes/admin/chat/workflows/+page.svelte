<!-- apps/web/src/routes/admin/chat/workflows/+page.svelte -->
<!--
	Multi-agent workflow inspector (Tasker 91).
	Deep link: /admin/chat/workflows?chat_session_id=<id>&turn_run_id=<id>
	Admin-only (layout + API). Reads the same session audit payload as /admin/chat/sessions,
	which now carries the durable workflow records; nothing here triggers execution.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, untrack } from 'svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import ConversationReplay from '$lib/components/admin/chat/ConversationReplay.svelte';
	import CopyableId from '$lib/components/admin/chat/workflow/CopyableId.svelte';
	import WorkflowCostsView from '$lib/components/admin/chat/workflow/WorkflowCostsView.svelte';
	import WorkflowEvidenceView from '$lib/components/admin/chat/workflow/WorkflowEvidenceView.svelte';
	import WorkflowFlowGraph from '$lib/components/admin/chat/workflow/WorkflowFlowGraph.svelte';
	import WorkflowNodeDetail from '$lib/components/admin/chat/workflow/WorkflowNodeDetail.svelte';
	import WorkflowRawView from '$lib/components/admin/chat/workflow/WorkflowRawView.svelte';
	import WorkflowTimelineView from '$lib/components/admin/chat/workflow/WorkflowTimelineView.svelte';
	import {
		AlertTriangle,
		Download,
		ExternalLink,
		FileArchive,
		RefreshCw,
		Workflow
	} from '$lib/icons/lucide';
	import { buildConversationTurns } from '$lib/services/admin/chat-session-audit-conversation';
	import { downloadChatSessionAuditBundle } from '$lib/services/admin/chat-session-audit-bundle';
	import {
		downloadChatSessionAuditMarkdown,
		fetchChatSessionAuditPayload
	} from '$lib/services/admin/chat-session-audit-export';
	import {
		formatDateTime,
		formatDuration
	} from '$lib/services/admin/chat-session-audit-formatters';
	import { buildReplayTimeline } from '$lib/services/admin/chat-session-audit-timeline';
	import type { ChatSessionAuditPayload } from '$lib/services/admin/chat-session-audit-types';
	import {
		downloadWorkflowAuditBundle,
		downloadWorkflowAuditMarkdown
	} from '$lib/services/admin/chat-workflow-audit-export';
	import { toastService } from '$lib/stores/toast.store';

	const SESSION_PARAM = 'chat_session_id';
	const RUN_PARAM = 'turn_run_id';
	const VIEW_PARAM = 'view';
	const NODE_PARAM = 'node';
	const POLL_MS = 6000;
	type View = 'flow' | 'timeline' | 'evidence' | 'costs' | 'transcript' | 'raw';
	const VIEWS: Array<{ id: View; label: string }> = [
		{ id: 'flow', label: 'Flow' },
		{ id: 'timeline', label: 'Timeline' },
		{ id: 'evidence', label: 'Evidence' },
		{ id: 'costs', label: 'Costs' },
		{ id: 'transcript', label: 'Transcript' },
		{ id: 'raw', label: 'Raw' }
	];

	let sessionInput = $state('');
	let sessionId = $state<string | null>(null);
	let requestedRunId = $state<string | null>(null);
	let selectedRunId = $state<string | null>(null);
	let view = $state<View>('flow');
	let selectedNodeId = $state<string | null>(null);
	let payload = $state<ChatSessionAuditPayload | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	// Set when a deep-linked turn_run_id was rejected by the server; the session still loads.
	let runWarning = $state<string | null>(null);
	let isExporting = $state(false);
	let exportMenuOpen = $state(false);
	let lastLoadedAt = $state<string | null>(null);
	// SvelteKit's router is not ready during hydration; shallow URL updates wait for mount.
	let routerReady = $state(false);
	let requestId = 0;
	onMount(() => {
		// Hydration flushes onMount before the router's own initialize() finishes; defer a tick.
		const timer = setTimeout(() => (routerReady = true), 0);
		return () => clearTimeout(timer);
	});

	const workflows = $derived(payload?.workflows ?? null);
	const runs = $derived(workflows?.runs ?? []);
	const run = $derived(runs.find((r) => r.turn_run_id === selectedRunId) ?? null);
	const ordinaryTurns = $derived(
		payload ? payload.turn_runs.filter((t) => workflows?.ordinary_turn_ids.includes(t.id)) : []
	);
	const conversationTurns = $derived.by(() => {
		if (!payload || !run) return [];
		const turns = buildConversationTurns({
			detail: payload,
			replayTimeline: buildReplayTimeline(payload.timeline)
		});
		return turns.filter((turn) => turn.run?.id === run.turn_run_id);
	});
	const sessionAuditHref = $derived(
		sessionId ? `/admin/chat/sessions?chat_session_id=${encodeURIComponent(sessionId)}` : null
	);
	const isPolling = $derived(Boolean(run && !run.is_terminal));

	function readUrl() {
		const url = browser ? new URL(window.location.href) : new URL($page.url);
		return {
			session: url.searchParams.get(SESSION_PARAM)?.trim() || null,
			run: url.searchParams.get(RUN_PARAM)?.trim() || null,
			view: (url.searchParams.get(VIEW_PARAM)?.trim() || null) as View | null,
			node: url.searchParams.get(NODE_PARAM)?.trim() || null
		};
	}

	// URL → state. The page store re-emits after our own shallow replaceState calls (with the
	// pre-update url), so read the browser location, and act only on what a real navigation
	// changes: the session, or a run other than the one this page itself put in the URL.
	$effect(() => {
		if (!browser) return;
		$page.url.href;
		const current = readUrl();
		if (current.session !== untrack(() => sessionId)) {
			sessionId = current.session;
			sessionInput = current.session ?? '';
			payload = null;
			requestedRunId = current.run;
			selectedRunId = null;
			selectedNodeId = current.node;
			error = null;
			runWarning = null;
		} else if (current.run !== untrack(() => selectedRunId ?? requestedRunId)) {
			requestedRunId = current.run;
			selectedRunId = null;
			selectedNodeId = current.node;
		}
		if (current.view && VIEWS.some((v) => v.id === current.view)) view = current.view;
		if (current.node) selectedNodeId = current.node;
	});

	// Load once per session. The deep-linked run rides along for server-side validation only;
	// changing the selected run afterwards never refetches.
	$effect(() => {
		if (!browser || !sessionId) return;
		void load(
			sessionId,
			untrack(() => requestedRunId)
		);
	});

	// Resolve the selection once the payload lands: keep a valid selection, else take the
	// requested run when it is a workflow turn, else the first workflow turn.
	$effect(() => {
		if (!payload) return;
		const current = untrack(() => selectedRunId);
		if (current && runs.some((r) => r.turn_run_id === current)) return;
		const requested = requestedRunId;
		const next =
			(requested && runs.some((r) => r.turn_run_id === requested) ? requested : null) ??
			runs[0]?.turn_run_id ??
			null;
		if (next !== current) selectedRunId = next;
	});

	// state → URL (shallow), so a reload or a shared link lands on the same run/view/node.
	$effect(() => {
		if (!browser || !routerReady || !sessionId) return;
		const url = new URL(window.location.href);
		url.searchParams.set(SESSION_PARAM, sessionId);
		const runParam = selectedRunId ?? requestedRunId;
		if (runParam) url.searchParams.set(RUN_PARAM, runParam);
		else url.searchParams.delete(RUN_PARAM);
		url.searchParams.set(VIEW_PARAM, view);
		if (selectedNodeId) url.searchParams.set(NODE_PARAM, selectedNodeId);
		else url.searchParams.delete(NODE_PARAM);
		if (url.href !== window.location.href) {
			try {
				replaceState(url, {});
			} catch {
				// Router not ready yet; the next state change retries.
			}
		}
	});

	// Poll only while the selected workflow is still running; stop at terminal state.
	$effect(() => {
		if (!browser || !isPolling || !sessionId) return;
		const id = sessionId;
		const timer = setInterval(() => void load(id, null, true), POLL_MS);
		return () => clearInterval(timer);
	});

	async function load(id: string, runId: string | null, silent = false) {
		const current = ++requestId;
		if (!silent) {
			isLoading = true;
			error = null;
		}
		try {
			let next: ChatSessionAuditPayload;
			let rejectedRunId: string | null = null;
			try {
				next = await fetchChatSessionAuditPayload(id, fetch, { turnRunId: runId });
			} catch (err) {
				// A stale or foreign turn_run_id is rejected server-side (404). Fall back to
				// the whole session once and say so, instead of leaving the page empty.
				if (!runId) throw err;
				next = await fetchChatSessionAuditPayload(id, fetch);
				rejectedRunId = runId;
			}
			if (current !== requestId) return;
			payload = next;
			lastLoadedAt = new Date().toISOString();
			if (rejectedRunId) {
				runWarning = `The requested turn run ${rejectedRunId} is not in this session; showing the session's workflows instead.`;
				// Drop the rejected id so the selection falls through to the first workflow
				// turn. The load effect does not depend on it, so nothing refetches.
				if (requestedRunId === rejectedRunId) requestedRunId = null;
			} else if (!silent) {
				runWarning = null;
			}
		} catch (err) {
			if (current !== requestId) return;
			error = err instanceof Error ? err.message : 'Failed to load the workflow audit';
			if (!silent) payload = null;
		} finally {
			if (current === requestId) isLoading = false;
		}
	}

	function openSession(event: SubmitEvent) {
		event.preventDefault();
		const id = sessionInput.trim();
		if (!id) return;
		const url = new URL(window.location.href);
		url.searchParams.set(SESSION_PARAM, id);
		url.searchParams.delete(RUN_PARAM);
		url.searchParams.delete(NODE_PARAM);
		replaceState(url, {});
		sessionId = id;
		payload = null;
		selectedRunId = null;
		selectedNodeId = null;
		requestedRunId = null;
	}

	function selectRun(id: string) {
		if (id === selectedRunId) return;
		selectedRunId = id;
		selectedNodeId = null;
	}

	function selectStep(stepKey: string) {
		selectedNodeId = `step:${stepKey}`;
		view = 'flow';
	}

	async function exportScope(scope: 'workflow' | 'session', format: 'markdown' | 'bundle') {
		if (!payload) return;
		exportMenuOpen = false;
		isExporting = true;
		try {
			if (scope === 'workflow') {
				if (!run) throw new Error('Select a workflow first');
				const target = { kind: 'workflow', turnRunId: run.turn_run_id } as const;
				if (format === 'markdown') downloadWorkflowAuditMarkdown(payload, target);
				else await downloadWorkflowAuditBundle(payload, target);
			} else if (format === 'markdown') downloadChatSessionAuditMarkdown(payload);
			else downloadChatSessionAuditBundle(payload);
			toastService.success(
				`Exported ${scope === 'workflow' ? 'workflow' : 'session'} as ${format === 'markdown' ? 'Markdown' : 'ZIP'}${run && !run.is_terminal ? ' (capture of a running workflow)' : ''}`
			);
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Export failed');
		} finally {
			isExporting = false;
		}
	}

	const usd = (micro: number | null | undefined) =>
		micro === null || micro === undefined ? 'unknown' : `$${(micro / 1_000_000).toFixed(6)}`;
	const outcomeClass = (outcome: string | null, terminal: boolean) =>
		!terminal
			? 'bg-accent/10 text-accent'
			: outcome === 'complete'
				? 'bg-success/10 text-success'
				: outcome === 'partial'
					? 'bg-warning/10 text-warning'
					: outcome === 'failed'
						? 'bg-destructive/10 text-destructive'
						: 'bg-muted text-foreground';
</script>

<svelte:head><title>Workflow inspector · Admin · BuildOS</title></svelte:head>

<div class="space-y-4 p-4 sm:p-6">
	<AdminPageHeader
		title="Workflow inspector"
		description="Saved multi-agent runs: graph, agents, evidence, costs and offline export. Read-only; opening a run never triggers execution."
		icon={Workflow}
	/>

	<form
		onsubmit={openSession}
		class="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
	>
		<label class="flex-1 text-xs font-medium text-foreground"
			>Chat session id
			<input
				bind:value={sessionInput}
				placeholder="Paste a chat_session_id"
				class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
			/>
		</label>
		<button
			type="submit"
			class="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
			disabled={!sessionInput.trim()}>Open</button
		>
		{#if sessionId}
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground pressable"
				onclick={() => sessionId && void load(sessionId, selectedRunId)}
				disabled={isLoading}
				title="Reload the saved records"
			>
				<RefreshCw class={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
			</button>
			{#if sessionAuditHref}<a
					href={sessionAuditHref}
					class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground pressable"
					><ExternalLink class="h-3.5 w-3.5" /> Session audit</a
				>{/if}
			<a
				href="/workflow-lab"
				class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground pressable"
				>Workflow lab</a
			>
		{/if}
	</form>

	{#if !sessionId}
		<div
			class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
		>
			Open a session from the Workflow Lab "Trace" button, from a session audit, or paste a
			session id above.
		</div>
	{:else if isLoading && !payload}
		<div class="space-y-2">
			{#each Array(4) as _, i (i)}<div
					class="h-16 animate-pulse rounded-lg border border-border bg-muted/40"
				></div>{/each}
		</div>
	{:else if error && !payload}
		<div
			class="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
		>
			<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
		</div>
	{:else if payload}
		{#if error}<p class="flex items-center gap-2 text-xs text-warning">
				<AlertTriangle class="h-3.5 w-3.5" /> Last refresh failed: {error}. Showing the
				previous capture.
			</p>{/if}

		<section class="rounded-lg border border-border bg-card p-3">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 class="truncate text-base font-semibold text-foreground">
						{payload.session.title}
					</h2>
					<p class="text-xs text-muted-foreground">
						{payload.session.user.email} · <CopyableId
							value={payload.session.id}
							label="session"
						/> · captured {formatDateTime(
							workflows?.captured_at ?? lastLoadedAt
						)}{isPolling ? ' · refreshing while running' : ''}
					</p>
				</div>
				<div class="relative">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground pressable disabled:opacity-60"
						onclick={() => (exportMenuOpen = !exportMenuOpen)}
						disabled={isExporting}
						aria-haspopup="menu"
						aria-expanded={exportMenuOpen}
					>
						<Download class="h-3.5 w-3.5" /> Export
					</button>
					{#if exportMenuOpen}
						<button
							type="button"
							class="fixed inset-0 z-40 cursor-default"
							aria-label="Close export menu"
							tabindex="-1"
							onclick={() => (exportMenuOpen = false)}
						></button>
						<div
							class="absolute right-0 top-full z-50 mt-1 min-w-64 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-ink"
							role="menu"
						>
							<p
								class="px-3 py-1 text-2xs uppercase tracking-wider text-muted-foreground"
							>
								This workflow{run ? ` (turn ${run.turn_index ?? '?'})` : ''}
							</p>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50"
								disabled={!run}
								onclick={() => void exportScope('workflow', 'markdown')}
								><Download class="h-3.5 w-3.5" /> Markdown report</button
							>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50"
								disabled={!run}
								onclick={() => void exportScope('workflow', 'bundle')}
								><FileArchive class="h-3.5 w-3.5" /> ZIP bundle (flow.mmd, agents/, raw/,
								manifest)</button
							>
							<div class="my-1 h-px bg-border" role="separator"></div>
							<p
								class="px-3 py-1 text-2xs uppercase tracking-wider text-muted-foreground"
							>
								Whole session ({runs.length} workflow + {ordinaryTurns.length} ordinary
								turns)
							</p>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
								onclick={() => void exportScope('session', 'markdown')}
								><Download class="h-3.5 w-3.5" /> Markdown report</button
							>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
								onclick={() => void exportScope('session', 'bundle')}
								><FileArchive class="h-3.5 w-3.5" /> ZIP bundle</button
							>
						</div>
					{/if}
				</div>
			</div>

			<div
				class="mt-3 flex flex-wrap gap-2"
				role="tablist"
				aria-label="Turns in this session"
			>
				{#each runs as r (r.turn_run_id)}
					<button
						type="button"
						role="tab"
						aria-selected={r.turn_run_id === selectedRunId}
						class={`rounded-lg border px-3 py-1.5 text-left text-xs pressable ${r.turn_run_id === selectedRunId ? 'border-accent bg-accent/10' : 'border-border bg-background hover:border-accent/50'}`}
						onclick={() => selectRun(r.turn_run_id)}
					>
						<span class="font-medium text-foreground"
							>Turn {r.turn_index ?? '?'} · workflow</span
						>
						<span
							class={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${outcomeClass(r.terminal_outcome, r.is_terminal)}`}
							>{r.outcome_label}</span
						>
						<div class="mt-0.5 max-w-64 truncate text-2xs text-muted-foreground">
							{r.policy_ref ?? ''} · {r.request_message.slice(0, 60)}
						</div>
					</button>
				{/each}
				{#each ordinaryTurns as t (t.id)}
					<div
						class="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground"
						title="Ordinary chat turn (no workflow). Inspect it in the session audit."
					>
						Turn {t.turn_index} · ordinary chat
						<div class="mt-0.5 max-w-64 truncate text-2xs">
							{t.request_message.slice(0, 60)}
						</div>
					</div>
				{/each}
				{#if runs.length === 0}<p class="text-sm text-muted-foreground">
						This session has no saved workflow runs. {ordinaryTurns.length} ordinary turn(s)
						are inspectable in the session audit.
					</p>{/if}
			</div>

			{#if runWarning}
				<p class="mt-2 flex items-center gap-2 text-xs text-warning">
					<AlertTriangle class="h-3.5 w-3.5" />
					{runWarning}
				</p>
			{/if}
			{#if requestedRunId && payload && !runs.some((r) => r.turn_run_id === requestedRunId)}
				<p class="mt-2 flex items-center gap-2 text-xs text-warning">
					<AlertTriangle class="h-3.5 w-3.5" /> The requested turn run is in this session but
					is not a workflow turn; showing the first workflow instead.
				</p>
			{/if}
		</section>

		{#if run}
			<section class="rounded-lg border border-border bg-card p-3">
				<div class="grid grid-cols-2 gap-2 text-xs md:grid-cols-4 xl:grid-cols-8">
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Outcome</div>
						<div class="text-sm font-semibold text-foreground">
							{run.outcome_label}{run.is_terminal ? '' : ' (running)'}
						</div>
						<div class="text-2xs text-muted-foreground">{run.phase ?? '-'}</div>
					</div>
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Wall clock</div>
						<div class="text-sm font-semibold text-foreground">
							{run.timing.wall_clock_ms === null
								? 'unknown'
								: formatDuration(run.timing.wall_clock_ms)}
						</div>
						<div class="text-2xs text-muted-foreground">
							overlap {run.timing.parallel_overlap_ms === null
								? 'n/a'
								: formatDuration(run.timing.parallel_overlap_ms)}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Settled cost</div>
						<div class="text-sm font-semibold text-foreground">
							{usd(run.costs.settled_micro_usd)}
						</div>
						<div class="text-2xs text-muted-foreground">
							budget {usd(run.costs.budget_micro_usd)}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Uncertain / outstanding</div>
						<div
							class={`text-sm font-semibold ${run.costs.uncertain_dispatch_count ? 'text-destructive' : 'text-foreground'}`}
						>
							{run.costs.uncertain_dispatch_count
								? usd(run.costs.uncertain_reserved_micro_usd)
								: 'none'}
						</div>
						<div class="text-2xs text-muted-foreground">
							{run.costs.reserved_outstanding_micro_usd
								? `outstanding ${usd(run.costs.reserved_outstanding_micro_usd)}`
								: 'no open reservations'}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Dispatches</div>
						<div class="text-sm font-semibold text-foreground">
							{run.costs.physical_dispatches}
						</div>
						<div class="text-2xs text-muted-foreground">
							{run.steps.reduce((n, s) => n + s.attempts_used, 0)} logical attempts
						</div>
					</div>
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Recoveries</div>
						<div class="text-sm font-semibold text-foreground">
							{run.recovery_count}
						</div>
					</div>
					<div
						class="rounded-lg border border-dashed border-muted-foreground/50 bg-background p-2"
					>
						<div class="text-muted-foreground">Jev shadow</div>
						<div class="text-sm font-semibold text-foreground">
							{run.selection_shadow ? run.selection_shadow.status : 'none'}
						</div>
						<div class="text-2xs text-muted-foreground">
							{run.selection_shadow?.cost_usd !== null &&
							run.selection_shadow?.cost_usd !== undefined
								? `$${run.selection_shadow.cost_usd.toFixed(8)} · separate`
								: 'observation only'}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-background p-2">
						<div class="text-muted-foreground">Plan</div>
						<div
							class="truncate text-sm font-semibold text-foreground"
							title={run.plan_version ?? ''}
						>
							{run.graph.parallel_groups.length
								? 'parallel'
								: run.graph.sequential_handoffs.length
									? 'sequential handoff'
									: run.plan
										? 'saved'
										: 'none'}
						</div>
						<div class="text-2xs text-muted-foreground">{run.policy_ref ?? '-'}</div>
					</div>
				</div>
				{#if !run.supported}
					<p class="mt-2 flex items-center gap-2 text-xs text-warning">
						<AlertTriangle class="h-3.5 w-3.5" />
						{run.unsupported_reason}. Raw records are available; no graph is derived.
					</p>
				{/if}
				{#if run.coverage.filter((c) => c.status !== 'available' && c.status !== 'not_applicable').length || (workflows?.notes.length ?? 0) > 0}
					<details class="mt-2 text-xs">
						<summary class="cursor-pointer text-muted-foreground"
							>Coverage: {run.coverage.filter(
								(c) => c.status !== 'available' && c.status !== 'not_applicable'
							).length} gap(s) for this run{workflows?.notes.length
								? `, ${workflows.notes.length} capture note(s)`
								: ''}</summary
						>
						<ul class="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
							{#each run.coverage.filter((c) => c.status !== 'available' && c.status !== 'not_applicable') as note, i (i)}<li
								>
									<span class="font-medium text-foreground">{note.scope}</span>
									({note.status.replace(/_/g, ' ')}): {note.detail}
								</li>{/each}
							{#each workflows?.notes ?? [] as note, i (i)}<li>{note}</li>{/each}
						</ul>
					</details>
				{/if}
			</section>

			<div
				class="flex flex-wrap gap-1 border-b border-border"
				role="tablist"
				aria-label="Inspector views"
			>
				{#each VIEWS as v (v.id)}
					<button
						type="button"
						role="tab"
						aria-selected={view === v.id}
						class={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${view === v.id ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
						onclick={() => (view = v.id)}>{v.label}</button
					>
				{/each}
			</div>

			{#if view === 'flow'}
				<div class="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
					<div>
						<WorkflowFlowGraph
							graph={run.graph}
							{selectedNodeId}
							onSelect={(id) => (selectedNodeId = id)}
						/>
					</div>
					<WorkflowNodeDetail {run} nodeId={selectedNodeId} />
				</div>
			{:else if view === 'timeline'}
				<WorkflowTimelineView {run} onSelectStep={selectStep} />
			{:else if view === 'evidence'}
				<WorkflowEvidenceView {run} onSelectStep={selectStep} />
			{:else if view === 'costs'}
				<WorkflowCostsView {run} onSelectStep={selectStep} />
			{:else if view === 'transcript'}
				{#if conversationTurns.length}
					<ConversationReplay sessionDetail={payload} {conversationTurns} />
				{:else}
					<div class="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
						<p class="text-muted-foreground">
							No chat messages are linked to this turn yet; showing the saved request
							and durable answer text.
						</p>
						<pre
							class="whitespace-pre-wrap rounded-md bg-background p-3 text-foreground">{run.request_message ||
								'(request not recorded)'}</pre>
						<pre
							class="whitespace-pre-wrap rounded-md bg-background p-3 text-foreground">{run
								.answer.text || '(no answer text saved)'}</pre>
					</div>
				{/if}
			{:else if view === 'raw'}
				<WorkflowRawView {run} />
			{/if}
		{/if}
	{/if}
</div>
