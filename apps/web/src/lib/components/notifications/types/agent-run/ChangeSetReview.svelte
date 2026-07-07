<!-- apps/web/src/lib/components/notifications/types/agent-run/ChangeSetReview.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Plus, Pencil, Trash2, Check, X, Clock, MessageCircle } from '$lib/icons/lucide';
	import DocumentProposalDiff from './DocumentProposalDiff.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { notifyDataMutation } from '$lib/stores/projectDataMutations';
	import type { ChangeSet, ProposedChange, ProposedChangeAction } from '@buildos/shared-types';

	let {
		runId,
		changeSet,
		onApplied,
		acceptLabel = 'Apply',
		dismissLabel = 'Reject',
		approveAllLabel = 'Approve',
		rejectAllLabel = 'Reject',
		openingChat = false,
		snoozing = false,
		onChat,
		onSnooze
	}: {
		runId: string;
		changeSet: ChangeSet;
		onApplied?: () => void;
		acceptLabel?: string;
		dismissLabel?: string;
		approveAllLabel?: string;
		rejectAllLabel?: string;
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
	function setAll(decision: 'approved' | 'rejected') {
		overrides = Object.fromEntries(changeSet.changes.map((c) => [c.id, decision]));
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

	// Best-effort project scope for the mutation signal: any `project_id` referenced by a
	// change, plus the entity id of any project-level change. Empty = scope unknown.
	function collectAffectedProjectIds(set: ChangeSet): string[] {
		const ids = new Set<string>();
		for (const change of set.changes) {
			for (const payload of [change.after, change.before]) {
				const pid = (payload as Record<string, unknown> | null | undefined)?.project_id;
				if (typeof pid === 'string' && pid) ids.add(pid);
			}
			if (change.entity_type === 'project') {
				const projectEntityId = change.entity_id ?? change.applied_entity_id;
				if (typeof projectEntityId === 'string' && projectEntityId)
					ids.add(projectEntityId);
			}
		}
		return Array.from(ids);
	}

	async function apply() {
		if (applying || !runId) return;
		applying = true;
		try {
			const body = {
				decisions: changeSet.changes.map((c) => ({
					change_id: c.id,
					decision: decisionFor(c.id)
				}))
			};
			const res = await fetch(`/api/agent-runs/${runId}/commit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				toastService.error(payload?.error || 'Could not apply the changes');
				return;
			}
			const r = payload?.data;
			const failed = r?.failed ?? 0;
			if (failed > 0) {
				toastService.warning(
					`Applied ${r.applied}, ${failed} failed, ${r.rejected} rejected. Use Chat for follow-up.`
				);
				onApplied?.();
				return;
			}
			// Tell the rest of the app to refetch so the applied changes show up live.
			const applied = r?.applied ?? 0;
			if (applied > 0) {
				notifyDataMutation({
					hasChanges: true,
					totalMutations: applied,
					affectedProjectIds: collectAffectedProjectIds(changeSet),
					hasMessagesSent: false
				});
			}
			onApplied?.();
		} catch {
			toastService.error('Could not apply the changes');
		} finally {
			applying = false;
		}
	}
</script>

<div class="space-y-3 rounded-lg border border-info/40 bg-info/5 p-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="micro-label text-info">
			Proposed changes ({changeSet.changes.length}) — review before applying
		</div>
		<div class="flex flex-wrap items-center justify-end gap-1">
			<button
				type="button"
				class="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-medium text-muted-foreground underline transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
				onclick={() => setAll('approved')}
				disabled={applying}>{approveAllLabel} all</button
			>
			<span class="text-xs text-muted-foreground" aria-hidden="true">·</span>
			<button
				type="button"
				class="inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-medium text-muted-foreground underline transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
				onclick={() => setAll('rejected')}
				disabled={applying}>{rejectAllLabel} all</button
			>
		</div>
	</div>

	<div class="space-y-2">
		{#each changeSet.changes as change (change.id)}
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
					<div
						class="inline-flex min-h-[44px] overflow-hidden rounded-md border border-border"
					>
						<button
							type="button"
							onclick={() => setDecision(change.id, 'approved')}
							disabled={applying}
							aria-pressed={!rejected}
							class="inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-1 px-3 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none {rejected
								? 'text-muted-foreground hover:bg-muted'
								: 'bg-success/10 text-success'}"
						>
							<Check class="h-3 w-3 shrink-0" />
							{acceptLabel}
						</button>
						<button
							type="button"
							onclick={() => setDecision(change.id, 'rejected')}
							disabled={applying}
							aria-pressed={rejected}
							class="inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-1 border-l border-border px-3 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none {rejected
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:bg-muted'}"
						>
							<X class="h-3 w-3 shrink-0" />
							{dismissLabel}
						</button>
					</div>
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
						Chat
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
		<Button
			onclick={apply}
			variant="primary"
			size="md"
			disabled={applying}
			class="w-full sm:w-auto"
		>
			{applying
				? 'Applying…'
				: approvedCount === 0
					? `${dismissLabel} all & finish`
					: `${acceptLabel} ${approvedCount} change${approvedCount === 1 ? '' : 's'}`}
		</Button>
	</div>
</div>
