<!-- apps/web/src/routes/admin/jobs/+page.svelte -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData } from './$types';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { ChevronDown, CircleCheck, RotateCcw, TriangleAlert } from '$lib/icons/lucide';
	import { MAX_REQUEUE_JOB_IDS } from '$lib/services/admin/failed-jobs/failed-jobs';

	let { data }: { data: PageData } = $props();

	type Group = PageData['groups'][number];
	type RunResult = { requeued: number; alreadyMovedOn: number; notAllowed: number };

	/** How many jobs an opened group lists before "Show all". */
	const JOBS_SHOWN_AT_FIRST = 25;

	const openGroups = new SvelteSet<string>();
	const fullyListedGroups = new SvelteSet<string>();

	// One run at a time: the key of the group ("group:<type>") or the job id being run.
	let runningKey = $state<string | null>(null);
	let groupToConfirm = $state<Group | null>(null);
	let confirmOpen = $state(false);
	let lastRun = $state<RunResult | null>(null);

	function hrefWith(changes: Record<string, string | number | null>): string {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, String(value));
		}
		const query = params.toString();
		return `/admin/jobs${query ? `?${query}` : ''}`;
	}

	const timeFormat = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	function when(iso: string): string {
		return timeFormat.format(new Date(iso));
	}

	function jobCount(count: number): string {
		return count === 1 ? '1 job' : `${count} jobs`;
	}

	function toggleGroup(jobType: string) {
		if (openGroups.has(jobType)) openGroups.delete(jobType);
		else openGroups.add(jobType);
	}

	function askToRunGroup(group: Group) {
		if (runningKey || group.rerunnableIds.length === 0) return;
		groupToConfirm = group;
		confirmOpen = true;
	}

	function closeConfirm() {
		// The group stays set so the window keeps its wording while it closes.
		confirmOpen = false;
	}

	async function confirmRunGroup() {
		const group = groupToConfirm;
		closeConfirm();
		if (group) await runAgain(group.rerunnableIds, `group:${group.jobType}`);
	}

	async function runAgain(jobIds: string[], key: string) {
		if (runningKey || jobIds.length === 0) return;
		runningKey = key;
		const totals: RunResult = { requeued: 0, alreadyMovedOn: 0, notAllowed: 0 };
		let sent = false;
		try {
			for (let start = 0; start < jobIds.length; start += MAX_REQUEUE_JOB_IDS) {
				const response = await fetch('/api/admin/jobs/requeue', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jobIds: jobIds.slice(start, start + MAX_REQUEUE_JOB_IDS)
					})
				});
				const result = await response.json().catch(() => null);
				if (!response.ok || !result?.success) {
					throw new Error(result?.error ?? 'The request did not go through.');
				}
				sent = true;
				totals.requeued += Number(result.data?.requeued ?? 0);
				totals.alreadyMovedOn += Number(result.data?.alreadyMovedOn ?? 0);
				totals.notAllowed += Number(result.data?.notAllowed ?? 0);
			}
			if (totals.requeued > 0) {
				toastService.success(
					`${jobCount(totals.requeued)} back in the queue. ${totals.requeued === 1 ? 'It starts' : 'They start'} within a few seconds.`
				);
			} else {
				toastService.warning('Nothing was run again. Those jobs had already moved on.');
			}
		} catch (error) {
			console.error('Failed to run jobs again:', error);
			toastService.error(
				error instanceof Error && error.message
					? `Could not run again: ${error.message}`
					: 'Could not run again. Please try again.'
			);
		} finally {
			// Reload even after a partial failure, so the list matches the queue.
			if (sent) {
				lastRun = totals;
				await invalidateAll();
			}
			runningKey = null;
		}
	}
</script>

<svelte:head>
	<title>Failed Jobs · Admin</title>
</svelte:head>

