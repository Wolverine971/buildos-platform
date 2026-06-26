<!-- apps/web/src/lib/components/inbox/InboxChangeDetails.svelte -->
<!--
	Decodes a project-review suggestion's declarative `operations[]` into a
	human-readable list so the reviewer can see WHAT the change actually does
	(update a task, change a status, move a doc, delete, etc.) before deciding.
	Used by both the Dashboard AI Inbox modal and the project-page Inbox panel.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		ArrowRight,
		ChevronDown,
		FilePlus2,
		FileText,
		FolderTree,
		Link2,
		ListChecks,
		Pencil,
		Trash2
	} from 'lucide-svelte';
	import type { LoopOperation, ProjectSuggestionPreview } from '@buildos/shared-types';

	let {
		operations = [],
		preview = null,
		defaultOpen = false
	}: {
		operations?: LoopOperation[];
		preview?: ProjectSuggestionPreview | null;
		defaultOpen?: boolean;
	} = $props();

	let open = $state(untrack(() => defaultOpen));

	type Action = 'create' | 'update' | 'delete' | 'move' | 'link' | 'unlink' | 'other';

	type FieldChange = { label: string; value: string };

	type DecodedOp = {
		action: Action;
		actionLabel: string;
		entityLabel: string;
		target: string | null;
		summary: string | null;
		changes: FieldChange[];
	};

	const actionMeta: Record<Action, { label: string; cls: string; icon: typeof Pencil }> = {
		create: {
			label: 'Create',
			cls: 'border-success/30 bg-success/10 text-success',
			icon: FilePlus2
		},
		update: { label: 'Update', cls: 'border-accent/30 bg-accent/10 text-accent', icon: Pencil },
		delete: {
			label: 'Delete',
			cls: 'border-destructive/30 bg-destructive/10 text-destructive',
			icon: Trash2
		},
		move: {
			label: 'Move',
			cls: 'border-warning/30 bg-warning/10 text-warning',
			icon: FolderTree
		},
		link: { label: 'Link', cls: 'border-border bg-muted text-muted-foreground', icon: Link2 },
		unlink: {
			label: 'Unlink',
			cls: 'border-border bg-muted text-muted-foreground',
			icon: Link2
		},
		other: {
			label: 'Change',
			cls: 'border-border bg-muted text-muted-foreground',
			icon: FileText
		}
	};

	const entityIcon: Record<string, typeof FileText> = {
		task: ListChecks,
		document: FileText,
		entities: Link2
	};

	const entityNameLabel: Record<string, string> = {
		task: 'task',
		document: 'document',
		project: 'project',
		goal: 'goal',
		milestone: 'milestone',
		plan: 'plan',
		risk: 'risk',
		entities: 'link',
		asset: 'asset'
	};

	// Friendly labels for known prop keys produced by the project-loop generators.
	const fieldLabel: Record<string, string> = {
		loop_flagged_outdated: 'Outdated flag',
		loop_outdated_reason: 'Outdated reason',
		loop_flagged_conflict: 'Conflict flag',
		loop_conflict_kind: 'Conflict type',
		loop_conflict_with_task_id: 'Conflicts with',
		loop_conflict_reason: 'Conflict reason',
		state_key: 'Status',
		status: 'Status',
		type_key: 'Type',
		title: 'Title',
		name: 'Name',
		description: 'Description',
		priority: 'Priority',
		start_date: 'Start date',
		due_date: 'Due date'
	};

	function humanizeKey(key: string): string {
		if (fieldLabel[key]) return fieldLabel[key];
		return key
			.replace(/_/g, ' ')
			.replace(/\bid\b/i, 'ID')
			.replace(/^\w/, (c) => c.toUpperCase());
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined || value === '') return '—';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') return String(value);
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (!trimmed) return '—';
			return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
		}
		try {
			const json = JSON.stringify(value);
			return json.length > 80 ? `${json.slice(0, 80)}…` : json;
		} catch {
			return String(value);
		}
	}

	function parseTool(tool: string): { action: Action; entity: string } {
		const cleaned = tool.toLowerCase().replace(/_in_tree$/, '');
		const parts = cleaned.split('_').filter((part) => part !== 'onto');
		const verb = parts[0] ?? '';
		const action: Action =
			verb === 'create'
				? 'create'
				: verb === 'update'
					? 'update'
					: verb === 'delete' || verb === 'remove'
						? 'delete'
						: verb === 'move'
							? 'move'
							: verb === 'link'
								? 'link'
								: verb === 'unlink'
									? 'unlink'
									: 'other';
		const entity = parts[1] ?? '';
		return { action, entity };
	}

	function decodeOperation(op: LoopOperation): DecodedOp {
		const { action, entity } = parseTool(op.tool ?? '');
		const args = (op.args ?? {}) as Record<string, unknown>;
		const entityLabel = entityNameLabel[entity] ?? entity ?? 'item';

		const changes: FieldChange[] = [];

		// Field-level changes live in `props` for update_* operations.
		const props = args.props;
		if (props && typeof props === 'object' && !Array.isArray(props)) {
			for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
				changes.push({ label: humanizeKey(key), value: formatValue(value) });
			}
		}

		// Notable top-level args worth surfacing per action.
		if (action === 'move') {
			if ('new_parent_id' in args) {
				const parent = args.new_parent_id;
				changes.push({
					label: 'New location',
					value: parent ? formatValue(parent) : 'Top level'
				});
			}
			if (typeof args.new_position === 'number') {
				changes.push({ label: 'Position', value: String(args.new_position) });
			}
		}

		if (action === 'create') {
			for (const key of ['title', 'name', 'description', 'priority', 'start_date'] as const) {
				if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
					changes.push({ label: humanizeKey(key), value: formatValue(args[key]) });
				}
			}
		}

		if (action === 'link' || action === 'unlink') {
			for (const key of [
				'relationship',
				'relation',
				'to_entity_id',
				'from_entity_id'
			] as const) {
				if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
					changes.push({ label: humanizeKey(key), value: formatValue(args[key]) });
				}
			}
		}

		const target =
			(typeof args.title === 'string' && args.title.trim()) ||
			(typeof args.name === 'string' && args.name.trim()) ||
			null;

		return {
			action,
			actionLabel: actionMeta[action].label,
			entityLabel,
			target,
			summary: typeof op.label === 'string' && op.label.trim() ? op.label.trim() : null,
			changes
		};
	}

	const decoded = $derived(operations.map((op) => decodeOperation(op)));
	const count = $derived(operations.length);

	const hasPreviewDetail = $derived(
		Boolean(
			(preview?.before && preview.before.length) ||
				(preview?.after && preview.after.length) ||
				preview?.impact
		)
	);
