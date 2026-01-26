<!-- apps/web/src/routes/homework/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { HomeworkRunWithProjects } from './+page.server';

	interface Props {
		data: { runs: HomeworkRunWithProjects[]; projects: any[]; error: string | null };
	}

	let { data }: Props = $props();

	let objective = $state('');
	let scope = $state('global');
	let selectedProject = $state('');
	let selectedProjectsMulti = $state<string[]>([]);
	let formError = $state<string | null>(null);
	let submitting = $state(false);

	const validateProjectSelection = () => {
		if (scope === 'project') return Boolean(selectedProject);
		if (scope === 'multi_project') return selectedProjectsMulti.length > 0;
		return true;
	};

	const getMetric = (metrics: any, key: string) => {
		if (!metrics || typeof metrics !== 'object') return 0;
		return typeof metrics[key] === 'number' ? metrics[key] : 0;
	};

	const getScopeLabel = (run: HomeworkRunWithProjects): string => {
		if (run.scope === 'global') {
			return 'Global';
		}
		if (run.project_names.length > 0) {
			return run.project_names.join(', ');
		}
		// Fallback if no project names found
		if (run.scope === 'project') {
			return 'Project';
		}
		if (run.scope === 'multi_project') {
			return 'Multiple Projects';
		}
		return run.scope;
	};

	const startRun = async (event: Event) => {
		event.preventDefault();
		formError = null;
		if (!objective.trim()) {
			formError = 'Objective is required.';
			return;
		}
		if (!validateProjectSelection()) {
			formError = 'Please select a project for this homework run.';
			return;
		}
		submitting = true;
		const project_ids =
			scope === 'project'
				? [selectedProject]
				: scope === 'multi_project'
					? selectedProjectsMulti
					: undefined;
		const res = await fetch('/api/homework/runs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ objective: objective.trim(), scope, project_ids })
		});
		const json = await res.json();
		submitting = false;
		if (!res.ok) {
			formError = json?.message || 'Failed to start run.';
			return;
		}
		if (json?.data?.url) {
			await goto(json.data.url);
		}
	};
</script>

