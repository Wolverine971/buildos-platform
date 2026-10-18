<!-- apps/web/src/routes/admin/gmail-relevance/review/+page.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import { Check } from '$lib/icons/lucide';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type ScanProgress = NonNullable<PageProps['data']['scan']['latest_run']>;
	type Decision =
		| 'correct_project'
		| 'wrong_project'
		| 'relevant_missing_project'
		| 'not_project_relevant'
		| 'ambiguous';

	const TERMINAL_SCOPE_STATES = new Set([
		'completed',
		'cancelled',
		'quota_stopped',
		'failed',
		'expired'
	]);
	const ACTIVE_RUN_STATES = new Set(['pending', 'running']);
	// A step that finds its account busy or backing off waits, then tries again.
	const IDLE_WAIT_MS = 3_000;
	const MAX_IDLE_STEPS = 40;

	function reviewAction(action: 'prepare' | 'open' | 'adjudicate', runId: string): string {
		return `?/${action}&run_id=${encodeURIComponent(runId)}`;
	}

	function mailboxLocation(categories: { inbox: boolean; sent: boolean }): string {
		if (categories.inbox && categories.sent) return 'Inbox + Sent';
		if (categories.sent) return 'Sent';
		if (categories.inbox) return 'Inbox';
		return 'Other';
	}

	function scanErrorMessage(code: string): string {
		if (['phase_a_disabled', 'user_not_allowed'].includes(code)) {
			return 'Scanning is switched off for this account.';
		}
		if (['connection_unavailable', 'connection_disconnected'].includes(code)) {
			return 'Gmail needs to be reconnected before it can be scanned.';
		}
		if (
			[
				'project_unavailable',
				'profile_unavailable',
				'concurrent_publication_conflict'
			].includes(code)
		) {
			return 'One of the chosen projects could not be prepared. Untick it and try again.';
		}
		if (code === 'idempotency_conflict') {
			return 'This scan was already started in another tab. Reload the page.';
		}
		if (code === 'manifest_expired') {
			return 'This scan expired before it finished. Start a new one.';
		}
		if (code === 'budget_exceeded') {
			return 'This scan reached its Gmail limit before finishing.';
		}
		if (['provider_timeout', 'provider_rejected'].includes(code)) {
			return 'Gmail did not answer in time. Continue to try again.';
		}
		if (code === 'network') {
			return 'Lost the connection to BuildOS. Continue to pick up where it stopped.';
		}
		return 'The scan stopped unexpectedly. Continue to pick up where it stopped.';
	}

	function scopeStatus(scope: ScanProgress['scopes'][number]): string {
		if (scope.state === 'completed') return 'Done';
		if (scope.state === 'cancelled') return 'Cancelled';
		if (scope.state === 'expired') return 'Expired';
		if (scope.state === 'quota_stopped') return 'Hit the Gmail limit';
		if (scope.state === 'failed') {
			return scope.terminal_reason_code === 'connection_disconnected'
				? 'Gmail disconnected'
				: 'Stopped with an error';
		}
		if (scope.state === 'retry_wait') return 'Waiting to retry';
		return scope.observations_discovered === 0 ? 'Starting' : 'Reading';
	}

	// ── Step 1: scan ──────────────────────────────────────────────────────────

	// Progress from the steps this tab runs; otherwise whatever the page loaded with.
	let liveProgress = $state<ScanProgress | null>(null);
	const scanProgress = $derived(liveProgress ?? data.scan.latest_run);
	const scanActive = $derived(scanProgress !== null && ACTIVE_RUN_STATES.has(scanProgress.state));
	let scanning = $state(false);
	let startPending = $state(false);
	let cancelPending = $state(false);
	let scanErrorCode = $state<string | null>(null);
	let stopRequested = false;
	let currentScan: Promise<void> | null = null;

	let selectedProjectIds = $state<string[]>(
		untrack(() =>
			data.scan.projects.slice(0, data.scan.max_projects).map((project) => project.id)
		)
	);
	const selectedProjects = $derived(new Set(selectedProjectIds));
	const atProjectLimit = $derived(selectedProjectIds.length >= data.scan.max_projects);

	function toggleProject(projectId: string, checked: boolean) {
		selectedProjectIds = checked
			? [...selectedProjectIds, projectId]
			: selectedProjectIds.filter((id) => id !== projectId);
	}

	const scanTotals = $derived.by(() => {
		const scopes = scanProgress?.scopes ?? [];
		const read = scopes.reduce((total, scope) => total + scope.observations_processed, 0);
		const fraction =
			scopes.length === 0
				? 0
				: scopes.reduce(
						(total, scope) =>
							total +
							(TERMINAL_SCOPE_STATES.has(scope.state)
								? 1
								: scope.observations_processed / Math.max(scope.message_cap, 1)),
						0
					) / scopes.length;
		return { read, percent: Math.round(fraction * 100) };
	});

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function postAction(name: 'scanStep' | 'cancelScan', body: FormData) {
		const response = await fetch(`?/${name}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text());
	}

	async function runScope(runId: string, scopeId: string): Promise<void> {
		let idleSteps = 0;
		while (!stopRequested) {
			const body = new FormData();
			body.set('run_id', runId);
			body.set('connection_scope_id', scopeId);
			let result: Awaited<ReturnType<typeof postAction>>;
			try {
				result = await postAction('scanStep', body);
			} catch {
				scanErrorCode = 'network';
				return;
			}
			if (result.type !== 'success' || result.data?.kind !== 'scan_step') {
				scanErrorCode =
					result.type === 'failure' && typeof result.data?.error_code === 'string'
						? result.data.error_code
						: 'internal_error';
				return;
			}
			const step = result.data as unknown as {
				status: 'committed' | 'no_op';
				step_error_code: string | null;
				progress: ScanProgress;
			};
			liveProgress = step.progress;
			const scope = step.progress.scopes.find((candidate) => candidate.id === scopeId);
			if (
				!scope ||
				TERMINAL_SCOPE_STATES.has(scope.state) ||
				!ACTIVE_RUN_STATES.has(step.progress.state)
			) {
				return;
			}
			if (step.status === 'no_op') {
				idleSteps += 1;
				if (idleSteps >= MAX_IDLE_STEPS) {
					scanErrorCode = step.step_error_code ?? 'internal_error';
					return;
				}
				await sleep(IDLE_WAIT_MS);
			} else {
				idleSteps = 0;
			}
		}
	}

	async function runScanLoop(progress: ScanProgress): Promise<void> {
		scanning = true;
		stopRequested = false;
		scanErrorCode = null;
		try {
			// Each account has its own checkpoint, so all of them advance at once.
			await Promise.all(
				progress.scopes
					.filter((scope) => !TERMINAL_SCOPE_STATES.has(scope.state))
					.map((scope) => runScope(progress.run_id, scope.id))
			);
		} finally {
			scanning = false;
		}
		if (!stopRequested && !scanErrorCode) {
			await invalidateAll();
			liveProgress = null;
		}
	}

	function runScan(progress: ScanProgress) {
		if (scanning) return;
		currentScan = runScanLoop(progress).finally(() => {
			currentScan = null;
		});
	}

	async function cancelScan() {
		if (!scanProgress) return;
		cancelPending = true;
		// Let any step already talking to Gmail settle, so the cancel lands on every account.
		stopRequested = true;
		await currentScan;
		const body = new FormData();
		body.set('run_id', scanProgress.run_id);
		try {
			const result = await postAction('cancelScan', body);
			if (result.type === 'failure' && typeof result.data?.error_code === 'string') {
				scanErrorCode = result.data.error_code;
			} else {
				scanErrorCode = null;
			}
		} catch {
			scanErrorCode = 'network';
		}
		await invalidateAll();
		liveProgress = null;
		cancelPending = false;
	}

	// Pick an unfinished scan back up when the page opens; stop when it closes.
	let resumeChecked = false;
	$effect(() => {
		const progress = data.scan.latest_run;
		if (resumeChecked) return;
		resumeChecked = true;
		if (data.scan.enabled && progress && ACTIVE_RUN_STATES.has(progress.state)) {
			untrack(() => runScan(progress));
		}
	});
	$effect(() => () => {
		stopRequested = true;
	});

	// ── Steps 2 and 3: prepare and review ─────────────────────────────────────

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

	const hasCompletedScan = $derived(data.runs.length > 0);
	// 4 means every step is done.
	const step = $derived(
		!hasCompletedScan
			? 1
			: data.selected_run_id && data.queue.length === 0
				? 2
				: reviewFinished
					? 4
					: 3
	);

	// ── Scorecard ─────────────────────────────────────────────────────────────

	const scorecard = $derived.by(() => {
		const answered = quickQueue.filter(
			(item): item is typeof item & { decision: Decision } => item.decision !== null
		);
		const count = (decision: Decision) =>
			answered.filter((item) => item.decision === decision).length;
		const byProject = new Map<string, { right: number; answered: number }>();
		for (const item of answered) {
			const row = byProject.get(item.project_label) ?? { right: 0, answered: 0 };
			row.answered += 1;
			if (item.decision === 'correct_project') row.right += 1;
			byProject.set(item.project_label, row);
		}
		return {
			answered: answered.length,
			right: count('correct_project'),
			wrongProject: count('wrong_project') + count('relevant_missing_project'),
			unrelated: count('not_project_relevant'),
			unsure: count('ambiguous'),
			projects: [...byProject.entries()]
				.map(([label, row]) => ({ label, ...row }))
				.sort((left, right) => right.answered - left.answered)
		};
	});

	function percent(value: number | null | undefined): string | null {
		return typeof value === 'number' ? `${Math.round(value * 100)}%` : null;
	}
</script>

<svelte:head>
	<title>Email Suggestions · BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
	<header class="space-y-2">
		<p class="micro-label text-accent">Experiment · only you can see this</p>
		<h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
			Email suggestions
		</h1>
		<p class="max-w-2xl text-sm leading-6 text-muted-foreground">
			Can BuildOS tell which of your emails belong to which project? Scan your recent email,
			then answer 20 of its guesses. Your answers don't change your email or your projects.
		</p>
	</header>

	<ol class="grid grid-cols-3 gap-2" aria-label="Steps">
		{#each ['Scan', 'Prepare', 'Review'] as label, index (label)}
			{@const number = index + 1}
			<li
				class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm {number === step
					? 'border-accent/40 bg-accent/10 font-semibold text-foreground'
					: 'border-border bg-card text-muted-foreground'}"
				aria-current={number === step ? 'step' : undefined}
			>
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold {number <
					step
						? 'bg-success text-white'
						: number === step
							? 'bg-accent text-accent-foreground'
							: 'bg-muted text-muted-foreground'}"
				>
					{#if number < step}
						<Check class="h-3 w-3" aria-hidden="true" />
					{:else}
						{number}
					{/if}
				</span>
				{label}
			</li>
		{/each}
	</ol>

	<!-- Step 1: scan -->
	<section
		class="space-y-4 rounded-lg border border-border bg-card p-5 shadow-ink"
		aria-labelledby="scan-heading"
	>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 id="scan-heading" class="text-lg font-semibold text-foreground">
					1. Scan your email
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Reads the subject, snippet, and participants of up to 1,000 emails per account
					from the last 30 days. No email bodies or attachments.
				</p>
			</div>
			{#if hasCompletedScan && !scanActive}
				<p class="stamp text-xs text-success">
					✓ Last scan {new Date(data.runs[0]!.created_at).toLocaleString()}
				</p>
			{/if}
		</div>

		{#if scanErrorCode}
			<p
				class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				role="alert"
			>
				{scanErrorMessage(scanErrorCode)}
				{#if ['connection_unavailable', 'connection_disconnected'].includes(scanErrorCode)}
					<a href="/profile?tab=email" class="ml-1 font-semibold underline">
						Open Profile → Email
					</a>
				{/if}
			</p>
		{/if}

		{#if !data.scan.enabled}
			<p
				class="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
			>
				Scanning is switched off on this server. Turn on
				<code class="stamp">GMAIL_RELEVANCE_PHASE_A_ENABLED</code> and add your user ID to
				<code class="stamp">GMAIL_RELEVANCE_PHASE_A_USER_IDS</code>.
			</p>
		{:else if data.scan.unavailable}
			<p
				class="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
			>
				Could not load your accounts and projects. Reload to try again.
			</p>
		{:else if scanProgress && scanActive}
			<div class="space-y-3" aria-live="polite">
				<div class="flex items-baseline justify-between gap-3">
					<p class="text-sm font-medium text-foreground">
						{#if scanning}
							Scanning… keep this tab open.
						{:else}
							Scan paused.
						{/if}
					</p>
					<p class="stamp text-sm text-muted-foreground">
						{scanTotals.read.toLocaleString()} emails read
					</p>
				</div>
				<div
					class="h-2 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="Scan progress"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={scanTotals.percent}
				>
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
						style:width={`${scanTotals.percent}%`}
					></div>
				</div>
				<ul class="divide-y divide-border rounded-lg border border-border">
					{#each scanProgress.scopes as scope (scope.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
							<span class="min-w-0 truncate text-foreground"
								>{scope.account_label}</span
							>
							<span class="stamp shrink-0 text-xs text-muted-foreground">
								{scope.observations_processed.toLocaleString()} read · {scopeStatus(
									scope
								)}
							</span>
						</li>
					{/each}
				</ul>
				<div class="flex flex-wrap gap-2">
					{#if !scanning}
						<Button
							variant="accent"
							size="sm"
							onclick={() => scanProgress && runScan(scanProgress)}
						>
							Continue scan
						</Button>
					{/if}
					<Button
						variant="outline"
						size="sm"
						loading={cancelPending}
						disabled={cancelPending}
						onclick={cancelScan}
					>
						Cancel scan
					</Button>
				</div>
			</div>
		{:else if data.scan.accounts.length === 0}
			<p
				class="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
			>
				No Gmail account is ready to scan.
				<a href="/profile?tab=email" class="font-semibold text-accent underline">
					Connect or reconnect Gmail in Profile → Email
				</a>
			</p>
		{:else}
			{#if scanProgress && !scanActive && scanProgress.state !== 'completed'}
				<p
					class="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
				>
					{scanProgress.state === 'cancelled'
						? 'The last scan was cancelled.'
						: 'The last scan stopped before every account finished, so it cannot be reviewed. Start a new one.'}
				</p>
			{/if}
			<details class="rounded-lg border border-border bg-background" open={!hasCompletedScan}>
				<summary
					class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground"
				>
					{hasCompletedScan ? 'Scan again' : 'Choose what to scan'}
					<span class="stamp text-xs font-normal text-muted-foreground">
						{data.scan.accounts.length} account{data.scan.accounts.length === 1
							? ''
							: 's'} · {selectedProjectIds.length} project{selectedProjectIds.length ===
						1
							? ''
							: 's'}
					</span>
				</summary>
				<form
					method="POST"
					action="?/startScan"
					class="space-y-4 border-t border-border px-4 py-4"
					use:enhance={() => {
						startPending = true;
						scanErrorCode = null;
						return async ({ result, update }) => {
							startPending = false;
							if (result.type === 'success' && result.data?.kind === 'scan_started') {
								const progress = result.data.progress as ScanProgress;
								liveProgress = progress;
								runScan(progress);
								return;
							}
							if (
								result.type === 'failure' &&
								typeof result.data?.error_code === 'string'
							) {
								scanErrorCode = result.data.error_code;
								return;
							}
							await update();
						};
					}}
				>
					<input type="hidden" name="idempotency_key" value={data.scan.start_key} />
					<div>
						<p class="micro-label text-muted-foreground">Gmail accounts</p>
						<ul class="mt-2 flex flex-wrap gap-2">
							{#each data.scan.accounts as account (account.id)}
								<li
									class="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground"
								>
									{account.label}
								</li>
							{/each}
						</ul>
					</div>
					<fieldset>
						<legend class="micro-label text-muted-foreground">
							Projects to match against · up to {data.scan.max_projects}
						</legend>
						{#if data.scan.projects.length === 0}
							<p class="mt-2 text-sm text-muted-foreground">
								You don't own any active projects yet.
							</p>
						{:else}
							<ul
								class="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2"
							>
								{#each data.scan.projects as project (project.id)}
									{@const checked = selectedProjects.has(project.id)}
									<li>
										<label
											class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted {!checked &&
											atProjectLimit
												? 'opacity-50'
												: ''}"
										>
											<input
												type="checkbox"
												name="project_id"
												value={project.id}
												{checked}
												disabled={!checked && atProjectLimit}
												onchange={(event) =>
													toggleProject(
														project.id,
														event.currentTarget.checked
													)}
												class="rounded border-border"
											/>
											<span class="truncate">{project.name}</span>
										</label>
									</li>
								{/each}
							</ul>
						{/if}
					</fieldset>
					<Button
						type="submit"
						variant="accent"
						loading={startPending}
						disabled={startPending || selectedProjectIds.length === 0}
					>
						Scan last 30 days
					</Button>
				</form>
			</details>
		{/if}
	</section>

	{#if form?.kind === 'error'}
		<section
			class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
			aria-live="polite"
		>
			{actionErrorMessage}
		</section>
	{:else if form?.kind === 'prepared'}
		<section
			class="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-foreground"
			aria-live="polite"
		>
			Your suggestion set is ready. Open the first email when you're ready to review.
		</section>
	{:else if adjudicated}
		<section
			class="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground"
			aria-live="polite"
		>
			<strong>Answer saved.</strong>
			<span class="ml-1 text-muted-foreground">
				{reviewFinished ? 'The review is complete.' : 'The next suggestion is ready below.'}
			</span>
		</section>
	{/if}

	{#if hasCompletedScan}
		{#if data.runs.length > 1}
			<form
				method="GET"
				class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-ink sm:flex-row sm:items-end"
			>
				<label class="flex-1 text-sm font-medium text-foreground">
					Review scan
					<select
						name="run_id"
						class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm"
					>
						{#each data.runs as run (run.id)}
							<option value={run.id} selected={run.id === data.selected_run_id}>
								{run.label} · {new Date(run.created_at).toLocaleString()}
							</option>
						{/each}
					</select>
				</label>
				<Button type="submit" variant="secondary" size="sm">Load</Button>
			</form>
		{/if}

		{#if data.selected_run_id && data.queue.length === 0}
			<!-- Step 2: prepare -->
			<form
				method="POST"
				action={reviewAction('prepare', data.selected_run_id)}
				class="rounded-lg border border-accent/30 bg-accent/10 p-5"
			>
				<input type="hidden" name="run_id" value={data.selected_run_id} />
				<h2 class="text-lg font-semibold text-foreground">2. Prepare 20 suggestions</h2>
				<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
					BuildOS picks 20 of its guesses from the scan for you to check. This doesn't
					contact Gmail again.
				</p>
				<Button type="submit" variant="accent" class="mt-4">Prepare suggestions</Button>
			</form>
		{:else if quickQueue.length > 0}
			<!-- Step 3: review -->
			<section class="rounded-lg border border-border bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="text-lg font-semibold text-foreground">3. Review</h2>
						<p class="stamp mt-1 text-3xl font-semibold text-foreground">
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
			<section class="rounded-lg border border-border bg-card p-6 shadow-ink">
				<h2 class="font-semibold text-foreground">No candidate suggestions found</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					The scan finished, but neither matcher linked any of the sampled emails to a
					project. Try a scan with different projects.
				</p>
			</section>
		{/if}

		{#if opened && data.selected_run_id}
			<section class="space-y-5 rounded-lg border border-accent/30 bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="micro-label text-accent">Suggested project</p>
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

				<div class="space-y-3 rounded-lg bg-muted/60 p-4">
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
							class="tx-button tx-button-success min-h-12 w-full rounded-lg bg-success px-4 py-3 text-sm font-semibold text-white"
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
							class="min-h-12 w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
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
							class="min-h-12 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground"
						>
							Not sure
						</button>
					</form>
				</div>

				{#if alternativeProjects.length > 0}
					<details class="rounded-lg border border-border bg-background p-4">
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
									class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm"
								>
									<option value="">Choose a project</option>
									{#each alternativeProjects as project (project.id)}
										<option value={project.id}>{project.label}</option>
									{/each}
								</select>
							</label>
							<Button type="submit" variant="secondary" class="self-end">
								Save different project
							</Button>
						</form>
					</details>
				{:else}
					<p
						class="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground"
					>
						No other projects were included in this scan.
					</p>
				{/if}
			</section>
		{:else if data.selected_run_id && nextSample}
			<section class="rounded-lg border border-accent/30 bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-start justify-between gap-5">
					<div class="max-w-2xl space-y-2">
						<p class="micro-label text-accent">
							Suggestion {nextSample.quick_review_order} of {quickQueue.length}
						</p>
						<h2 class="text-xl font-semibold text-foreground">
							We think this email belongs to {nextSample.project_label}
						</h2>
						<p class="text-sm leading-6 text-muted-foreground">
							{nextSample.account_label}. Open the preview to see the subject, date,
							participants, and snippet, then say whether the match is right.
						</p>
					</div>
					<form method="POST" action={reviewAction('open', data.selected_run_id)}>
						<input type="hidden" name="run_id" value={data.selected_run_id} />
						<input type="hidden" name="sample_id" value={nextSample.id} />
						<Button type="submit" variant="accent">Show email and choices</Button>
					</form>
				</div>
			</section>
		{:else if reviewFinished}
			<section class="rounded-lg border border-success/30 bg-success/10 p-6 text-center">
				{#if expiredCount === 0}
					<h2 class="text-xl font-semibold text-foreground">
						{reviewedCount} suggestion{reviewedCount === 1 ? '' : 's'} reviewed
					</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						That's enough for a first read. BuildOS won't scan again on its own.
					</p>
				{:else}
					<h2 class="text-xl font-semibold text-foreground">Review window finished</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						{reviewedCount} answer{reviewedCount === 1 ? '' : 's'} saved; {expiredCount}
						suggestion{expiredCount === 1 ? '' : 's'} expired before review. BuildOS won't
						scan again on its own.
					</p>
				{/if}
			</section>
		{/if}

		{#if scorecard.answered > 0}
			<section
				class="space-y-4 rounded-lg border border-border bg-card p-5 shadow-ink"
				aria-labelledby="scorecard-heading"
			>
				<div class="flex flex-wrap items-baseline justify-between gap-3">
					<h2 id="scorecard-heading" class="text-lg font-semibold text-foreground">
						{reviewFinished ? 'Results' : 'Results so far'}
					</h2>
					<p class="stamp text-sm text-muted-foreground">
						Right {scorecard.right} of {scorecard.answered}
					</p>
				</div>
				<dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{#each [{ label: 'Right project', value: scorecard.right, tone: 'text-success' }, { label: 'Wrong project', value: scorecard.wrongProject, tone: 'text-warning' }, { label: 'Unrelated', value: scorecard.unrelated, tone: 'text-destructive' }, { label: 'Not sure', value: scorecard.unsure, tone: 'text-muted-foreground' }] as tile (tile.label)}
						<div class="rounded-lg border border-border bg-background p-3">
							<dt class="micro-label text-muted-foreground">{tile.label}</dt>
							<dd class="stamp mt-1 text-2xl font-semibold {tile.tone}">
								{tile.value}
							</dd>
						</div>
					{/each}
				</dl>
				{#if scorecard.projects.length > 0}
					<div>
						<p class="micro-label text-muted-foreground">By project</p>
						<ul class="mt-2 divide-y divide-border rounded-lg border border-border">
							{#each scorecard.projects as project (project.label)}
								<li
									class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
								>
									<span class="min-w-0 truncate text-foreground"
										>{project.label}</span
									>
									<span class="stamp shrink-0 text-muted-foreground">
										{project.right} / {project.answered} right
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if data.metrics && (percent(data.metrics.variant_a.precision) || percent(data.metrics.variant_b.precision))}
					<div class="rounded-lg border border-border bg-background p-3 text-sm">
						<p class="micro-label text-muted-foreground">Which matcher did better</p>
						<ul class="mt-2 space-y-1 text-foreground">
							<li>
								Strict (people, domains, file names, IDs):
								<span class="stamp font-semibold"
									>{percent(data.metrics.variant_a.precision) ?? '—'}</span
								> of its guesses right
							</li>
							<li>
								Broad (also matches words from the project):
								<span class="stamp font-semibold"
									>{percent(data.metrics.variant_b.precision) ?? '—'}</span
								> of its guesses right
							</li>
						</ul>
						<p class="mt-2 text-xs text-muted-foreground">
							Estimated from your answers, so early numbers move a lot.
						</p>
					</div>
				{/if}
			</section>
		{/if}
	{/if}

	<p class="text-xs text-muted-foreground">
		Read-only. Email bodies and attachments are never read. A scan keeps only encrypted email
		IDs, dates, and match scores, deleted within 7 days; an email's subject, snippet, and
		participants are fetched again only when you open it.
	</p>
</div>
