<!-- apps/web/src/lib/components/projects/desktop/ReaderDetailsPanel.svelte -->
<!--
	The reader's Details panel: what the full editors keep in their side drawer,
	beside the item instead of behind a modal. People (ping, assign), a task's
	assignees, repeat and tags, linked items, activity (the change history),
	comments, a task's images, and when it was made. Each folded section loads
	only when opened; which ones are open is remembered on this device.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Activity,
		ChevronDown,
		ImageIcon,
		Link,
		MessageSquare,
		Repeat,
		Users,
		X
	} from '$lib/icons/lucide';
	import EntityActivityLog from '$lib/components/ontology/EntityActivityLog.svelte';
	import EntityCollaborationAction from '$lib/components/ontology/EntityCollaborationAction.svelte';
	import EntityCommentsSection from '$lib/components/ontology/EntityCommentsSection.svelte';
	import ImageAssetsPanel from '$lib/components/ontology/ImageAssetsPanel.svelte';
	import LinkedEntities from '$lib/components/ontology/linked-entities/LinkedEntities.svelte';
	import type { EntityKind } from '$lib/components/ontology/linked-entities/linked-entities.types';
	import TagsDisplay from '$lib/components/ontology/TagsDisplay.svelte';
	import TaskAssigneeSelector from '$lib/components/ontology/TaskAssigneeSelector.svelte';
	import type { ReaderKind } from './reader-model';

	type Assignee = { actor_id?: string | null; name?: string | null; email?: string | null };

	let {
		kind,
		id,
		projectId,
		canWrite,
		title,
		props: entityProps = null,
		assignees = [],
		createdAt = null,
		completedAt = null,
		onAssignees,
		onOpenLinked,
		onLinksChanged,
		onImagesChanged,
		onAllDetails,
		onClose
	}: {
		kind: ReaderKind;
		id: string;
		projectId: string;
		canWrite: boolean;
		title: string;
		/** The item's props (a task's tags and repeat live here). */
		props?: Record<string, unknown> | null;
		assignees?: Assignee[];
		createdAt?: string | null;
		completedAt?: string | null;
		/** Save a task's assignees; false when the save failed. */
		onAssignees?: (actorIds: string[]) => Promise<boolean>;
		onOpenLinked: (kind: EntityKind, id: string) => void;
		onLinksChanged?: () => void;
		onImagesChanged?: () => void;
		/** The full editor, for what the panel doesn't carry (repeat setup, organize, delete). */
		onAllDetails: () => void;
		onClose: () => void;
	} = $props();

	// ---------- Folded sections ----------

	type SectionKey = 'linked' | 'activity' | 'comments' | 'images';
	const OPEN_KEY = 'buildos:reader-details-sections';
	function readOpen(): Record<SectionKey, boolean> {
		const fallback = { linked: true, activity: false, comments: false, images: false };
		try {
			const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null');
			return saved && typeof saved === 'object' ? { ...fallback, ...saved } : fallback;
		} catch {
			return fallback;
		}
	}
	let open = $state(readOpen());
	function toggle(key: SectionKey) {
		open = { ...open, [key]: !open[key] };
		try {
			localStorage.setItem(OPEN_KEY, JSON.stringify(open));
		} catch {
			// Storage can be off (private mode); the fold still works here.
		}
	}
	let commentCount = $state<number | null>(null);

	// ---------- A task's assignees: saved as they change ----------

	function actorIds(list: readonly Assignee[]): string[] {
		return list
			.map((entry) => entry.actor_id)
			.filter((value): value is string => typeof value === 'string' && value.length > 0)
			.sort();
	}
	// The names the read already carries, shown while the member list loads.
	const fallback = $derived(
		assignees
			.filter((entry): entry is Assignee & { actor_id: string } => Boolean(entry.actor_id))
			.map((entry) => ({ actor_id: entry.actor_id, name: entry.name, email: entry.email }))
	);
	let assigneeIds = $state<string[]>(untrack(() => actorIds(assignees)));
	let savedIds = untrack(() => actorIds(assignees).join(','));
	let assigneeTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const next = [...assigneeIds].sort();
		const joined = next.join(',');
		if (!onAssignees || joined === savedIds) return;
		if (assigneeTimer) clearTimeout(assigneeTimer);
		// A short wait so picking two people sends one save.
		assigneeTimer = setTimeout(async () => {
			const before = savedIds;
			savedIds = joined;
			const ok = await onAssignees(next);
			if (!ok) {
				savedIds = before;
				assigneeIds = before ? before.split(',') : [];
			}
		}, 500);
		return () => {
			if (assigneeTimer) clearTimeout(assigneeTimer);
		};
	});

	// ---------- A task's repeat ----------

	const series = $derived.by(() => {
		const meta = entityProps?.series;
		return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
	});
	const repeatLabel = $derived.by(() => {
		if (series?.role === 'master') {
			const count = Number(series.instance_count ?? 0);
			return count > 0 ? `Repeats · ${count} upcoming` : 'Repeats';
		}
		if (series?.role === 'instance') return 'Part of a repeating series';
		return "Doesn't repeat";
	});
	const hasTags = $derived(
		Array.isArray(entityProps?.tags) && (entityProps.tags as unknown[]).length > 0
	);

	function longDate(value: string | null | undefined): string {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
	}
