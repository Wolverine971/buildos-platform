<!-- apps/web/src/lib/components/today/WhatChangedSection.svelte -->
<script lang="ts">
	import {
		Bot,
		ChevronDown,
		ChevronRight,
		MessageCircle,
		Pencil,
		Plus,
		Trash2,
		User as UserIcon
	} from '$lib/icons/lucide';
	import {
		buildProjectEntityOpenHref,
		resolveEntityOpenAction
	} from '$lib/components/project/project-page-interactions';
	import { trackLoopEvent } from '$lib/services/loop-telemetry';
	import type { WhatChangedEntry, WhatChangedFeed } from '$lib/types/today';

	interface Props {
		feed: WhatChangedFeed;
		/** Present = task receipts get a "chat about this change" action. */
		onChatAboutEntry?: (entry: WhatChangedEntry) => void;
	}

	let { feed, onChatAboutEntry }: Props = $props();

	let collapsed = $state(false);
	let expandedProjects = $state<Set<string>>(new Set());

	const VISIBLE_PER_PROJECT = 3;

	interface ProjectGroup {
		projectId: string;
		projectName: string;
		entries: WhatChangedEntry[];
	}

	const groups = $derived.by<ProjectGroup[]>(() => {
		const byProject = new Map<string, ProjectGroup>();
		for (const entry of feed.entries) {
			let group = byProject.get(entry.project_id);
			if (!group) {
				group = {
					projectId: entry.project_id,
					projectName: entry.project_name,
					entries: []
				};
				byProject.set(entry.project_id, group);
			}
			group.entries.push(entry);
		}
		// Most recently changed project first
		return Array.from(byProject.values()).sort(
			(a, b) =>
				new Date(b.entries[0]?.latest_at ?? 0).getTime() -
				new Date(a.entries[0]?.latest_at ?? 0).getTime()
		);
	});

	const sinceLabel = $derived.by(() => {
		const sinceMs = new Date(feed.since).getTime();
		const hours = (Date.now() - sinceMs) / (60 * 60 * 1000);
		if (hours <= 25) return 'since yesterday';
		return `since ${new Date(feed.since).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		})}`;
	});

	function relativeTime(iso: string): string {
		const deltaMs = Date.now() - new Date(iso).getTime();
		const minutes = Math.max(1, Math.round(deltaMs / 60_000));
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.round(hours / 24);
		return `${days}d ago`;
	}

	function entityLabel(entry: WhatChangedEntry): string {
		// 'note' logs render as documents everywhere else in the product
		return entry.entity_type === 'note' ? 'document' : entry.entity_type;
	}

	function entityHref(entry: WhatChangedEntry): string | null {
		// Deleted entities have nowhere to land; the project link above still works.
		if (entry.action === 'deleted') return null;
		if (entry.entity_type === 'project') return `/projects/${entry.project_id}`;
		const resolution = resolveEntityOpenAction(entry.entity_type, entry.entity_id);
		if (resolution.result !== 'opened') return null;
		return buildProjectEntityOpenHref(
			entry.project_id,
			resolution.action.kind,
			resolution.action.entityId
		);
	}

	function trackEntityOpen(entry: WhatChangedEntry) {
		trackLoopEvent('loop_surface_opened', 'today', {
			source_type: 'receipt_entity',
			entity_type: entry.entity_type,
			source_ref_id: entry.entity_id,
			project_id: entry.project_id
		});
	}

	function toggleProject(projectId: string) {
		const next = new Set(expandedProjects);
		if (next.has(projectId)) {
			next.delete(projectId);
		} else {
			next.add(projectId);
		}
		expandedProjects = next;
	}
</script>

