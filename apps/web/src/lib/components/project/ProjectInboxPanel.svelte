<!-- apps/web/src/lib/components/project/ProjectInboxPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AlertCircle,
		Check,
		ClipboardCheck,
		FileText,
		Inbox,
		RefreshCw,
		Sparkles
	} from '$lib/icons/lucide';
	import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import ChangeSetFailureSummary from '$lib/components/notifications/types/agent-run/ChangeSetFailureSummary.svelte';
	import ChangeSetReview from '$lib/components/notifications/types/agent-run/ChangeSetReview.svelte';
	import InboxChangeDetails from '$lib/components/inbox/InboxChangeDetails.svelte';
	import InboxDecisionControls from '$lib/components/inbox/InboxDecisionControls.svelte';
	import InboxFindingControls from '$lib/components/inbox/InboxFindingControls.svelte';
	import InboxProjectBadge from '$lib/components/inbox/InboxProjectBadge.svelte';
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

	type InboxSourceType =
		| 'agent_run'
		| 'project_suggestion'
		| 'project_audit'
		| 'calendar_suggestion';
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
		project_id: string | null;
		status: InboxItemStatus;
		title: string;
		summary: string | null;
		risk_tier: number | null;
		created_at: string;
		project?: { id: string; name: string | null } | null;
		can_decide?: boolean;
		decision_disabled_reason?: string | null;
		source_payload?: Record<string, unknown> | null;
		source_context?: {
			project_loop_run?: ProjectLoopRunContext | null;
			project_audit?: ProjectAuditContext | null;
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
		project_id: string | null;
		trigger_reason: string | null;
		status: string | null;
		summary: string | null;
		brief: ProjectLoopRun['brief'] | null;
		suggestion_count: number | null;
		created_at: string | null;
		finished_at: string | null;
	};

	type ProjectAuditContext = {
		id: string;
		project_id: string | null;
		status: string | null;
		trigger_reason: string | null;
		delivery_confidence: string | null;
		summary: string | null;
		role: string | null;
		generated_suggestion_count: number | null;
		unresolved_suggestion_count: number | null;
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
	let loadError = $state<string | null>(null);
	let refreshing = $state(false);
	let triggering = $state(false);
	let pendingIds = $state<Set<string>>(new Set());
	let pollingRunId = $state<string | null>(null);
	let selectedIds = $state<Set<string>>(new Set());
	let decisionNoteById = $state<Record<string, string>>({});
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);
	let chatSessionId = $state<string | null>(null);
	let chatItemId = $state<string | null>(null);
	let resolvingChatAction = $state<ChatResolutionAction | null>(null);
	let explicitlyResolvedChatItemId = $state<string | null>(null);
	let openingChatIds = $state<Set<string>>(new Set());
	const activeChatItem = $derived(
		chatItemId ? (items.find((item) => item.id === chatItemId) ?? null) : null
	);

	const inboxResolutionActions = $derived.by<AgentChatResolutionAction[]>(() => {
		if (!chatItemId || !chatSessionId) return [];
		return [
			{
				id: 'mark-handled-from-chat',
				label: activeChatItem && isFinding(activeChatItem) ? 'Address' : 'Mark handled',
				title:
					activeChatItem && isFinding(activeChatItem)
						? 'Record this finding as addressed after the chat'
						: 'Remove this inbox item after this chat',
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
	const SNOOZE_MS = 24 * 60 * 60 * 1000;
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
		task_conflict: 'Conflict',
		audit_recommendation: 'Audit'
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
		const auditGroups = new Map<string, { key: string; label: string; items: InboxItem[] }>();
		const safe = { key: 'safe', label: 'Safe cleanup', items: [] as InboxItem[] };
		const decision = {
			key: 'decision',
			label: 'Needs your call',
			items: [] as InboxItem[]
		};
		const audits = { key: 'audits', label: 'Complete audits', items: [] as InboxItem[] };
		const drift = { key: 'drift', label: 'Project drift', items: [] as InboxItem[] };
		const other = { key: 'other', label: 'Other proposals', items: [] as InboxItem[] };
		const groups = [audits, safe, decision, drift, other];
		for (const item of items) {
			const payload = projectSuggestion(item);
			const audit = projectAuditContext(item);
			if (item.source_type === 'project_audit') {
				audits.items.push(item);
				continue;
			}
			if (payload?.kind === 'audit_recommendation' && audit) {
				const key = `audit:${audit.id}`;
				const group = auditGroups.get(key) ?? {
					key,
					label: auditGroupLabel(audit),
					items: [] as InboxItem[]
				};
				group.items.push(item);
				auditGroups.set(key, group);
				continue;
			}
			if (payload?.kind === 'drift') drift.items.push(item);
			else if (
				item.source_type === 'project_suggestion' &&
				(payload?.risk_tier ?? item.risk_tier ?? 2) <= 1
			)
				safe.items.push(item);
			else if (item.source_type === 'project_suggestion') decision.items.push(item);
			else other.items.push(item);
		}
		return [...auditGroups.values(), ...groups.filter((group) => group.items.length > 0)];
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

	function projectAuditContext(item: InboxItem): ProjectAuditContext | null {
		return item.source_context?.project_audit ?? null;
	}

	function itemProject(item: InboxItem): { id: string; name: string | null } | null {
		return item.project ?? (item.project_id ? { id: item.project_id, name: null } : null);
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

	function auditGroupLabel(audit: ProjectAuditContext): string {
		const date = formatShortDate(audit.finished_at ?? audit.created_at);
		return date ? `Audit follow-ups · ${date}` : 'Audit follow-ups';
	}

	function auditRecommendationLabel(audit: ProjectAuditContext | null): string | null {
		if (!audit) return null;
		const count = audit.unresolved_suggestion_count ?? audit.generated_suggestion_count;
		if (count === null) return null;
		return `${count} recommendation${count === 1 ? '' : 's'}`;
	}

	function sourceLabel(item: InboxItem): string {
		if (item.source_type === 'agent_run') return 'Agent proposal';
		if (item.source_type === 'project_audit') return 'Project audit';
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

	function isFinding(item: InboxItem): boolean {
		if (item.source_type !== 'project_suggestion') return false;
		const payload = projectSuggestion(item);
		return (
			payload?.kind === 'drift' ||
			payload?.kind === 'audit_recommendation' ||
			arrayValue(payload?.operations).length === 0
		);
	}

	function canDecide(item: InboxItem): boolean {
		return canEdit && item.status === 'pending' && item.can_decide !== false;
	}

	function canBatchApprove(item: InboxItem): boolean {
		if (!canDecide(item) || item.source_type !== 'project_suggestion') return false;
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

	function updateDecisionNote(item: InboxItem, note: string) {
		decisionNoteById = { ...decisionNoteById, [item.id]: note };
	}

	function removeItemsFromInbox(itemIds: Iterable<string>) {
		const ids = new Set(itemIds);
		if (ids.size === 0) return;
		items = items.filter((item) => !ids.has(item.id));
		selectedIds = new Set([...selectedIds].filter((id) => !ids.has(id)));
		decisionNoteById = Object.fromEntries(
			Object.entries(decisionNoteById).filter(([id]) => !ids.has(id))
		);
		onCountChange?.(items.length);
	}

	async function loadAgentChatModal(): Promise<NonNullable<AgentChatModalLazy>> {
		if (AgentChatModalComponent) return AgentChatModalComponent;
		const module = await import('$lib/components/agent/AgentChatModal.svelte');
		AgentChatModalComponent = module.default;
		return module.default;
	}

	function canChat(item: InboxItem): boolean {
		return (
			canDecide(item) ||
			Boolean(agentFailedChangeSet(item)) ||
			(item.source_type === 'project_audit' &&
				(item.status === 'pending' || item.status === 'blocked'))
		);
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
			console.error('[ProjectInboxPanel] failed to open inbox chat', error);
			toastService.error(friendlyFailure('open a chat for this review item'));
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
				toastService.error(friendlyFailure('update this review item'));
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
		if (run.status === 'failed') return "Project review couldn't finish. Try running it again.";
		return run.summary ?? 'Project review updated.';
	}

	function friendlyFailure(action: string): string {
		return `We couldn't ${action}. Try again in a moment.`;
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

	async function load(
		options: { silent?: boolean; showErrorToast?: boolean } = {}
	): Promise<LoopPayload | null> {
		if (!options.silent) loading = true;
		else refreshing = true;
		if (!options.silent) loadError = null;
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
			loadError = null;
			onCountChange?.(items.length);
			latestRun = loopResult?.latestRun ?? null;
			return loopResult;
		} catch (error) {
			console.error('[ProjectInboxPanel] load failed', error);
			const message = friendlyFailure("load this project's review items");
			if (!options.silent) {
				loadError = message;
			} else if (options.showErrorToast) {
				toastService.error(message);
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
			console.error('[ProjectInboxPanel] project review failed to start', error);
			toastService.error(friendlyFailure('start the project review'));
		} finally {
			triggering = false;
		}
	}

	async function decide(
		item: InboxItem,
		action: 'approve' | 'address' | 'reject',
		decisionNote?: string
	) {
		if (pendingIds.has(item.id)) return;
		const note = decisionNote?.trim() ?? '';
		pendingIds = new Set(pendingIds).add(item.id);
		const notificationId = startInboxDecisionNotification(item, action);
		removeItemsFromInbox([item.id]);
		try {
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					item_id: item.id,
					action,
					...(action === 'address' && note ? { resolution_text: note } : {}),
					...(action === 'reject' && item.source_type === 'project_suggestion' && note
						? { note }
						: {})
				})
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Action failed');

			const result = json.data?.result as
				| (ProjectSuggestionResult & { inProgress?: boolean })
				| undefined;
			let message =
				action === 'approve'
					? 'Review item applied.'
					: action === 'address'
						? 'Response recorded.'
						: 'Review item dismissed.';
			let title =
				action === 'approve'
					? 'Review item applied'
					: action === 'address'
						? 'Finding addressed'
						: 'Review item dismissed';
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
			console.error('[ProjectInboxPanel] inbox decision failed', error);
			failInboxDecisionNotification(
				notificationId,
				"We couldn't apply that decision. The item is back in your inbox."
			);
			void load({ silent: true });
		} finally {
			const next = new Set(pendingIds);
			next.delete(item.id);
			pendingIds = next;
		}
	}

	async function snooze(item: InboxItem) {
		if (pendingIds.has(item.id)) return;
		pendingIds = new Set(pendingIds).add(item.id);
		const notificationId = startInboxDecisionNotification(item, 'snooze');
		removeItemsFromInbox([item.id]);
		try {
			const snoozeUntil = new Date(Date.now() + SNOOZE_MS).toISOString();
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					item_id: item.id,
					action: 'snooze',
					snooze_until: snoozeUntil
				})
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Snooze failed');

			completeInboxDecisionNotification(
				notificationId,
				'Review item snoozed until tomorrow.',
				{
					toastKind: 'info',
					title: 'Review item snoozed'
				}
			);
		} catch (error) {
			console.error('[ProjectInboxPanel] inbox snooze failed', error);
			failInboxDecisionNotification(
				notificationId,
				"We couldn't snooze that item. It is back in your inbox."
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
			console.error('[ProjectInboxPanel] batch apply failed', error);
			failInboxDecisionNotification(
				notificationId,
				"We couldn't apply the selected items. They are back in your inbox."
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

<div class="min-w-0 space-y-0 overflow-x-hidden">
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
					Project review needs attention
				{:else}
					No pending review items
				{/if}
			</p>
			{#if latestRun?.summary && !items.length && !runActive && !pollingRunId}
				<p class="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">
					{latestRun.summary}
				</p>
			{/if}
		</div>
		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				onclick={() => load({ silent: true, showErrorToast: true })}
				disabled={loading || refreshing}
				class="h-11 w-11 p-0"
				title="Refresh inbox"
				aria-label="Refresh inbox"
			>
				<RefreshCw
					class="h-3.5 w-3.5 {refreshing
						? 'animate-spin motion-reduce:animate-none'
						: ''}"
				/>
			</Button>
			{#if PROJECT_LOOPS_ENABLED && canEdit}
				<Button
					variant="secondary"
					size="sm"
					onclick={runLoop}
					disabled={triggering || runActive || Boolean(pollingRunId)}
					class="min-h-11 px-3 text-xs"
				>
					<RefreshCw
						class="mr-1.5 h-3.5 w-3.5 {triggering || runActive || pollingRunId
							? 'animate-spin motion-reduce:animate-none'
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
					class="min-h-11 px-3 text-xs"
				>
					<Check class="mr-1.5 h-3.5 w-3.5" />
					Apply {selectedBatchIds.length}
				</Button>
			{/if}
		</div>
	</div>

	{#if latestRun?.brief}
		<div class="border-t border-border bg-muted/20 px-3 py-3">
			<p class="micro-label font-semibold text-muted-foreground">Project brief</p>
			{#if latestRun.brief.current_goal}
				<p class="mt-1 text-xs font-semibold text-foreground">
					{latestRun.brief.current_goal}
				</p>
			{/if}
			<div class="mt-2 grid gap-2 sm:grid-cols-2">
				{#if latestRun.brief.next_best_action}
					<div>
						<p class="micro-label font-semibold text-muted-foreground">Next</p>
						<p class="mt-0.5 text-2xs text-foreground/80">
							{latestRun.brief.next_best_action}
						</p>
					</div>
				{/if}
				{#if latestRun.brief.open_decisions?.length}
					<div>
						<p class="micro-label font-semibold text-muted-foreground">
							Open decisions
						</p>
						<p class="mt-0.5 line-clamp-2 text-2xs text-foreground/80">
							{latestRun.brief.open_decisions.slice(0, 3).join(' · ')}
						</p>
					</div>
				{/if}
			</div>
			{#if latestRun.brief.stale_assumptions?.length || latestRun.brief.contradictions_or_drift?.length}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each (latestRun.brief.stale_assumptions ?? []).slice(0, 3) as item, index (`stale-${index}-${item}`)}
						<span
							class="inline-block max-w-full truncate rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-2xs text-warning"
							title={item}
						>
							{item}
						</span>
					{/each}
					{#each (latestRun.brief.contradictions_or_drift ?? []).slice(0, 3) as item, index (`drift-${index}-${item}`)}
						<span
							class="inline-block max-w-full truncate rounded-md border border-border bg-card px-1.5 py-0.5 text-2xs text-muted-foreground"
							title={item}
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
				<div
					class="h-20 animate-pulse rounded-md border border-border bg-muted/30 motion-reduce:animate-none"
				></div>
			{/each}
		</div>
	{:else if loadError}
		<div class="border-t border-border px-4 py-6" role="alert">
			<div
				class="flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-3"
			>
				<AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold text-foreground">
						Review items are unavailable
					</p>
					<p class="mt-1 text-xs text-muted-foreground">{loadError}</p>
					<Button
						variant="outline"
						size="sm"
						onclick={() => load()}
						class="mt-3 min-h-11"
					>
						Try again
					</Button>
				</div>
			</div>
		</div>
	{:else if items.length === 0}
		<div class="border-t border-border px-3 py-6 text-center">
			<Inbox class="mx-auto h-5 w-5 text-muted-foreground" />
			<p class="mt-2 text-xs font-medium text-foreground">Inbox is clear</p>
			<p class="mt-1 text-2xs text-muted-foreground">
				New review items will appear here when an agent proposes project changes.
			</p>
		</div>
	{:else}
		<div class="min-w-0 overflow-x-hidden border-t border-border">
			{#each groupedItems as group (group.key)}
				<div class="micro-label bg-muted/20 px-3 py-2 font-semibold text-muted-foreground">
					{group.label} ({group.items.length})
				</div>
				{#each group.items as item (item.id)}
					{@const payload = projectSuggestion(item)}
					{@const agent = agentRun(item)}
					{@const reviewRun = projectLoopRunContext(item)}
					{@const audit = projectAuditContext(item)}
					{@const reviewRunText = reviewRunLabel(reviewRun)}
					{@const project = itemProject(item)}
					{@const changeSet = agentChangeSet(item)}
					{@const failedChangeSet = agentFailedChangeSet(item)}
					{@const auditRecommendations = auditRecommendationLabel(audit)}
					{@const tier = tierFor(item.risk_tier ?? payload?.risk_tier)}
					{@const Icon = sourceIcon(item)}
					{@const evidence = arrayValue<ProjectSuggestionEvidenceRef>(
						payload?.evidence_refs
					).slice(0, 3)}
					{@const changes = changeCount(item)}
					<div class="min-w-0 border-b border-border px-3 py-3 last:border-b-0">
						<div
							class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								<InboxProjectBadge {project} />
								<div class="flex flex-wrap items-center gap-2">
									{#if canBatchApprove(item)}
										<label
											class="-my-2 -ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background"
										>
											<input
												type="checkbox"
												class="h-5 w-5 rounded-md border-border"
												checked={selectedIds.has(item.id)}
												onchange={(event) =>
													updateSelected(
														item,
														(event.currentTarget as HTMLInputElement)
															.checked
													)}
											/>
											<span class="sr-only"
												>Select {item.title || 'review item'}</span
											>
										</label>
									{/if}
									<span
										class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-semibold {tier.cls}"
									>
										<Icon class="h-3 w-3" />
										{tier.label}
									</span>
									<span class="micro-label font-medium text-muted-foreground">
										{sourceLabel(item)}
									</span>
									{#if payload?.kind}
										<span class="micro-label font-medium text-muted-foreground">
											{kindLabel[payload.kind] ?? payload.kind}
										</span>
									{/if}
									{#if reviewRunText}
										<span
											class="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
										>
											{reviewRunText}
										</span>
									{/if}
								</div>
								<p
									class="mt-1.5 line-clamp-2 break-words text-sm font-semibold text-foreground"
								>
									{item.title || payload?.title || agent?.label || 'Review item'}
								</p>
								{#if payload?.why_now}
									<p
										class="mt-1 line-clamp-3 break-words text-xs text-foreground/80"
									>
										<span class="font-semibold">Why now:</span>
										{payload.why_now}
									</p>
								{:else if item.summary || payload?.rationale || agent?.goal}
									<p
										class="mt-1 line-clamp-3 break-words text-xs text-muted-foreground"
									>
										{item.summary ?? payload?.rationale ?? agent?.goal}
									</p>
								{/if}
								{#if payload?.preview?.summary}
									<p
										class="mt-1.5 line-clamp-3 break-words border-l-2 border-accent/30 pl-2 text-xs text-muted-foreground"
									>
										<span class="font-semibold text-foreground/80"
											>Preview:</span
										>
										{payload.preview.summary}
									</p>
								{/if}
								{#if item.source_type === 'project_audit' && audit}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#if auditRecommendations}
											<span
												class="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-2xs text-muted-foreground"
											>
												{auditRecommendations}
											</span>
										{/if}
										{#if audit.delivery_confidence}
											<span
												class="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-2xs text-accent"
											>
												{audit.delivery_confidence} confidence
											</span>
										{/if}
									</div>
								{/if}
								{#if evidence.length}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each evidence as ref, index (`${ref.entity_type}-${ref.entity_id ?? ref.title}-${index}`)}
											<span
												class="inline-block max-w-full truncate rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-2xs text-muted-foreground sm:max-w-[18rem]"
												title={evidenceLabel(ref)}
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
									<p class="mt-1.5 text-2xs text-muted-foreground">
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
											snoozing={pendingIds.has(item.id)}
											onApplied={() => handleAgentRunApplied(item)}
											onSnooze={() => snooze(item)}
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
								{#if isFinding(item)}
									<InboxFindingControls
										idPrefix={`project-inbox-${item.id}`}
										note={decisionNoteById[item.id] ?? ''}
										pending={pendingIds.has(item.id)}
										canChat={canChat(item)}
										openingChat={isOpeningChat(item)}
										layout="project"
										onNoteChange={(note) => updateDecisionNote(item, note)}
										onAddress={(note) => decide(item, 'address', note)}
										onReject={(note) => decide(item, 'reject', note)}
										onSnooze={() => snooze(item)}
										onChat={() => openChat(item)}
									/>
								{:else}
									<InboxDecisionControls
										pending={pendingIds.has(item.id)}
										canChat={canChat(item)}
										openingChat={isOpeningChat(item)}
										layout="project"
										onApprove={() => decide(item, 'approve')}
										onReject={() => decide(item, 'reject')}
										onSnooze={() => snooze(item)}
										onChat={() => openChat(item)}
									/>
								{/if}
							{:else if canChat(item)}
								<Button
									variant="outline"
									size="sm"
									loading={isOpeningChat(item)}
									disabled={isOpeningChat(item)}
									onclick={() => openChat(item)}
									class="min-h-11 w-full shrink-0 sm:w-auto"
								>
									<Sparkles class="mr-2 h-4 w-4" />
									Open chat
								</Button>
							{:else if item.decision_disabled_reason}
								<div
									class="w-full max-w-full shrink-0 break-words rounded-md border border-border bg-muted/30 px-2.5 py-2 text-2xs font-medium text-muted-foreground sm:w-auto sm:max-w-56"
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
