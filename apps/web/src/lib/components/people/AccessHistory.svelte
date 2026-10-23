<!-- apps/web/src/lib/components/people/AccessHistory.svelte -->
<!--
	Access history: who got access to your projects, and when, newest first.
	Fetches /api/people/history itself; pass projectId for one project.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { History, RefreshCw } from '$lib/icons/lucide';

	type HistoryEvent = {
		id: string;
		occurred_at: string;
		project_id: string;
		project_name: string;
		kind: string;
		text: string;
		by_you: boolean;
	};

	let {
		projectId = null,
		pageSize = 30,
		class: className = ''
	}: {
		/** Only this project's history. Omit for every project you own. */
		projectId?: string | null;
		pageSize?: number;
		class?: string;
	} = $props();

	let events = $state<HistoryEvent[]>([]);
	let nextBefore = $state<string | null>(null);
	let nextBeforeId = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let moreError = $state<string | null>(null);

	const thisYear = new Date().getFullYear();

	function dateLabel(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			...(date.getFullYear() === thisYear ? {} : { year: 'numeric' })
		});
	}

	function fullDate(value: string): string {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
	}

	function readEvents(value: unknown): HistoryEvent[] {
		if (!Array.isArray(value)) return [];
		return value.filter(
			(item): item is HistoryEvent =>
				!!item &&
				typeof item === 'object' &&
				typeof (item as HistoryEvent).id === 'string' &&
				typeof (item as HistoryEvent).text === 'string' &&
				typeof (item as HistoryEvent).occurred_at === 'string'
		);
	}

	function historyUrl(cursor?: { before: string; beforeId: string | null }): string {
		const params = new URLSearchParams({ limit: String(pageSize) });
		if (projectId) params.set('project_id', projectId);
		if (cursor) {
			params.set('before', cursor.before);
			if (cursor.beforeId) params.set('before_id', cursor.beforeId);
		}
		return `/api/people/history?${params.toString()}`;
	}

	async function fetchPage(url: string, signal?: AbortSignal) {
		const res = await fetch(url, { credentials: 'same-origin', signal });
		const payload = await res.json().catch(() => null);
		if (!res.ok) {
			throw new Error(
				typeof payload?.error === 'string' ? payload.error : 'Could not load the history.'
			);
		}
		return {
			events: readEvents(payload?.data?.events),
			nextBefore:
				typeof payload?.data?.next_before === 'string' ? payload.data.next_before : null,
			nextBeforeId:
				typeof payload?.data?.next_before_id === 'string'
					? payload.data.next_before_id
					: null
		};
	}

	async function loadFirst(signal?: AbortSignal) {
		loading = true;
		error = null;
		moreError = null;
		try {
			const page = await fetchPage(historyUrl(), signal);
			events = page.events;
			nextBefore = page.nextBefore;
			nextBeforeId = page.nextBeforeId;
		} catch (err) {
			if (signal?.aborted) return;
			error = err instanceof Error ? err.message : 'Could not load the history.';
		} finally {
			if (!signal?.aborted) loading = false;
		}
	}

	async function loadMore() {
		if (!nextBefore || loadingMore) return;
		loadingMore = true;
		moreError = null;
		try {
			const page = await fetchPage(
				historyUrl({ before: nextBefore, beforeId: nextBeforeId })
			);
			const seen = new Set(events.map((event) => event.id));
			events = [...events, ...page.events.filter((event) => !seen.has(event.id))];
			nextBefore = page.nextBefore;
			nextBeforeId = page.nextBeforeId;
		} catch (err) {
			moreError = err instanceof Error ? err.message : 'Could not load more.';
		} finally {
			loadingMore = false;
		}
	}

	// Load (and reload when the project or page size changes); cancel a stale request.
	$effect(() => {
		void projectId;
		void pageSize;
		const controller = new AbortController();
		loadFirst(controller.signal);
		return () => controller.abort();
	});
</script>

<div class="flex flex-col gap-3 {className}">
	{#if loading}
		<ol class="divide-y divide-border rounded-lg border border-border bg-card" aria-busy="true">
			{#each [0, 1, 2] as row (row)}
				<li class="flex items-center gap-3 px-4 py-3">
					<span
						class="h-3 w-12 shrink-0 animate-pulse rounded bg-muted motion-reduce:animate-none"
					></span>
					<span
						class="h-3 flex-1 animate-pulse rounded bg-muted motion-reduce:animate-none"
					></span>
				</li>
			{/each}
		</ol>
		<span class="sr-only" role="status">Loading access history</span>
	{:else if error}
		<div
			class="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
			role="alert"
		>
			<p class="flex-1 text-sm text-foreground">{error}</p>
			<Button variant="outline" size="sm" icon={RefreshCw} onclick={() => loadFirst()}>
				Try again
			</Button>
		</div>
	{:else if events.length === 0}
		<div class="flex items-start gap-3 rounded-lg border border-dashed border-border px-4 py-4">
			<History class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<p class="text-sm text-muted-foreground">
				Nothing yet. Changes to who can see your projects, and what their agents can do,
				show up here.
			</p>
		</div>
	{:else}
		<ol class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
			{#each events as event (event.id)}
				<li class="flex items-baseline gap-3 px-4 py-2.5">
					<time
						class="stamp w-16 shrink-0 text-xs text-muted-foreground"
						datetime={event.occurred_at}
						title={fullDate(event.occurred_at)}
					>
						{dateLabel(event.occurred_at)}
					</time>
					<span class="min-w-0 flex-1 text-sm text-foreground">{event.text}</span>
				</li>
			{/each}
		</ol>

		{#if moreError}
			<p class="text-sm text-destructive" role="alert">{moreError}</p>
		{/if}

		{#if nextBefore}
			<div>
				<Button variant="outline" size="sm" loading={loadingMore} onclick={loadMore}>
					Show more
				</Button>
			</div>
		{/if}
	{/if}
</div>
