<!-- apps/web/src/routes/tree-agent/runs/[id]/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import TreeAgentGraph from '$lib/components/tree-agent/TreeAgentGraph.svelte';
	import TreeAgentContextSelector from '$lib/components/tree-agent/TreeAgentContextSelector.svelte';
	import { normalizeTreeAgentEvent, type TreeAgentEventRow } from '@buildos/shared-types';
	import { treeAgentGraphStore } from '$lib/stores/treeAgentGraph.store';

	interface TreeAgentRunRow {
		id: string;
		objective: string;
		status: string;
		created_at: string;
		updated_at: string;
		metrics?: {
			context?: {
				type?: 'global' | 'project';
				project_id?: string | null;
			};
		} | null;
	}

	interface Props {
		data: {
			run: TreeAgentRunRow;
			events: TreeAgentEventRow[];
			projectsMap?: Record<string, { id: string; name: string }>;
		};
	}

	let { data }: Props = $props();
	let run = $state(data.run);
	let events = $state(data.events ?? []);
	let polling = $state<ReturnType<typeof setInterval> | null>(null);
	let contextSelectorOpen = $state(false);
	let isChangingContext = $state(false);

	const formatDate = (dateStr: string) =>
		new Date(dateStr).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const currentContextType = $derived<'global' | 'project'>(
		run.metrics?.context?.type === 'project' ? 'project' : 'global'
	);
	const currentProjectId = $derived<string | null>(
		currentContextType === 'project' ? (run.metrics?.context?.project_id ?? null) : null
	);
	const currentProjectName = $derived<string | undefined>(
		currentProjectId ? data.projectsMap?.[currentProjectId]?.name : undefined
	);

	const refresh = async () => {
		const res = await fetch(`/api/tree-agent/runs/${run.id}?include_events=true`);
		const json = await res.json().catch(() => null);
		if (!json?.success || !json?.data?.run) return;
		run = json.data.run;
		events = json.data.events ?? events;

		const normalized = (json.data.events ?? [])
			.map((row: TreeAgentEventRow) => normalizeTreeAgentEvent(row))
			.filter(
				(
					event: ReturnType<typeof normalizeTreeAgentEvent>
				): event is NonNullable<ReturnType<typeof normalizeTreeAgentEvent>> =>
					Boolean(event)
			)
			.sort(
				(
					a: NonNullable<ReturnType<typeof normalizeTreeAgentEvent>>,
					b: NonNullable<ReturnType<typeof normalizeTreeAgentEvent>>
				) => {
					const aSeq = typeof a.seq === 'number' ? a.seq : 0;
					const bSeq = typeof b.seq === 'number' ? b.seq : 0;
					return aSeq - bSeq;
				}
			);
		if (normalized.length > 0) {
			treeAgentGraphStore.applyEvents(normalized);
		}
	};

	async function handleContextChange(newContext: {
		context_type: 'global' | 'project';
		context_project_id: string | null;
	}) {
		isChangingContext = true;
		try {
			const response = await fetch('/api/tree-agent/runs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					objective: run.objective,
					context_type: newContext.context_type,
					context_project_id: newContext.context_project_id
				})
			});

			if (!response.ok) {
				console.error('Failed to create new run');
				return;
			}

			const result = await response.json();
			if (result.success && result.data?.run?.id) {
				contextSelectorOpen = false;
				await goto(`/tree-agent/runs/${result.data.run.id}`);
			}
		} catch (err) {
			console.error('Failed to change context:', err);
		} finally {
			isChangingContext = false;
		}
	}

	$effect(() => {
		refresh();
		polling = setInterval(refresh, 5000);

		return () => {
			if (polling) clearInterval(polling);
			polling = null;
		};
	});
</script>

<div class="tree-agent-page min-h-screen bg-background text-foreground">
	<div class="mx-auto w-full max-w-7xl px-4 py-4 space-y-3">
		<header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between sp-block">
			<div class="space-y-1 flex-1">
				<div class="text-xs uppercase tracking-wider text-muted-foreground">Tree Agent</div>
				<h1 class="text-2xl font-semibold">{run.objective}</h1>
				<div class="text-sm text-muted-foreground">
					Run {run.id} • {run.status} • Updated {formatDate(run.updated_at)}
				</div>
			</div>

			<!-- Context Controls -->
			<div class="flex flex-col gap-2">
				{#if currentContextType === 'global'}
					<span
						class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground font-medium w-fit tx tx-frame tx-weak wt-paper"
					>
						<span>🌐</span>
						<span>Global Context</span>
					</span>
				{:else if currentProjectId && currentProjectName}
					<span
						class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground font-medium w-fit tx tx-frame tx-weak wt-paper"
					>
						<span>📁</span>
						<span>{currentProjectName}</span>
					</span>
				{/if}

				<button
					onclick={() => (contextSelectorOpen = true)}
					disabled={isChangingContext}
					class="px-4 py-2 rounded-lg bg-accent text-accent-foreground font-medium transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-ink pressable text-sm tx tx-grain tx-weak wt-paper"
				>
					{isChangingContext ? 'Switching...' : 'Change Context'}
				</button>
			</div>
		</header>

		<section class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
			<div
				class="border border-border rounded-xl bg-card tx tx-frame tx-weak shadow-ink min-h-[70vh] overflow-hidden flex flex-col sp-block"
			>
				<TreeAgentGraph
					runId={run.id}
					contextType={currentContextType}
					projectName={currentProjectName}
				/>
			</div>

			<aside class="space-y-3 sp-block">
				<div
					class="border border-border rounded-xl bg-card tx tx-frame tx-weak shadow-ink overflow-hidden flex flex-col"
				>
					<div class="px-3 py-2 border-b border-border bg-muted/30">
						<div class="text-xs font-semibold text-foreground uppercase tracking-wider">
							Recent Events
						</div>
					</div>
					<ul class="max-h-[70vh] overflow-auto divide-y divide-border flex-1">
						{#each events.slice(0, 100) as event}
							<li
								class="px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors tx tx-grain tx-weak wt-paper sp-inline"
							>
								<div class="font-mono text-foreground truncate flex-1">
									{event.event_type}
								</div>
								<div class="text-muted-foreground whitespace-nowrap shrink-0">
									#{event.seq ?? '—'}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			</aside>
		</section>
	</div>

	<!-- Context Selector Modal -->
	<TreeAgentContextSelector
		{currentContextType}
		{currentProjectId}
		onContextChange={handleContextChange}
		onClose={() => (contextSelectorOpen = false)}
		isOpen={contextSelectorOpen}
	/>
</div>