</script>

<aside class="panel" aria-label="Details">
	<header class="panel-head">
		<span class="micro">Details</span>
		<button
			type="button"
			class="ib"
			onclick={onClose}
			aria-label="Close details"
			title="Close (D)"
		>
			<X class="h-4 w-4" />
		</button>
	</header>

	<div class="rows">
		<EntityCollaborationAction
			{projectId}
			entityType={kind}
			entityId={id}
			entityTitle={title}
			disabled={!canWrite}
		/>

		{#if kind === 'task'}
			<div class="row">
				<span class="label"><Users class="h-3.5 w-3.5" /> Assignees</span>
				<div class="min-w-0">
					<TaskAssigneeSelector
						{projectId}
						bind:selectedActorIds={assigneeIds}
						fallbackAssignees={fallback}
						disabled={!canWrite}
						maxAssignees={10}
					/>
				</div>
			</div>
			<div class="row inline">
				<span class="label"><Repeat class="h-3.5 w-3.5" /> Repeat</span>
				<span class="value">{repeatLabel}</span>
				{#if canWrite}
					<button type="button" class="link" onclick={onAllDetails}>
						{series ? 'Manage' : 'Set up'}
					</button>
				{/if}
			</div>
			{#if hasTags}
				<div class="row">
					<TagsDisplay props={entityProps} size="xs" showLabel={true} />
				</div>
			{/if}
		{/if}
	</div>

	<section class="sec">
		<button
			type="button"
			class="sec-head"
			aria-expanded={open.linked}
			onclick={() => toggle('linked')}
		>
			<Link class="h-3.5 w-3.5" />
			<span>Linked items</span>
			<ChevronDown class="chev h-3.5 w-3.5 {open.linked ? 'rotate-180' : ''}" />
		</button>
		{#if open.linked}
			<div class="sec-body">
				<LinkedEntities
					sourceId={id}
					sourceKind={kind as EntityKind}
					{projectId}
					readOnly={!canWrite}
					compactEditToggle={true}
					onEntityClick={onOpenLinked}
					{onLinksChanged}
				/>
			</div>
		{/if}
	</section>

	<section class="sec">
		<button
			type="button"
			class="sec-head"
			aria-expanded={open.comments}
			onclick={() => toggle('comments')}
		>
			<MessageSquare class="h-3.5 w-3.5" />
			<span>Comments{commentCount ? ` (${commentCount})` : ''}</span>
			<ChevronDown class="chev h-3.5 w-3.5 {open.comments ? 'rotate-180' : ''}" />
		</button>
		{#if open.comments}
			<div class="sec-body">
				<EntityCommentsSection
					{projectId}
					entityType={kind}
					entityId={id}
					onCountChange={(count) => (commentCount = count)}
				/>
			</div>
		{/if}
	</section>

	<section class="sec">
		<button
			type="button"
			class="sec-head"
			aria-expanded={open.activity}
			onclick={() => toggle('activity')}
		>
			<Activity class="h-3.5 w-3.5" />
			<span>Activity</span>
			<ChevronDown class="chev h-3.5 w-3.5 {open.activity ? 'rotate-180' : ''}" />
		</button>
		{#if open.activity}
			<div class="sec-body">
				<EntityActivityLog
					entityType={kind}
					entityId={id}
					autoLoad={true}
					embedded={true}
				/>
			</div>
		{/if}
	</section>

	{#if kind === 'task'}
		<section class="sec">
			<button
				type="button"
				class="sec-head"
				aria-expanded={open.images}
				onclick={() => toggle('images')}
			>
				<ImageIcon class="h-3.5 w-3.5" />
				<span>Images</span>
				<ChevronDown class="chev h-3.5 w-3.5 {open.images ? 'rotate-180' : ''}" />
			</button>
			{#if open.images}
				<div class="sec-body">
					<ImageAssetsPanel
						{projectId}
						entityKind="task"
						entityId={id}
						showTitle={false}
						compact={true}
						canEdit={canWrite}
						onChanged={onImagesChanged}
					/>
				</div>
			{/if}
		</section>
	{/if}

	<dl class="meta">
		{#if createdAt}
			<div>
				<dt>Created</dt>
				<dd>{longDate(createdAt)}</dd>
			</div>
		{/if}
		{#if completedAt}
			<div>
				<dt>Completed</dt>
				<dd>{longDate(completedAt)}</dd>
			</div>
		{/if}
	</dl>

	<button type="button" class="all" onclick={onAllDetails}> Open the full editor </button>
</aside>

<style>
	.panel {
		display: flex;
		height: 100%;
		min-height: 0;
		flex-direction: column;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: hsl(var(--background));
	}
	/* Solid and on top while the sections scroll under it. */
	.panel-head {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		padding: 6px 6px 6px 14px;
	}
	.micro {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.ib {
		display: inline-grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 7px;
		color: hsl(var(--muted-foreground));
	}
	.ib:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	/* Each block keeps its children's layers (textures, raised cards) to itself,
	   so nothing paints over the sticky header. */
	.rows,
	.sec,
	.meta {
		position: relative;
		z-index: 0;
		isolation: isolate;
	}
	.rows {
		display: grid;
		gap: 2px;
		border-bottom: 1px solid hsl(var(--border));
		padding-bottom: 6px;
	}
	.row {
		display: grid;
		gap: 6px;
		padding: 8px 14px;
	}
	.row.inline {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.label {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	.value {
		min-width: 0;
		flex: 1;
		font-size: 12.5px;
		color: hsl(var(--foreground));
	}
	.link,
	.all {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		text-decoration: underline;
		text-decoration-color: hsl(var(--border-strong));
		text-underline-offset: 3px;
	}
	.link:hover,
	.all:hover {
		color: hsl(var(--foreground));
	}
	.sec {
		border-bottom: 1px solid hsl(var(--border));
	}
	.sec-head {
		display: flex;
		width: 100%;
		min-height: 40px;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		font-size: 12.5px;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.sec-head:hover {
		background: hsl(var(--muted) / 0.6);
	}
	.sec-head :global(.chev) {
		margin-left: auto;
		color: hsl(var(--muted-foreground));
		transition: transform 150ms ease;
	}
	.sec-body {
		padding: 0 14px 12px;
	}
	.meta {
		display: grid;
		gap: 4px;
		padding: 12px 14px 4px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.meta div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.meta dd {
		color: hsl(var(--foreground) / 0.8);
	}
	.all {
		align-self: flex-start;
		margin: 8px 14px 16px;
	}
	.ib:focus-visible,
	.sec-head:focus-visible,
	.link:focus-visible,
	.all:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.sec-head :global(.chev) {
			transition: none;
		}
	}
</style>
