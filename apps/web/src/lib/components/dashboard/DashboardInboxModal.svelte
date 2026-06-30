<!-- apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte -->
<script lang="ts">
	import {
		CalendarDays,
		ClipboardCheck,
		FileText,
		Inbox,
		LoaderCircle,
		Sparkles
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
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
		startInboxDecisionNotification
	} from '$lib/services/inbox-decision-notification.service';
	import { toastService } from '$lib/stores/toast.store';
	import type {
		ChatContextType,
		ChangeSet,
		ProjectSuggestion,
		ProjectSuggestionEvidenceRef,
		ProjectSuggestionResult
	} from '@buildos/shared-types';

	type InboxSourceType = 'agent_run' | 'project_suggestion' | 'calendar_suggestion';
	type InboxItemStatus = 'pending' | 'deciding' | 'decided' | 'blocked' | 'expired' | 'snoozed';
	type CloseSummary = { hasChanges: boolean; changedCount: number; remainingCount: number };
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
		} | null;
	};

	type AgentRunPayload = {
		goal?: string | null;
		label?: string | null;
		change_set?: ChangeSet | null;
	};

	type CalendarSuggestionPayload = {
		ai_reasoning?: string | null;
		confidence_score?: number | null;
		detected_keywords?: string[] | null;
		event_count?: number | null;
		event_patterns?: unknown;
		suggested_context?: string | null;
		suggested_description?: string | null;
		suggested_name?: string | null;
		suggested_tasks?: unknown;
	};

	type CalendarTaskPreview = {
		title: string;
		description?: string;
		start_date?: string;
		priority?: string | number;
		task_type?: string;
		recurrence_pattern?: string;
	};

	type CalendarEventPattern = {
		start_date?: string;
		end_date?: string;
		tags?: string[];
	};

	type ProjectLoopRunContext = {
		id: string;
		trigger_reason: string | null;
		status: string | null;
		summary: string | null;
		brief: Record<string, unknown> | null;
		suggestion_count: number | null;
		created_at: string | null;
		finished_at: string | null;
	};

	let {
		isOpen,
		onClose
	}: {
		isOpen: boolean;
		onClose: (summary?: CloseSummary) => void;
	} = $props();

	let items = $state<InboxItem[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let pendingIds = $state<Set<string>>(new Set());
	let changedCount = $state(0);
	let wasOpen = $state(false);
	let activeGroupKey = $state<string | null>(null);
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);
	let chatSessionId = $state<string | null>(null);
	let chatItemId = $state<string | null>(null);
	let chatContext = $state<{ contextType: ChatContextType; entityId?: string } | null>(null);
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

	const accountGroupKey = 'account';

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
		const groups = new Map<string, InboxItem[]>();
		for (const item of items) {
			const key = item.project_id ?? accountGroupKey;
			groups.set(key, [...(groups.get(key) ?? []), item]);
		}
		return [...groups.entries()].map(([key, groupItems]) => {
			const project = groupItems.find((item) => item.project)?.project ?? null;
			return {
				key,
				label: key === accountGroupKey ? 'Account' : (project?.name ?? 'Project'),
				projectId: key === accountGroupKey ? null : key,
				actionableCount: groupItems.filter(canDecide).length,
				items: groupItems
			};
		});
	});
	const activeGroup = $derived(
		groupedItems.find((group) => group.key === activeGroupKey) ?? groupedItems[0] ?? null
	);
	const totalActionable = $derived(items.filter(canDecide).length);

	function asRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	}

	function sourcePayload<T extends Record<string, unknown>>(item: InboxItem): T | null {
		return asRecord(item.source_payload) as T | null;
	}

	function projectSuggestion(item: InboxItem): ProjectSuggestion | null {
		return sourcePayload<ProjectSuggestion & Record<string, unknown>>(item);
	}

	function agentRun(item: InboxItem): AgentRunPayload | null {
		return sourcePayload<AgentRunPayload & Record<string, unknown>>(item);
	}

	function calendarSuggestion(item: InboxItem): CalendarSuggestionPayload | null {
		return sourcePayload<CalendarSuggestionPayload & Record<string, unknown>>(item);
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

	function arrayValue<T>(value: unknown): T[] {
		return Array.isArray(value) ? (value as T[]) : [];
	}

	function calendarTasks(item: InboxItem): CalendarTaskPreview[] {
		const tasks = calendarSuggestion(item)?.suggested_tasks;
		if (!Array.isArray(tasks)) return [];
		return tasks
			.filter(
				(task): task is Record<string, unknown> => typeof task === 'object' && task !== null
			)
			.map((task) => ({
				title:
					typeof task.title === 'string' && task.title.trim()
						? task.title.trim()
						: 'Untitled task',
				description:
					typeof task.description === 'string' && task.description.trim()
						? task.description.trim()
						: undefined,
				start_date: typeof task.start_date === 'string' ? task.start_date : undefined,
				priority:
					typeof task.priority === 'string' || typeof task.priority === 'number'
						? task.priority
						: undefined,
				task_type: typeof task.task_type === 'string' ? task.task_type : undefined,
				recurrence_pattern:
					typeof task.recurrence_pattern === 'string'
						? task.recurrence_pattern
						: undefined
			}));
	}

	function calendarEventPattern(item: InboxItem): CalendarEventPattern | null {
		const pattern = calendarSuggestion(item)?.event_patterns;
		if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) return null;
		const record = pattern as Record<string, unknown>;
		return {
			start_date: typeof record.start_date === 'string' ? record.start_date : undefined,
			end_date: typeof record.end_date === 'string' ? record.end_date : undefined,
			tags: Array.isArray(record.tags)
				? record.tags.filter((tag): tag is string => typeof tag === 'string')
				: undefined
		};
	}

	function formatShortDate(value: string | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatCalendarDateRange(pattern: CalendarEventPattern | null): string | null {
		const start = formatShortDate(pattern?.start_date);
		const end = formatShortDate(pattern?.end_date);
		if (start && end && start !== end) return `${start} - ${end}`;
		return start ?? end;
	}

	function formatConfidence(value: number | null | undefined): string | null {
		if (typeof value !== 'number' || !Number.isFinite(value)) return null;
		return `${Math.round(value * 100)}% confidence`;
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
		const date = formatShortDate(run.finished_at ?? run.created_at ?? undefined);
		return date ? `${trigger} · ${date}` : trigger;
	}

	function tierFor(value: number | null | undefined): TierMeta {
		if (!value) return fallbackTier;
		return tierMeta[value] ?? fallbackTier;
	}

	function sourceLabel(item: InboxItem): string {
		if (item.source_type === 'agent_run') return 'Agent proposal';
		if (item.source_type === 'calendar_suggestion') return 'Calendar suggestion';
		return 'Project review';
	}

	function sourceIcon(item: InboxItem): typeof Inbox {
		if (item.source_type === 'agent_run') return Sparkles;
		if (item.source_type === 'project_suggestion') return ClipboardCheck;
		if (item.source_type === 'calendar_suggestion') return CalendarDays;
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

	function evidenceLabel(ref: ProjectSuggestionEvidenceRef): string {
		return `${evidenceTypeLabel[ref.entity_type] ?? 'Source'}: ${ref.title}`;
	}

	function removeItemFromInbox(item: InboxItem): boolean {
		return removeItemById(item.id);
	}

	function removeItemById(itemId: string): boolean {
		const before = items.length;
		items = items.filter((candidate) => candidate.id !== itemId);
		return items.length !== before;
	}

	function canDecide(item: InboxItem): boolean {
		return item.status === 'pending' && item.can_decide === true;
	}

	function canChat(item: InboxItem): boolean {
		return canDecide(item) || Boolean(agentFailedChangeSet(item));
	}

	function isOpeningChat(item: InboxItem): boolean {
		return openingChatIds.has(item.id);
	}

	async function loadAgentChatModal(): Promise<NonNullable<AgentChatModalLazy>> {
		if (AgentChatModalComponent) return AgentChatModalComponent;
		const module = await import('$lib/components/agent/AgentChatModal.svelte');
		AgentChatModalComponent = module.default;
		return module.default;
	}

	function contextTypeForChat(
		item: InboxItem,
		result: Record<string, unknown> | null,
		session: Record<string, unknown> | null
	): ChatContextType {
		const contextType = result?.context_type ?? session?.context_type;
		if (
			contextType === 'project' ||
			contextType === 'calendar' ||
			contextType === 'global' ||
			contextType === 'daily_brief' ||
			contextType === 'general' ||
			contextType === 'project_create' ||
			contextType === 'daily_brief_update' ||
			contextType === 'ontology'
		) {
			return contextType;
		}
		if (item.project_id) return 'project';
		if (item.source_type === 'calendar_suggestion') return 'calendar';
		return 'global';
	}

	function readString(value: unknown): string | null {
		return typeof value === 'string' && value.trim() ? value.trim() : null;
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
			const result = (json.data ?? null) as Record<string, unknown> | null;
			const session = (json.data?.session ?? null) as Record<string, unknown> | null;
			const entityId =
				readString(result?.entity_id) ??
				readString(session?.entity_id) ??
				readString(result?.project_id) ??
				item.project_id ??
				undefined;
			chatContext = {
				contextType: contextTypeForChat(item, result, session),
				entityId: entityId ?? undefined
			};
			chatSessionId = nextChatSessionId;
			chatItemId = item.id;
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Failed to open chat');
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
				const removed = removeItemById(itemId);
				if (removed) changedCount += 1;
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
		chatContext = null;
		resolvingChatAction = null;
		if (wasExplicitlyResolved) {
			explicitlyResolvedChatItemId = null;
			return;
		}
		if (itemId && summary?.hasChanges) {
			void resolveChatItem(itemId, { summary });
		}
	}

	async function loadInbox(options: { silent?: boolean } = {}) {
		if (!options.silent) loading = true;
		if (!options.silent) error = null;
		try {
			const url = new URL('/api/inbox', window.location.origin);
			url.searchParams.set('status', 'pending');
			url.searchParams.set('include_payload', '1');
			url.searchParams.set('limit', '100');
			const res = await fetch(url);
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Failed to load inbox');
			items = json.data?.items ?? [];
		} catch (err) {
			if (!options.silent) {
				error = err instanceof Error ? err.message : 'Failed to load inbox';
			}
		} finally {
			if (!options.silent) loading = false;
		}
	}

	async function decide(item: InboxItem, action: 'approve' | 'reject') {
		if (pendingIds.has(item.id)) return;
		pendingIds = new Set(pendingIds).add(item.id);
		const notificationId = startInboxDecisionNotification(item, action);
		const removed = removeItemFromInbox(item);
		if (removed) changedCount += 1;
		try {
			const res = await fetch('/api/inbox/decide', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					item_id: item.id,
					action
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
		} catch (err) {
			if (removed) changedCount = Math.max(0, changedCount - 1);
			failInboxDecisionNotification(
				notificationId,
				err instanceof Error ? err.message : 'Action failed'
			);
			void loadInbox({ silent: true });
		} finally {
			const next = new Set(pendingIds);
			next.delete(item.id);
			pendingIds = next;
		}
	}

	function handleAgentRunApplied(item: InboxItem) {
		if (removeItemFromInbox(item)) changedCount += 1;
	}

	function close() {
		closeChat();
		onClose({
			hasChanges: changedCount > 0,
			changedCount,
			remainingCount: items.length
		});
	}

	$effect(() => {
		if (isOpen && !wasOpen) {
			wasOpen = true;
			changedCount = 0;
			void loadInbox();
		} else if (!isOpen && wasOpen) {
			wasOpen = false;
		}
	});

	$effect(() => {
		if (!items.length) {
			activeGroupKey = null;
			return;
		}

		if (!activeGroupKey || !groupedItems.some((group) => group.key === activeGroupKey)) {
			activeGroupKey = groupedItems[0]?.key ?? null;
		}
	});
</script>

<Modal {isOpen} onClose={close} title="AI Inbox" size="xl">
	<div class="flex min-h-[55vh] flex-col overflow-hidden">
		<div class="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">
					{#if loading}
						Loading review items
					{:else if items.length}
						{items.length} pending item{items.length === 1 ? '' : 's'}
					{:else}
						Inbox is clear
					{/if}
				</p>
				{#if changedCount > 0}
					<p class="mt-0.5 text-[11px] text-muted-foreground">
						{changedCount} handled this session
					</p>
				{:else if items.length && totalActionable !== items.length}
					<p class="mt-0.5 text-[11px] text-muted-foreground">
						{totalActionable} actionable
					</p>
				{/if}
			</div>
			<button
				type="button"
				onclick={() => loadInbox()}
				disabled={loading}
				class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
				title="Refresh inbox"
			>
				<LoaderCircle class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
			</button>
		</div>

		{#if loading}
			<div class="space-y-2 p-3">
				{#each Array(4) as _, index (index)}
					<div
						class="h-24 rounded-md border border-border bg-muted/30 animate-pulse"
					></div>
				{/each}
			</div>
		{:else if error}
			<div class="p-4">
				<p class="text-sm text-destructive">{error}</p>
				<button
					type="button"
					onclick={() => loadInbox()}
					class="mt-3 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
				>
					Retry
				</button>
			</div>
		{:else if items.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
				<Inbox class="h-6 w-6 text-muted-foreground" />
				<p class="mt-2 text-sm font-semibold text-foreground">No pending review items</p>
				<p class="mt-1 max-w-sm text-xs text-muted-foreground">
					Agent proposals and source-specific suggestions will appear here when they need
					a decision.
				</p>
			</div>
		{:else}
			<div
				class="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)]"
			>
				<div
					class="border-b border-border p-2 lg:max-h-[calc(85dvh-8rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r"
				>
					<div class="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
						{#each groupedItems as group (group.key)}
							<button
								type="button"
								onclick={() => (activeGroupKey = group.key)}
								class="min-w-[190px] rounded-md border px-2.5 py-2 text-left transition-colors lg:min-w-0 {activeGroup?.key ===
								group.key
									? 'border-accent/40 bg-accent/10'
									: 'border-border bg-card hover:bg-muted/40'}"
							>
								<div class="flex items-start justify-between gap-2">
									<p
										class="min-w-0 truncate text-xs font-semibold text-foreground"
									>
										{group.label}
									</p>
									<span
										class="shrink-0 text-[11px] font-semibold text-foreground"
									>
										{group.items.length}
									</span>
								</div>
								<p class="mt-1 text-[11px] text-muted-foreground">
									{group.actionableCount} actionable
								</p>
							</button>
						{/each}
					</div>
				</div>

				{#if activeGroup}
					<section class="flex min-h-0 flex-col overflow-hidden">
						<div
							class="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2"
						>
							<div class="min-w-0">
								<p class="truncate text-xs font-semibold text-foreground">
									{activeGroup.label}
									<span class="text-muted-foreground">
										({activeGroup.items.length})
									</span>
								</p>
								{#if activeGroup.actionableCount !== activeGroup.items.length}
									<p class="mt-0.5 text-[11px] text-muted-foreground">
										{activeGroup.actionableCount} actionable
									</p>
								{/if}
							</div>
							{#if activeGroup.projectId}
								<a
									href="/projects/{activeGroup.projectId}"
									class="shrink-0 text-xs font-medium text-accent hover:underline"
								>
									Open project
								</a>
							{/if}
						</div>

						<div class="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
							{#each activeGroup.items as item (item.id)}
								{@const payload = projectSuggestion(item)}
								{@const agent = agentRun(item)}
								{@const changeSet = agentChangeSet(item)}
								{@const failedChangeSet = agentFailedChangeSet(item)}
								{@const calendar = calendarSuggestion(item)}
								{@const reviewRun = projectLoopRunContext(item)}
								{@const reviewRunText = reviewRunLabel(reviewRun)}
								{@const taskPreview = calendarTasks(item)}
								{@const eventPattern = calendarEventPattern(item)}
								{@const dateRange = formatCalendarDateRange(eventPattern)}
								{@const confidence = formatConfidence(calendar?.confidence_score)}
								{@const tier = tierFor(item.risk_tier ?? payload?.risk_tier)}
								{@const Icon = sourceIcon(item)}
								{@const evidence = arrayValue<ProjectSuggestionEvidenceRef>(
									payload?.evidence_refs
								).slice(0, 2)}
								{@const changes = changeCount(item)}
								<div class="px-3 py-3">
									<div
										class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
									>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
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
												{item.title ||
													payload?.title ||
													agent?.label ||
													'Review item'}
											</p>
											{#if payload?.why_now}
												<p class="mt-1 text-[12px] text-foreground/80">
													<span class="font-semibold">Why now:</span>
													{payload.why_now}
												</p>
											{:else if item.summary || payload?.rationale || agent?.goal}
												<p class="mt-1 text-[12px] text-muted-foreground">
													{item.summary ??
														payload?.rationale ??
														agent?.goal}
												</p>
											{/if}
											{#if payload?.preview?.summary}
												<p
													class="mt-1.5 border-l-2 border-accent/30 pl-2 text-[12px] text-muted-foreground"
												>
													<span class="font-semibold text-foreground/80">
														Preview:
													</span>
													{payload.preview.summary}
												</p>
											{/if}
											{#if item.source_type === 'calendar_suggestion' && calendar}
												<div class="mt-2 space-y-2">
													<div class="flex flex-wrap gap-1.5">
														{#if calendar.event_count}
															<span
																class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
															>
																{calendar.event_count} event{calendar.event_count ===
																1
																	? ''
																	: 's'}
															</span>
														{/if}
														{#if taskPreview.length}
															<span
																class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
															>
																{taskPreview.length} task{taskPreview.length ===
																1
																	? ''
																	: 's'}
															</span>
														{/if}
														{#if dateRange}
															<span
																class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
															>
																{dateRange}
															</span>
														{/if}
														{#if confidence}
															<span
																class="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
															>
																{confidence}
															</span>
														{/if}
													</div>
													{#if calendar.suggested_description || calendar.suggested_context}
														<p
															class="text-[12px] text-muted-foreground"
														>
															{calendar.suggested_description ??
																calendar.suggested_context}
														</p>
													{/if}
													{#if taskPreview.length}
														<div
															class="rounded-md border border-border bg-muted/20 p-2"
														>
															<p
																class="text-[10px] font-semibold uppercase text-muted-foreground"
															>
																Suggested tasks
															</p>
															<div class="mt-1.5 space-y-1">
																{#each taskPreview.slice(0, 3) as task}
																	<div
																		class="flex items-start justify-between gap-2 text-[11px]"
																	>
																		<div class="min-w-0">
																			<p
																				class="truncate font-medium text-foreground"
																			>
																				{task.title}
																			</p>
																			{#if task.start_date || task.recurrence_pattern}
																				<p
																					class="mt-0.5 text-muted-foreground"
																				>
																					{formatShortDate(
																						task.start_date
																					) ??
																						task.recurrence_pattern}
																				</p>
																			{/if}
																		</div>
																		{#if task.priority}
																			<span
																				class="shrink-0 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
																			>
																				{task.priority}
																			</span>
																		{/if}
																	</div>
																{/each}
															</div>
															{#if taskPreview.length > 3}
																<p
																	class="mt-1.5 text-[10px] text-muted-foreground"
																>
																	+{taskPreview.length - 3} more
																</p>
															{/if}
														</div>
													{/if}
												</div>
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
													{changes} proposed change{changes === 1
														? ''
														: 's'}
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
														onApplied={() =>
															handleAgentRunApplied(item)}
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
												layout="dashboard"
												onApprove={() => decide(item, 'approve')}
												onReject={() => decide(item, 'reject')}
												onChat={() => openChat(item)}
											/>
										{:else if !canDecide(item)}
											<div
												class="shrink-0 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
											>
												{item.decision_disabled_reason ?? 'View only'}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</Modal>

{#if AgentChatModalComponent && chatSessionId}
	<AgentChatModalComponent
		isOpen={Boolean(chatSessionId)}
		contextType={chatContext?.contextType ?? 'global'}
		entityId={chatContext?.entityId}
		initialChatSessionId={chatSessionId}
		{inboxResolutionActions}
		onClose={closeChat}
	/>
{/if}
