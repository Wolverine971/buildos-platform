<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Gmail Relevance Pilot · BuildOS Admin</title>
	<meta
		name="description"
		content="Exact-user manual controls for one bounded Gmail relevance operation."
	/>
</svelte:head>

<main class="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
	<header class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-violet-600 uppercase">
			Phase A manual pilot
		</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
			One bounded operation at a time
		</h1>
		<p class="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
			Create or resume an immutable 30-day run, then submit one list page or metadata batch.
			This page never loops, polls, or starts a second operation automatically.
		</p>
	</header>

	<section
		class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
		aria-label="Operational gate"
	>
		<strong>Live-call gate:</strong>
		<span class="ml-1">Do not submit Run one operation without explicit pilot authorization.</span>
	</section>

	{#if form}
		<section
			class="rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950"
			aria-live="polite"
		>
			<h2 class="font-semibold text-slate-950 dark:text-white">Last content-free result</h2>
			<pre class="mt-3 overflow-auto text-xs text-slate-700 dark:text-slate-200">{JSON.stringify(
				form,
				null,
				2
			)}</pre>
		</section>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<form
			method="POST"
			action="?/createRun"
			class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
		>
			<h2 class="font-semibold text-slate-950 dark:text-white">Create or resume run</h2>
			<label class="block text-sm text-slate-700 dark:text-slate-200">
				Idempotency key
				<input
					name="idempotency_key"
					required
					minlength="16"
					maxlength="200"
					autocomplete="off"
					class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
				/>
			</label>

			<fieldset class="space-y-2">
				<legend class="text-sm font-medium text-slate-700 dark:text-slate-200">
					Eligible connections (maximum 3)
				</legend>
				{#each data.connections as connection (connection.id)}
					<label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
						<input type="checkbox" name="connection_id" value={connection.id} />
						{connection.label}
					</label>
				{:else}
					<p class="text-sm text-slate-500">No eligible read-only connections.</p>
				{/each}
			</fieldset>

			<fieldset class="space-y-2">
				<legend class="text-sm font-medium text-slate-700 dark:text-slate-200">
					Owned projects (maximum 25)
				</legend>
				{#each data.projects as project (project.id)}
					<label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
						<input type="checkbox" name="project_id" value={project.id} />
						{project.label}
					</label>
				{:else}
					<p class="text-sm text-slate-500">No owned projects.</p>
				{/each}
			</fieldset>

			<button
				type="submit"
				class="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
			>
				Create or resume
			</button>
		</form>

		<div class="space-y-6">
			<form
				method="POST"
				action="?/runOne"
				class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
			>
				<h2 class="font-semibold text-slate-950 dark:text-white">Run one operation</h2>
				<label class="block text-sm text-slate-700 dark:text-slate-200">
					Run ID
					<input
						name="run_id"
						required
						autocomplete="off"
						class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
					/>
				</label>
				<label class="block text-sm text-slate-700 dark:text-slate-200">
					Connection scope ID
					<input
						name="connection_scope_id"
						required
						autocomplete="off"
						class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
					/>
				</label>
				<button
					type="submit"
					class="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
				>
					Run exactly one
				</button>
			</form>

			<form
				method="POST"
				class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
			>
				<h2 class="font-semibold text-slate-950 dark:text-white">Control run</h2>
				<label class="block text-sm text-slate-700 dark:text-slate-200">
					Run ID
					<input
						name="run_id"
						required
						autocomplete="off"
						class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
					/>
				</label>
				<div class="flex flex-wrap gap-2">
					<button formaction="?/pause" class="rounded-lg border px-3 py-2 text-sm" type="submit">
						Pause
					</button>
					<button formaction="?/resume" class="rounded-lg border px-3 py-2 text-sm" type="submit">
						Resume
					</button>
					<button formaction="?/cancel" class="rounded-lg border px-3 py-2 text-sm" type="submit">
						Cancel
					</button>
					<button formaction="?/expire" class="rounded-lg border px-3 py-2 text-sm" type="submit">
						Expire
					</button>
				</div>
			</form>
		</div>
	</div>
</main>