<!-- Mode A: Dense command center for homework runs -->
<section class="p-3 sm:p-4 max-w-7xl mx-auto">
	<!-- Page header -->
	<header class="mb-4 sm:mb-6">
		<h1 class="text-2xl sm:text-3xl font-semibold text-foreground mb-1">Homework Runs</h1>
		<p class="text-sm text-muted-foreground">
			Long-running background tasks and their progress.
		</p>
	</header>

	<!-- Start new homework card (Mode B moment: creation) -->
	<section
		class="bg-card border border-border rounded-lg shadow-ink tx tx-bloom tx-weak wt-paper sp-block mb-4"
	>
		<div class="px-3 py-2 sm:px-4 sm:py-3 border-b border-border">
			<h2 class="text-base sm:text-lg font-semibold text-foreground">Start New Homework</h2>
		</div>
		<form onsubmit={startRun} class="p-3 sm:p-4 space-y-3">
			<!-- Objective field with GRID texture -->
			<div class="space-y-1">
				<label
					for="objective"
					class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
				>
					Objective
				</label>
				<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
					<textarea
						id="objective"
						placeholder="What should BuildOS work on while you're away?"
						bind:value={objective}
						rows="3"
						required
						class="relative z-10 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
					></textarea>
				</div>
			</div>

			<!-- Scope field -->
			<div class="space-y-1">
				<label
					for="scope"
					class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
				>
					Scope
				</label>
				<select
					id="scope"
					bind:value={scope}
					class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring text-foreground outline-none transition-colors"
				>
					<option value="global">Global</option>
					<option value="project">Project</option>
					<option value="multi_project">Multiple Projects</option>
				</select>
			</div>

			{#if scope === 'project'}
				<div class="space-y-1">
					<label
						class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
					>
						Project
					</label>
					<select
						bind:value={selectedProject}
						class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring text-foreground outline-none transition-colors"
						required
					>
						<option value="">Select a project</option>
						{#each data.projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</div>
			{:else if scope === 'multi_project'}
				<div class="space-y-1">
					<label
						class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
					>
						Projects
					</label>
					<select
						bind:value={selectedProjectsMulti}
						multiple
						size="5"
						class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring text-foreground outline-none transition-colors"
						required
					>
						{#each data.projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Error message -->
			{#if formError}
				<div
					class="px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg tx tx-static tx-weak"
				>
					<p class="text-sm text-red-600 dark:text-red-400">{formError}</p>
				</div>
			{/if}

			<!-- Submit button -->
			<button
				type="submit"
				disabled={submitting}
				class="w-full sm:w-auto px-4 py-2 bg-accent text-accent-foreground rounded-lg font-semibold shadow-ink pressable disabled:opacity-50 disabled:cursor-not-allowed transition-all"
			>
				{submitting ? 'Starting…' : 'Start Homework'}
			</button>
		</form>
	</section>

	<!-- Runs list -->
	{#if data.error}
		<div
			class="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg tx tx-static tx-weak"
		>
			<p class="text-sm text-red-600 dark:text-red-400">{data.error}</p>
		</div>
	{:else if data.runs.length === 0}
		<div class="p-4 bg-muted border border-border rounded-lg">
			<p class="text-sm text-muted-foreground text-center">No homework runs yet.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each data.runs as run}
				<a
					href={`/homework/runs/${run.id}`}
					class="block p-3 bg-card border border-border rounded-lg shadow-ink hover:shadow-ink-strong hover:border-accent/50 transition-all tx tx-grain tx-weak wt-paper sp-inline pressable no-underline"
				>
					<!-- Context badge -->
					<div class="mb-2">
						<span
							class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] uppercase tracking-wider font-medium"
							class:bg-slate-100={run.scope === 'global'}
							class:text-slate-600={run.scope === 'global'}
							class:dark:bg-slate-800={run.scope === 'global'}
							class:dark:text-slate-400={run.scope === 'global'}
							class:bg-indigo-100={run.scope !== 'global'}
							class:text-indigo-700={run.scope !== 'global'}
							class:dark:bg-indigo-950={run.scope !== 'global'}
							class:dark:text-indigo-400={run.scope !== 'global'}
						>
							{#if run.scope === 'global'}
								<svg
									class="w-3 h-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							{:else}
								<svg
									class="w-3 h-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
									/>
								</svg>
							{/if}
							<span class="truncate max-w-[150px]" title={getScopeLabel(run)}>
								{getScopeLabel(run)}
							</span>
						</span>
					</div>

					<!-- Title -->
					<h3 class="text-sm font-semibold text-foreground mb-2 line-clamp-2">
						{run.objective}
					</h3>

					<!-- Metadata -->
					<div class="flex flex-wrap items-center gap-2 text-xs">
						<!-- Status badge -->
						<span
							class="px-2 py-0.5 rounded-full text-[0.65rem] uppercase tracking-wider font-medium"
							class:bg-blue-100={run.status === 'running'}
							class:text-blue-700={run.status === 'running'}
							class:dark:bg-blue-950={run.status === 'running'}
							class:dark:text-blue-400={run.status === 'running'}
							class:bg-amber-100={run.status === 'stopped'}
							class:text-amber-700={run.status === 'stopped'}
							class:dark:bg-amber-950={run.status === 'stopped'}
							class:dark:text-amber-400={run.status === 'stopped'}
							class:bg-emerald-100={run.status === 'completed'}
							class:text-emerald-700={run.status === 'completed'}
							class:dark:bg-emerald-950={run.status === 'completed'}
							class:dark:text-emerald-400={run.status === 'completed'}
							class:bg-purple-100={run.status === 'waiting_on_user'}
							class:text-purple-700={run.status === 'waiting_on_user'}
							class:dark:bg-purple-950={run.status === 'waiting_on_user'}
							class:dark:text-purple-400={run.status === 'waiting_on_user'}
							class:bg-muted={![
								'running',
								'stopped',
								'completed',
								'waiting_on_user'
							].includes(run.status)}
							class:text-muted-foreground={![
								'running',
								'stopped',
								'completed',
								'waiting_on_user'
							].includes(run.status)}
						>
							{run.status}
						</span>

						<span class="text-muted-foreground">Iteration {run.iteration ?? 0}</span>
					</div>

					<!-- Metrics -->
					<div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
						<span>${getMetric(run.metrics, 'cost_total_usd').toFixed(4)}</span>
						<span>{getMetric(run.metrics, 'tokens_total')} tokens</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>
