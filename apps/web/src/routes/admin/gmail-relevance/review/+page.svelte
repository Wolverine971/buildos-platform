<!-- apps/web/src/routes/admin/gmail-relevance/review/+page.svelte -->
<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	function reviewAction(action: 'prepare' | 'open' | 'adjudicate', runId: string): string {
		return `?/${action}&run_id=${encodeURIComponent(runId)}`;
	}

	function mailboxLocation(categories: { inbox: boolean; sent: boolean }): string {
		if (categories.inbox && categories.sent) return 'Inbox + Sent';
		if (categories.sent) return 'Sent';
		if (categories.inbox) return 'Inbox';
		return 'Other';
	}

	const quickQueue = $derived(
		data.queue
			.filter((item) => item.quick_review_order !== null)
			.sort((left, right) => left.quick_review_order! - right.quick_review_order!)
	);
	const pendingQueue = $derived(quickQueue.filter((item) => item.state === 'pending'));
	const reviewedCount = $derived(quickQueue.filter((item) => item.state === 'reviewed').length);
	const expiredCount = $derived(quickQueue.filter((item) => item.state === 'expired').length);
	const opened = $derived(form?.kind === 'opened' ? form.review_context : null);
	const alternativeProjects = $derived(
		opened ? data.projects.filter((project) => project.id !== opened.project_id) : []
	);
	const adjudicated = $derived(form?.kind === 'adjudicated' ? form : null);
	const nextSample = $derived(pendingQueue[0] ?? null);
	const reviewFinished = $derived(quickQueue.length > 0 && pendingQueue.length === 0);
	const actionErrorMessage = $derived.by(() => {
		if (form?.kind !== 'error') return null;
		if (
			['run_unavailable', 'sample_unavailable', 'project_unavailable'].includes(
				form.error_code
			)
		) {
			return 'This suggestion is no longer available. Reload the scan to get the current queue.';
		}
		if (
			['provider_timeout', 'provider_rejected', 'connection_unavailable'].includes(
				form.error_code
			)
		) {
			return 'The email preview could not be retrieved. Try again in a moment; no answer was saved.';
		}
		if (form.error_code === 'idempotency_conflict') {
			return 'This suggestion was already answered in another request. Reload the scan to continue.';
		}
		return 'The result could not be confirmed. Reload this scan before trying again.';
	});
</script>

<svelte:head>
	<title>Email Suggestions · BuildOS</title>
	<meta name="description" content="Review a small set of project-related email suggestions." />
</svelte:head>

