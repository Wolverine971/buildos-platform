<!-- apps/web/src/lib/components/notifications/types/agent-run/AgentRunModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import {
		LoaderCircle,
		CheckCircle,
		AlertCircle,
		XCircle,
		CircleHelp,
		FileDiff,
		Pause,
		ArrowRight,
		MessageSquare,
		Activity
	} from '$lib/icons/lucide';
	import { formatDistanceToNow } from 'date-fns';
	import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
	import type { Database, AgentRunStatus, ChangeSet } from '@buildos/shared-types';
	import type { AgentRunNotification } from '$lib/types/notification.types';
	import { toastService } from '$lib/stores/toast.store';
	import { notificationStore } from '$lib/stores/notification.store';
	import { agentRunsStore } from '$lib/services/agentRunsRealtime.service';
	import {
		agentRunAccessLabel,
		agentRunDisplayTitle,
		agentRunStatusLabel,
		agentRunTriggerLabel
	} from '$lib/services/agent-run-notification-data';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import AgentRunSteerControl from './AgentRunSteerControl.svelte';
	import ChangeSetFailureSummary from './ChangeSetFailureSummary.svelte';
	import ChangeSetReview from './ChangeSetReview.svelte';
	import { prepareAgentRunChatEventDetail } from './agent-run-chat-session.client';

	const proseClasses = getProseClasses('sm');

	type AgentRunEventRow = Database['public']['Tables']['agent_run_events']['Row'];

	let {
		notification,
		onMinimize,
		onClose,
		onCancel
	}: {
		notification: AgentRunNotification | null;
		onMinimize?: () => void;
		onClose?: () => void;
		onCancel?: () => void;
	} = $props();

	const supabase = getContext<SupabaseClient | undefined>('supabase');

	let runId = $derived(notification?.data.runId ?? '');
	let runStatus = $derived<AgentRunStatus>(notification?.data.runStatus ?? 'cancelled');
	let result = $derived(notification?.data.result ?? null);
	let metrics = $derived(notification?.data.metrics ?? null);
	let proposedChangeSet = $derived((result?.proposed_changes ?? null) as ChangeSet | null);
	let failedChangeSet = $derived(
		proposedChangeSet?.changes.some(
			(change) => typeof change.error === 'string' && change.error.trim()
		)
			? proposedChangeSet
			: null
	);
	let canAnswerRun = $derived(
		runStatus === 'needs_input' ||
			(runStatus === 'partial' && Boolean(result?.open_questions?.length))
	);
	let canOpenChat = $derived(Boolean(runId));
	let isActive = $derived(
		runStatus === 'queued' ||
			runStatus === 'running' ||
			runStatus === 'paused' ||
			runStatus === 'needs_input' ||
			runStatus === 'proposal_ready'
	);
	let displayTitle = $derived(
		agentRunDisplayTitle(
			notification?.data.activityLabel,
			notification?.data.targetLabel,
			notification?.data.label ?? 'Agent work'
		)
	);
	let projectLabel = $derived(
		notification?.data.projectName ??
			(notification?.data.contextType === 'global' ? 'Workspace' : 'Project')
	);
	let sourceLabel = $derived(notification ? agentRunTriggerLabel(notification.data.trigger) : '');
	let accessLabel = $derived(
		notification
			? agentRunAccessLabel(notification.data.scopeMode, notification.data.reviewRequired)
			: ''
	);

	let events = $state<AgentRunEventRow[]>([]);
	let loadingEvents = $state(true);
	let openingChat = $state(false);
	let channel: RealtimeChannel | null = null;

	let appliedSteerMessages = $derived(
		events
			.filter((e) => e.event_type === 'run.steer')
			.map((e) => (e.payload as { message?: string } | null)?.message)
			.filter((m): m is string => Boolean(m))
	);

	function statusIcon(status: AgentRunStatus) {
		switch (status) {
			case 'completed':
				return { icon: CheckCircle, cls: 'text-success' };
			case 'partial':
				return { icon: AlertCircle, cls: 'text-warning' };
			case 'failed':
				return { icon: AlertCircle, cls: 'text-destructive' };
			case 'cancelled':
				return { icon: XCircle, cls: 'text-muted-foreground' };
			case 'needs_input':
				return { icon: CircleHelp, cls: 'text-warning' };
			case 'proposal_ready':
				return { icon: FileDiff, cls: 'text-info' };
			case 'paused':
				return { icon: Pause, cls: 'text-muted-foreground' };
			case 'queued':
				return {
					icon: LoaderCircle,
					cls: 'text-muted-foreground animate-spin motion-reduce:animate-none'
				};
			default:
				return {
					icon: LoaderCircle,
					cls: 'text-info animate-spin motion-reduce:animate-none'
				};
		}
	}

	let headIcon = $derived(statusIcon(runStatus));

	function projectHref(projectId?: string | null): string | null {
		return projectId ? `/projects/${projectId}` : null;
	}

	function entityHref(entity: {
		type: string;
		id: string;
		project_id?: string | null;
		url?: string | null;
	}): string | null {
		if (entity.url) return entity.url;
		const projectId = entity.project_id ?? notification?.data.projectId ?? null;
		if (entity.type === 'project') return `/projects/${entity.id}`;
		if (!projectId) return null;
		if (entity.type === 'task') return `/projects/${projectId}/tasks/${entity.id}`;
		if (entity.type === 'document') return `/projects/${projectId}/documents/${entity.id}`;
		return `/projects/${projectId}?entity=${encodeURIComponent(entity.type)}&id=${encodeURIComponent(entity.id)}`;
	}

	function entityLabel(entity: { type: string; id: string; title?: string | null }): string {
		return entity.title?.trim() || entity.type;
	}

	function mergeEvent(row: AgentRunEventRow | null) {
		if (!row?.id) return;
		if (events.some((e) => e.id === row.id)) return;
		events = [...events, row].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
	}

	async function loadEvents() {
		if (!runId) return;
		try {
			const response = await fetch(`/api/agent-runs/${runId}`, {
				headers: { accept: 'application/json' }
			});
			if (response.ok) {
				const body = await response.json().catch(() => null);
				const rows: AgentRunEventRow[] = body?.data?.events ?? [];
				events = rows.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
			}
		} catch (error) {
			console.warn('[AgentRunModal] Failed to load events', error);
		} finally {
			loadingEvents = false;
		}
	}

	async function subscribe() {
		if (!supabase || !runId) return;
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (session?.access_token) supabase.realtime.setAuth(session.access_token);

			const ch = supabase.channel(`agent-run:${runId}`, { config: { private: true } });
			ch.on('broadcast', { event: 'agent-run-event' }, (payload) => {
				const record =
					(payload as any)?.payload?.record ??
					(payload as any)?.record ??
					(payload as any)?.payload?.new ??
					null;
				if (record) mergeEvent(record as AgentRunEventRow);
			});
			await ch.subscribe();
			channel = ch;
		} catch (error) {
			console.warn('[AgentRunModal] Failed to subscribe to run events', error);
		}
	}

	onMount(() => {
		void loadEvents();
		void subscribe();
	});

	onDestroy(() => {
		if (channel && supabase) {
			void supabase.removeChannel(channel);
			channel = null;
		}
	});

	function eventLine(event: AgentRunEventRow): {
		icon: typeof ArrowRight;
		cls: string;
		text: string;
	} {
		const p = (event.payload ?? {}) as Record<string, any>;
		switch (event.event_type) {
			case 'run.tool_call':
				return { icon: ArrowRight, cls: 'text-info', text: `Calling ${p.op ?? 'op'}` };
			case 'run.tool_result':
				return p.ok === false
					? {
							icon: XCircle,
							cls: 'text-destructive',
							text: `${p.op ?? 'op'} failed${p.error?.message ? `: ${p.error.message}` : ''}`
						}
					: { icon: CheckCircle, cls: 'text-success', text: `${p.op ?? 'op'} ok` };
			case 'run.status':
				return {
					icon: Activity,
					cls: 'text-muted-foreground',
					text: `Status: ${p.status ?? ''}`
				};
			case 'run.steer':
				return {
					icon: MessageSquare,
					cls: 'text-warning',
					text: `Steer: ${p.message ?? ''}`
				};
			case 'run.message':
				return {
					icon: MessageSquare,
					cls: 'text-foreground',
					text: p.text ?? p.message ?? ''
				};
			case 'run.narration':
			default:
				return {
					icon: MessageSquare,
					cls: 'text-muted-foreground',
					text: p.thought ?? p.note ?? p.message ?? p.error ?? ''
				};
		}
	}

	let startedRelative = $derived.by(() => {
		const timestamp = notification?.data.startedAt ?? notification?.data.runCreatedAt;
		return timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : '';
	});

	function formatDuration(ms?: number): string {
		if (!ms || ms <= 0) return '—';
		const s = Math.round(ms / 1000);
		if (s < 60) return `${s}s`;
		const m = Math.floor(s / 60);
		return `${m}m ${s % 60}s`;
	}

	function deferNotificationUpdate(fn: () => void) {
		if (typeof window === 'undefined') {
			fn();
			return;
		}
		window.setTimeout(fn, 0);
	}

	function handleMinimize() {
		const id = notification?.id;
		const callback = onMinimize;
		if (!id && !callback) return;
		deferNotificationUpdate(() => {
			if (callback) callback();
			else if (id) notificationStore.minimize(id);
		});
	}

	function handleDismiss() {
		const id = notification?.id;
		const dismiss = notification?.actions?.dismiss;
		const callback = onClose;
		if (!id && !callback) return;
		deferNotificationUpdate(() => {
			if (callback) callback();
			else if (dismiss) dismiss();
			else if (id) notificationStore.remove(id);
		});
	}

	function handleClose() {
		if (isActive) handleMinimize();
		else handleDismiss();
	}

	async function handleCancel() {
		if (!runId) return;
		try {
			const response = await fetch(`/api/agent-runs/${runId}/cancel`, { method: 'POST' });
			if (!response.ok) {
				toastService.error('Could not stop this work');
				return;
			}
			toastService.info('Stopping work…');
			onCancel?.();
		} catch {
			toastService.error('Could not stop this work');
		}
	}

	async function handleRetry() {
		if (!runId) return;
		const run = get(agentRunsStore).get(runId);
		if (!run) return;
		try {
			const response = await fetch('/api/agent-runs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					label: run.label,
					goal: run.goal,
					instructions: run.instructions ?? undefined,
					expected_output: run.expected_output ?? undefined,
					context_type: run.context_type,
					project_id: run.project_id ?? undefined,
					scope_mode: run.scope_mode,
					allowed_ops: run.allowed_ops ?? undefined,
					review: run.review_required,
					budgets: run.budgets ?? undefined
				})
			});
			if (!response.ok) {
				toastService.error('Could not retry this work');
				return;
			}
			toastService.success('Work started again');
			handleDismiss();
		} catch {
			toastService.error('Could not retry this work');
		}
	}

	let answerText = $state('');
	let answering = $state(false);
	async function submitAnswer() {
		const answer = answerText.trim();
		if (!answer || answering || !runId) return;
		answering = true;
		try {
			const res = await fetch(`/api/agent-runs/${runId}/answer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ answer })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				toastService.error(body?.error || 'Could not send your answer');
				return;
			}
			toastService.info('Sent — the agent is picking it back up…');
			answerText = '';
		} catch {
			toastService.error('Could not send your answer');
		} finally {
			answering = false;
		}
	}

	async function handleOpenChat() {
		if (!notification || !runId || typeof window === 'undefined' || openingChat) return;
		openingChat = true;
		try {
			const detail = await prepareAgentRunChatEventDetail({
				runId,
				notificationData: notification.data
			});
			window.dispatchEvent(
				new CustomEvent('buildos:open-agent-chat', {
					detail
				})
			);
		} catch (error) {
			console.error('[AgentRunModal] Failed to open chat', error);
			toastService.error(error instanceof Error ? error.message : 'Could not open chat');
		} finally {
			openingChat = false;
		}
	}
</script>

{#if notification}
	<Modal
		isOpen={true}
		onClose={handleClose}
		title={displayTitle}
		size={runStatus === 'proposal_ready' || failedChangeSet ? 'xl' : 'lg'}
		variant="bottom-sheet"
		showCloseButton={true}
	>
		{#snippet children()}
			<div class="px-3 sm:px-4 py-3 sm:py-4 space-y-4">
				<!-- Header: project + friendly status/source/access + preview -->
				<div class="flex items-start gap-3">
					<div class="flex-shrink-0 mt-0.5">
						{#if headIcon}
							{@const HeadIcon = headIcon.icon}
							<HeadIcon class="w-5 h-5 {headIcon.cls}" />
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						{#if projectHref(notification.data.projectId)}
							<a
								href={projectHref(notification.data.projectId)}
								class="inline-block max-w-full truncate text-sm font-semibold text-accent hover:underline"
							>
								{projectLabel}
							</a>
						{:else}
							<div class="truncate text-sm font-semibold text-foreground">
								{projectLabel}
							</div>
						{/if}
						<div class="flex items-center gap-2 flex-wrap">
							<span class="text-xs font-medium text-foreground"
								>{agentRunStatusLabel(runStatus)}</span
							>
							<span class="text-xs text-muted-foreground">·</span>
							<span class="text-xs text-muted-foreground">{sourceLabel}</span>
							<span class="text-xs text-muted-foreground">·</span>
							<span class="text-xs text-muted-foreground">{accessLabel}</span>
							{#if startedRelative}
								<span class="text-xs text-muted-foreground">·</span>
								<span class="text-xs text-muted-foreground">{startedRelative}</span>
							{/if}
						</div>
						<p class="mt-1 text-sm text-foreground">
							{notification.data.preview ?? notification.data.goal}
						</p>
					</div>
				</div>

				<!-- Steer / pause / resume (live runs; needs_input uses the answer box) -->
				{#if runStatus === 'running' || runStatus === 'paused' || runStatus === 'queued'}
					<AgentRunSteerControl {runId} {runStatus} {appliedSteerMessages} />
				{/if}

				<!-- Proposal review — the run staged changes for your approval (review run) -->
				{#if runStatus === 'proposal_ready' && proposedChangeSet?.changes?.length}
					<ChangeSetReview
						{runId}
						changeSet={proposedChangeSet}
						acceptLabel="Accept"
						dismissLabel="Dismiss"
						approveAllLabel="Accept"
						rejectAllLabel="Dismiss"
						onApplied={handleDismiss}
						onChat={canOpenChat ? handleOpenChat : undefined}
						{openingChat}
					/>
				{:else if failedChangeSet}
					<ChangeSetFailureSummary
						changeSet={failedChangeSet}
						onChat={canOpenChat ? handleOpenChat : undefined}
						{openingChat}
					/>
				{/if}

				<!-- Answer box — the run is blocked or can continue from a partial result -->
				{#if canAnswerRun}
					<div class="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
						<div class="micro-label text-warning">
							{runStatus === 'partial'
								? 'Continue this work'
								: 'BuildOS needs your input'}
						</div>
						{#if result?.open_questions?.length}
							<ul class="list-disc list-inside space-y-0.5">
								{#each result.open_questions as q}
									<li class="text-sm text-foreground">{q}</li>
								{/each}
							</ul>
						{/if}
						<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
							<textarea
								bind:value={answerText}
								rows="2"
								disabled={answering}
								placeholder={runStatus === 'partial'
									? 'Tell BuildOS what to do next…'
									: 'Type your answer…'}
								class="min-h-[4.5rem] flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 sm:min-h-0 sm:text-sm"
							></textarea>
							<Button
								onclick={submitAnswer}
								variant="primary"
								size="md"
								disabled={answering || !answerText.trim()}
								class="w-full sm:w-auto"
							>
								{runStatus === 'partial' ? 'Continue' : 'Answer'}
							</Button>
						</div>
					</div>
				{/if}

				<!-- Result summary / answer -->
				{#if result?.summary || result?.answer}
					<div class="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
						{#if result.summary}
							<div>
								<div class="micro-label text-muted-foreground">Summary</div>
								<div class="agent-run-prose {proseClasses} mt-0.5 break-words">
									{@html renderMarkdown(result.summary)}
								</div>
							</div>
						{/if}
						{#if result.answer && result.answer !== result.summary}
							<div>
								<div class="micro-label text-muted-foreground">Answer</div>
								<div class="agent-run-prose {proseClasses} mt-0.5 break-words">
									{@html renderMarkdown(result.answer)}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Error -->
				{#if runStatus === 'failed' && notification.data.error}
					<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
						<div class="micro-label text-destructive">Error</div>
						<p class="text-sm text-destructive mt-0.5 whitespace-pre-wrap">
							{notification.data.error}
						</p>
					</div>
				{/if}

				<!-- Entities touched -->
				{#if result?.entities_touched?.length}
					<div>
						<div class="micro-label mb-1.5 text-muted-foreground">
							Changes ({result.entities_touched.length})
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each result.entities_touched as entity (`${entity.type}:${entity.id}:${entity.action}`)}
								{@const href = entityHref(entity)}
								{#if href}
									<a
										{href}
										class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-card border border-border text-foreground hover:border-accent/50 hover:text-accent"
										title={entity.description}
									>
										<span class="text-muted-foreground">{entity.action}</span>
										{entityLabel(entity)}
									</a>
								{:else}
									<span
										class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-card border border-border text-foreground"
										title={entity.description}
									>
										<span class="text-muted-foreground">{entity.action}</span>
										{entityLabel(entity)}
									</span>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<!-- Open questions (continuable runs render them in the answer box above) -->
				{#if result?.open_questions?.length && !canAnswerRun}
					<div>
						<div class="micro-label mb-1.5 text-muted-foreground">Open questions</div>
						<ul class="list-disc list-inside space-y-0.5">
							{#each result.open_questions as q}
								<li class="text-sm text-foreground">{q}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Narration / event log -->
				<div>
					<div class="micro-label mb-1.5 text-muted-foreground">Activity</div>
					<div
						class="rounded-lg border border-border bg-card max-h-64 overflow-y-auto divide-y divide-border/60"
					>
						{#if loadingEvents && events.length === 0}
							<div class="flex items-center gap-2 p-3 text-xs text-muted-foreground">
								<LoaderCircle class="w-4 h-4 animate-spin" /> Loading activity…
							</div>
						{:else if events.length === 0}
							<div class="p-3 text-xs text-muted-foreground">No activity yet.</div>
						{:else}
							{#each events as event (event.id)}
								{@const line = eventLine(event)}
								{#if line.text}
									{@const LineIcon = line.icon}
									<div class="flex items-start gap-2 p-2.5">
										<LineIcon
											class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 {line.cls}"
										/>
										<span class="text-xs text-foreground break-words"
											>{line.text}</span
										>
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				</div>

				<!-- Metrics -->
				{#if metrics}
					<div class="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
						<div class="rounded-lg bg-muted/40 p-2">
							<div class="text-sm font-medium text-foreground">
								{metrics.tool_calls ?? 0}
							</div>
							<div class="micro-label text-muted-foreground">Tools</div>
						</div>
						<div class="rounded-lg bg-muted/40 p-2">
							<div class="text-sm font-medium text-foreground">
								{(metrics.tokens ?? 0).toLocaleString()}
							</div>
							<div class="micro-label text-muted-foreground">Tokens</div>
						</div>
						<div class="rounded-lg bg-muted/40 p-2">
							<div class="text-sm font-medium text-foreground">
								${(metrics.cost_usd ?? 0).toFixed(3)}
							</div>
							<div class="micro-label text-muted-foreground">Cost</div>
						</div>
						<div class="rounded-lg bg-muted/40 p-2">
							<div class="text-sm font-medium text-foreground">
								{formatDuration(metrics.duration_ms)}
							</div>
							<div class="micro-label text-muted-foreground">Time</div>
						</div>
					</div>
				{/if}
			</div>
		{/snippet}

		{#snippet footer()}
			<div
				class="flex flex-col-reverse gap-2 border-t border-border bg-muted/50 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:px-4"
			>
				{#if isActive}
					{#if canOpenChat}
						<Button
							onclick={handleOpenChat}
							variant="primary"
							size="md"
							disabled={openingChat}
							class="w-full sm:w-auto"
						>
							{#if openingChat}
								<LoaderCircle class="h-4 w-4 animate-spin" />
								Opening…
							{:else}
								<MessageSquare class="h-4 w-4" />
								Chat
							{/if}
						</Button>
					{/if}
					<Button
						onclick={handleCancel}
						variant="outline"
						size="md"
						class="w-full sm:w-auto">Stop</Button
					>
					<Button
						onclick={handleMinimize}
						variant="ghost"
						size="md"
						class="w-full sm:w-auto">Minimize</Button
					>
				{:else}
					{#if runStatus === 'failed'}
						<Button
							onclick={handleRetry}
							variant="primary"
							size="md"
							class="w-full sm:w-auto">Retry</Button
						>
					{/if}
					{#if canOpenChat}
						<Button
							onclick={handleOpenChat}
							variant="primary"
							size="md"
							disabled={openingChat}
							class="w-full sm:w-auto"
						>
							{#if openingChat}
								<LoaderCircle class="h-4 w-4 animate-spin" />
								Opening…
							{:else}
								<MessageSquare class="h-4 w-4" />
								Chat
							{/if}
						</Button>
					{/if}
					<Button
						onclick={handleDismiss}
						variant="outline"
						size="md"
						class="w-full sm:w-auto">Dismiss</Button
					>
				{/if}
			</div>
		{/snippet}
	</Modal>
{/if}

<style>
	.agent-run-prose :global(> :first-child) {
		margin-top: 0;
	}
	.agent-run-prose :global(> :last-child) {
		margin-bottom: 0;
	}
</style>
