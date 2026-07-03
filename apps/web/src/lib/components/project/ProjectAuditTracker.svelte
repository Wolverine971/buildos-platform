<!-- apps/web/src/lib/components/project/ProjectAuditTracker.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Archive,
		CheckCircle2,
		MessageSquare,
		Play,
		RefreshCw,
		ShieldCheck
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
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
		generated_suggestion_count?: number | null;
		unresolved_suggestion_count?: number | null;
		created_at?: string | null;
		finished_at?: string | null;
		reviewed_at?: string | null;
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
		{:else if topFindings.length || dimensions.length}
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
		{:else if visibleSummary}
			<div class="border-t border-border px-3 py-3 sm:px-4">
				<p class="text-xs text-muted-foreground">{visibleSummary}</p>
			</div>
		{/if}
	</section>
{/if}

{#if AgentChatModalComponent && chatSessionId}
	<AgentChatModalComponent
		isOpen={Boolean(chatSessionId)}
		contextType="project"
		entityId={projectId}
		initialChatSessionId={chatSessionId}
		onClose={closeChat}
	/>
{/if}
