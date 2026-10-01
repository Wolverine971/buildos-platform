<!-- apps/web/src/lib/components/dashboard/RecentActivityPanels.svelte -->
<!--
  Recent activity (tasks, docs, goals across projects) beside recent chats.
  Lives under the Projects desktop; `recent` is null while the page's streamed
  analytics are still on their way, which shows skeleton rows of the same height.
-->
<script lang="ts">
	import { ArrowRight, FileText, ListChecks, MessageSquare, Target } from '$lib/icons/lucide';
	import { getTaskStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import { buildProjectEntityOpenHref } from '$lib/components/project/project-page-interactions';
	import { preloadProjectEntityModal } from '$lib/components/project/project-entity-modal-loader';
	import { formatActivityDay, getDashboardChatPresentation } from './dashboard-presentation';
	import type { UserDashboardAnalytics } from '$lib/types/dashboard-analytics';

	type ActivityItem =
		| {
				kind: 'task';
				id: string;
				title: string;
				project_name: string;
				state_key: string;
				due_at: string | null;
				updated_at: string;
				action_label: string;
				href: string;
		  }
		| {
				kind: 'document';
				id: string;
				title: string;
				project_name: string;
				state_key: string;
				updated_at: string;
				action_label: string;
				href: string;
		  }
		| {
				kind: 'goal';
				id: string;
				title: string;
				project_name: string;
				state_key: string;
				target_date: string | null;
				updated_at: string;
				action_label: string;
				href: string;
		  };

	let { recent }: { recent: UserDashboardAnalytics['recent'] | null } = $props();

	let pendingNavigationHref = $state<string | null>(null);

	const feed: ActivityItem[] = $derived.by(() => {
		if (!recent) return [];
		const items: ActivityItem[] = [];

		for (const t of recent.tasks) {
			items.push({
				kind: 'task',
				id: t.id,
				title: t.title,
				project_name: t.project_name,
				state_key: t.state_key,
				due_at: t.due_at,
				updated_at: t.updated_at,
				action_label: t.action_label,
				href: buildProjectEntityOpenHref(t.project_id, 'task', t.id)
			});
		}

		for (const d of recent.documents) {
			items.push({
				kind: 'document',
				id: d.id,
				title: d.title,
				project_name: d.project_name,
				state_key: d.state_key,
				updated_at: d.updated_at,
				action_label: d.action_label,
				href: buildProjectEntityOpenHref(d.project_id, 'document', d.id)
			});
		}

		for (const g of recent.goals) {
			items.push({
				kind: 'goal',
				id: g.id,
				title: g.name,
				project_name: g.project_name,
				state_key: g.state_key,
				target_date: g.target_date,
				updated_at: g.updated_at,
				action_label: g.action_label,
				href: buildProjectEntityOpenHref(g.project_id, 'goal', g.id)
			});
		}

		items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
		return items.slice(0, 8);
	});

	const chats = $derived(recent ? recent.chatSessions.slice(0, 4) : []);

	function formatRelativeTime(timestamp: string): string {
		const parsed = Date.parse(timestamp);
		if (Number.isNaN(parsed)) return 'Recently';

		const deltaMinutes = Math.floor((Date.now() - parsed) / (60 * 1000));
		if (deltaMinutes < 1) return 'Just now';
		if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
		const deltaHours = Math.floor(deltaMinutes / 60);
		if (deltaHours < 24) return `${deltaHours}h ago`;
		const deltaDays = Math.floor(deltaHours / 24);
		if (deltaDays < 7) return `${deltaDays}d ago`;

		return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatDueDate(value: string | null): string {
		if (!value) return 'No due date';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No due date';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatStateLabel(state: string): string {
		return state
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function handleAnchorClick(event: MouseEvent, href: string) {
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.defaultPrevented
		) {
			return;
		}
		pendingNavigationHref = href;
	}

	function pendingClass(href: string): string {
		return pendingNavigationHref === href
			? 'ring-1 ring-accent/50 animate-pulse motion-reduce:animate-none'
			: '';
	}

	function preloadDestination(kind: ActivityItem['kind']) {
		void Promise.all([
			import('$lib/components/project/ProjectModalsHost.svelte'),
			preloadProjectEntityModal(kind)
		]).catch((error) => {
			console.warn('[RecentActivity] Failed to preload entity modal:', error);
		});
	}
</script>

{#snippet skeletonRows(count: number)}
	<div class="wt-paper min-w-0 divide-y divide-border overflow-hidden" aria-hidden="true">
		{#each Array.from({ length: count }, (_, index) => index) as index (index)}
			<div class="flex items-start gap-3 px-3 py-2.5">
				<div
					class="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-muted motion-reduce:animate-none"
				></div>
				<div class="min-w-0 flex-1 space-y-1.5">
					<div
						class="h-3.5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none"
					></div>
					<div
						class="h-2.5 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none"
					></div>
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<div class="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3" aria-busy={recent ? undefined : 'true'}>
	<!-- Activity feed (2/3 width on desktop) -->
	<section class="min-w-0 lg:col-span-2">
		<div class="mb-2 flex items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-foreground sm:text-base">Recent activity</h2>
			<a
				href="/notifications"
				onclick={(event) => handleAnchorClick(event, '/notifications')}
				aria-busy={pendingNavigationHref === '/notifications'}
				class="shrink-0 text-sm text-muted-foreground transition-colors hover:text-accent {pendingClass(
					'/notifications'
				)}">All activity &rarr;</a
			>
		</div>

		{#if !recent}
			{@render skeletonRows(4)}
		{:else if feed.length === 0}
			<div class="wt-paper p-4 text-center tx tx-frame tx-weak">
				<p class="text-sm text-muted-foreground">No recent activity yet.</p>
			</div>
		{:else}
			<div class="wt-paper min-w-0 divide-y divide-border overflow-hidden">
				{#each feed as item, index (item.kind + '-' + item.id)}
					{@const dayLabel = formatActivityDay(item.updated_at)}
					{#if index === 0 || dayLabel !== formatActivityDay(feed[index - 1]!.updated_at)}
						<h3 class="bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
							{dayLabel}
						</h3>
					{/if}
					<a
						href={item.href}
						onpointerenter={() => preloadDestination(item.kind)}
						onfocus={() => preloadDestination(item.kind)}
						onclick={(event) => handleAnchorClick(event, item.href)}
						aria-busy={pendingNavigationHref === item.href}
						class="group flex min-w-0 items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset {pendingClass(
							item.href
						)}"
					>
						<div class="mt-0.5 shrink-0">
							{#if item.kind === 'task'}
								<ListChecks class="h-3.5 w-3.5 text-muted-foreground" />
							{:else if item.kind === 'document'}
								<FileText class="h-3.5 w-3.5 text-muted-foreground" />
							{:else}
								<Target class="h-3.5 w-3.5 text-muted-foreground" />
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 items-center gap-2">
								<p
									class="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
								>
									{item.title}
								</p>
								{#if item.kind === 'task' && item.action_label !== 'Completed'}
									<span
										class="inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-2xs font-medium {getTaskStateBadgeClass(
											item.state_key
										)}"
									>
										{formatStateLabel(item.state_key)}
									</span>
								{/if}
							</div>
							<div class="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
								<span
									class="text-2xs font-medium {item.action_label === 'Created'
										? 'text-success'
										: item.action_label === 'Completed'
											? 'text-info'
											: 'text-muted-foreground'}"
									>{item.action_label} {item.kind}</span
								>
								<span class="text-2xs text-muted-foreground">·</span>
								<span class="min-w-0 flex-1 truncate text-2xs text-muted-foreground"
									>{item.project_name}</span
								>
								{#if item.kind === 'task' && item.due_at}
									<span
										class="hidden shrink-0 text-2xs text-muted-foreground sm:inline"
										>· due {formatDueDate(item.due_at)}</span
									>
								{/if}
								{#if item.kind === 'goal' && item.target_date}
									<span
										class="hidden shrink-0 text-2xs text-muted-foreground sm:inline"
										>· target {formatDueDate(item.target_date)}</span
									>
								{/if}
							</div>
							{#if item.kind === 'task' && item.due_at}
								<p class="mt-0.5 text-2xs text-muted-foreground sm:hidden">
									Due {formatDueDate(item.due_at)}
								</p>
							{/if}
							{#if item.kind === 'goal' && item.target_date}
								<p class="mt-0.5 text-2xs text-muted-foreground sm:hidden">
									Target {formatDueDate(item.target_date)}
								</p>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-1">
							<span class="stamp whitespace-nowrap text-2xs text-muted-foreground">
								{formatRelativeTime(item.updated_at)}
							</span>
							<ArrowRight
								class="hidden h-3 w-3 text-accent opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none sm:block"
							/>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Recent chats (1/3 width on desktop) -->
	<section class="min-w-0">
		<div class="mb-2 flex min-w-0 items-center justify-between gap-2">
			<h2 class="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base">
				Recent chats
			</h2>
			<a
				href="/history?type=chats"
				onclick={(event) => handleAnchorClick(event, '/history?type=chats')}
				aria-busy={pendingNavigationHref === '/history?type=chats'}
				class="shrink-0 text-sm text-muted-foreground transition-colors hover:text-accent {pendingClass(
					'/history?type=chats'
				)}"
			>
				All chats &rarr;
			</a>
		</div>

		{#if !recent}
			{@render skeletonRows(3)}
		{:else if chats.length === 0}
			<div class="wt-paper p-4 text-center tx tx-frame tx-weak">
				<p class="text-sm text-muted-foreground">No recent chats.</p>
			</div>
		{:else}
			<div class="wt-paper min-w-0 divide-y divide-border overflow-hidden">
				{#each chats as session (session.id)}
					{@const chat = getDashboardChatPresentation(session)}
					{@const chatHref = `/history?type=chats&id=${session.id}&itemType=chat_session`}
					<a
						href={chatHref}
						onclick={(event) => handleAnchorClick(event, chatHref)}
						aria-busy={pendingNavigationHref === chatHref}
						class="group block min-w-0 px-3 py-2.5 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset {pendingClass(
							chatHref
						)}"
					>
						<div class="flex min-w-0 items-start justify-between gap-2">
							<div class="flex min-w-0 flex-1 items-start gap-2">
								<MessageSquare class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-foreground">
										{chat.title}
									</p>
									<p class="mt-0.5 truncate text-2xs text-muted-foreground">
										{chat.subtitle}
									</p>
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<span
									class="stamp whitespace-nowrap text-2xs text-muted-foreground"
								>
									{formatRelativeTime(session.last_activity_at)}
								</span>
								<ArrowRight
									class="hidden h-3 w-3 text-accent opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none sm:block"
								/>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
