<!-- apps/web/src/lib/components/notifications/types/agent-run/ChangeSetReview.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import { Plus, Pencil, Trash2, Check, X } from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { ChangeSet, ProposedChange, ProposedChangeAction } from '@buildos/shared-types';

	let {
		runId,
		changeSet,
		onApplied
	}: {
		runId: string;
		changeSet: ChangeSet;
		onApplied?: () => void;
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

	function toggle(id: string) {
		overrides[id] = decisionFor(id) === 'rejected' ? 'approved' : 'rejected';
	}
	function setAll(decision: 'approved' | 'rejected') {
		overrides = Object.fromEntries(changeSet.changes.map((c) => [c.id, decision]));
	}

	const ACTION_META: Record<ProposedChangeAction, { icon: typeof Plus; cls: string; label: string }> =
		{
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
		if (typeof value === 'string') return value.length > 160 ? value.slice(0, 160) + '…' : value;
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
			.map((k) => ({ key: k, before: change.before ? before[k] : undefined, after: after[k] }));
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
				toastService.warning(`Applied ${r.applied}, ${failed} failed, ${r.rejected} rejected`);
			} else {
				toastService.success(
					`Applied ${r?.applied ?? 0} change${r?.applied === 1 ? '' : 's'}` +
						(r?.rejected ? `, rejected ${r.rejected}` : '')
				);
			}
			onApplied?.();
		} catch {
			toastService.error('Could not apply the changes');
		} finally {
			applying = false;
		}
	}
</script>

<div class="rounded-lg border border-info/40 bg-info/5 p-3 space-y-3">
	<div class="flex items-center justify-between gap-2 flex-wrap">
		<div class="text-xs font-medium text-info uppercase tracking-wide">
			Proposed changes ({changeSet.changes.length}) — review before applying
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="text-xs text-muted-foreground hover:text-foreground underline"
				onclick={() => setAll('approved')}
				disabled={applying}>Approve all</button
			>
			<span class="text-muted-foreground text-xs">·</span>
			<button
				type="button"
				class="text-xs text-muted-foreground hover:text-foreground underline"
				onclick={() => setAll('rejected')}
				disabled={applying}>Reject all</button
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
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-center gap-1.5 min-w-0">
						<ActionIcon class="w-3.5 h-3.5 flex-shrink-0 {meta.cls}" />
						<span class="text-xs font-medium text-foreground">{meta.label}</span>
						<span class="text-xs text-muted-foreground">{change.entity_type}</span>
					</div>
					<button
						type="button"
						onclick={() => toggle(change.id)}
						disabled={applying}
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border {rejected
							? 'border-border text-muted-foreground'
							: 'border-success/40 text-success bg-success/5'}"
					>
						{#if rejected}
							<X class="w-3 h-3" /> Rejected
						{:else}
							<Check class="w-3 h-3" /> Approved
						{/if}
					</button>
				</div>

				{#if change.rationale}
					<p class="text-xs text-muted-foreground mt-1">{change.rationale}</p>
				{/if}

				{#if diffRows(change).length}
					<div class="mt-1.5 space-y-0.5">
						{#each diffRows(change) as row (row.key)}
							<div class="text-xs flex gap-1.5">
								<span class="text-muted-foreground flex-shrink-0">{row.key}:</span>
								{#if change.action === 'update' && change.before}
									<span class="text-muted-foreground line-through break-words"
										>{formatValue(row.before)}</span
									>
									<span class="text-muted-foreground">→</span>
									<span class="text-foreground break-words">{formatValue(row.after)}</span>
								{:else}
									<span class="text-foreground break-words">{formatValue(row.after)}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="flex items-center justify-end gap-2">
		<Button onclick={apply} variant="primary" size="md" disabled={applying}>
			{applying
				? 'Applying…'
				: approvedCount === 0
					? 'Reject all & finish'
					: `Apply ${approvedCount} change${approvedCount === 1 ? '' : 's'}`}
		</Button>
	</div>
</div>
