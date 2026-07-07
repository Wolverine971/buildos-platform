<!-- apps/web/src/lib/components/notifications/types/agent-run/DocumentProposalDiff.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { FileDiff } from '$lib/icons/lucide';
	import UnifiedDiffView from '$lib/components/ui/UnifiedDiffView.svelte';
	import { createDocumentDiff } from '$lib/utils/document-diff';
	import type { ProposedChange } from '@buildos/shared-types';
	import {
		START_HERE_DOCUMENT_TYPE_KEY,
		stripStartHereManagedRegions
	} from '@buildos/shared-agent-ops/ontology/start-here';

	type DocumentSnapshotInput = {
		title?: string | null;
		description?: string | null;
		content?: string | null;
		state_key?: string | null;
	};

	let { change }: { change: ProposedChange } = $props();

	function recordFrom(value: Record<string, unknown> | undefined): Record<string, unknown> {
		return value ?? {};
	}

	function textField(record: Record<string, unknown>, key: string): string | null | undefined {
		const value = record[key];
		if (typeof value === 'string') return value;
		if (value === null) return null;
		return undefined;
	}

	function hasDocumentFields(record: Record<string, unknown>): boolean {
		return (
			typeof record.title === 'string' ||
			typeof record.description === 'string' ||
			typeof record.content === 'string' ||
			typeof record.state_key === 'string'
		);
	}

	function snapshotFrom(
		value: Record<string, unknown> | undefined
	): DocumentSnapshotInput | null {
		const record = recordFrom(value);
		if (!hasDocumentFields(record)) return null;
		return {
			title: textField(record, 'title'),
			description: textField(record, 'description'),
			content: textField(record, 'content'),
			state_key: textField(record, 'state_key')
		};
	}

	function isStartHereChange(change: ProposedChange): boolean {
		const before = recordFrom(change.before);
		const after = recordFrom(change.after);
		return (
			before.type_key === START_HERE_DOCUMENT_TYPE_KEY ||
			after.type_key === START_HERE_DOCUMENT_TYPE_KEY
		);
	}

	function normalizeSnapshotForDisplay(
		snapshot: DocumentSnapshotInput | null,
		stripManagedRegions: boolean
	): DocumentSnapshotInput | null {
		if (!snapshot) return null;
		return {
			...snapshot,
			content:
				stripManagedRegions && typeof snapshot.content === 'string'
					? stripStartHereManagedRegions(snapshot.content)
					: snapshot.content
		};
	}

	function proposedSnapshotFrom(change: ProposedChange): DocumentSnapshotInput | null {
		if (change.action === 'delete') return null;
		const before = snapshotFrom(change.before);
		const after = snapshotFrom(change.after);
		if (change.action !== 'update') return after;
		return {
			title: after?.title !== undefined ? after.title : before?.title,
			description: after?.description !== undefined ? after.description : before?.description,
			content: after?.content !== undefined ? after.content : before?.content,
			state_key: after?.state_key !== undefined ? after.state_key : before?.state_key
		};
	}

	function titleFrom(change: ProposedChange): string {
		const afterTitle = textField(recordFrom(change.after), 'title');
		const beforeTitle = textField(recordFrom(change.before), 'title');
		const title = afterTitle ?? beforeTitle;
		if (title) return title;
		if (change.entity_id) return `Document ${change.entity_id.slice(0, 8)}`;
		return 'Document';
	}

	const diff = $derived.by(() => {
		const stripManagedRegions = isStartHereChange(change);
		return createDocumentDiff(
			normalizeSnapshotForDisplay(snapshotFrom(change.before), stripManagedRegions),
			normalizeSnapshotForDisplay(proposedSnapshotFrom(change), stripManagedRegions),
			5
		);
	});
	const fileTitle = $derived(titleFrom(change));
	const stats = $derived(diff.totalStats);
</script>

<div class="mt-2 overflow-hidden rounded-md border border-border bg-background">
	<div
		class="flex items-center justify-between gap-3 border-b border-border bg-muted px-2.5 py-2"
	>
		<div class="flex min-w-0 items-center gap-2">
			<FileDiff class="h-3.5 w-3.5 shrink-0 text-info" />
			<span class="truncate font-mono text-[11px] font-medium text-foreground">
				{fileTitle}
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-2 text-[10px] tabular-nums">
			{#if stats.modified > 0}
				<span class="text-warning">~{stats.modified}</span>
			{/if}
			{#if stats.added > 0}
				<span class="text-success">+{stats.added}</span>
			{/if}
			{#if stats.removed > 0}
				<span class="text-destructive">-{stats.removed}</span>
			{/if}
		</div>
	</div>

	<div class="max-h-[30rem] overflow-y-auto bg-card/50 p-2">
		<UnifiedDiffView fields={diff.fields} />
	</div>
</div>
