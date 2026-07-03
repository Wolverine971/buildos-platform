<!-- apps/web/src/lib/components/project/ProjectAuditTracker.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Archive,
		AlertCircle,
		CheckCircle2,
		FileText,
		LoaderCircle,
		MessageSquare,
		Play,
		RefreshCw,
		ShieldCheck
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
	import { toastService } from '$lib/stores/toast.store';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	type AgentChatModalLazy =
		| typeof import('$lib/components/agent/AgentChatModal.svelte').default
		| null;

	type Rating = 'green' | 'yellow' | 'red' | 'unknown' | string;

	type AuditDimension = {
		key?: string;
		name?: string;
		rating?: Rating;
		summary?: string;
		evidence_refs?: unknown;
		recommendations?: unknown;
		uncertainty?: string | null;
	};

	type AuditFinding = {
		title?: string;
		summary?: string;
		rating?: Rating;
		dimension?: string;
	};

	type ProjectAudit = {
		id: string;
		status: string;
		trigger_reason?: string | null;
		delivery_confidence?: Rating | null;
		project_size_class?: string | null;
		summary?: string | null;
		project_thesis?: string | null;
		top_findings?: unknown;
		top_actions?: unknown;
		dimensions?: unknown;
		recommendations?: unknown;
		evidence_refs?: unknown;
		open_questions?: unknown;
		risks?: unknown;
		change_summary?: unknown;
		generated_suggestion_count?: number | null;
		unresolved_suggestion_count?: number | null;
		created_at?: string | null;
		finished_at?: string | null;
		reviewed_at?: string | null;
	};

	type AuditChangeSummary = {
		trigger_reason?: unknown;
		recent_activity_count?: unknown;
		recent_activity_window_days?: unknown;
		document_count?: unknown;
		task_count?: unknown;
		goal_count?: unknown;
		prior_audit_count?: unknown;
		prior_ready_audit_count?: unknown;
		unresolved_audit_recommendation_count?: unknown;
		open_inbox_count?: unknown;
		suppressed_recommendation_count?: unknown;
		previous_audit_summary?: unknown;
		child_suggestion_warning?: unknown;
	};

	type AuditRecommendation = {
		title?: string;
		summary?: string;
		priority?: string;
		role?: string;
		dimension?: string;
	};

	type AuditEvidenceRef = {
		entity_type?: string;
		label?: string;
		reason?: string;
		excerpt?: string;
	};

	type AuditRisk = {
		title?: string;
		summary?: string;
		risk?: string;
		severity?: string;
		dimension?: string;
	};

	type AuditOpenQuestion = {
		question?: string;
		dimension?: string;
	};

	type ProjectSuggestionSummary = {
		id?: string;
		title?: string;
		status?: string;
		kind?: string;
		rationale?: string | null;
		why_now?: string | null;
		created_at?: string | null;
		decided_at?: string | null;
	};

	type AuditChildSuggestion = {
		id?: string;
		role?: string;
		created_at?: string | null;
		project_suggestions?: ProjectSuggestionSummary | ProjectSuggestionSummary[] | null;
	};

	type AuditDetailPayload = {
		audit: ProjectAudit;
		childSuggestions: AuditChildSuggestion[];
	};

	type AuditContextItem = {
		label: string;
		value: string;
		title?: string;
	};

	type TriggerEvaluation = {
		id: string;
		decision: string;
		reason_summary?: string | null;
		quiet_until?: string | null;
		cooldown_until?: string | null;
		project_size_class?: string | null;
		created_at?: string | null;
	};

	type TrackerPayload = {
		latestAudit: ProjectAudit | null;
		latestEvaluation: TriggerEvaluation | null;
		trackerState?: {
			state: string;
			summary: string | null;
		} | null;
	};

	let { projectId, canEdit = false }: { projectId: string; canEdit?: boolean } = $props();

	let payload = $state<TrackerPayload | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let running = $state(false);
	let markingReviewed = $state(false);
	let archiving = $state(false);
	let openingChat = $state(false);
	let polling = $state(false);
	let detailOpen = $state(false);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let detailPayload = $state<AuditDetailPayload | null>(null);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);
	let chatSessionId = $state<string | null>(null);

	const latestAudit = $derived(payload?.latestAudit ?? null);
	const latestEvaluation = $derived(payload?.latestEvaluation ?? null);
	const trackerState = $derived(payload?.trackerState ?? null);
	const auditActive = $derived(
		latestAudit?.status === 'queued' || latestAudit?.status === 'running'
	);
	const canRunAudit = $derived(canEdit && !running && !auditActive);
	const canMarkReviewed = $derived(
		canEdit && latestAudit?.status === 'ready' && !markingReviewed
	);
	const canArchive = $derived(
		canEdit &&
			Boolean(latestAudit?.id) &&
			latestAudit?.status !== 'archived' &&
			!auditActive &&
			!archiving
	);
	const dimensions = $derived(
		normalizeArray<AuditDimension>(latestAudit?.dimensions).slice(0, 8)
	);
	const topFindings = $derived(
		normalizeArray<AuditFinding>(latestAudit?.top_findings).slice(0, 3)
	);
	const changeSummary = $derived(
		normalizeRecord<AuditChangeSummary>(latestAudit?.change_summary)
	);
	const generatedFollowUps = $derived(
		typeof latestAudit?.generated_suggestion_count === 'number'
			? latestAudit.generated_suggestion_count
			: 0
	);
	const unresolvedFollowUps = $derived(
		typeof latestAudit?.unresolved_suggestion_count === 'number'
			? latestAudit.unresolved_suggestion_count
			: 0
	);
	const visibleSummary = $derived(
		latestAudit?.summary ?? trackerState?.summary ?? latestEvaluation?.reason_summary ?? null
	);
	const auditContextItems = $derived.by(() =>
		buildAuditContextItems(changeSummary, generatedFollowUps, unresolvedFollowUps)
	);
	const previousAuditSummary = $derived(textFrom(changeSummary?.previous_audit_summary));
	const childSuggestionWarning = $derived(textFrom(changeSummary?.child_suggestion_warning));
	const hasAuditContext = $derived(
		auditContextItems.length > 0 ||
			Boolean(previousAuditSummary) ||
			Boolean(childSuggestionWarning)
	);
	const auditDetail = $derived(detailPayload?.audit ?? null);
	const detailDimensions = $derived(
		normalizeArray<AuditDimension>(auditDetail?.dimensions).slice(0, 8)
	);
	const detailRecommendations = $derived(
		normalizeArray<AuditRecommendation>(auditDetail?.recommendations).slice(0, 8)
	);
	const detailEvidenceRefs = $derived(
		normalizeArray<AuditEvidenceRef>(auditDetail?.evidence_refs).slice(0, 12)
	);
	const detailRisks = $derived(normalizeArray<AuditRisk>(auditDetail?.risks).slice(0, 6));
	const detailOpenQuestions = $derived(
		normalizeArray<AuditOpenQuestion>(auditDetail?.open_questions).slice(0, 6)
	);
	const detailChildSuggestions = $derived(
		normalizeArray<AuditChildSuggestion>(detailPayload?.childSuggestions)
	);

	const POLL_INTERVAL_MS = 2500;
	const MAX_POLL_MS = 2 * 60 * 1000;

	function normalizeArray<T extends Record<string, unknown>>(value: unknown): T[] {
		return Array.isArray(value)
			? value.filter(
					(item): item is T =>
						Boolean(item) && typeof item === 'object' && !Array.isArray(item)
				)
			: [];
	}

	function normalizeRecord<T extends Record<string, unknown>>(value: unknown): T | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		return value as T;
	}

	function textFrom(value: unknown): string | null {
		if (typeof value !== 'string') return null;
		const text = value.trim();
		return text || null;
	}

	function countFrom(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return Math.max(0, Math.trunc(value));
		}
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
		}
		return null;
	}

	function formatCount(value: number, singular: string, plural = `${singular}s`): string {
		const label = value === 1 ? singular : plural;
		return `${new Intl.NumberFormat().format(value)} ${label}`;
	}

	function formatTriggerReason(value: string): string {
		return value
			.split('_')
			.filter(Boolean)
			.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
			.join(' ');
	}

	function buildAuditContextItems(
		summary: AuditChangeSummary | null,
		generatedCount: number,
		unresolvedCount: number
	): AuditContextItem[] {
		if (!summary && generatedCount <= 0 && unresolvedCount <= 0) return [];

		const items: AuditContextItem[] = [];
		const triggerReason = textFrom(summary?.trigger_reason);
		if (triggerReason) {
			items.push({
				label: 'Trigger',
				value: compactLabel(formatTriggerReason(triggerReason), 'Trigger')
			});
		}

		const recentActivityCount = countFrom(summary?.recent_activity_count);
		const windowDays = countFrom(summary?.recent_activity_window_days);
		if (recentActivityCount !== null) {
			items.push({
				label: 'What changed',
				value: `${formatCount(recentActivityCount, 'change')}${
					windowDays ? ` over ${formatCount(windowDays, 'day')}` : ''
				}`
			});
		}

		const documentCount = countFrom(summary?.document_count);
		const taskCount = countFrom(summary?.task_count);
		const goalCount = countFrom(summary?.goal_count);
		const shapeParts = [
			documentCount !== null ? formatCount(documentCount, 'doc') : null,
			taskCount !== null ? formatCount(taskCount, 'task') : null,
			goalCount !== null ? formatCount(goalCount, 'goal') : null
		].filter((part): part is string => Boolean(part));
		if (shapeParts.length > 0) {
			const value = shapeParts.join(', ');
			items.push({ label: 'Project shape', value, title: value });
		}

		const followUpParts: string[] = [];
		if (generatedCount > 0) {
			followUpParts.push(
				`${unresolvedCount} of ${generatedCount} follow-up${generatedCount === 1 ? '' : 's'} open`
			);
		} else if (unresolvedCount > 0) {
			followUpParts.push(formatCount(unresolvedCount, 'open follow-up'));
		}
		const priorUnresolvedCount = countFrom(summary?.unresolved_audit_recommendation_count);
		if (priorUnresolvedCount && priorUnresolvedCount > 0) {
			followUpParts.push(formatCount(priorUnresolvedCount, 'prior recommendation'));
		}
		const openInboxCount = countFrom(summary?.open_inbox_count);
		if (openInboxCount && openInboxCount > 0) {
			followUpParts.push(formatCount(openInboxCount, 'open inbox item'));
		}
		if (followUpParts.length > 0) {
			const value = followUpParts.join(', ');
			items.push({ label: 'Open loops', value, title: value });
		}

		const suppressedCount = countFrom(summary?.suppressed_recommendation_count);
		if (suppressedCount && suppressedCount > 0) {
			items.push({
				label: 'Repeat filter',
				value: `${formatCount(suppressedCount, 'repeat')} suppressed`
			});
		}

		const priorReadyCount = countFrom(summary?.prior_ready_audit_count);
		const priorAuditCount = countFrom(summary?.prior_audit_count);
		if ((priorReadyCount && priorReadyCount > 0) || (priorAuditCount && priorAuditCount > 0)) {
			const count =
				priorReadyCount && priorReadyCount > 0 ? priorReadyCount : (priorAuditCount ?? 0);
			items.push({
				label: 'Audit history',
				value: formatCount(count, 'prior audit', 'prior audits')
			});
		}

		return items.slice(0, 6);
	}

	function normalizeStringArray(value: unknown): string[] {
		return Array.isArray(value)
			? value.filter(
					(item): item is string => typeof item === 'string' && item.trim().length > 0
				)
			: [];
	}

	function childSuggestion(row: AuditChildSuggestion): ProjectSuggestionSummary | null {
		const joined = row.project_suggestions;
		if (Array.isArray(joined)) return joined[0] ?? null;
		return joined ?? null;
	}

	function displayLabel(value: string | null | undefined, fallback: string): string {
		if (!value?.trim()) return fallback;
		return value.replace(/_/g, ' ');
	}

	function chipClass(value: string | null | undefined): string {
		const normalized = value?.toLowerCase();
		if (normalized === 'applied' || normalized === 'reviewed' || normalized === 'green') {
			return 'border-success/30 bg-success/10 text-success';
		}
		if (normalized === 'low') return 'border-success/30 bg-success/10 text-success';
		if (
			normalized === 'pending' ||
			normalized === 'ready' ||
			normalized === 'yellow' ||
			normalized === 'medium'
		) {
			return 'border-warning/30 bg-warning/10 text-warning';
		}
		if (
			normalized === 'failed' ||
			normalized === 'dismissed' ||
			normalized === 'red' ||
			normalized === 'high'
		) {
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		}
		return 'border-border bg-muted/40 text-muted-foreground';
	}

	function recommendationMeta(item: AuditRecommendation): string | null {
		const parts = [item.priority, item.role, item.dimension]
			.map((part) => displayLabel(part, ''))
			.filter(Boolean);
		return parts.length ? parts.join(' / ') : null;
	}

	function riskTitle(item: AuditRisk, index: number): string {
		return compactLabel(item.title ?? item.risk ?? item.dimension, `Risk ${index + 1}`);
	}

	function riskSummary(item: AuditRisk): string | null {
		return item.summary ?? (item.title ? item.risk : null) ?? null;
	}

	function compactLabel(value: string | null | undefined, fallback: string): string {
		const text = value?.trim() || fallback;
		return text.length <= 54 ? text : `${text.slice(0, 51)}...`;
	}

	function formatDate(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function statusLabel(audit: ProjectAudit | null): string {
		if (!audit) {
			const state = trackerState?.state ?? latestEvaluation?.decision;
			if (state === 'below_baseline' || state === 'skipped_ineligible')
				return 'Below baseline';
			if (state === 'deferred_quiet_period') return 'Deferred';
			if (state === 'manual_required') return 'Manual only';
			return 'No audit';
		}
		if (audit.status === 'queued') return 'Queued';
		if (audit.status === 'running') return 'Running';
		if (audit.status === 'ready') return 'Ready';
		if (audit.status === 'reviewed') return 'Reviewed';
		if (audit.status === 'failed') return 'Failed';
		return compactLabel(audit.status, 'Audit');
	}

	function confidenceClass(value: Rating | null | undefined): string {
		if (value === 'green') return 'border-success/30 bg-success/10 text-success';
		if (value === 'yellow') return 'border-warning/30 bg-warning/10 text-warning';
		if (value === 'red') return 'border-destructive/30 bg-destructive/10 text-destructive';
		return 'border-border bg-muted/40 text-muted-foreground';
	}

	function ratingDot(value: Rating | null | undefined): string {
		if (value === 'green') return 'bg-success';
		if (value === 'yellow') return 'bg-warning';
		if (value === 'red') return 'bg-destructive';
		return 'bg-muted-foreground';
	}

	function stateClass(audit: ProjectAudit | null): string {
		if (audit?.status === 'failed')
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		if (audit?.status === 'ready') return 'border-accent/30 bg-accent/10 text-accent';
		if (auditActive || polling) return 'border-warning/30 bg-warning/10 text-warning';
		return 'border-border bg-muted/40 text-muted-foreground';
	}

	async function load(options: { silent?: boolean } = {}) {
		if (!PROJECT_LOOPS_ENABLED) {
			loading = false;
			return null;
		}
		if (!options.silent) loading = true;
		else refreshing = true;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/audits/latest`);
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Failed to load project audit');
			payload = (json.data ?? null) as TrackerPayload | null;
			return payload;
		} catch (error) {
			if (!options.silent) {
				toastService.error(
					error instanceof Error ? error.message : 'Failed to load project audit'
				);
			}
			return null;
		} finally {
			if (!options.silent) loading = false;
			refreshing = false;
		}
	}

	function clearPoll() {
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
		polling = false;
	}

	function startPolling() {
		clearPoll();
		polling = true;
		const startedAt = Date.now();
		const tick = async () => {
			const data = await load({ silent: true });
			const audit = data?.latestAudit ?? null;
			if (audit && audit.status !== 'queued' && audit.status !== 'running') {
				clearPoll();
				if (audit.status === 'ready') toastService.success('Project audit is ready.');
				else if (audit.status === 'failed')
					toastService.error(audit.summary ?? 'Project audit failed.');
				return;
			}
			if (Date.now() - startedAt >= MAX_POLL_MS) {
				clearPoll();
				toastService.info('Project audit is still running. Refresh to check later.');
				return;
			}
			pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
		};
		pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
	}

	async function runAudit() {
		if (!canRunAudit) return;
		running = true;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/audits/run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ auditDepth: 'standard' })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Failed to start project audit');
			if (json.data?.queued) {
				toastService.success('Project audit started.');
				await load({ silent: true });
				startPolling();
			} else {
				toastService.info(json.data?.reason ?? 'Project audit was not queued.');
				await load({ silent: true });
			}
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to start project audit'
			);
		} finally {
			running = false;
		}
	}

	async function markReviewed() {
		if (!latestAudit?.id || !canMarkReviewed) return;
		markingReviewed = true;
		try {
			const res = await fetch(
				`/api/onto/projects/${projectId}/audits/${latestAudit.id}/reviewed`,
				{ method: 'POST' }
			);
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Failed to mark audit reviewed');
			toastService.success('Project audit marked reviewed.');
			await load({ silent: true });
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to mark audit reviewed'
			);
		} finally {
			markingReviewed = false;
		}
	}

	async function archiveAudit() {
		if (!latestAudit?.id || !canArchive) return;
		archiving = true;
		try {
			const res = await fetch(
				`/api/onto/projects/${projectId}/audits/${latestAudit.id}/archive`,
				{ method: 'POST' }
			);
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Failed to archive audit');
			toastService.success('Project audit archived.');
			await load({ silent: true });
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to archive audit');
		} finally {
			archiving = false;
		}
	}

	async function openDetail() {
		if (!latestAudit?.id) return;
		detailOpen = true;
		if (detailPayload?.audit.id === latestAudit.id && !detailError) return;
		detailLoading = true;
		detailError = null;
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/audits/${latestAudit.id}`);
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Failed to load audit details');
			detailPayload = (json.data ?? null) as AuditDetailPayload | null;
			if (!detailPayload?.audit) throw new Error('Audit details were not returned');
		} catch (error) {
			detailError = error instanceof Error ? error.message : 'Failed to load audit details';
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		detailOpen = false;
	}

	async function loadAgentChatModal(): Promise<NonNullable<AgentChatModalLazy>> {
		if (AgentChatModalComponent) return AgentChatModalComponent;
		const module = await import('$lib/components/agent/AgentChatModal.svelte');
		AgentChatModalComponent = module.default;
		return module.default;
	}

	async function openChat() {
		if (!latestAudit?.id || openingChat) return;
		openingChat = true;
		try {
			await loadAgentChatModal();
			const res = await fetch(
				`/api/onto/projects/${projectId}/audits/${latestAudit.id}/chat-session`,
				{ method: 'POST' }
			);
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? 'Failed to open audit chat');
			const nextSessionId = json.data?.chat_session_id ?? json.data?.session?.id;
			if (typeof nextSessionId !== 'string' || !nextSessionId) {
				throw new Error('Audit chat session was not returned');
			}
			chatSessionId = nextSessionId;
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to open audit chat'
			);
		} finally {
			openingChat = false;
		}
	}

	function closeChat(_summary?: DataMutationSummary) {
		chatSessionId = null;
	}

	onMount(() => {
		if (!PROJECT_LOOPS_ENABLED) return;
		void load().then((data) => {
			const audit = data?.latestAudit;
			if (audit?.status === 'queued' || audit?.status === 'running') startPolling();
		});
		return clearPoll;
	});