</script>

{#if count > 0 || hasPreviewDetail}
	<div class="mt-2">
		<button
			type="button"
			onclick={() => (open = !open)}
			class="inline-flex items-center gap-1 rounded text-[11px] font-semibold text-accent hover:underline"
			aria-expanded={open}
		>
			<ChevronDown class="h-3 w-3 transition-transform {open ? 'rotate-0' : '-rotate-90'}" />
			{open ? 'Hide' : 'Show'}
			{count} proposed change{count === 1 ? '' : 's'}
		</button>

		{#if open}
			<div class="mt-2 space-y-1.5">
				{#each decoded as op, opIndex (opIndex)}
					{@const Icon = entityIcon[op.entityLabel] ?? actionMeta[op.action].icon}
					<div class="rounded-md border border-border bg-muted/20 p-2">
						<div class="flex flex-wrap items-center gap-1.5">
							<span
								class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold {actionMeta[
									op.action
								].cls}"
							>
								<Icon class="h-3 w-3" />
								{op.actionLabel}
								{op.entityLabel}
							</span>
							{#if op.target}
								<span
									class="min-w-0 truncate text-[11px] font-medium text-foreground"
								>
									{op.target}
								</span>
							{/if}
						</div>

						{#if op.summary}
							<p class="mt-1 text-[11px] text-muted-foreground">{op.summary}</p>
						{/if}

						{#if op.changes.length}
							<div class="mt-1.5 space-y-0.5">
								{#each op.changes as change, changeIndex (changeIndex)}
									<div class="flex items-baseline gap-1.5 text-[11px]">
										<span class="shrink-0 font-medium text-muted-foreground">
											{change.label}:
										</span>
										<span class="min-w-0 break-words text-foreground/90">
											{change.value}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				{#if hasPreviewDetail}
					<div class="rounded-md border border-border bg-muted/10 p-2">
						{#if preview?.before?.length || preview?.after?.length}
							<div class="flex flex-wrap items-start gap-2 text-[11px]">
								{#if preview?.before?.length}
									<div class="min-w-0 flex-1">
										<p
											class="text-[10px] font-semibold uppercase text-muted-foreground"
										>
											Before
										</p>
										<ul class="mt-0.5 space-y-0.5">
											{#each preview.before as line}
												<li
													class="break-words text-muted-foreground line-through"
												>
													{line}
												</li>
											{/each}
										</ul>
									</div>
									<ArrowRight
										class="mt-4 h-3 w-3 shrink-0 text-muted-foreground"
									/>
								{/if}
								{#if preview?.after?.length}
									<div class="min-w-0 flex-1">
										<p
											class="text-[10px] font-semibold uppercase text-muted-foreground"
										>
											After
										</p>
										<ul class="mt-0.5 space-y-0.5">
											{#each preview.after as line}
												<li class="break-words text-foreground/90">
													{line}
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
						{#if preview?.impact}
							<p class="mt-1.5 text-[11px] text-muted-foreground">
								<span class="font-semibold text-foreground/80">Impact:</span>
								{preview.impact}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
