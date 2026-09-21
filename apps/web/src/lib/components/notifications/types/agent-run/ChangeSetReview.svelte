<!-- apps/web/src/lib/components/notifications/types/agent-run/ChangeSetReview.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Plus, Pencil, Trash2, Check, X, Clock, MessageCircle } from '$lib/icons/lucide';
	import DocumentProposalDiff from './DocumentProposalDiff.svelte';
	import ChangeSetFailureSummary from './ChangeSetFailureSummary.svelte';
	import { untrack } from 'svelte';
	import {
		pendingAgentRunReviews,
		submitAgentRunReview,
		type PendingReviewCommit
	} from '$lib/services/agent-run-review.client';
	import type { ChangeSet, ProposedChange, ProposedChangeAction } from '@buildos/shared-types';

	let {
		runId,
		changeSet,
		onApplied,
		onApplying,
		acceptLabel = 'Apply',
		dismissLabel = 'Reject',
		rejectAllLabel = 'Reject',
		chatLabel = 'Chat',
		openingChat = false,
		snoozing = false,
		onChat,
		onSnooze
	}: {
		runId: string;
		changeSet: ChangeSet;
		onApplied?: () => void;
		onApplying?: (applying: boolean) => void;
		acceptLabel?: string;
		dismissLabel?: string;
		approveAllLabel?: string;
		rejectAllLabel?: string;
		chatLabel?: string;
		openingChat?: boolean;
		snoozing?: boolean;
		onChat?: () => void | Promise<void>;
		onSnooze?: () => void | Promise<void>;
	} = $props();

	// Per-change decision overrides; absent = the default ('approved'). Keeping an
	// overrides map (rather than seeding from the prop) keeps decisions correct if
	// the change set prop ever changes while the modal is open.
	let overrides = $state<Record<string, 'approved' | 'rejected'>>({});
	let applying = $state(false);
	let observedCommit: PendingReviewCommit | null = null;
	const pendingCommit = $derived($pendingAgentRunReviews.get(runId));
	let errorMessage = $state<string | null>(null);
	let failedChangeSet = $state.raw<ChangeSet | null>(null);
	let finished = $state(false);
	let dismissing = $state(false);
	const busy = $derived(
		applying || Boolean(pendingCommit) || openingChat || snoozing || finished
	);

	function decisionFor(id: string): 'approved' | 'rejected' {
		return overrides[id] ?? 'approved';
	}

	let approvedCount = $derived(
		changeSet.changes.filter((c) => decisionFor(c.id) !== 'rejected').length
	);
	const hasFooterSecondaryActions = $derived(Boolean(onSnooze || onChat));

	function setDecision(id: string, decision: 'approved' | 'rejected') {
		overrides[id] = decision;
	}

	const ACTION_META: Record<
		ProposedChangeAction,
		{ icon: typeof Plus; cls: string; label: string }
	> = {
		create: { icon: Plus, cls: 'text-success', label: 'Create' },
		update: { icon: Pencil, cls: 'text-info', label: 'Update' },
		delete: { icon: Trash2, cls: 'text-destructive', label: 'Delete' }
	};

	// Fields to hide from the diff (targeting ids, not meaningful content).
	const HIDDEN_KEYS = new Set([
		'project_id',
		'task_id',
		'document_id',
		'goal_id',
		'plan_id',
		'milestone_id',
		'risk_id'
	]);

	function formatValue(value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'string')
			return value.length > 160 ? value.slice(0, 160) + '…' : value;
		if (typeof value === 'object') {
			const json = JSON.stringify(value);
			return json.length > 160 ? json.slice(0, 160) + '…' : json;
		}
		return String(value);
	}

	function diffRows(change: ProposedChange): { key: string; before?: unknown; after: unknown }[] {
		const after = (change.after ?? {}) as Record<string, unknown>;
		const before = (change.before ?? {}) as Record<string, unknown>;
		return Object.keys(after)
			.filter((k) => !HIDDEN_KEYS.has(k))
			.map((k) => ({
				key: k,
				before: change.before ? before[k] : undefined,
				after: after[k]
			}));
	}

	function isDocumentDiffChange(change: ProposedChange): boolean {
		if (change.entity_type !== 'document' && !change.op.startsWith('onto.document.'))
			return false;
		const before = (change.before ?? {}) as Record<string, unknown>;
		const after = (change.after ?? {}) as Record<string, unknown>;
		return [before, after].some(
			(record) =>
				typeof record.title === 'string' ||
				typeof record.description === 'string' ||
				typeof record.content === 'string' ||
				typeof record.state_key === 'string'
		);
	}

	// A save can start in another inbox surface or outlive this component.
	$effect(() => {
		const commit = pendingCommit;
		if (commit && commit !== observedCommit) {
			untrack(() => {
				void observeCommit(commit);
			});
		}
	});

	async function observeCommit(commit: PendingReviewCommit) {
		observedCommit = commit;
		const complete = onApplied;
		const setApplying = onApplying;
		applying = true;
		dismissing = commit.dismissing;
		overrides = Object.fromEntries(
			commit.decisions.map((decision) => [decision.change_id, decision.decision])
		);
		errorMessage = null;
		setApplying?.(true);
		try {
			const outcome = await commit.promise;
			finished = Boolean(outcome.result);
			errorMessage = outcome.error;
			failedChangeSet = outcome.result?.failed ? (outcome.result.change_set ?? null) : null;
			if (outcome.result && !outcome.result.failed) complete?.();
		} finally {
			applying = false;
			setApplying?.(false);
		}
	}

	function apply(rejectAll = false) {
		if (busy || !runId) return;
		const snapshot = $state.snapshot(changeSet);
		const commit = submitAgentRunReview(
			runId,
			snapshot,
			snapshot.changes.map((change) => ({
				change_id: change.id,
				decision: rejectAll ? 'rejected' : decisionFor(change.id)
			}))
		);
		void observeCommit(commit);
	}
