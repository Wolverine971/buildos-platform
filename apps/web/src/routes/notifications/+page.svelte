<!-- apps/web/src/routes/notifications/+page.svelte -->
<!--
	Activity timeline: one continuous reverse-chronological feed of everything that
	happened across the user's projects. Notifications are a lane inside the feed
	rather than the whole feed. Pages load lazily as the user scrolls.

	Every card is a single click target that opens the thing it describes (the brief,
	the chat transcript, the project), with the project and the grouped child rows as
	secondary links inside it.
-->
<script lang="ts">
	import {
		Activity,
		AlertCircle,
		Bell,
		Bot,
		Brain,
		Calendar,
		ChevronDown,
		ChevronRight,
		ClipboardCheck,
		Coffee,
		Inbox,
		Loader2,
		MessageSquare,
		Mic,
		Pencil,
		Plug,
		RefreshCw,
		Users
	} from '$lib/icons/lucide';
	import {
		buildProjectEntityOpenHref,
		resolveEntityOpenAction
	} from '$lib/components/project/project-page-interactions';
	import {
		ACTIVITY_LANES,
		type ActivityChild,
		type ActivityEntry,
		type ActivityLane,
		type ActivityTimelinePage
	} from '$lib/types/activity-timeline';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type LaneFilter = ActivityLane | 'all';

	// Server-rendered page 1 is a seed, not a binding: from here the component owns
	// the list (appending on scroll, replacing on filter), so it deliberately does
	// not re-sync with `data`.
	// svelte-ignore state_referenced_locally
	const seed = data.page ?? { entries: [], nextCursor: null, hasMore: false, degraded: [] };

	let entries = $state<ActivityEntry[]>([...seed.entries]);
	let cursor = $state<string | null>(seed.nextCursor);
	let hasMore = $state<boolean>(seed.hasMore);
	let degraded = $state<string[]>(seed.degraded);
	let activeLane = $state<LaneFilter>('all');
	let loading = $state(false);
	// svelte-ignore state_referenced_locally
	let loadError = $state<string | null>(data.error ?? null);
	let expanded = $state<Set<string>>(new Set());

	/**
	 * Entries can repeat across a page boundary because the server cursor is
	 * inclusive (it has to be, or activity sharing a timestamp would be dropped).
	 * Keying on id is what makes that safe.
	 */
	let seenIds = new Set<string>(seed.entries.map((entry) => entry.id));

	let sentinel = $state<HTMLElement | null>(null);

	const LANE_STYLES: Record<ActivityLane, { dot: string; chip: string; icon: string }> = {
		ping: {
			dot: 'bg-accent',
			chip: 'border-accent/40 bg-accent/10 text-accent',
			icon: 'text-accent bg-accent/10'
		},
		agent: {
			dot: 'bg-info',
			chip: 'border-info/40 bg-info/10 text-info',
			icon: 'text-info bg-info/10'
		},
		you: {
			dot: 'bg-success',
			chip: 'border-success/40 bg-success/10 text-success',
			icon: 'text-success bg-success/10'
		},
		system: {
			dot: 'bg-muted-foreground',
			chip: 'border-border-strong bg-muted text-muted-foreground',
			icon: 'text-muted-foreground bg-muted'
		}
	};

	function entryIcon(entry: ActivityEntry) {
		switch (entry.kind) {
			case 'notification':
				return Bell;
			case 'project_audit':
				return ClipboardCheck;
			case 'loop_run':
				return RefreshCw;
			case 'agent_run':
				return Bot;
			case 'chat_session':
				return MessageSquare;
			case 'braindump':
				return Brain;
			case 'voice_note':
				return Mic;
			case 'brief':
				return Coffee;
			case 'calendar_analysis':
				return Calendar;
			case 'entity_changes':
				// The actor is the useful signal here, not the fact that entities changed.
				if (entry.actor === 'external_agent') return Plug;
				if (entry.actor === 'chat') return MessageSquare;
				if (entry.actor === 'teammate') return Users;
				return Pencil;
			default:
				return Activity;
		}
	}

	/**
	 * The project gets its own link in the card footer, so a trailing "· Project"
	 * is trimmed off the actor label rather than printing the name twice per card.
	 */
	function actorLabel(entry: ActivityEntry): string {
		const project = entry.project_name;
		if (!project) return entry.actor_label;
		const suffix = ` · ${project}`;
		return entry.actor_label.endsWith(suffix)
			? entry.actor_label.slice(0, -suffix.length)
			: entry.actor_label;
	}

	/**
	 * Secondary "go to the project" link. Suppressed when the card itself already
	 * opens the project, so the same destination is never offered twice.
	 */
	function projectHref(entry: ActivityEntry): string | null {
		if (!entry.project_id) return null;
		const href = `/projects/${encodeURIComponent(entry.project_id)}`;
		return entry.href === href ? null : href;
	}

	function statusRing(entry: ActivityEntry): string {
		if (entry.status === 'error') return 'ring-2 ring-destructive/40';
		if (entry.status === 'warn') return 'ring-2 ring-warning/40';
		return '';
	}

	function statusDot(entry: ActivityEntry): string {
		if (entry.status === 'error') return 'bg-destructive';
		if (entry.status === 'warn') return 'bg-warning';
		return LANE_STYLES[entry.lane].dot;
	}

	function formatTime(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	function formatAbsolute(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatRelative(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const diffMs = Date.now() - date.getTime();
		const minutes = Math.floor(diffMs / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		// Past a week "4:15 PM" says nothing useful — the date is the orienting fact.
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function dayLabel(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Earlier';

		const startOfDay = (input: Date) => {
			const copy = new Date(input);
			copy.setHours(0, 0, 0, 0);
			return copy.getTime();
		};

		const today = startOfDay(new Date());
		const entryDay = startOfDay(date);
		const dayMs = 86_400_000;

		if (entryDay === today) return 'Today';
		if (entryDay === today - dayMs) return 'Yesterday';
		if (entryDay > today - 7 * dayMs) {
			return date.toLocaleDateString(undefined, { weekday: 'long' });
		}
		return date.toLocaleDateString(undefined, {
			month: 'long',
			day: 'numeric',
			year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
		});
	}

	const days = $derived.by(() => {
		const groups: { label: string; entries: ActivityEntry[] }[] = [];
		for (const entry of entries) {
			const label = dayLabel(entry.occurred_at);
			const current = groups[groups.length - 1];
			if (current && current.label === label) current.entries.push(entry);
			else groups.push({ label, entries: [entry] });
		}
		return groups;
	});

	function childHref(child: ActivityChild): string | null {
		if (!child.project_id) return null;
		if (child.detail?.startsWith('Deleted')) return null;
		// Review-pass children name a project rather than an entity inside one, so
		// without this fallback the project rows in a nightly sweep aren't clickable.
		if (!child.entity_type || !child.entity_id) {
			return `/projects/${encodeURIComponent(child.project_id)}`;
		}
		if (child.entity_type === 'project') return `/projects/${child.project_id}`;
		const resolution = resolveEntityOpenAction(child.entity_type, child.entity_id);
		if (resolution.result !== 'opened') return null;
		return buildProjectEntityOpenHref(
			child.project_id,
			resolution.action.kind,
			resolution.action.entityId
		);
	}

	function toggleExpanded(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function laneQuery(lane: LaneFilter): string {
		return lane === 'all' ? '' : `&lanes=${lane}`;
	}

	async function fetchPage(
		before: string | null,
		lane: LaneFilter
	): Promise<ActivityTimelinePage> {
		const params = new URLSearchParams({ limit: '30' });
		if (before) params.set('before', before);
		const response = await fetch(`/api/activity?${params.toString()}${laneQuery(lane)}`);
		const json = await response.json();
		if (!response.ok || !json?.success) {
			throw new Error(json?.error ?? 'Failed to load activity');
		}
		return json.data as ActivityTimelinePage;
	}

	async function loadMore() {
		if (loading || !hasMore || !cursor) return;
		loading = true;
		loadError = null;

		const requestedLane = activeLane;
		const requestedCursor = cursor;

		try {
			const page = await fetchPage(requestedCursor, requestedLane);
			// The filter may have changed while this request was in flight.
			if (requestedLane !== activeLane) return;

			const fresh = page.entries.filter((entry) => !seenIds.has(entry.id));
			for (const entry of fresh) seenIds.add(entry.id);
			entries = [...entries, ...fresh];
			degraded = page.degraded;

			// A page that advances neither the cursor nor the list means the feed cannot
			// make progress; stopping here prevents an endless scroll-fetch loop.
			const stalled = fresh.length === 0 && page.nextCursor === requestedCursor;
			cursor = page.nextCursor;
			hasMore = page.hasMore && !stalled;
		} catch (error) {
			console.error('[Activity] Failed to load more', error);
			loadError = 'Could not load more activity.';
			hasMore = false;
		} finally {
			loading = false;
		}
	}

	async function selectLane(lane: LaneFilter) {
		if (lane === activeLane) return;
		activeLane = lane;
		loading = true;
		loadError = null;
		entries = [];
		seenIds = new Set();
		cursor = null;
		hasMore = false;

		try {
			const page = await fetchPage(null, lane);
			if (lane !== activeLane) return;
			entries = page.entries;
			seenIds = new Set(page.entries.map((entry) => entry.id));
			cursor = page.nextCursor;
			hasMore = page.hasMore;
			degraded = page.degraded;
		} catch (error) {
			console.error('[Activity] Failed to filter', error);
			loadError = 'Could not load that filter.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const target = sentinel;
		if (!target) return;

		const observer = new IntersectionObserver(
			(observed) => {
				if (observed.some((item) => item.isIntersecting)) void loadMore();
			},
			// Start fetching before the sentinel is visible so scrolling stays smooth.
			{ rootMargin: '600px 0px' }
		);
		observer.observe(target);
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>Activity - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
	The background lives on this full-bleed wrapper, not on the reading column.
	Painting it on the column instead leaves the layout's textured <main> showing
	as two strips down either side of the feed.
-->
<div class="min-h-screen bg-background">
	<div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
		<!-- Header -->
		<header class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
			>
				<Activity class="h-5 w-5" aria-hidden="true" />
			</div>
			<div class="min-w-0">
				<h1 class="text-xl font-semibold tracking-tight text-foreground">Activity</h1>
				<p class="text-sm text-muted-foreground">
					Everything that happened across your projects
				</p>
			</div>
		</header>

		<!-- Lane filters -->
		<div
			class="mt-5 flex flex-wrap gap-1.5 border-b border-border pb-4"
			role="group"
			aria-label="Filter activity"
		>
			<button
				type="button"
				onclick={() => selectLane('all')}
				aria-pressed={activeLane === 'all'}
				class="rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {activeLane ===
				'all'
					? 'border-foreground bg-foreground text-background'
					: 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground'}"
			>
				Everything
			</button>
			{#each ACTIVITY_LANES as lane (lane.key)}
				<button
					type="button"
					onclick={() => selectLane(lane.key)}
					aria-pressed={activeLane === lane.key}
					class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {activeLane ===
					lane.key
						? LANE_STYLES[lane.key].chip
						: 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground'}"
				>
					<span
						class="h-1.5 w-1.5 rounded-full {LANE_STYLES[lane.key].dot}"
						aria-hidden="true"
					></span>
					{lane.label}
				</button>
			{/each}
		</div>

		{#if loadError}
			<div
				class="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			>
				<AlertCircle class="h-4 w-4 shrink-0" aria-hidden="true" />
				<span>{loadError}</span>
			</div>
		{/if}

		{#if degraded.length > 0}
			<div
				class="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-foreground"
			>
				Some activity could not be loaded ({degraded.join(', ')}). The rest of the timeline
				is complete.
			</div>
		{/if}

		{#if entries.length === 0 && !loading}
			<div
				class="mt-6 flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-14 text-center shadow-ink"
			>
				<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
					<Inbox class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
				</div>
				<div>
					<p class="text-base font-medium text-foreground">Nothing here yet</p>
					<p class="mt-1 text-sm text-muted-foreground">
						{activeLane === 'all'
							? 'Your edits, agent runs, project reviews, and notifications will show up here.'
							: 'Nothing in this lane yet — try Everything.'}
					</p>
				</div>
			</div>
		{/if}

		<!-- Timeline -->
		{#each days as day (day.label + day.entries[0]?.id)}
			<section>
				<!--
					Deliberately not sticky: `body` and `.layout-root` both set
					`overflow-x: hidden`, which computes `overflow-y: auto` and makes them
					scroll containers, so `position: sticky` never engages anywhere in the
					app. A static heading that works beats a sticky one that silently doesn't.
				-->
				<h2
					class="pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{day.label}
				</h2>

				<ol class="relative">
					<!-- The rail: one continuous line behind every dot in this day. -->
					<span
						class="pointer-events-none absolute bottom-3 left-[15px] top-3 w-px bg-border"
						aria-hidden="true"
					></span>

					{#each day.entries as entry (entry.id)}
						{@const Icon = entryIcon(entry)}
						{@const isOpen = expanded.has(entry.id)}
						{@const actor = actorLabel(entry)}
						{@const project = projectHref(entry)}
						<li class="relative pb-2 pl-11">
							<!-- Dot -->
							<span
								class="absolute left-[11px] top-[19px] h-2 w-2 rounded-full ring-4 ring-background {statusDot(
									entry
								)}"
								aria-hidden="true"
							></span>

							<div
								class="group relative rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-border-strong hover:bg-muted/30 focus-within:border-border-strong sm:px-4"
							>
								<div class="flex gap-3">
									<div
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {LANE_STYLES[
											entry.lane
										].icon} {statusRing(entry)}"
									>
										<Icon class="h-4 w-4" aria-hidden="true" />
									</div>

									<div class="min-w-0 flex-1">
										<div class="flex min-w-0 items-start gap-2">
											<p
												class="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]"
											>
												{#if entry.href}
													<!--
														Stretched link: names itself from the title
														for screen readers while making the whole
														card one click target.
													-->
													<a
														href={entry.href}
														class="rounded after:absolute after:inset-0 after:rounded-xl hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:text-accent"
													>
														{entry.title}
													</a>
												{:else}
													{entry.title}
												{/if}
											</p>
											<time
												datetime={entry.occurred_at}
												title={formatAbsolute(entry.occurred_at)}
												class="shrink-0 pt-px text-xs tabular-nums text-muted-foreground"
											>
												{formatRelative(entry.occurred_at)}
											</time>
											{#if entry.href}
												<ChevronRight
													class="mt-px h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-accent"
													aria-hidden="true"
												/>
											{/if}
										</div>

										<p class="mt-0.5 text-xs text-muted-foreground">
											{actor}
										</p>

										{#if entry.body}
											<p
												class="mt-1.5 line-clamp-3 break-words text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]"
											>
												{entry.body}
											</p>
										{/if}

										{#if entry.stats.length > 0}
											<div
												class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
											>
												{#each entry.stats as stat (stat.label)}
													<span class="inline-flex items-center gap-1">
														<span class="text-muted-foreground"
															>{stat.label}</span
														>
														<span class="font-medium text-foreground"
															>{stat.value}</span
														>
													</span>
												{/each}
											</div>
										{/if}

										{#if entry.children.length > 0 || project}
											<div
												class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
											>
												{#if entry.children.length > 0}
													<button
														type="button"
														onclick={() => toggleExpanded(entry.id)}
														aria-expanded={isOpen}
														class="relative z-10 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														{#if isOpen}
															<ChevronDown
																class="h-3.5 w-3.5"
																aria-hidden="true"
															/>
														{:else}
															<ChevronRight
																class="h-3.5 w-3.5"
																aria-hidden="true"
															/>
														{/if}
														{entry.children.length}
														{entry.children.length === 1
															? 'detail'
															: 'details'}
													</button>
												{/if}

												{#if project}
													<a
														href={project}
														class="relative z-10 inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														{entry.project_name ?? 'Project'}
													</a>
												{/if}
											</div>
										{/if}

										{#if isOpen && entry.children.length > 0}
											<ul
												class="mt-2 space-y-1 border-l border-border pl-3 text-xs"
											>
												{#each entry.children as child (child.id)}
													{@const href = childHref(child)}
													<!--
														Two columns rather than one wrapping row, so
														the time stays pinned to the first line
														however long the label and detail run.
													-->
													<li
														class="flex items-baseline justify-between gap-3"
													>
														<span
															class="min-w-0 break-words [overflow-wrap:anywhere]"
														>
															{#if href}
																<a
																	{href}
																	class="relative z-10 rounded font-medium text-foreground underline-offset-2 hover:text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
																>
																	{child.label}
																</a>
															{:else}
																<span
																	class="font-medium text-foreground"
																	>{child.label}</span
																>
															{/if}
															{#if child.detail}
																<span class="text-muted-foreground"
																	>{child.detail}</span
																>
															{/if}
															{#if child.occurrences && child.occurrences > 1}
																<span class="text-muted-foreground"
																	>×{child.occurrences}</span
																>
															{/if}
														</span>
														<span
															class="shrink-0 tabular-nums text-muted-foreground/70"
															>{formatTime(child.at)}</span
														>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								</div>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/each}

		<!-- Infinite-scroll sentinel + terminal states -->
		<div bind:this={sentinel} class="py-8 text-center">
			{#if loading}
				<span
					class="inline-flex items-center gap-2 text-sm text-muted-foreground"
					role="status"
					aria-live="polite"
				>
					<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
					Loading activity…
				</span>
			{:else if hasMore}
				<button
					type="button"
					onclick={() => loadMore()}
					class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Load more
				</button>
			{:else if entries.length > 0}
				<span class="text-xs text-muted-foreground">That's the whole timeline.</span>
			{/if}
		</div>
	</div>
</div>
