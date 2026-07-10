<!-- apps/web/src/lib/components/today/WhatChangedSection.svelte -->
<script lang="ts">
	import {
		Bot,
		ChevronDown,
		ChevronRight,
		Pencil,
		Plus,
		Trash2,
		User as UserIcon
	} from '$lib/icons/lucide';
	import type { WhatChangedEntry, WhatChangedFeed } from '$lib/types/today';

	interface Props {
		feed: WhatChangedFeed;
	}

	let { feed }: Props = $props();

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
	<section class="mt-5 sm:mt-6" aria-label="What changed">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="flex w-full items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
			aria-expanded={!collapsed}
		>
			<h2
				class="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground"
			>
				What changed
			</h2>
			<span class="text-[10px] sm:text-xs text-muted-foreground/70">
				{feed.entries.length}
				{feed.entries.length === 1 ? 'update' : 'updates'} · {sinceLabel}
			</span>
			{#if collapsed}
				<ChevronRight class="h-3 w-3 text-muted-foreground/70" />
			{:else}
				<ChevronDown class="h-3 w-3 text-muted-foreground/70" />
			{/if}
		</button>

		{#if !collapsed}
			<div class="space-y-2">
				{#each groups as group (group.projectId)}
					{@const isExpanded = expandedProjects.has(group.projectId)}
					{@const visible = isExpanded
						? group.entries
						: group.entries.slice(0, VISIBLE_PER_PROJECT)}
					<div class="wt-paper p-2 sm:p-3 tx tx-grain tx-weak">
						<div class="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
							<a
								href={`/projects/${group.projectId}`}
								class="min-w-0 truncate text-xs sm:text-sm font-semibold text-foreground hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
							>
								{group.projectName}
							</a>
							<span class="flex-shrink-0 text-[10px] sm:text-xs text-muted-foreground">
								{group.entries.length}
								{group.entries.length === 1 ? 'change' : 'changes'}
							</span>
						</div>
						<ul class="space-y-1 sm:space-y-1.5">
							{#each visible as entry (entry.id)}
								<li class="flex items-center gap-1.5 sm:gap-2 min-w-0">
									{#if entry.action === 'created'}
										<Plus
											class="h-3 w-3 flex-shrink-0 text-success"
											aria-label="Created"
										/>
									{:else if entry.action === 'deleted'}
										<Trash2
											class="h-3 w-3 flex-shrink-0 text-destructive"
											aria-label="Deleted"
										/>
									{:else}
										<Pencil
											class="h-3 w-3 flex-shrink-0 text-accent"
											aria-label="Updated"
										/>
									{/if}
									<span
										class="min-w-0 truncate text-[11px] sm:text-xs text-foreground"
										title={entry.entity_name}
									>
										{entry.entity_name}
									</span>
									<span
										class="flex-shrink-0 text-[10px] sm:text-[11px] text-muted-foreground"
									>
										{entityLabel(entry)}
										{#if entry.occurrences > 1}
											· ×{entry.occurrences}
										{/if}
									</span>
									<span
										class="ml-auto flex min-w-0 items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground"
									>
										{#if entry.actor_kind === 'agent' || entry.actor_kind === 'external_agent'}
											<Bot class="h-3 w-3 flex-shrink-0 text-accent/80" />
										{:else}
											<UserIcon
												class="h-3 w-3 flex-shrink-0 text-muted-foreground/70"
											/>
										{/if}
										<span
											class="min-w-0 max-w-20 truncate sm:max-w-40"
											title={entry.actor_label}>{entry.actor_label}</span
										>
										<span class="flex-shrink-0 text-muted-foreground/60"
											>· {relativeTime(entry.latest_at)}</span
										>
									</span>
								</li>
							{/each}
						</ul>
						{#if group.entries.length > VISIBLE_PER_PROJECT}
							<button
								onclick={() => toggleProject(group.projectId)}
								class="mt-1.5 sm:mt-2 text-[10px] sm:text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
							>
								{isExpanded
									? 'Show less'
									: `+${group.entries.length - VISIBLE_PER_PROJECT} more`}
							</button>
						{/if}
					</div>
				{/each}
			</div>
			{#if feed.truncated}
				<p class="mt-1.5 text-[10px] sm:text-xs text-muted-foreground/70">
					Showing the most recent changes — older ones in this window were cut off.
				</p>
			{/if}
		{/if}
	</section>
{/if}