</script>

<div class="space-y-3 rounded-lg border border-info/40 bg-info/5 p-3">
	<div
		class="sticky top-0 z-10 -mx-3 -mt-3 flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-info/20 bg-card p-3"
	>
		<div>
			<div class="micro-label text-info">
				{changeSet.changes.length} proposed change{changeSet.changes.length === 1
					? ''
					: 's'}
			</div>
			{#if changeSet.changes.length > 1 && !finished}
				<p class="mt-1 text-xs text-muted-foreground">
					{approvedCount} selected · Unselected changes will be dismissed.
				</p>
			{/if}
		</div>
		{#if !finished}
			<div class="flex flex-wrap items-center gap-2">
				<Button
					onclick={() => apply(true)}
					variant="outline"
					size="sm"
					disabled={busy}
					loading={applying && dismissing}
				>
					<X class="h-3.5 w-3.5" />
					{changeSet.changes.length === 1 ? dismissLabel : `${rejectAllLabel} all`}
				</Button>
				<Button
					onclick={() => apply()}
					variant="primary"
					size="sm"
					disabled={busy || approvedCount === 0}
					loading={applying && !dismissing}
				>
					<Check class="h-3.5 w-3.5" />
					{applying && !dismissing
						? 'Applying…'
						: `${acceptLabel} ${approvedCount} change${approvedCount === 1 ? '' : 's'}`}
				</Button>
			</div>
		{/if}
	</div>

	{#if errorMessage}
		<p
			role="alert"
			class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
		>
			{errorMessage}
		</p>
	{/if}
	{#if failedChangeSet}
		<ChangeSetFailureSummary changeSet={failedChangeSet} />
	{/if}
	{#if applying}
		<p role="status" class="text-xs text-muted-foreground">
			{dismissing ? 'Dismissing changes…' : 'Applying changes…'}
		</p>
	{/if}

	<div class="space-y-2">
		{#each changeSet.changes as change, index (change.id)}
			{@const meta = ACTION_META[change.action] ?? ACTION_META.update}
			{@const ActionIcon = meta.icon}
			{@const rejected = decisionFor(change.id) === 'rejected'}
			<div
				class="rounded-md border border-border bg-card p-2.5 {rejected ? 'opacity-50' : ''}"
			>
				<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div class="flex min-w-0 items-center gap-1.5">
						<ActionIcon class="h-3.5 w-3.5 shrink-0 {meta.cls}" />
						<span class="shrink-0 text-xs font-medium text-foreground"
							>{meta.label}</span
						>
						<span class="min-w-0 truncate text-xs text-muted-foreground"
							>{change.entity_type}</span
						>
					</div>
					{#if changeSet.changes.length > 1}
						<label
							class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-foreground"
						>
							<input
								type="checkbox"
								checked={!rejected}
								disabled={busy}
								onchange={(event) =>
									setDecision(
										change.id,
										event.currentTarget.checked ? 'approved' : 'rejected'
									)}
								aria-label={`Include change ${index + 1}: ${meta.label} ${change.entity_type}`}
								class="h-4 w-4 rounded border-border text-accent focus:ring-accent"
							/>
							Include
						</label>
					{/if}
				</div>

				{#if change.rationale}
					<p class="mt-1 line-clamp-3 break-words text-xs text-muted-foreground">
						{change.rationale}
					</p>
				{/if}

				{#if isDocumentDiffChange(change)}
					<DocumentProposalDiff {change} />
				{:else if diffRows(change).length}
					<div class="mt-1.5 space-y-0.5">
						{#each diffRows(change) as row (row.key)}
							<div
								class="flex min-w-0 flex-col gap-0.5 text-xs sm:flex-row sm:gap-1.5"
							>
								<span class="shrink-0 text-muted-foreground">{row.key}:</span>
								{#if change.action === 'update' && change.before}
									<span
										class="min-w-0 break-words text-muted-foreground line-through"
										>{formatValue(row.before)}</span
									>
									<span class="shrink-0 text-muted-foreground">→</span>
									<span class="min-w-0 break-words text-foreground"
										>{formatValue(row.after)}</span
									>
								{:else}
									<span class="min-w-0 break-words text-foreground"
										>{formatValue(row.after)}</span
									>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div
		class="flex flex-col gap-2 sm:flex-row sm:items-center {hasFooterSecondaryActions
			? 'sm:justify-between'
			: 'sm:justify-end'}"
	>
		{#if hasFooterSecondaryActions}
			<div
				class="grid gap-2 sm:flex sm:items-center {onSnooze && onChat
					? 'grid-cols-2'
					: 'grid-cols-1'}"
			>
				{#if onChat}
					<Button
						variant="accent"
						size="sm"
						icon={MessageCircle}
						onclick={() => onChat?.()}
						disabled={applying || openingChat}
						loading={openingChat}
						class="w-full text-xs sm:w-auto"
					>
						{chatLabel}
					</Button>
				{/if}
				{#if onSnooze}
					<Button
						variant="outline"
						size="sm"
						icon={Clock}
						onclick={() => onSnooze?.()}
						disabled={applying || snoozing}
						loading={snoozing}
						title="Snooze until tomorrow"
						class="w-full text-xs sm:w-auto"
					>
						Snooze
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>
