<!-- apps/web/src/lib/components/project/ProjectInboxPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, ClipboardCheck, FileText, Inbox, RefreshCw, Sparkles } from 'lucide-svelte';
	import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import ChangeSetFailureSummary from '$lib/components/notifications/types/agent-run/ChangeSetFailureSummary.svelte';
	import ChangeSetReview from '$lib/components/notifications/types/agent-run/ChangeSetReview.svelte';
	import InboxChangeDetails from '$lib/components/inbox/InboxChangeDetails.svelte';
	import InboxDecisionControls from '$lib/components/inbox/InboxDecisionControls.svelte';
	import type {
		AgentChatResolutionAction,
		DataMutationSummary
	} from '$lib/components/agent/agent-chat.types';
	import {
		completeInboxDecisionNotification,
		failInboxDecisionNotification,
		startInboxBatchDecisionNotification,
		startInboxDecisionNotification
	} from '$lib/services/inbox-decision-notification.service';
	import type {
		ChangeSet,
		ProjectLoopRun,
		ProjectSuggestion,
		ProjectSuggestionEvidenceRef,
		ProjectSuggestionResult
	} from '@buildos/shared-types';

	type InboxSourceType = 'agent_run' | 'project_suggestion' | 'calendar_suggestion';
	type InboxItemStatus = 'pending' | 'deciding' | 'decided' | 'blocked' | 'expired' | 'snoozed';
	type AgentChatModalLazy =
		| typeof import('$lib/components/agent/AgentChatModal.svelte').default
		| null;
	type ChatResolutionAction = 'handled' | 'dismissed';

	type InboxItem = {
		id: string;
		source_type: InboxSourceType;
		source_ref_id: string;
		source_status: string | null;
		status: InboxItemStatus;
		title: string;
		summary: string | null;
		risk_tier: number | null;
		created_at: string;
		can_decide?: boolean;
		decision_disabled_reason?: string | null;
		source_payload?: Record<string, unknown> | null;
		source_context?: {
			project_loop_run?: ProjectLoopRunContext | null;
		} | null;
	};

	type InboxPayload = {
		items?: InboxItem[];
		repairedCount?: number;
		backfilledCount?: number;
	};

	type LoopPayload = {
		runs: ProjectLoopRun[];
		latestRun: ProjectLoopRun | null;
	};

	type AgentRunPayload = {
		goal?: string | null;
		label?: string | null;
		change_set?: ChangeSet | null;
	};

	type ProjectLoopRunContext = {
		id: string;
		trigger_reason: string | null;
		status: string | null;
		summary: string | null;
		brief: ProjectLoopRun['brief'] | null;
		suggestion_count: number | null;
		created_at: string | null;
		finished_at: string | null;
	};

	let {
		projectId,
		canEdit = false,
		onCountChange
	}: {
		projectId: string;
		canEdit?: boolean;
		onCountChange?: (count: number) => void;
	} = $props();

	let items = $state<InboxItem[]>([]);
	let latestRun = $state<ProjectLoopRun | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let triggering = $state(false);
	let pendingIds = $state<Set<string>>(new Set());
	let pollingRunId = $state<string | null>(null);
	let selectedIds = $state<Set<string>>(new Set());
	let dismissReasonById = $state<Record<string, string>>({});
	let dismissNoteById = $state<Record<string, string>>({});
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);
	let chatSessionId = $state<string | null>(null);
	let chatItemId = $state<string | null>(null);
	let resolvingChatAction = $state<ChatResolutionAction | null>(null);
	let explicitlyResolvedChatItemId = $state<string | null>(null);
	let openingChatIds = $state<Set<string>>(new Set());

	const inboxResolutionActions = $derived.by<AgentChatResolutionAction[]>(() => {
		if (!chatItemId || !chatSessionId) return [];
		return [
			{
				id: 'mark-handled-from-chat',
				label: 'Mark handled',
				title: 'Remove this inbox item after this chat',
				intent: 'primary',
				disabled: Boolean(resolvingChatAction),
				loading: resolvingChatAction === 'handled',
				onResolve: (summary) => resolveOpenChatItem('handled', summary)
			},
			{
				id: 'dismiss-from-chat',
				label: 'Dismiss',
				title: 'Dismiss this inbox item after this chat',
				intent: 'danger',
				disabled: Boolean(resolvingChatAction),
				loading: resolvingChatAction === 'dismissed',
				onResolve: (summary) => resolveOpenChatItem('dismissed', summary)
			}
		];
	});

	const POLL_INTERVAL_MS = 2500;
	const MAX_POLL_MS = 2 * 60 * 1000;
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	const notifiedRunIds = new Set<string>();

	const runActive = $derived(isRunActive(latestRun));

	type TierMeta = { label: string; cls: string };
	const tierMeta: Record<number, TierMeta> = {
		1: { label: 'Low risk', cls: 'border-accent/30 bg-accent/10 text-accent' },
		2: { label: 'Review', cls: 'border-warning/30 bg-warning/10 text-warning' },
		3: {
			label: 'High risk',
			cls: 'border-destructive/30 bg-destructive/10 text-destructive'
		}
	};
	const fallbackTier: TierMeta = {
		label: 'Review',
		cls: 'border-border bg-muted text-muted-foreground'
	};

	const kindLabel: Record<string, string> = {
		doc_org: 'Organize',
		doc_outdated: 'Outdated',
		drift: 'Drift',
		task_conflict: 'Conflict'
	};

	const evidenceTypeLabel: Record<string, string> = {
		project: 'Project',
		goal: 'Goal',
		document: 'Doc',
		task: 'Task',
		calendar_event: 'Event',
		external: 'Source',
		unknown: 'Source'
	};

	const groupedItems = $derived.by(() => {
		const safe = { key: 'safe', label: 'Safe cleanup', items: [] as InboxItem[] };
		const decision = {
			key: 'decision',
			label: 'Needs your call',
			items: [] as InboxItem[]
		};
		const drift = { key: 'drift', label: 'Project drift', items: [] as InboxItem[] };
		const other = { key: 'other', label: 'Other proposals', items: [] as InboxItem[] };
		const groups = [safe, decision, drift, other];
		for (const item of items) {
			const payload = projectSuggestion(item);
			if (payload?.kind === 'drift') drift.items.push(item);
			else if (
				item.source_type === 'project_suggestion' &&
				(payload?.risk_tier ?? item.risk_tier ?? 2) <= 1
			)
				safe.items.push(item);
			else if (item.source_type === 'project_suggestion') decision.items.push(item);
			else other.items.push(item);
		}
		return groups.filter((group) => group.items.length > 0);
	});

	const selectedBatchIds = $derived.by(() =>
		items
			.filter((item) => selectedIds.has(item.id) && canBatchApprove(item))
			.map((item) => item.id)
	);

	function isRunActive(run: ProjectLoopRun | null | undefined): boolean {
		return run?.status === 'queued' || run?.status === 'running';
	}

	function clearPoll() {
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
		pollingRunId = null;
	}

	function tierFor(value: number | null | undefined): TierMeta {
		if (!value) return fallbackTier;
		return tierMeta[value] ?? fallbackTier;
	}

	function asRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	}

	function sourcePayload<T extends Record<string, unknown>>(item: InboxItem): T | null {
		return asRecord(item.source_payload) as T | null;
	}

	function arrayValue<T>(value: unknown): T[] {
		return Array.isArray(value) ? (value as T[]) : [];
	}

	function projectSuggestion(item: InboxItem): ProjectSuggestion | null {
		return sourcePayload<ProjectSuggestion & Record<string, unknown>>(item);
	}

	function agentRun(item: InboxItem): AgentRunPayload | null {
		return sourcePayload<AgentRunPayload & Record<string, unknown>>(item);
	}

	function projectLoopRunContext(item: InboxItem): ProjectLoopRunContext | null {
		return item.source_context?.project_loop_run ?? null;
	}

	function agentChangeSet(item: InboxItem): ChangeSet | null {
		if (item.source_type !== 'agent_run') return null;
		const changeSet = agentRun(item)?.change_set;
		if (!changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0) {
			return null;
		}
		return changeSet;
	}

	function hasFailedChanges(changeSet: ChangeSet | null): boolean {
		return Boolean(
			changeSet?.changes.some(
				(change) => typeof change.error === 'string' && change.error.trim()
			)
		);
	}

	function agentFailedChangeSet(item: InboxItem): ChangeSet | null {
		const changeSet = agentChangeSet(item);
		return hasFailedChanges(changeSet) ? changeSet : null;
	}

	function evidenceLabel(ref: ProjectSuggestionEvidenceRef): string {
		return `${evidenceTypeLabel[ref.entity_type] ?? 'Source'}: ${ref.title}`;
	}

	function formatShortDate(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function reviewRunLabel(run: ProjectLoopRunContext | null): string | null {
		if (!run) return null;
		const trigger =
			run.trigger_reason === 'manual'
				? 'Manual review'
				: run.trigger_reason === 'burst'
					? 'Burst review'
					: run.trigger_reason === 'end_of_day'
						? 'Scheduled review'
						: 'Project review';
		const date = formatShortDate(run.finished_at ?? run.created_at);
		return date ? `${trigger} · ${date}` : trigger;
	}

	function sourceLabel(item: InboxItem): string {
		if (item.source_type === 'agent_run') return 'Agent proposal';
		if (item.source_type === 'calendar_suggestion') return 'Calendar suggestion';
		return 'Project review';
	}

	function sourceIcon(item: InboxItem): typeof Inbox {
		if (item.source_type === 'agent_run') return Sparkles;
		if (item.source_type === 'project_suggestion') return ClipboardCheck;
		return FileText;
	}

	function changeCount(item: InboxItem): number {
		if (item.source_type === 'project_suggestion') {
			return arrayValue(projectSuggestion(item)?.operations).length;
		}
		if (item.source_type === 'agent_run') {
			return arrayValue(agentRun(item)?.change_set?.changes).length;
		}
		return 0;
	}

	function canDecide(item: InboxItem): boolean {
		return canEdit && item.status === 'pending' && item.can_decide !== false;
	}

	function canBatchApprove(item: InboxItem): boolean {
		if (!canDecide(item) || item.source_type !== 'project_suggestion') return false;
		if (clarificationFor(item)) return false;
		const payload = projectSuggestion(item);
		const riskTier = payload?.risk_tier ?? item.risk_tier ?? 3;
		const operations = arrayValue<{ tool?: string }>(payload?.operations);
		return (
			riskTier <= 2 &&
			payload?.reversible !== false &&
			operations.length > 0 &&
			!operations.some((operation) => operation.tool === 'move_document_in_tree')
		);
	}

	function updateSelected(item: InboxItem, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) next.add(item.id);
		else next.delete(item.id);
		selectedIds = next;
	}

	function removeItemsFromInbox(itemIds: Iterable<string>) {
		const ids = new Set(itemIds);
		if (ids.size === 0) return;
		items = items.filter((item) => !ids.has(item.id));
		selectedIds = new Set([...selectedIds].filter((id) => !ids.has(id)));
		onCountChange?.(items.length);
	}

	function clarificationFor(item: InboxItem): string {
		return item.source_type === 'project_suggestion'
			? (dismissNoteById[item.id] ?? '').trim()
			: '';
	}

	async function loadAgentChatModal(): Promise<NonNullable<AgentChatModalLazy>> {
		if (AgentChatModalComponent) return AgentChatModalComponent;
		const module = await import('$lib/components/agent/AgentChatModal.svelte');
		AgentChatModalComponent = module.default;
		return module.default;
	}

	function canChat(item: InboxItem): boolean {
		return canDecide(item) || Boolean(agentFailedChangeSet(item));
	}

	function isOpeningChat(item: InboxItem): boolean {
		return openingChatIds.has(item.id);
	}

	async function openChat(item: InboxItem) {
		if (!canChat(item) || isOpeningChat(item)) return;
		openingChatIds = new Set(openingChatIds).add(item.id);
		try {
			await loadAgentChatModal();
			const res = await fetch(`/api/inbox/${item.id}/chat-session`, { method: 'POST' });
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Failed to open chat');
			const nextChatSessionId = json.data?.chat_session_id ?? json.data?.session?.id;
			if (typeof nextChatSessionId !== 'string' || !nextChatSessionId) {
				throw new Error('Chat session was not returned');
			}
			chatSessionId = nextChatSessionId;
			chatItemId = item.id;
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to open chat');
		} finally {
			const next = new Set(openingChatIds);
			next.delete(item.id);
			openingChatIds = next;
		}
	}

	async function resolveChatItem(
		itemId: string,
		options: {
			summary?: DataMutationSummary;
			resolution?: ChatResolutionAction;
			sessionId?: string | null;
			showErrors?: boolean;
		}
	): Promise<boolean> {
		const summary = options.summary;
		const sessionId = summary?.sessionId ?? options.sessionId;
		const hasChanges = summary?.hasChanges === true;
		if (!sessionId || (!hasChanges && !options.resolution)) return false;
		try {
			const response = await fetch(`/api/inbox/${itemId}/resolve-from-chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session_id: sessionId,
					has_changes: hasChanges,
					total_mutations: summary?.totalMutations ?? 0,
					affected_project_ids: summary?.affectedProjectIds ?? [],
					...(options.resolution ? { resolution: options.resolution } : {})
				})
			});
			const json = await response.json().catch(() => null);
			if (!response.ok) throw new Error(json?.error ?? 'Failed to resolve inbox item');
			if (json?.data?.resolved) {
				removeItemsFromInbox([itemId]);
				toastService.success(
					options.resolution === 'dismissed'
						? 'Inbox item dismissed.'
						: options.resolution === 'handled'
							? 'Inbox item marked handled.'
							: 'Inbox item handled from chat.'
				);
				return true;
			}
		} catch (error) {
			if (options.showErrors) {
				toastService.error(
					error instanceof Error ? error.message : 'Failed to resolve inbox item'
				);
			}
			console.warn('[AI Inbox] Failed to resolve inbox item from chat:', error);
		}
		return false;
	}

	async function resolveOpenChatItem(
		resolution: ChatResolutionAction,
		summary: DataMutationSummary
	): Promise<boolean> {
		const itemId = chatItemId;
		const sessionId = chatSessionId;
		if (!itemId || !sessionId || resolvingChatAction) return false;
		resolvingChatAction = resolution;
		try {
			const resolved = await resolveChatItem(itemId, {
				summary,
				resolution,
				sessionId,
				showErrors: true
			});
			if (resolved) explicitlyResolvedChatItemId = itemId;
			return resolved;
		} finally {
			resolvingChatAction = null;
		}
	}

	function closeChat(summary?: DataMutationSummary) {
		const itemId = chatItemId;
		const wasExplicitlyResolved = !!itemId && explicitlyResolvedChatItemId === itemId;
		chatSessionId = null;
		chatItemId = null;
		resolvingChatAction = null;
		if (wasExplicitlyResolved) {
			explicitlyResolvedChatItemId = null;
			return;
		}
		if (itemId && summary?.hasChanges) {
			void resolveChatItem(itemId, { summary });
		}
	}

	function completionMessage(run: ProjectLoopRun, itemCount: number): string {
		if (run.status === 'waiting_review') {
			return `Project review finished - ${itemCount} item${itemCount === 1 ? '' : 's'} ready.`;
		}
		if (run.status === 'completed') return run.summary ?? 'Project review finished.';
		if (run.status === 'failed') return run.error_message ?? 'Project review failed.';
		return run.summary ?? 'Project review updated.';
	}

	function notifyRunFinished(run: ProjectLoopRun, itemCount: number) {
		if (notifiedRunIds.has(run.id)) return;
		notifiedRunIds.add(run.id);
		if (run.status === 'failed') toastService.error(completionMessage(run, itemCount));
		else toastService.success(completionMessage(run, itemCount));
	}

	async function loadLoopState(): Promise<LoopPayload | null> {
		if (!PROJECT_LOOPS_ENABLED) return null;
		const res = await fetch(`/api/onto/projects/${projectId}/loops`);
		if (!res.ok) throw new Error(`Failed to load project review (${res.status})`);
		const json = await res.json();
		return {
			runs: json.data?.runs ?? [],
			latestRun: json.data?.latestRun ?? null
		};
	}

	async function load(options: { silent?: boolean } = {}): Promise<LoopPayload | null> {
		if (!options.silent) loading = true;
		else refreshing = true;
		try {
			const inboxUrl = new URL('/api/inbox', window.location.origin);
			inboxUrl.searchParams.set('project_id', projectId);
			inboxUrl.searchParams.set('status', 'pending');
			inboxUrl.searchParams.set('include_payload', '1');
			inboxUrl.searchParams.set('limit', '50');

			const [inboxRes, loopResult] = await Promise.all([
				fetch(inboxUrl),
				PROJECT_LOOPS_ENABLED ? loadLoopState().catch(() => null) : Promise.resolve(null)
			]);

			const inboxJson = await inboxRes.json();
			if (!inboxRes.ok) throw new Error(inboxJson?.error ?? 'Failed to load inbox');

			const data = (inboxJson.data ?? {}) as InboxPayload;
			items = data.items ?? [];
			onCountChange?.(items.length);
			latestRun = loopResult?.latestRun ?? null;
			return loopResult;
		} catch (error) {
			console.error('[ProjectInboxPanel] load failed', error);
			if (!options.silent) {
				toastService.error(error instanceof Error ? error.message : 'Failed to load inbox');
			}
			return null;
		} finally {
			if (!options.silent) loading = false;
			refreshing = false;
		}
	}

	function findRun(data: LoopPayload, runId: string): ProjectLoopRun | null {
		return data.runs.find((run) => run.id === runId) ?? null;
	}

	function startPolling(runId: string) {
		clearPoll();
		pollingRunId = runId;
		const startedAt = Date.now();

		const tick = async () => {
			const data = await load({ silent: true });
			if (!data) {
				if (Date.now() - startedAt < MAX_POLL_MS) {
					pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
				} else {
					clearPoll();
				}
				return;
			}

			const run = findRun(data, runId);
			if (run && !isRunActive(run)) {
				notifyRunFinished(run, items.length);
				clearPoll();
				return;
			}

			if (Date.now() - startedAt >= MAX_POLL_MS) {
				clearPoll();
				toastService.info('Project review is still running. Refresh to check later.');
				return;
			}

			pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
		};

		pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
	}

	async function runLoop() {
		if (triggering || !PROJECT_LOOPS_ENABLED) return;
		triggering = true;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/loops`, { method: 'POST' });
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Failed to start review');
			if (json.data?.reason === 'already_running')
				toastService.info('Project review is already running.');
			else toastService.success('Project review started.');

			const data = await load({ silent: true });
			const runId = json.data?.runId ?? data?.latestRun?.id;
			if (!runId) return;

			const run = data ? findRun(data, runId) : null;
			if (run && !isRunActive(run)) notifyRunFinished(run, items.length);
			else startPolling(runId);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to start review');
		} finally {
			triggering = false;
		}
	}

	async function decide(item: InboxItem, action: 'approve' | 'reject') {
		if (pendingIds.has(item.id)) return;
		pendingIds = new Set(pendingIds).add(item.id);
		const notificationId = startInboxDecisionNotification(item, action);
		removeItemsFromInbox([item.id]);
		try {
			const clarification = clarificationFor(item);
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					item_id: item.id,
					action,
					...(item.source_type === 'project_suggestion' && clarification
						? { clarification }
						: {}),
					...(action === 'reject' && item.source_type === 'project_suggestion'
						? {
								reason: dismissReasonById[item.id] || 'other',
								note: dismissNoteById[item.id] || undefined
							}
						: {})
				})
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Action failed');

			const result = json.data?.result as
				| (ProjectSuggestionResult & { inProgress?: boolean })
				| undefined;
			let message = action === 'approve' ? 'Review item applied.' : 'Review item dismissed.';
			let title = action === 'approve' ? 'Review item applied' : 'Review item dismissed';
			let toastKind: 'success' | 'info' | 'error' = 'success';
			if (json.data?.superseded) {
				message = 'Review item changed. Rerun Project Review.';
				title = 'Review item changed';
				toastKind = 'error';
			} else if (json.data?.delegated) {
				message = 'Clarified decision started.';
				title = 'Clarified decision started';
			} else if (result?.inProgress) {
				message = 'Review item is already processing.';
				title = 'Review item processing';
				toastKind = 'info';
			} else if (action === 'approve' && result && result.ok === false) {
				message = 'Some changes could not be applied.';
				title = 'Review item failed';
				toastKind = 'error';
			} else if (json.data?.degraded) {
				message = 'Agent queue is full; handled directly.';
				title = 'Handled directly';
				toastKind = 'info';
			} else if (action === 'approve') {
				message = changeCount(item) ? 'Review item applied.' : 'Review item acknowledged.';
				title = changeCount(item) ? 'Review item applied' : 'Review item acknowledged';
			}
			completeInboxDecisionNotification(notificationId, message, { toastKind, title });
		} catch (error) {
			failInboxDecisionNotification(
				notificationId,
				error instanceof Error ? error.message : 'Action failed'
			);
			void load({ silent: true });
		} finally {
			const next = new Set(pendingIds);
			next.delete(item.id);
			pendingIds = next;
		}
	}

	function handleAgentRunApplied(item: InboxItem) {
		removeItemsFromInbox([item.id]);
	}

	async function batchApproveSelected() {
		const ids = selectedBatchIds;
		if (ids.length === 0) return;
		for (const id of ids) pendingIds = new Set(pendingIds).add(id);
		const notificationId = startInboxBatchDecisionNotification(ids.length);
		removeItemsFromInbox(ids);
		try {
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ item_ids: ids, action: 'approve' })
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Batch apply failed');
			const results = Array.isArray(json.data?.results) ? json.data.results : [];
			const appliedIds = new Set(
				results
					.map((result: { item_id?: unknown }) => result.item_id)
					.filter((id: unknown): id is string => typeof id === 'string')
			);
			const superseded = results.filter(
				(result: { superseded?: unknown }) => result.superseded === true
			).length;
			const appliedCount = Math.max(0, appliedIds.size - superseded);
			const failed = Number(json.data?.failed ?? 0);
			const itemLabel = appliedCount === 1 ? 'review item' : 'review items';
			let message = `${appliedCount} ${itemLabel} applied.`;
			let title = 'Review items applied';
			let toastKind: 'success' | 'info' | 'error' = 'success';
			if (failed > 0) {
				message = `${appliedCount} applied, ${superseded} changed, ${failed} failed.`;
				title = 'Batch apply incomplete';
				toastKind = 'error';
				void load({ silent: true });
			} else if (superseded > 0) {
				message = `${appliedCount} applied, ${superseded} changed. Rerun Project Review.`;
				title = 'Review items changed';
				toastKind = 'error';
			}
			completeInboxDecisionNotification(notificationId, message, { toastKind, title });
		} catch (error) {
			failInboxDecisionNotification(
				notificationId,
				error instanceof Error ? error.message : 'Batch apply failed'
			);
			void load({ silent: true });
		} finally {
			const next = new Set(pendingIds);
			for (const id of ids) next.delete(id);
			pendingIds = next;
		}
	}

	onMount(() => {
		void load().then((data) => {
			if (data?.latestRun && isRunActive(data.latestRun)) startPolling(data.latestRun.id);
		});
		return clearPoll;
	});
