<!-- apps/web/src/lib/components/knowledge/ProjectPeopleTab.svelte -->
<!--
	People on a project card (tasker 168): everyone this project's tasks and docs name, and who
	knows them. Your own entries first (most mentioned first; open the card on /knowledge), then
	names only other members have filed. In a shared project each row says whose People know
	them and opens "From Alice's People" in place (with Ask). Loads when the tab opens.
-->
<script lang="ts">
	import {
		Building,
		ChevronDown,
		ChevronRight,
		MapPin,
		RefreshCw,
		User
	} from '$lib/icons/lucide';
	import { lensEntriesFor, lensOnlyNames } from './lens-match';
	import type { LensEntry } from './sharing-types';

	interface Props {
		projectId: string;
		projectName: string;
	}

	let { projectId, projectName }: Props = $props();

	type Mine = { id: string; kind: string; name: string; summary: string | null; records: number };
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let mine = $state.raw<Mine[]>([]);
	let others = $state.raw<LensEntry[]>([]);
	let shared = $state(false);
	let open = $state<string | null>(null);
	let Lens = $state<typeof import('./KnowledgeLensSection.svelte').default | null>(null);

	async function load(id: string) {
		status = 'loading';
		try {
			const response = await fetch(`/api/knowledge/project-people?project_id=${id}`);
			const body = await response.json().catch(() => null);
			if (!response.ok || !body?.data) throw new Error();
			if (id !== projectId) return;
			mine = body.data.mine ?? [];
			others = body.data.others ?? [];
			shared = Boolean(body.data.shared);
			status = 'ready';
			if (others.length && !Lens)
				void import('./KnowledgeLensSection.svelte').then((m) => (Lens = m.default));
		} catch {
			if (id === projectId) status = 'error';
		}
	}

	$effect(() => {
		open = null;
		void load(projectId);
	});

	const rows = $derived([
		...mine.map((entry) => ({
			key: entry.id,
			kind: entry.kind,
			name: entry.name,
			summary: entry.summary,
			records: entry.records,
			mineId: entry.id as string | null,
			lens: lensEntriesFor(others, [entry.name])
		})),
		...lensOnlyNames(
			others,
			mine.map((m) => m.name)
		).map((entry) => {
			const lens = lensEntriesFor(others, [entry.entity.name, ...entry.quotes]);
			return {
				key: `lens:${entry.entity.id}`,
				kind: entry.entity.kind,
				name: entry.entity.name,
				summary: entry.entity.summary,
				records: new Set(lens.flatMap((e) => e.record_ids)).size,
				mineId: null as string | null,
				lens
			};
		})
	]);

	const iconFor = (kind: string) =>
		kind === 'org' ? Building : kind === 'place' ? MapPin : User;
	const knownBy = (row: (typeof rows)[number]) =>
		[...(row.mineId ? ['You'] : []), ...row.lens.map((e) => e.owner.name)].join(', ');
	const rowClass =
		'flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#if status === 'loading'}
	<div class="grid gap-2 px-2 py-1" aria-busy="true" aria-label="Loading people">
		{#each [0, 1, 2, 3] as index (index)}
			<div class="h-11 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"></div>
		{/each}
	</div>
{:else if status === 'error'}
	<div
		class="grid justify-items-center gap-2 px-2 py-6 text-sm text-muted-foreground"
		role="alert"
	>
		<span>Could not load the people in {projectName}.</span>
		<button
			type="button"
			class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-muted"
			onclick={() => void load(projectId)}><RefreshCw class="h-4 w-4" /> Try again</button
		>
	</div>
{:else if !rows.length}
	<p class="px-2 py-6 text-center text-sm text-muted-foreground">
		No people or organizations named in {projectName} yet. Names in its tasks and docs show up here.
	</p>
{:else}
	{#if shared}
		<p class="px-2 pb-1 text-xs text-muted-foreground">
			Who this project names, and whose People know them.
		</p>
	{/if}
	<ul class="flex min-w-0 flex-col">
		{#each rows as row (row.key)}
			{@const Icon = iconFor(row.kind)}
			{@const expanded = open === row.key}
			<li class="min-w-0">
				<div class="flex min-w-0 items-center gap-1">
					{#if row.mineId}
						<a href="/knowledge?kind={row.kind}&e={row.mineId}" class={rowClass}>
							<Icon
								class="h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium text-foreground"
									>{row.name}</span
								>
								<span class="block truncate text-xs text-muted-foreground"
									>{row.summary ? `${row.summary} · ` : ''}{row.records} mention{row.records ===
									1
										? ''
										: 's'}{shared ? ` · ${knownBy(row)}` : ''}</span
								>
							</span>
							<ChevronRight
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						</a>
					{:else}
						<button
							type="button"
							class={rowClass}
							aria-expanded={expanded}
							onclick={() => (open = expanded ? null : row.key)}
						>
							<Icon
								class="h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium text-foreground"
									>{row.name}</span
								>
								<span class="block truncate text-xs text-muted-foreground"
									>In {knownBy(row)}'s People · not in yours</span
								>
							</span>
							<ChevronDown
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform {expanded
									? 'rotate-180'
									: ''}"
								aria-hidden="true"
							/>
						</button>
					{/if}
					{#if row.mineId && row.lens.length}
						<button
							type="button"
							class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-expanded={expanded}
							onclick={() => (open = expanded ? null : row.key)}
							>{expanded ? 'Hide' : 'What others know'}</button
						>
					{/if}
				</div>
				{#if expanded && Lens && row.lens.length}
					<div class="mb-2 ml-8 rounded-lg border border-border bg-card">
						<Lens entries={row.lens} {projectId} />
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
