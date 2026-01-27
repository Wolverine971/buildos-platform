<!-- apps/web/src/routes/tree-agent/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';

	interface TreeAgentRunRow {
		id: string;
		objective: string;
		status: string;
		updated_at: string;
		created_at: string;
	}

	interface Props {
		data: { runs: TreeAgentRunRow[] };
	}

	let { data }: Props = $props();
	let runs = $state<TreeAgentRunRow[]>(data.runs ?? []);
	let objective = $state('');
	let creating = $state(false);
	let error = $state<string | null>(null);

	const formatDate = (dateStr: string) =>
		new Date(dateStr).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const createRun = async () => {
		if (creating) return;
		error = null;
		const trimmed = objective.trim();
		if (!trimmed) {
			error = 'Objective is required';
			return;
		}

		creating = true;
		try {
			const res = await fetch('/api/tree-agent/runs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ objective: trimmed })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok || !json?.success || !json?.data?.run?.id) {
				error = json?.error ?? json?.message ?? 'Failed to create run';
				return;
			}

			const nextRun = json.data.run as TreeAgentRunRow;
			runs = [nextRun, ...runs];
			objective = '';
			await goto(`/tree-agent/runs/${nextRun.id}`);
		} finally {
			creating = false;
		}
	};
</script>

<div class="min-h-screen bg-background text-foreground">
	<div class="mx-auto w-full max-w-4xl px-4 py-6 space-y-4">
		<header class="space-y-1">
			<div class="text-xs uppercase tracking-wider text-muted-foreground">Agents</div>
			<h1 class="text-3xl font-semibold">Tree Agent</h1>
			<p class="text-sm text-muted-foreground">
				Create a run and watch the planner/executor graph unfold live.
			</p>
		</header>

		<section
			class="border border-border rounded-xl bg-card tx tx-frame tx-weak shadow-ink p-3 space-y-3 sp-block"
		>
			<div class="text-sm font-medium">New Run</div>
			<div class="flex flex-col gap-3 md:flex-row">
				<input
					class="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring transition-colors tx tx-frame tx-weak wt-paper"
					placeholder="Describe the objective..."
					bind:value={objective}
					onkeydown={(e) => e.key === 'Enter' && createRun()}
				/>
				<button
					class="px-4 py-2 rounded-lg bg-accent text-accent-foreground font-medium shadow-ink hover:bg-accent/90 disabled:opacity-60 transition-colors pressable tx tx-grain tx-weak wt-paper"
					disabled={creating}
					onclick={createRun}
				>
					{creating ? 'Creating...' : 'Start Run'}
				</button>
			</div>
			{#if error}
				<div
					class="px-3 py-2 text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 rounded-lg border border-red-200 dark:border-red-800 tx tx-static tx-weak wt-paper"
				>
					{error}
				</div>
			{/if}
		</section>

		<section class="space-y-3 sp-block">
			<div class="text-sm font-medium">Recent Runs</div>
			<div
				class="border border-border rounded-xl bg-card tx tx-frame tx-weak shadow-ink overflow-hidden"
			>
				<ul class="divide-y divide-border">
					{#if runs.length === 0}
						<li class="px-3 py-2 text-sm text-muted-foreground">No runs yet.</li>
					{:else}
						{#each runs as run}
							<li
								class="px-3 py-2 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors sp-inline"
							>
								<div class="min-w-0">
									<a
										class="font-medium text-accent hover:underline truncate block tx tx-grain tx-weak wt-paper pressable"
										href={`/tree-agent/runs/${run.id}`}>{run.objective}</a
									>
									<div class="text-xs text-muted-foreground">
										<span
											class="inline-block px-2 py-0.5 rounded text-xs bg-muted text-foreground font-medium tx tx-frame tx-weak"
											>{run.status}</span
										>
										• {formatDate(run.updated_at)}
									</div>
								</div>
								<div class="text-xs text-muted-foreground whitespace-nowrap">
									{formatDate(run.created_at)}
								</div>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		</section>
	</div>
</div>
