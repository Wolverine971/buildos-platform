<!-- apps/web/src/lib/components/knowledge/SharedKnowledgeSection.svelte -->
<!--
	Profile › People & agents › Shared knowledge (tasker 168): asks waiting on you ("Bob asked
	for contact details about someone in Wayne Strategies") with Open, and everything you've
	shared from your People with Stop. Answering happens on the entry's card (Open goes to it on
	/knowledge), where the Share sheet picks what and for how long. Shows nothing until there is
	something to show.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { BookUser, ChevronRight, X } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import type { ShareInboxItem } from './sharing-types';

	type Given = {
		id: string;
		entity: { id: string; kind: string; name: string };
		what: 'contact' | 'all' | 'picked';
		predicates: string[];
		duration: 'membership' | 'always' | 'until';
		expires_at: string | null;
		project: { id: string; name: string } | null;
		grantee: { user_id: string; name: string } | null;
	};

	let asks = $state<ShareInboxItem[]>([]);
	let given = $state<Given[]>([]);
	let busy = $state<string | null>(null);

	async function load() {
		try {
			const response = await fetch('/api/knowledge/shares/mine');
			const body = await response.json().catch(() => null);
			if (!response.ok || !body?.data) return;
			asks = body.data.asks ?? [];
			given = body.data.given ?? [];
		} catch {
			// Optional section: the rest of the tab works without it.
		}
	}

	onMount(() => {
		void load();
	});

	const cardHref = (entity: { id: string; kind: string }) =>
		`/knowledge?kind=${entity.kind}&e=${entity.id}`;

	const whatText = (what: string) =>
		what === 'all'
			? 'everything except notes'
			: what === 'picked'
				? 'some details'
				: 'contact details';

	function howLong(row: Given): string {
		if (row.duration === 'membership')
			return `while you're both in ${row.project?.name ?? 'the project'}`;
		if (row.duration === 'until' && row.expires_at)
			return `until ${new Date(row.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
		return 'always';
	}

	async function stop(row: Given) {
		busy = row.id;
		try {
			const response = await fetch(`/api/knowledge/shares/${row.id}`, { method: 'DELETE' });
			if (!response.ok) throw new Error();
			given = given.filter((g) => g.id !== row.id);
			toastService.success('Stopped sharing');
		} catch {
			toastService.error('Could not stop sharing. Try again.');
		} finally {
			busy = null;
		}
	}

	const rowClass =
		'flex min-h-10 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#if asks.length || given.length}
	<section
		id="knowledge-asks"
		class="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card tx tx-frame tx-weak"
		aria-labelledby="hub-knowledge-heading"
	>
		<div class="border-b border-border px-4 py-3 sm:px-5">
			<h3
				id="hub-knowledge-heading"
				class="flex items-center gap-2 text-sm font-medium text-foreground sm:text-base"
			>
				<BookUser class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				Shared knowledge
			</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				People in your shared projects see the public details in your People. Contact
				details and the rest only go to people you share them with.
			</p>
		</div>
		<div class="flex flex-col gap-4 px-2 py-3 sm:px-3">
			{#if asks.length}
				<div class="flex flex-col gap-1">
					<p class="micro-label px-2 text-muted-foreground">Waiting on you</p>
					<ul class="flex flex-col">
						{#each asks as ask (ask.id)}
							<li>
								<a href={cardHref(ask.entity)} class={rowClass}>
									<span
										class="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
										aria-hidden="true"
									></span>
									<span class="min-w-0 flex-1">
										<span class="font-medium">{ask.requested_by.name}</span>
										asked for {whatText(ask.what)} about
										<span class="font-medium">{ask.entity.name}</span>
										{#if ask.project.name}<span class="text-muted-foreground">
												· {ask.project.name}</span
											>{/if}
									</span>
									<span class="shrink-0 text-xs text-muted-foreground"
										>{formatRelativeTime(ask.created_at)}</span
									>
									<ChevronRight
										class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if given.length}
				<div class="flex flex-col gap-1">
					<p class="micro-label px-2 text-muted-foreground">You've shared</p>
					<ul class="flex flex-col">
						{#each given as row (row.id)}
							<li class="flex min-w-0 items-center gap-1">
								<a href={cardHref(row.entity)} class="{rowClass} flex-1">
									<span class="min-w-0 flex-1">
										<span class="font-medium">{row.entity.name}</span>
										<span class="text-muted-foreground">
											· {whatText(row.what)} with {row.grantee?.name ??
												`everyone in ${row.project?.name ?? 'the project'}`}
											· {howLong(row)}</span
										>
									</span>
								</a>
								<button
									type="button"
									class="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
									disabled={busy === row.id}
									aria-label="Stop sharing {row.entity.name}"
									onclick={() => void stop(row)}
								>
									<X class="h-3.5 w-3.5" aria-hidden="true" /> Stop
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>
{/if}
