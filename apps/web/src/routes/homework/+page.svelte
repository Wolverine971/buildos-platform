<!-- apps/web/src/routes/homework/+page.svelte -->
<script lang="ts">
	export let data: { runs: any[]; error: string | null };

	const getMetric = (metrics: any, key: string) => {
		if (!metrics || typeof metrics !== 'object') return 0;
		return typeof metrics[key] === 'number' ? metrics[key] : 0;
	};
</script>

<section class="homework-page">
	<header class="page-header">
		<h1>Homework Runs</h1>
		<p class="subtitle">Long-running background tasks and their progress.</p>
	</header>

	{#if data.error}
		<div class="error">{data.error}</div>
	{:else if data.runs.length === 0}
		<div class="empty">No homework runs yet.</div>
	{:else}
		<div class="runs-grid">
			{#each data.runs as run}
				<a class="run-card" href={`/homework/runs/${run.id}`}>
					<div class="run-title">{run.objective}</div>
					<div class="run-meta">
						<span class={`status status-${run.status}`}>{run.status}</span>
						<span>Iteration {run.iteration ?? 0}</span>
						<span>
							${getMetric(run.metrics, 'cost_total_usd').toFixed(4)}
						</span>
						<span>{getMetric(run.metrics, 'tokens_total')} tokens</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>

<style>
	.homework-page {
		padding: 2rem;
	}
	.page-header h1 {
		margin: 0 0 0.25rem;
	}
	.subtitle {
		color: #6b7280;
		margin: 0 0 1.5rem;
	}
	.error {
		color: #b91c1c;
		background: #fee2e2;
		padding: 0.75rem 1rem;
		border-radius: 8px;
	}
	.empty {
		color: #6b7280;
		background: #f3f4f6;
		padding: 1rem;
		border-radius: 8px;
	}
	.runs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}
	.run-card {
		display: block;
		padding: 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		text-decoration: none;
		color: inherit;
		background: #fff;
	}
	.run-title {
		font-weight: 600;
		margin-bottom: 0.5rem;
	}
	.run-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		font-size: 0.85rem;
		color: #374151;
	}
	.status {
		text-transform: capitalize;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		background: #e5e7eb;
	}
	.status-running {
		background: #dbeafe;
		color: #1d4ed8;
	}
	.status-stopped {
		background: #fef3c7;
		color: #92400e;
	}
	.status-completed {
		background: #dcfce7;
		color: #166534;
	}
</style>