</script>

<div class="space-y-0">
	<div class="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-3">
		<div class="min-w-0">
			<p class="text-xs font-semibold text-foreground">
				{#if loading}
					Loading inbox
				{:else if items.length}
					{items.length} pending item{items.length === 1 ? '' : 's'}
				{:else if runActive || pollingRunId}
					Review running
				{:else if latestRun?.status === 'failed'}
					{latestRun.error_message ?? 'Review failed'}
				{:else}
					No pending review items
				{/if}
			</p>
			{#if latestRun?.summary && !items.length && !runActive && !pollingRunId}
				<p class="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
					{latestRun.summary}
				</p>
			{/if}
		</div>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => load({ silent: true })}
				disabled={loading || refreshing}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
				title="Refresh inbox"
			>
				<RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
			</button>
			{#if PROJECT_LOOPS_ENABLED && canEdit}
				<Button
					variant="secondary"
					size="sm"
					onclick={runLoop}
					disabled={triggering || runActive || Boolean(pollingRunId)}
					class="min-h-8 px-2.5 py-1 text-xs"
				>
					<RefreshCw
						class="mr-1.5 h-3.5 w-3.5 {triggering || runActive || pollingRunId
							? 'animate-spin'
							: ''}"
					/>
					{runActive || pollingRunId ? 'Reviewing' : 'Run review'}
				</Button>
			{/if}
			{#if selectedBatchIds.length}
				<Button
					variant="secondary"
					size="sm"
					onclick={batchApproveSelected}
					disabled={selectedBatchIds.some((id) => pendingIds.has(id))}
					class="min-h-8 px-2.5 py-1 text-xs"
				>
					<Check class="mr-1.5 h-3.5 w-3.5" />
					Apply {selectedBatchIds.length}
				</Button>
			{/if}
		</div>
	</div>

	{#if latestRun?.brief}
		<div class="border-t border-border bg-muted/20 px-3 py-3">
			<p class="text-[10px] font-semibold uppercase text-muted-foreground">Project brief</p>
			{#if latestRun.brief.current_goal}
				<p class="mt-1 text-xs font-semibold text-foreground">
					{latestRun.brief.current_goal}
				</p>
			{/if}
			<div class="mt-2 grid gap-2 sm:grid-cols-2">
				{#if latestRun.brief.next_best_action}
					<div>
						<p class="text-[10px] font-semibold uppercase text-muted-foreground">
							Next
						</p>
						<p class="mt-0.5 text-[11px] text-foreground/80">
							{latestRun.brief.next_best_action}
						</p>
					</div>
				{/if}
				{#if latestRun.brief.open_decisions?.length}
					<div>
						<p class="text-[10px] font-semibold uppercase text-muted-foreground">
							Open decisions
						</p>
						<p class="mt-0.5 line-clamp-2 text-[11px] text-foreground/80">
							{latestRun.brief.open_decisions.slice(0, 3).join(' · ')}
						</p>
					</div>
				{/if}
			</div>
			{#if latestRun.brief.stale_assumptions?.length || latestRun.brief.contradictions_or_drift?.length}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each (latestRun.brief.stale_assumptions ?? []).slice(0, 3) as item}
						<span
							class="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
						>
							{item}
						</span>
					{/each}
					{#each (latestRun.brief.contradictions_or_drift ?? []).slice(0, 3) as item}
						<span
							class="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
						>
							{item}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="space-y-2 border-t border-border p-2 sm:p-3">
			{#each Array(3) as _, index (index)}
				<div class="h-20 rounded-md border border-border bg-muted/30 animate-pulse"></div>
			{/each}
		</div>
	{:else if items.length === 0}
		<div class="border-t border-border px-3 py-6 text-center">
			<Inbox class="mx-auto h-5 w-5 text-muted-foreground" />
			<p class="mt-2 text-xs font-medium text-foreground">Inbox is clear</p>
			<p class="mt-1 text-[11px] text-muted-foreground">
				New review items will appear here when an agent proposes project changes.
			</p>
		</div>
	{:else}
		<div class="border-t border-border">
			{#each groupedItems as group (group.key)}
				<div
					class="bg-muted/20 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
				>
					{group.label} ({group.items.length})
				</div>
				{#each group.items as item (item.id)}
					{@const payload = projectSuggestion(item)}
					{@const agent = agentRun(item)}
					{@const reviewRun = projectLoopRunContext(item)}
					{@const reviewRunText = reviewRunLabel(reviewRun)}
					{@const changeSet = agentChangeSet(item)}
					{@const failedChangeSet = agentFailedChangeSet(item)}
					{@const tier = tierFor(item.risk_tier ?? payload?.risk_tier)}
					{@const Icon = sourceIcon(item)}
					{@const evidence = arrayValue<ProjectSuggestionEvidenceRef>(
						payload?.evidence_refs
					).slice(0, 3)}
					{@const changes = changeCount(item)}
					<div class="border-b border-border px-3 py-3 last:border-b-0">
						<div
							class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									{#if canBatchApprove(item)}
										<input
											type="checkbox"
											class="h-3.5 w-3.5 rounded border-border"
											checked={selectedIds.has(item.id)}
											onchange={(event) =>
												updateSelected(
													item,
													(event.currentTarget as HTMLInputElement)
														.checked
												)}
											aria-label="Select review item"
										/>
									{/if}
									<span
										class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold {tier.cls}"
									>
										<Icon class="h-3 w-3" />
										{tier.label}
									</span>
									<span
										class="text-[10px] font-medium uppercase text-muted-foreground"
									>
										{sourceLabel(item)}
									</span>
									{#if payload?.kind}
										<span
											class="text-[10px] font-medium uppercase text-muted-foreground"
										>
											{kindLabel[payload.kind] ?? payload.kind}
										</span>
									{/if}
									{#if reviewRunText}
										<span
											class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
										>
											{reviewRunText}
										</span>
									{/if}
								</div>
								<p class="mt-1.5 text-sm font-semibold text-foreground">
									{item.title || payload?.title || agent?.label || 'Review item'}
								</p>
								{#if payload?.why_now}
									<p class="mt-1 text-[12px] text-foreground/80">
										<span class="font-semibold">Why now:</span>
										{payload.why_now}
									</p>
								{:else if item.summary || payload?.rationale || agent?.goal}
									<p class="mt-1 text-[12px] text-muted-foreground">
										{item.summary ?? payload?.rationale ?? agent?.goal}
									</p>
								{/if}
								{#if payload?.preview?.summary}
									<p
										class="mt-1.5 border-l-2 border-accent/30 pl-2 text-[12px] text-muted-foreground"
									>
										<span class="font-semibold text-foreground/80"
											>Preview:</span
										>
										{payload.preview.summary}
									</p>
								{/if}
								{#if evidence.length}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each evidence as ref}
											<span
												class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
											>
												{evidenceLabel(ref)}
											</span>
										{/each}
									</div>
								{/if}
								{#if item.source_type === 'project_suggestion' && (changes || payload?.preview)}
									<InboxChangeDetails
										operations={payload?.operations ?? []}
										preview={payload?.preview ?? null}
									/>
								{:else if changes}
									<p class="mt-1.5 text-[11px] text-muted-foreground">
										{changes} proposed change{changes === 1 ? '' : 's'}
									</p>
								{/if}
								{#if changeSet && canDecide(item)}
									<div class="mt-3">
										<ChangeSetReview
											runId={item.source_ref_id}
											{changeSet}
											acceptLabel="Accept"
											dismissLabel="Dismiss"
											approveAllLabel="Accept"
											rejectAllLabel="Dismiss"
											openingChat={isOpeningChat(item)}
											onApplied={() => handleAgentRunApplied(item)}
											onChat={canChat(item)
												? () => openChat(item)
												: undefined}
										/>
									</div>
								{:else if failedChangeSet}
									<div class="mt-3">
										<ChangeSetFailureSummary
											changeSet={failedChangeSet}
											openingChat={isOpeningChat(item)}
											onChat={canChat(item)
												? () => openChat(item)
												: undefined}
										/>
									</div>
								{/if}
							</div>
							{#if canDecide(item) && !changeSet}
								<InboxDecisionControls
									pending={pendingIds.has(item.id)}
									canChat={canChat(item)}
									openingChat={isOpeningChat(item)}
									layout="project"
									onApprove={() => decide(item, 'approve')}
									onReject={() => decide(item, 'reject')}
									onChat={() => openChat(item)}
								/>
							{:else if item.decision_disabled_reason}
								<div
									class="shrink-0 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
								>
									{item.decision_disabled_reason}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/each}
		</div>
	{/if}
</div>

{#if AgentChatModalComponent && chatSessionId}
	<AgentChatModalComponent
		isOpen={Boolean(chatSessionId)}
		contextType="project"
		entityId={projectId}
		initialChatSessionId={chatSessionId}
		{inboxResolutionActions}
		onClose={closeChat}
	/>
{/if}
