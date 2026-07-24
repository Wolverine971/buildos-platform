<!-- apps/web/src/routes/admin/gmail-relevance/review/+page.svelte -->
<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const pendingQueue = $derived(data.queue.filter((item) => item.state === 'pending'));
	const opened = $derived(form?.kind === 'opened' ? form.review_context : null);
	const adjudicated = $derived(form?.kind === 'adjudicated' && form.variant_reveal ? form : null);
	const nextSample = $derived(pendingQueue[0] ?? null);

	function percent(value: number | null): string {
		return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
	}
</script>

<svelte:head>
	<title>Gmail Relevance Review · BuildOS Admin</title>
	<meta
		name="description"
		content="Variant-blinded human review for the bounded Gmail relevance pilot."
	/>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
	<header class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-violet-600 uppercase">
			Phase A · Slice 4
		</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
			Blinded relevance review
		</h1>
		<p class="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
			Review one request-lifetime metadata snapshot at a time. Variants remain hidden until
			the decision is recorded.
		</p>
	</header>

	<section
		class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
		aria-label="Safety boundary"
	>
		<strong>Review-only boundary active.</strong>
		<span class="ml-1">
			No bodies, storage cache, models, Gmail mutations, project mutations, queue, or scan
			controls.
		</span>
	</section>

	{#if form?.kind === 'error'}
		<section
			class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
			aria-live="polite"
		>
			Review action failed with fixed code: <code>{form.error_code}</code>
		</section>
	{:else if form?.kind === 'prepared'}
		<section
			class="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"
			aria-live="polite"
		>
			Prepared {form.total_samples} blinded samples across {form.scope_count} accounts.
		</section>
	{:else if adjudicated}
		<section
			class="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"
			aria-live="polite"
		>
			<p class="font-semibold">
				Decision recorded{adjudicated.replayed ? ' (idempotent replay)' : ''}.
			</p>
			<p class="mt-1">
				Variant reveal: {adjudicated.variant_reveal.stratum.replace('_', ' ')} · A score
				{adjudicated.variant_reveal.a?.score ?? '—'} · B score {adjudicated.variant_reveal.b
					?.score ?? '—'}
			</p>
		</section>
	{/if}

	{#if data.runs.length === 0}
		<section
			class="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-950"
		>
			<h2 class="font-semibold text-slate-950 dark:text-white">No completed pilot run</h2>
			<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
				This review surface only accepts completed runs owned by the exact allowlisted user.
			</p>
		</section>
	{:else}
		<form
			method="GET"
			class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end dark:border-slate-800 dark:bg-slate-950"
		>
			<label class="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
				Completed run
				<select
					name="run_id"
					class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
				>
					{#each data.runs as run (run.id)}
						<option value={run.id} selected={run.id === data.selected_run_id}>
							{run.label} · {new Date(run.created_at).toLocaleString()}
						</option>
					{/each}
				</select>
			</label>
			<button
				type="submit"
				class="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
			>
				Load review
			</button>
		</form>

		{#if data.selected_run_id && data.queue.length === 0}
			<form
				method="POST"
				action="?/prepare"
				class="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"
			>
				<input type="hidden" name="run_id" value={data.selected_run_id} />
				<h2 class="font-semibold text-amber-950 dark:text-amber-100">
					Lock the 300-item sample
				</h2>
				<p class="mt-2 text-sm text-amber-900 dark:text-amber-200">
					Creates 100 deterministic, variant-aware samples per account. No Gmail call
					occurs.
				</p>
				<button
					type="submit"
					class="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
				>
					Prepare blinded sample
				</button>
			</form>
		{:else if data.metrics}
			<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Review progress">
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500">Progress</p>
					<p class="mt-1 text-2xl font-semibold">
						{data.metrics.adjudicated} / {data.metrics.target}
					</p>
				</div>
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500">Variant A precision / recall</p>
					<p class="mt-1 text-xl font-semibold">
						{percent(data.metrics.variant_a.precision)} / {percent(
							data.metrics.variant_a.recall
						)}
					</p>
				</div>
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500">Variant B precision / recall</p>
					<p class="mt-1 text-xl font-semibold">
						{percent(data.metrics.variant_b.precision)} / {percent(
							data.metrics.variant_b.recall
						)}
					</p>
				</div>
				<div
					class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
				>
					<p class="text-xs text-slate-500">Source retention</p>
					<p class="mt-1 text-sm font-semibold">
						{data.source_retention_expires_at
							? new Date(data.source_retention_expires_at).toLocaleString()
							: '—'}
					</p>
				</div>
			</section>

			<section class="grid gap-4 lg:grid-cols-3">
				{#each data.metrics.account_progress as account (account.account_label)}
					<div
						class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
					>
						<p class="text-sm font-medium">{account.account_label}</p>
						<p class="mt-1 text-2xl font-semibold">
							{account.reviewed} / {account.target}
						</p>
					</div>
				{/each}
			</section>

			<section
				class="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
				aria-label="Segment quality metrics"
			>
				<div class="border-b border-slate-200 p-4 dark:border-slate-800">
					<h2 class="font-semibold">Quality by account and project</h2>
					<p class="mt-1 text-xs text-slate-500">
						Weighted estimates; ambiguous decisions are excluded from precision and
						recall.
					</p>
				</div>
				<div class="overflow-x-auto">
					<table
						class="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800"
					>
						<thead class="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900">
							<tr>
								<th class="px-4 py-3 font-medium">Segment</th>
								<th class="px-4 py-3 font-medium">Reviewed</th>
								<th class="px-4 py-3 font-medium">A precision / recall</th>
								<th class="px-4 py-3 font-medium">B precision / recall</th>
								<th class="px-4 py-3 font-medium">A / B yield per 100</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100 dark:divide-slate-900">
							{#each [...data.metrics.segments.accounts, ...data.metrics.segments.projects] as segment (`${segment.label}:${segment.id}`)}
								<tr>
									<td class="px-4 py-3 font-medium">{segment.label}</td>
									<td class="px-4 py-3">{segment.reviewed}</td>
									<td class="px-4 py-3"
										>{percent(segment.variant_a.precision)} / {percent(
											segment.variant_a.recall
										)}</td
									>
									<td class="px-4 py-3"
										>{percent(segment.variant_b.precision)} / {percent(
											segment.variant_b.recall
										)}</td
									>
									<td class="px-4 py-3"
										>{segment.candidate_yield_per_100_observations.a ?? '—'} / {segment
											.candidate_yield_per_100_observations.b ?? '—'}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if opened && data.selected_run_id}
			<section
				class="space-y-5 rounded-2xl border border-violet-200 bg-white p-5 dark:border-violet-900 dark:bg-slate-950"
			>
				<div>
					<p class="text-xs font-semibold tracking-[0.16em] text-violet-600 uppercase">
						Blinded sample
					</p>
					<h2 class="mt-1 text-xl font-semibold">{opened.project_label}</h2>
					<p class="mt-1 text-xs text-slate-500">
						{new Date(opened.internal_date).toLocaleString()} · {opened
							.mailbox_categories.sent
							? 'Sent'
							: 'Inbox'}
					</p>
				</div>
				<div class="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
					<p class="font-medium text-slate-950 dark:text-white">
						{opened.subject || '(No subject)'}
					</p>
					<p class="text-sm text-slate-600 dark:text-slate-300">
						{opened.snippet || '(No snippet)'}
					</p>
					<p class="break-words text-xs text-slate-500">
						Participants: {opened.participant_addresses.join(', ') || 'None available'}
					</p>
				</div>

				<form method="POST" action="?/adjudicate" class="grid gap-4 sm:grid-cols-2">
					<input type="hidden" name="run_id" value={data.selected_run_id} />
					<input type="hidden" name="sample_id" value={opened.sample_id} />
					<input type="hidden" name="idempotency_key" value={opened.idempotency_key} />
					<label class="text-sm font-medium">
						Decision
						<select
							name="decision"
							required
							class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
						>
							<option value="correct_project">Correct project</option>
							<option value="wrong_project">Wrong project</option>
							<option value="relevant_missing_project"
								>Relevant, but missing another project</option
							>
							<option value="not_project_relevant">Not project-relevant</option>
							<option value="ambiguous">Ambiguous / insufficient context</option>
						</select>
					</label>
					<label class="text-sm font-medium">
						Bounded correction reason
						<select
							name="correction_reason"
							class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
						>
							<option value="">None</option>
							<option value="wrong_actor">Wrong actor</option>
							<option value="wrong_domain">Wrong domain</option>
							<option value="wrong_artifact">Wrong artifact</option>
							<option value="wrong_identifier">Wrong identifier</option>
							<option value="lexical_false_positive">Lexical false positive</option>
							<option value="negative_signal_missed">Negative signal missed</option>
							<option value="missing_profile_signal">Missing profile signal</option>
							<option value="cross_project_ambiguity">Cross-project ambiguity</option>
							<option value="insufficient_metadata">Insufficient metadata</option>
						</select>
					</label>
					<label class="text-sm font-medium">
						Corrected / additional project
						<select
							name="corrected_project_id"
							class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
						>
							<option value="">None</option>
							{#each data.projects.filter((project) => project.id !== opened.project_id) as project (project.id)}
								<option value={project.id}>{project.label}</option>
							{/each}
						</select>
					</label>
					<label class="text-sm font-medium">
						Optional rule proposal
						<select
							name="rule_proposal"
							class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
						>
							<option value="">None</option>
							<option value="always_sender">Always sender</option>
							<option value="always_domain">Always domain</option>
							<option value="always_thread">Always thread</option>
							<option value="never_sender">Never sender</option>
							<option value="never_domain">Never domain</option>
							<option value="never_thread">Never thread</option>
						</select>
					</label>
					<button
						type="submit"
						class="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
					>
						Record blinded decision
					</button>
				</form>
			</section>
		{:else if data.selected_run_id && nextSample}
			<section
				class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
			>
				<div class="flex items-center justify-between gap-4">
					<div>
						<h2 class="font-semibold">Next blinded sample</h2>
						<p class="mt-1 text-sm text-slate-500">
							{nextSample.account_label} · {nextSample.project_label} · item
							{nextSample.sample_order}
						</p>
					</div>
					<form method="POST" action="?/open">
						<input type="hidden" name="run_id" value={data.selected_run_id} />
						<input type="hidden" name="sample_id" value={nextSample.id} />
						<button
							type="submit"
							class="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950"
						>
							Open metadata
						</button>
					</form>
				</div>
			</section>
		{/if}
	{/if}
</main>
