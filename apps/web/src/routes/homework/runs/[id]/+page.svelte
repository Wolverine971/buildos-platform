<!-- apps/web/src/routes/homework/runs/[id]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';

	export let data: { run: any; iterations: any[]; events: any[] };

	let run = data.run;
	let iterations = data.iterations;
	let events = data.events;
	let polling: ReturnType<typeof setInterval> | null = null;
	let updating = false;

	const getMetric = (metrics: any, key: string) => {
		if (!metrics || typeof metrics !== 'object') return 0;
		return typeof metrics[key] === 'number' ? metrics[key] : 0;
	};

	const refresh = async () => {
		if (updating) return;
		updating = true;
		try {
			const res = await fetch(`/api/homework/runs/${run.id}`);
			const json = await res.json();
			if (json?.data?.run) {
				run = json.data.run;
				iterations = json.data.iterations ?? iterations;
				events = json.data.events ?? events;
			}
		} finally {
			updating = false;
		}
	};

	const cancelRun = async () => {
		await fetch(`/api/homework/runs/${run.id}/cancel`, { method: 'POST' });
		await refresh();
	};

	const continueRun = async () => {
		await fetch(`/api/homework/runs/${run.id}/respond`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		await refresh();
	};

	onMount(() => {
		polling = setInterval(refresh, 5000);
		return () => {
			if (polling) clearInterval(polling);
		};
	});
</script>

<section class="run-page">
	<header class="run-header">
		<div>
			<h1>Homework Run</h1>
			<p class="objective">{run.objective}</p>
		</div>
		<div class="actions">
			{#if run.status === 'running' || run.status === 'queued'}
				<button class="secondary" on:click={cancelRun}>Cancel</button>
			{:else if run.status === 'stopped'}
				<button class="primary" on:click={continueRun}>Continue</button>
			{/if}
		</div>
	</header>

	<div class="summary-grid">
		<div class="summary-card">
			<div class="label">Status</div>
			<div class={`value status-${run.status}`}>{run.status}</div>
		</div>
		<div class="summary-card">
			<div class="label">Iterations</div>
			<div class="value">{run.iteration ?? 0}</div>
		</div>
		<div class="summary-card">
			<div class="label">Cost (live)</div>
			<div class="value">${getMetric(run.metrics, 'cost_total_usd').toFixed(4)}</div>
		</div>
		<div class="summary-card">
			<div class="label">Tokens</div>
			<div class="value">{getMetric(run.metrics, 'tokens_total')}</div>
		</div>
	</div>

	<section class="section">
		<h2>Iterations</h2>
		{#if iterations.length === 0}
			<p class="muted">No iterations yet.</p>
		{:else}
			<ul class="list">
				{#each iterations as iteration}
					<li>
						<strong>Iteration {iteration.iteration}</strong>
						<span class="status-pill">{iteration.status}</span>
						<div class="muted">{iteration.summary || 'No summary yet.'}</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="section">
		<h2>Events</h2>
		{#if events.length === 0}
			<p class="muted">No events recorded yet.</p>
		{:else}
			<ul class="list">
				{#each events as event}
					<li>
						<code>{event.event?.type || 'event'}</code>
						<span class="muted">#{event.seq}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<style>
	.run-page {
		padding: 2rem;
	}
	.run-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.objective {
		color: #6b7280;
		margin: 0.25rem 0 0;
	}
	.actions button {
		margin-left: 0.5rem;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.summary-card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1rem;
	}
	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		color: #6b7280;
		margin-bottom: 0.25rem;
	}
	.value {
		font-size: 1.1rem;
		font-weight: 600;
	}
	.section {
		margin-bottom: 2rem;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.list li {
		padding: 0.75rem 0;
		border-bottom: 1px solid #f3f4f6;
	}
	.status-pill {
		margin-left: 0.5rem;
		font-size: 0.75rem;
		background: #e5e7eb;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
	}
	.muted {
		color: #6b7280;
		font-size: 0.85rem;
	}
	button.primary {
		background: #111827;
		color: #fff;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 8px;
	}
	button.secondary {
		background: #f3f4f6;
		color: #111827;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 8px;
	}
</style>