<div class="space-y-6">
	<AdminPageHeader
		title="Failed Jobs"
		description="Background work that gave up after its retries, such as during a provider outage. See what failed and run the safe ones again."
		icon={RotateCcw}
	/>

	<!-- The answer: did anything fail? -->
	<section
		class="rounded-xl border border-border bg-card p-5 shadow-ink tx {data.answer.failed
			? 'tx-static'
			: 'tx-frame'} tx-weak"
		aria-live="polite"
	>
		<div class="flex items-start gap-3">
			{#if data.answer.failed}
				<TriangleAlert class="mt-1 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
			{:else}
				<CircleCheck class="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
			{/if}
			<div class="min-w-0">
				<h2 class="text-xl font-semibold leading-snug text-foreground">
					{data.answer.headline}
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">{data.answer.detail}</p>
				{#if data.truncated}
					<p class="mt-2 text-sm text-muted-foreground">
						Showing the newest failures only. Pick a shorter window to see every one.
					</p>
				{/if}
			</div>
		</div>
	</section>

	{#if lastRun}
		<div
			class="rounded-xl border border-border bg-card p-4 text-sm shadow-ink tx tx-grain tx-weak"
			role="status"
		>
			{#if lastRun.requeued > 0}
				<p class="font-medium text-foreground">
					{jobCount(lastRun.requeued)}
					{lastRun.requeued === 1 ? 'is' : 'are'} back in the queue.
				</p>
				<p class="mt-1 text-muted-foreground">
					{lastRun.requeued === 1 ? 'It starts' : 'They start'} within a few seconds with a
					fresh set of tries. Anything that fails again comes back to this page.
				</p>
			{:else}
				<p class="font-medium text-foreground">Nothing was run again.</p>
			{/if}
			{#if lastRun.alreadyMovedOn > 0}
				<p class="mt-1 text-muted-foreground">
					{jobCount(lastRun.alreadyMovedOn)} left alone: already queued again, or no longer
					failed.
				</p>
			{/if}
			{#if lastRun.notAllowed > 0}
				<p class="mt-1 text-muted-foreground">
					{jobCount(lastRun.notAllowed)} left alone: not safe to run a second time.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Window and test-account filter -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
		<div
			class="inline-flex rounded-lg border border-border bg-card p-0.5"
			role="group"
			aria-label="Time window"
		>
			{#each data.dayChoices as days (days)}
				<a
					href={hrefWith({ days: days === 1 ? null : days })}
					aria-current={data.days === days ? 'page' : undefined}
					class="rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {data.days ===
					days
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					>{days === 1 ? 'Last 24 hours' : `${days} days`}</a
				>
			{/each}
		</div>
		<label class="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
			<input
				type="checkbox"
				class="h-4 w-4 rounded border-border-strong text-accent focus-visible:ring-2 focus-visible:ring-ring"
				checked={data.includeTestAccounts}
				onchange={(event) =>
					goto(hrefWith({ test: event.currentTarget.checked ? '1' : null }), {
						keepFocus: true,
						noScroll: true
					})}
			/>
			<span>
				Show test account jobs
				{#if data.hiddenTestJobs > 0}
					<span class="text-muted-foreground">({data.hiddenTestJobs} hidden)</span>
				{/if}
			</span>
		</label>
	</div>

	<!-- Failed jobs by type -->
	{#if data.groups.length}
		<div class="space-y-4">
			{#each data.groups as group (group.jobType)}
				{@const open = openGroups.has(group.jobType)}
				{@const listAll = fullyListedGroups.has(group.jobType)}
				{@const shownJobs = listAll ? group.jobs : group.jobs.slice(0, JOBS_SHOWN_AT_FIRST)}
				{@const mixed =
					group.rerunnableIds.length > 0 && group.rerunnableIds.length < group.count}
				<ErrorBoundary area="admin-failed-jobs-group" context={{ jobType: group.jobType }}>
					<section class="rounded-xl border border-border bg-card shadow-ink">
						<div
							class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
						>
							<button
								type="button"
								class="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-expanded={open}
								aria-controls="jobs-{group.jobType}"
								onclick={() => toggleGroup(group.jobType)}
							>
								<ChevronDown
									class="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {open
										? ''
										: '-rotate-90'}"
									aria-hidden="true"
								/>
								<span class="min-w-0 flex-1">
									<span class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
										<span class="text-base font-semibold text-foreground"
											>{group.label}</span
										>
										<span
											class="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
											>{group.count} failed</span
										>
									</span>
									<span class="mt-0.5 block text-2xs text-muted-foreground stamp"
										>{group.jobType}</span
									>
									<span class="mt-2 block text-sm text-muted-foreground">
										{#if group.count === 1}
											Failed <time datetime={group.lastFailedAt}
												>{when(group.lastFailedAt)}</time
											>
										{:else}
											First failed <time datetime={group.firstFailedAt}
												>{when(group.firstFailedAt)}</time
											>
											· last failed
											<time datetime={group.lastFailedAt}
												>{when(group.lastFailedAt)}</time
											>
										{/if}
									</span>
									{#if group.topError}
										<span class="mt-2 block text-sm text-foreground">
											<span class="micro-label mr-1"
												>{group.count === 1
													? 'Error'
													: `Most common error (${group.topError.count} of ${group.count})`}</span
											>
											<span class="line-clamp-3 break-words"
												>{group.topError.message}</span
											>
										</span>
									{/if}
									<span class="mt-2 block text-xs text-accent">
										{open ? 'Hide' : 'Show'}
										{group.count === 1 ? 'the job' : `all ${group.count} jobs`}
									</span>
								</span>
							</button>
							{#if group.rerunnableIds.length > 0}
								<Button
									variant="primary"
									size="sm"
									icon={RotateCcw}
									class="w-full shrink-0 sm:w-auto"
									loading={runningKey === `group:${group.jobType}`}
									disabled={runningKey !== null}
									onclick={() => askToRunGroup(group)}
								>
									{group.rerunnableIds.length === 1
										? 'Run again'
										: `Run ${group.rerunnableIds.length} again`}
								</Button>
							{/if}
						</div>

						{#if group.blockedMessage}
							<p
								class="border-t border-border px-4 py-3 text-sm text-muted-foreground"
							>
								{group.blockedMessage}
							</p>
						{/if}

						<div id="jobs-{group.jobType}" hidden={!open}>
							{#if open}
								<ul class="divide-y divide-border border-t border-border">
									{#each shownJobs as job (job.id)}
										<li
											class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
										>
											<div
												class="shrink-0 text-xs text-muted-foreground sm:w-44"
											>
												<time
													class="block font-medium text-foreground stamp"
													datetime={job.failedAt}
													>{when(job.failedAt)}</time
												>
												<span class="block truncate"
													>{job.userEmail ?? 'No owner on record'}</span
												>
												{#if job.isTestAccount}
													<span
														class="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-2xs"
														>Test account</span
													>
												{/if}
											</div>
											<div class="min-w-0 flex-1">
												<p class="break-words text-sm text-foreground">
													{job.errorMessage}
												</p>
												{#if mixed && job.blockedMessage}
													<p class="mt-1 text-xs text-muted-foreground">
														{job.blockedMessage}
													</p>
												{/if}
											</div>
											{#if job.canRerun}
												<Button
													variant="outline"
													size="sm"
													icon={RotateCcw}
													class="w-full shrink-0 sm:w-auto"
													loading={runningKey === job.id}
													disabled={runningKey !== null}
													onclick={() => runAgain([job.id], job.id)}
												>
													Run again
												</Button>
											{/if}
										</li>
									{/each}
								</ul>
								{#if !listAll && group.jobs.length > JOBS_SHOWN_AT_FIRST}
									<div class="border-t border-border px-4 py-3">
										<button
											type="button"
											class="text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											onclick={() => fullyListedGroups.add(group.jobType)}
										>
											Show all {group.jobs.length} jobs
										</button>
									</div>
								{/if}
							{/if}
						</div>
					</section>
				</ErrorBoundary>
			{/each}
		</div>
	{:else if data.hiddenTestJobs > 0}
		<p class="px-4 py-6 text-center text-sm text-muted-foreground">
			The only failures in this window belong to the test account.
			<a href={hrefWith({ test: '1' })} class="text-accent underline-offset-4 hover:underline"
				>Show them</a
			>
		</p>
	{/if}
</div>

<ConfirmationModal
	bind:isOpen={confirmOpen}
	title={groupToConfirm
		? `Run ${jobCount(groupToConfirm.rerunnableIds.length)} again?`
		: 'Run again?'}
	confirmText="Run again"
	confirmVariant="primary"
	icon="info"
	onconfirm={confirmRunGroup}
	oncancel={closeConfirm}
>
	{#snippet content()}
		{#if groupToConfirm}
			<p class="text-sm text-muted-foreground">
				{groupToConfirm.rerunnableIds.length === 1
					? 'This job goes'
					: `These ${groupToConfirm.rerunnableIds.length} jobs go`} back in the queue under
				<span class="font-medium text-foreground">{groupToConfirm.label}</span> and
				{groupToConfirm.rerunnableIds.length === 1 ? 'starts' : 'start'} within a few seconds.
				Running {groupToConfirm.rerunnableIds.length === 1 ? 'it' : 'them'} twice is safe.
			</p>
		{/if}
	{/snippet}
</ConfirmationModal>
