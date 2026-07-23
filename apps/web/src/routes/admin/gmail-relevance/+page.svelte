<!-- apps/web/src/routes/admin/gmail-relevance/+page.svelte -->
<script lang="ts">
	import type { PageProps } from './$types';

	type ProjectEmailProfileGroup =
		| 'identity'
		| 'actors'
		| 'artifacts'
		| 'identifiers'
		| 'semantic_context'
		| 'negative_evidence'
		| 'user_rules'
		| 'recency';

	let { data }: PageProps = $props();

	const groups: Array<{ key: ProjectEmailProfileGroup; label: string }> = [
		{ key: 'identity', label: 'Identity' },
		{ key: 'actors', label: 'Actors and domains' },
		{ key: 'artifacts', label: 'Artifacts' },
		{ key: 'identifiers', label: 'Identifiers' },
		{ key: 'semantic_context', label: 'Semantic context' },
		{ key: 'negative_evidence', label: 'Negative evidence' },
		{ key: 'user_rules', label: 'Explicit user rules' },
		{ key: 'recency', label: 'Expiring recency' }
	];
</script>

<svelte:head>
	<title>Gmail Relevance Phase A · BuildOS Admin</title>
	<meta
		name="description"
		content="Read-only internal preview of deterministic project email profiles."
	/>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
	<header class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-violet-600 uppercase">
			Phase A preview
		</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
			Project email profile
		</h1>
		<p class="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
			This page compiles existing BuildOS project data in memory. It does not read Gmail, call
			a model, persist a profile, or modify a project.
		</p>
	</header>

	<section
		class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
		aria-label="Safety boundary"
	>
		<strong>Read-only boundary active.</strong>
		<span class="ml-1">Gmail reads: 0 · Model calls: 0 · Database writes: 0</span>
	</section>

	{#if data.projects.length === 0}
		<section
			class="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-950"
		>
			<h2 class="font-semibold text-slate-950 dark:text-white">No owned projects found</h2>
			<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
				The preview only compiles projects where your current ontology actor is an owner.
			</p>
		</section>
	{:else}
		<form
			method="GET"
			class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end dark:border-slate-800 dark:bg-slate-950"
		>
			<label class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
				Owned project
				<select
					name="project_id"
					class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
				>
					{#each data.projects as project (project.id)}
						<option value={project.id} selected={project.id === data.selectedProjectId}>
							{project.name}
						</option>
					{/each}
				</select>
			</label>
			<button
				type="submit"
				class="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
			>
				Compile preview
			</button>
		</form>

		{#if data.profile}
			<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Profile metadata">
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500 dark:text-slate-400">Compiler</p>
					<p class="mt-1 break-all text-sm font-medium text-slate-950 dark:text-white">
						{data.profile.compiler_version}
					</p>
				</div>
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500 dark:text-slate-400">Profile version</p>
					<p class="mt-1 text-sm font-medium text-slate-950 dark:text-white">
						{data.profile.profile_version}
					</p>
				</div>
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500 dark:text-slate-400">Source snapshot</p>
					<p class="mt-1 text-sm font-medium text-slate-950 dark:text-white">
						{data.profile.source_snapshot_at}
					</p>
				</div>
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500 dark:text-slate-400">Stable hash</p>
					<p
						class="mt-1 truncate font-mono text-sm text-slate-950 dark:text-white"
						title={data.profile.profile_hash}
					>
						{data.profile.profile_hash}
					</p>
				</div>
			</section>

			<div class="grid gap-5 lg:grid-cols-2">
				{#each groups as group (group.key)}
					<section
						class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
					>
						<div class="flex items-center justify-between gap-3">
							<h2 class="font-semibold text-slate-950 dark:text-white">
								{group.label}
							</h2>
							<span
								class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
							>
								{data.profile.groups[group.key].length}
							</span>
						</div>
						<ul class="mt-4 space-y-3">
							{#each data.profile.groups[group.key] as entry (`${entry.field}:${entry.normalized_value}`)}
								<li class="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
									<div class="flex flex-wrap items-start justify-between gap-2">
										<p
											class="break-words text-sm font-medium text-slate-950 dark:text-white"
										>
											{entry.value}
										</p>
										<code class="text-xs text-violet-700 dark:text-violet-300"
											>{entry.field}</code
										>
									</div>
									<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
										{entry.sources.length} source{entry.sources.length === 1
											? ''
											: 's'} ·
										{entry.sources
											.map(
												(source) =>
													`${source.source_type}:${source.source_field}`
											)
											.join(', ')}
									</p>
									{#if entry.expires_at}
										<p class="mt-1 text-xs text-amber-700 dark:text-amber-300">
											Expires {entry.expires_at}
										</p>
									{/if}
								</li>
							{:else}
								<li class="text-sm text-slate-500 dark:text-slate-400">
									No signals compiled.
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</main>