</script>

{#if PROJECT_LOOPS_ENABLED}
	<section
		class="overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak"
		aria-label="Project audit"
	>
		<div
			class="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-4"
		>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
					>
						<ShieldCheck class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-sm font-semibold text-foreground">Audit</h2>
							<span
								class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {stateClass(
									latestAudit
								)}"
							>
								{statusLabel(latestAudit)}
							</span>
							{#if latestAudit?.delivery_confidence}
								<span
									class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {confidenceClass(
										latestAudit.delivery_confidence
									)}"
								>
									{latestAudit.delivery_confidence}
								</span>
							{/if}
							{#if latestAudit?.finished_at || latestAudit?.created_at}
								<span class="text-[10px] font-medium text-muted-foreground">
									{formatDate(latestAudit.finished_at ?? latestAudit.created_at)}
								</span>
							{/if}
							{#if generatedFollowUps > 0}
								<span
									class="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
								>
									{unresolvedFollowUps > 0
										? `${unresolvedFollowUps} open follow-up${unresolvedFollowUps === 1 ? '' : 's'}`
										: `${generatedFollowUps} follow-up${generatedFollowUps === 1 ? '' : 's'}`}
								</span>
							{/if}
						</div>
						{#if loading}
							<div
								class="mt-1 h-3 w-56 max-w-full animate-pulse rounded bg-muted/50"
							></div>
						{:else if visibleSummary}
							<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
								{visibleSummary}
							</p>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-1.5 sm:justify-end">
				<button
					type="button"
					onclick={() => load({ silent: true })}
					disabled={loading || refreshing}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
					title="Refresh audit"
				>
					<RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
				</button>
				{#if latestAudit}
					<Button
						variant="ghost"
						size="sm"
						onclick={openDetail}
						loading={detailLoading}
						disabled={detailLoading}
						class="min-h-8 px-2.5 py-1 text-xs"
						icon={FileText}
					>
						Details
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={openChat}
						loading={openingChat}
						disabled={openingChat}
						class="min-h-8 px-2.5 py-1 text-xs"
						icon={MessageSquare}
					>
						Chat
					</Button>
				{/if}
				{#if canMarkReviewed}
					<Button
						variant="success"
						size="sm"
						onclick={markReviewed}
						loading={markingReviewed}
						class="min-h-8 px-2.5 py-1 text-xs"
						icon={CheckCircle2}
					>
						Reviewed
					</Button>
				{/if}
				{#if canArchive}
					<Button
						variant="ghost"
						size="sm"
						onclick={archiveAudit}
						loading={archiving}
						class="min-h-8 px-2.5 py-1 text-xs"
						icon={Archive}
					>
						Archive
					</Button>
				{/if}
				{#if canEdit}
					<Button
						variant="secondary"
						size="sm"
						onclick={runAudit}
						disabled={!canRunAudit}
						loading={running || auditActive || polling}
						class="min-h-8 px-2.5 py-1 text-xs"
						icon={Play}
					>
						{auditActive || polling ? 'Auditing' : 'Run audit'}
					</Button>
				{/if}
			</div>
		</div>

		{#if loading}
			<div class="grid gap-2 border-t border-border px-3 py-3 sm:grid-cols-3 sm:px-4">
				{#each Array(3) as _, index (index)}
					<div
						class="h-12 animate-pulse rounded-md border border-border bg-muted/30"
					></div>
				{/each}
			</div>
		{:else if hasAuditContext}
			<div class="border-t border-border px-3 py-3 sm:px-4">
				{#if auditContextItems.length}
					<dl class="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
						{#each auditContextItems as item (item.label)}
							<div class="min-w-0 border-l border-border pl-2">
								<dt
									class="text-[10px] font-semibold uppercase text-muted-foreground"
								>
									{item.label}
								</dt>
								<dd
									class="mt-0.5 truncate text-xs font-medium text-foreground/85"
									title={item.title ?? item.value}
								>
									{item.value}
								</dd>
							</div>
						{/each}
					</dl>
				{/if}
				{#if previousAuditSummary}
					<p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
						<span class="font-semibold text-foreground/75">Prior audit:</span>
						{previousAuditSummary}
					</p>
				{/if}
				{#if childSuggestionWarning}
					<p class="mt-2 text-xs font-medium text-warning">
						{childSuggestionWarning}
					</p>
				{/if}
			</div>
		{/if}

		{#if !loading && (topFindings.length || dimensions.length)}
			<div
				class="grid gap-3 border-t border-border px-3 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]"
			>
				{#if topFindings.length}
					<div class="min-w-0">
						<p class="text-[10px] font-semibold uppercase text-muted-foreground">
							Findings
						</p>
						<div class="mt-2 space-y-1.5">
							{#each topFindings as finding, index (finding.dimension ?? finding.title ?? index)}
								<div class="flex items-start gap-2 text-xs">
									<span
										class="mt-1 h-2 w-2 shrink-0 rounded-full {ratingDot(
											finding.rating
										)}"
									></span>
									<p class="min-w-0 text-foreground/85">
										<span class="font-semibold">
											{compactLabel(finding.title, 'Finding')}
										</span>
										{#if finding.summary}
											<span class="text-muted-foreground">
												- {finding.summary}</span
											>
										{/if}
									</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if dimensions.length}
					<div class="min-w-0">
						<p class="text-[10px] font-semibold uppercase text-muted-foreground">
							Dimensions
						</p>
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each dimensions as item, index (item.key ?? item.name ?? index)}
								<span
									class="inline-flex max-w-full items-center gap-1.5 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
									title={item.summary}
								>
									<span class="h-1.5 w-1.5 rounded-full {ratingDot(item.rating)}"
									></span>
									<span class="truncate"
										>{compactLabel(item.name, item.key ?? 'Dimension')}</span
									>
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{:else if !loading && !hasAuditContext && visibleSummary}
			<div class="border-t border-border px-3 py-3 sm:px-4">
				<p class="text-xs text-muted-foreground">{visibleSummary}</p>
			</div>
		{/if}
	</section>
{/if}

<Modal
	isOpen={detailOpen}
	onClose={closeDetail}
	title="Audit details"
	size="xl"
	variant="bottom-sheet"
	ariaLabel="Project audit details"
>
	<div class="space-y-4 p-3 sm:p-4">
		{#if detailLoading}
			<div class="flex items-center justify-center py-12">
				<LoaderCircle class="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		{:else if detailError}
			<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
				<div class="flex items-start gap-2">
					<AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
					<div class="min-w-0">
						<p class="text-sm font-medium text-destructive">Unable to load audit</p>
						<p class="mt-0.5 text-xs text-destructive/80">{detailError}</p>
					</div>
				</div>
				<button
					type="button"
					onclick={openDetail}
					class="mt-3 rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 pressable"
				>
					Retry
				</button>
			</div>
		{:else if auditDetail}
			<div class="space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {chipClass(
							auditDetail.status
						)}"
					>
						{statusLabel(auditDetail)}
					</span>
					{#if auditDetail.delivery_confidence}
						<span
							class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {confidenceClass(
								auditDetail.delivery_confidence
							)}"
						>
							{auditDetail.delivery_confidence}
						</span>
					{/if}
					{#if auditDetail.trigger_reason}
						<span class="text-[10px] font-medium text-muted-foreground">
							{formatTriggerReason(auditDetail.trigger_reason)}
						</span>
					{/if}
					{#if auditDetail.finished_at || auditDetail.created_at}
						<span class="text-[10px] font-medium text-muted-foreground">
							{formatDate(auditDetail.finished_at ?? auditDetail.created_at)}
						</span>
					{/if}
				</div>
				{#if auditDetail.summary}
					<p class="text-sm leading-relaxed text-foreground/85">{auditDetail.summary}</p>
				{/if}
				{#if auditDetail.project_thesis}
					<p class="text-xs leading-relaxed text-muted-foreground">
						<span class="font-semibold text-foreground/75">Thesis:</span>
						{auditDetail.project_thesis}
					</p>
				{/if}
			</div>

			{#if detailDimensions.length}
				<section class="border-t border-border pt-3">
					<h3 class="text-xs font-semibold uppercase text-muted-foreground">
						Dimensions
					</h3>
					<div class="mt-2 divide-y divide-border border-y border-border">
						{#each detailDimensions as dimension, index (dimension.key ?? dimension.name ?? index)}
							{@const dimensionRecommendations = normalizeStringArray(
								dimension.recommendations
							).slice(0, 3)}
							<div class="py-2">
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="h-2 w-2 shrink-0 rounded-full {ratingDot(
											dimension.rating
										)}"
									></span>
									<p class="min-w-0 text-sm font-semibold text-foreground">
										{compactLabel(dimension.name, dimension.key ?? 'Dimension')}
									</p>
									{#if dimension.rating}
										<span
											class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {chipClass(
												dimension.rating
											)}"
										>
											{dimension.rating}
										</span>
									{/if}
								</div>
								{#if dimension.summary}
									<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
										{dimension.summary}
									</p>
								{/if}
								{#if dimensionRecommendations.length}
									<ul class="mt-1.5 space-y-1 text-xs text-foreground/80">
										{#each dimensionRecommendations as recommendation}
											<li class="flex gap-2">
												<span
													class="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent"
												></span>
												<span>{recommendation}</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if detailRecommendations.length}
				<section class="border-t border-border pt-3">
					<h3 class="text-xs font-semibold uppercase text-muted-foreground">
						Recommendations
					</h3>
					<div class="mt-2 space-y-2">
						{#each detailRecommendations as recommendation, index (recommendation.title ?? index)}
							<div class="border-l border-border pl-2">
								<div class="flex flex-wrap items-center gap-2">
									<p class="min-w-0 text-sm font-semibold text-foreground">
										{compactLabel(
											recommendation.title,
											`Recommendation ${index + 1}`
										)}
									</p>
									{#if recommendation.priority}
										<span
											class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {chipClass(
												recommendation.priority
											)}"
										>
											{recommendation.priority}
										</span>
									{/if}
								</div>
								{#if recommendation.summary}
									<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
										{recommendation.summary}
									</p>
								{/if}
								{#if recommendationMeta(recommendation)}
									<p class="mt-1 text-[10px] uppercase text-muted-foreground">
										{recommendationMeta(recommendation)}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<section class="border-t border-border pt-3">
				<h3 class="text-xs font-semibold uppercase text-muted-foreground">Follow-ups</h3>
				{#if detailChildSuggestions.length}
					<div class="mt-2 divide-y divide-border border-y border-border">
						{#each detailChildSuggestions as row, index (row.id ?? index)}
							{@const suggestion = childSuggestion(row)}
							<div class="py-2">
								<div class="flex flex-wrap items-center gap-2">
									<p class="min-w-0 text-sm font-semibold text-foreground">
										{compactLabel(
											suggestion?.title,
											displayLabel(row.role, 'Follow-up')
										)}
									</p>
									<span
										class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {chipClass(
											suggestion?.status
										)}"
									>
										{displayLabel(suggestion?.status, 'linked')}
									</span>
								</div>
								{#if suggestion?.why_now || suggestion?.rationale}
									<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
										{suggestion.why_now ?? suggestion.rationale}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-2 text-xs text-muted-foreground">No linked follow-ups.</p>
				{/if}
			</section>

			{#if detailRisks.length || detailOpenQuestions.length}
				<section class="grid gap-3 border-t border-border pt-3 md:grid-cols-2">
					{#if detailRisks.length}
						<div class="min-w-0">
							<h3 class="text-xs font-semibold uppercase text-muted-foreground">
								Risks
							</h3>
							<div class="mt-2 space-y-2">
								{#each detailRisks as risk, index (risk.title ?? risk.risk ?? index)}
									<div class="border-l border-border pl-2">
										<div class="flex flex-wrap items-center gap-2">
											<p class="text-sm font-semibold text-foreground">
												{riskTitle(risk, index)}
											</p>
											{#if risk.severity}
												<span
													class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold {chipClass(
														risk.severity
													)}"
												>
													{risk.severity}
												</span>
											{/if}
										</div>
										{#if riskSummary(risk)}
											<p class="mt-1 text-xs text-muted-foreground">
												{riskSummary(risk)}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
					{#if detailOpenQuestions.length}
						<div class="min-w-0">
							<h3 class="text-xs font-semibold uppercase text-muted-foreground">
								Open questions
							</h3>
							<div class="mt-2 space-y-2">
								{#each detailOpenQuestions as question, index (question.question ?? index)}
									<div class="border-l border-border pl-2">
										<p class="text-sm font-semibold text-foreground">
											{compactLabel(
												question.dimension,
												`Question ${index + 1}`
											)}
										</p>
										{#if question.question}
											<p class="mt-1 text-xs text-muted-foreground">
												{question.question}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</section>
			{/if}

			{#if detailEvidenceRefs.length}
				<section class="border-t border-border pt-3">
					<h3 class="text-xs font-semibold uppercase text-muted-foreground">Evidence</h3>
					<div class="mt-2 grid gap-2 sm:grid-cols-2">
						{#each detailEvidenceRefs as evidence, index (evidence.label ?? index)}
							<div class="min-w-0 border-l border-border pl-2">
								<p class="truncate text-xs font-semibold text-foreground">
									{compactLabel(evidence.label, `Evidence ${index + 1}`)}
								</p>
								<p class="mt-0.5 text-[10px] uppercase text-muted-foreground">
									{displayLabel(evidence.entity_type, 'evidence')}
								</p>
								{#if evidence.reason}
									<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
										{evidence.reason}
									</p>
								{/if}
								{#if evidence.excerpt}
									<p class="mt-1 line-clamp-2 text-xs text-foreground/75">
										{evidence.excerpt}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/if}
	</div>
</Modal>

{#if AgentChatModalComponent && chatSessionId}
	<AgentChatModalComponent
		isOpen={Boolean(chatSessionId)}
		contextType="project"
		entityId={projectId}
		initialChatSessionId={chatSessionId}
		onClose={closeChat}
	/>
{/if}