{#if feed.entries.length > 0}
	<section class="mt-5 border-t border-border/70 pt-2" aria-label="What changed">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="flex min-h-11 w-full items-center gap-2 [@media(pointer:fine)]:min-h-7 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-expanded={!collapsed}
		>
			<div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
				<h2 class="text-sm font-semibold tracking-tight text-foreground">What changed</h2>
				<p class="text-2xs text-muted-foreground">
					{feed.entries.length}
					{feed.entries.length === 1 ? 'update' : 'updates'} · {sinceLabel}
				</p>
			</div>
			{#if collapsed}<ChevronRight
					class="h-4 w-4 shrink-0 text-muted-foreground"
				/>{:else}<ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground" />{/if}
		</button>
		{#if !collapsed}
			<div
				class="mt-1 divide-y divide-border/70 rounded-lg border border-border/70 bg-card px-2 sm:px-3"
			>
				{#each groups as group (group.projectId)}
					{@const isExpanded = expandedProjects.has(group.projectId)}
					{@const visible = isExpanded
						? group.entries
						: group.entries.slice(0, VISIBLE_PER_PROJECT)}
					<div class="py-2">
						<div class="flex min-w-0 items-center justify-between gap-2">
							<a
								href={`/projects/${group.projectId}`}
								class="flex min-h-11 min-w-0 items-center rounded-md text-xs font-semibold [@media(pointer:fine)]:min-h-7 text-foreground hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								title={group.projectName}
								><span class="truncate">{group.projectName}</span></a
							>
							<span class="shrink-0 text-xs tabular-nums text-muted-foreground"
								>{group.entries.length}</span
							>
						</div>
						<ul>
							{#each visible as entry (entry.id)}
								{@const href = entityHref(entry)}
								<li
									class="flex min-h-11 min-w-0 items-center gap-1.5 [@media(pointer:fine)]:min-h-7"
								>
									<div class="flex w-3.5 shrink-0 items-center">
										{#if entry.action === 'created'}<Plus
												class="h-3.5 w-3.5 text-success"
												aria-label="Created"
											/>{:else if entry.action === 'deleted'}<Trash2
												class="h-3.5 w-3.5 text-destructive"
												aria-label="Deleted"
											/>{:else}<Pencil
												class="h-3.5 w-3.5 text-muted-foreground"
												aria-label="Updated"
											/>{/if}
									</div>
									<div class="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2">
										{#if href}
											<a
												{href}
												onclick={() => trackEntityOpen(entry)}
												class="flex min-h-6 min-w-0 items-center rounded-md text-xs leading-4 sm:flex-1 text-foreground hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												title={entry.entity_name}
												><span class="min-w-0 truncate"
													>{entry.entity_name}</span
												></a
											>
										{:else}<p
												class="flex min-h-6 min-w-0 items-center truncate text-xs leading-4 text-muted-foreground sm:flex-1"
											>
												{entry.entity_name}
											</p>{/if}
										<div
											class="flex min-w-0 items-center gap-1 text-2xs leading-4 text-muted-foreground sm:shrink-0"
										>
											<span
												>{entityLabel(entry)}{#if entry.occurrences > 1}
													· ×{entry.occurrences}{/if}</span
											>
											<span aria-hidden="true">·</span>
											<span class="inline-flex min-w-0 items-center gap-1">
												{#if entry.actor_kind === 'agent' || entry.actor_kind === 'external_agent'}<Bot
														class="h-3 w-3 shrink-0"
													/>{:else}<UserIcon
														class="h-3 w-3 shrink-0"
													/>{/if}
												<span
													class="max-w-20 truncate"
													title={entry.actor_label}
													>{entry.actor_label}</span
												>
											</span>
											<span class="shrink-0"
												>· {relativeTime(entry.latest_at)}</span
											>
										</div>
									</div>
									{#if onChatAboutEntry && entry.entity_type === 'task' && entry.action !== 'deleted'}
										<button
											onclick={() => onChatAboutEntry(entry)}
											class="flex h-11 w-11 shrink-0 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											title={`Chat about "${entry.entity_name}"`}
											aria-label={`Chat about "${entry.entity_name}"`}
											><MessageCircle class="h-4 w-4" /></button
										>
									{/if}
								</li>
							{/each}
						</ul>
						{#if group.entries.length > VISIBLE_PER_PROJECT}
							<button
								onclick={() => toggleProject(group.projectId)}
								class="inline-flex min-h-11 items-center rounded-md text-xs font-medium [@media(pointer:fine)]:min-h-7 text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-expanded={isExpanded}
								>{isExpanded
									? 'Show less'
									: `Show ${group.entries.length - VISIBLE_PER_PROJECT} more`}</button
							>
						{/if}
					</div>
				{/each}
			</div>
			{#if feed.truncated}<p class="mt-1 text-2xs text-muted-foreground">
					Showing the most recent changes in this window.
				</p>{/if}
		{/if}
	</section>
{/if}