<main id="main-content" class="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
	<header class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
			Email suggestions
		</p>
		<h1 class="text-3xl font-semibold tracking-tight text-foreground">
			Review project matches
		</h1>
		<p class="max-w-2xl text-sm leading-6 text-muted-foreground">
			For each suggestion, BuildOS shows one email and the project it may belong to. Choose
			Yes, No, Not sure, or a different project. Your answers do not change your email or your
			projects.
		</p>
	</header>

	<section
		class="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-foreground"
		aria-label="Privacy boundary"
	>
		<strong>Read-only preview.</strong>
		<span class="ml-1 text-muted-foreground">
			BuildOS opens one email’s subject, snippet, and participants only when you request it.
			Bodies and attachments are not read or stored.
		</span>
	</section>

	{#if form?.kind === 'error'}
		<section
			class="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
			aria-live="polite"
		>
			{actionErrorMessage}
		</section>
	{:else if form?.kind === 'prepared'}
		<section
			class="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm text-foreground"
			aria-live="polite"
		>
			Your suggestion set is ready. Open the first email when you’re ready to review.
		</section>
	{:else if adjudicated}
		<section
			class="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-foreground"
			aria-live="polite"
		>
			<strong>Answer saved.</strong>
			<span class="ml-1 text-muted-foreground">
				{reviewFinished ? 'The review is complete.' : 'The next suggestion is ready below.'}
			</span>
		</section>
	{/if}

	{#if data.runs.length === 0}
		<section class="rounded-2xl border border-border bg-card p-8 shadow-ink">
			<h2 class="font-semibold text-foreground">No completed email scan yet</h2>
			<p class="mt-2 text-sm text-muted-foreground">
				Suggestions will appear here after the bounded read-only scan finishes.
			</p>
		</section>
	{:else}
		{#if data.runs.length > 1}
			<form
				method="GET"
				class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-ink sm:flex-row sm:items-end"
			>
				<label class="flex-1 text-sm font-medium text-foreground">
					Email scan
					<select
						name="run_id"
						class="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2"
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
					class="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background"
				>
					Load
				</button>
			</form>
		{/if}

		{#if data.selected_run_id && data.queue.length === 0}
			<form
				method="POST"
				action={reviewAction('prepare', data.selected_run_id)}
				class="rounded-2xl border border-accent/30 bg-accent/10 p-6"
			>
				<input type="hidden" name="run_id" value={data.selected_run_id} />
				<h2 class="text-lg font-semibold text-foreground">Prepare 20 suggestions</h2>
				<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
					BuildOS will prepare a content-free sample pool from the completed scan, then
					show 20 candidate matches here. This does not make another Gmail request.
				</p>
				<button
					type="submit"
					class="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink"
				>
					Prepare suggestions
				</button>
			</form>
		{:else if quickQueue.length > 0}
			<section class="rounded-2xl border border-border bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-sm font-medium text-muted-foreground">Review progress</p>
						<p class="mt-1 text-3xl font-semibold text-foreground">
							{reviewedCount} / {quickQueue.length}
						</p>
					</div>
					{#if data.source_retention_expires_at}
						<p class="text-xs text-muted-foreground">
							Available until {new Date(
								data.source_retention_expires_at
							).toLocaleString()}
						</p>
					{/if}
				</div>
				<div
					class="mt-4 h-2 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="Email suggestion review progress"
					aria-valuemin="0"
					aria-valuemax={quickQueue.length}
					aria-valuenow={reviewedCount}
				>
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
						style:width={`${(reviewedCount / quickQueue.length) * 100}%`}
					></div>
				</div>
				{#if expiredCount > 0}
					<p class="mt-3 text-sm text-warning">
						{expiredCount} suggestion{expiredCount === 1 ? '' : 's'} expired before review.
					</p>
				{/if}
			</section>
		{:else if data.queue.length > 0}
			<section class="rounded-2xl border border-border bg-card p-8 shadow-ink">
				<h2 class="font-semibold text-foreground">No candidate suggestions found</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					The scan completed, but neither matching approach produced a reviewable project
					candidate in the sample.
				</p>
			</section>
		{/if}

		{#if opened && data.selected_run_id}
			<section class="space-y-5 rounded-2xl border border-accent/30 bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold tracking-[0.16em] text-accent uppercase">
							Suggested project
						</p>
						<h2 class="mt-1 text-xl font-semibold text-foreground">
							{opened.project_label}
						</h2>
					</div>
					<p class="text-xs text-muted-foreground">
						{new Date(opened.internal_date).toLocaleString()} · {mailboxLocation(
							opened.mailbox_categories
						)}
					</p>
				</div>

				<div class="space-y-3 rounded-xl bg-muted/60 p-4">
					<p class="font-medium text-foreground">{opened.subject || '(No subject)'}</p>
					<p class="text-sm leading-6 text-muted-foreground">
						{opened.snippet || '(No snippet)'}
					</p>
					<p class="break-words text-xs text-muted-foreground">
						Participants: {opened.participant_addresses.join(', ') || 'None available'}
					</p>
				</div>

				<div class="grid gap-3 sm:grid-cols-3">
					<form method="POST" action={reviewAction('adjudicate', data.selected_run_id)}>
						<input type="hidden" name="run_id" value={data.selected_run_id} />
						<input type="hidden" name="sample_id" value={opened.sample_id} />
						<input
							type="hidden"
							name="idempotency_key"
							value={opened.idempotency_key}
						/>
						<input type="hidden" name="decision" value="correct_project" />
						<input type="hidden" name="correction_reason" value="" />
						<input type="hidden" name="corrected_project_id" value="" />
						<input type="hidden" name="rule_proposal" value="" />
						<button
							type="submit"
							class="min-h-12 w-full rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-ink"
						>
							Yes, related
						</button>
					</form>

					<form method="POST" action={reviewAction('adjudicate', data.selected_run_id)}>
						<input type="hidden" name="run_id" value={data.selected_run_id} />
						<input type="hidden" name="sample_id" value={opened.sample_id} />
						<input
							type="hidden"
							name="idempotency_key"
							value={opened.idempotency_key}
						/>
						<input type="hidden" name="decision" value="not_project_relevant" />
						<input
							type="hidden"
							name="correction_reason"
							value="negative_signal_missed"
						/>
						<input type="hidden" name="corrected_project_id" value="" />
						<input type="hidden" name="rule_proposal" value="" />
						<button
							type="submit"
							class="min-h-12 w-full rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
						>
							No, unrelated
						</button>
					</form>

					<form method="POST" action={reviewAction('adjudicate', data.selected_run_id)}>
						<input type="hidden" name="run_id" value={data.selected_run_id} />
						<input type="hidden" name="sample_id" value={opened.sample_id} />
						<input
							type="hidden"
							name="idempotency_key"
							value={opened.idempotency_key}
						/>
						<input type="hidden" name="decision" value="ambiguous" />
						<input
							type="hidden"
							name="correction_reason"
							value="insufficient_metadata"
						/>
						<input type="hidden" name="corrected_project_id" value="" />
						<input type="hidden" name="rule_proposal" value="" />
						<button
							type="submit"
							class="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground"
						>
							Not sure
						</button>
					</form>
				</div>

				{#if alternativeProjects.length > 0}
					<details class="rounded-xl border border-border bg-background p-4">
						<summary class="cursor-pointer text-sm font-semibold text-foreground">
							It belongs to a different project
						</summary>
						<form
							method="POST"
							action={reviewAction('adjudicate', data.selected_run_id)}
							class="mt-4 flex flex-col gap-3 sm:flex-row"
						>
							<input type="hidden" name="run_id" value={data.selected_run_id} />
							<input type="hidden" name="sample_id" value={opened.sample_id} />
							<input
								type="hidden"
								name="idempotency_key"
								value={opened.idempotency_key}
							/>
							<input type="hidden" name="decision" value="wrong_project" />
							<input
								type="hidden"
								name="correction_reason"
								value="cross_project_ambiguity"
							/>
							<input type="hidden" name="rule_proposal" value="" />
							<label class="flex-1 text-sm font-medium text-foreground">
								Correct project
								<select
									name="corrected_project_id"
									required
									class="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2"
								>
									<option value="">Choose a project</option>
									{#each alternativeProjects as project (project.id)}
										<option value={project.id}>{project.label}</option>
									{/each}
								</select>
							</label>
							<button
								type="submit"
								class="self-end rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background"
							>
								Save different project
							</button>
						</form>
					</details>
				{:else}
					<p
						class="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground"
					>
						No other projects were included in this scan.
					</p>
				{/if}
			</section>
		{:else if data.selected_run_id && nextSample}
			<section class="rounded-2xl border border-accent/30 bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-start justify-between gap-5">
					<div class="max-w-2xl space-y-2">
						<p class="text-xs font-semibold tracking-[0.16em] text-accent uppercase">
							Suggestion {nextSample.quick_review_order} of {quickQueue.length}
						</p>
						<h2 class="text-xl font-semibold text-foreground">
							We think this email belongs to {nextSample.project_label}
						</h2>
						<p class="text-sm leading-6 text-muted-foreground">
							Account: {nextSample.account_label}. Open the read-only preview to see
							the subject, date, participants, and snippet, then tell us whether the
							match is right.
						</p>
					</div>
					<form method="POST" action={reviewAction('open', data.selected_run_id)}>
						<input type="hidden" name="run_id" value={data.selected_run_id} />
						<input type="hidden" name="sample_id" value={nextSample.id} />
						<button
							type="submit"
							class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink"
						>
							Show email and choices
						</button>
					</form>
				</div>
			</section>
		{:else if reviewFinished}
			<section class="rounded-2xl border border-success/30 bg-success/10 p-8 text-center">
				{#if expiredCount === 0}
					<h2 class="text-xl font-semibold text-foreground">
						{reviewedCount} suggestion{reviewedCount === 1 ? '' : 's'} reviewed
					</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						That is enough for a directional read. BuildOS will not scan again
						automatically.
					</p>
				{:else}
					<h2 class="text-xl font-semibold text-foreground">Review window finished</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						{reviewedCount} answer{reviewedCount === 1 ? '' : 's'} saved; {expiredCount}
						suggestion{expiredCount === 1 ? '' : 's'} expired before review. BuildOS will
						not scan again automatically.
					</p>
				{/if}
			</section>
		{/if}
	{/if}
</main>
