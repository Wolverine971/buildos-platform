<!-- apps/web/src/routes/admin/email-sequences/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		CheckCircle2,
		Clock3,
		Edit3,
		Eye,
		Mail,
		RefreshCw,
		RotateCcw,
		TriangleAlert,
		Users
	} from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	type SequenceKey = 'buildos_reactivation_founder_pilot' | 'buildos_welcome';

	type CopyOption = {
		sequenceKey: SequenceKey;
		stepKey: string;
		variantKey: string;
		sequencePosition: number;
		stepLabel: string;
		triggerLabel: string;
		triggerDetail: string;
		label: string;
		description: string;
		status: 'source' | 'override';
		subject: string;
		body: string;
		sourceSubject: string;
		sourceBody: string;
		previewHtml: string;
		ctaLabel: string | null;
		ctaUrl: string | null;
		updatedAt: string | null;
	};

	type CopyGroup = {
		stepKey: string;
		sequencePosition: number;
		stepLabel: string;
		triggerLabel: string;
		triggerDetail: string;
		options: CopyOption[];
	};

	type RecipientRow = {
		email: string;
		name: string | null;
		userId: string;
		status: string;
		stepKey: string | null;
		variantKey: string | null;
		nextSendAt: string | null;
		dueLabel: string;
		batchId: string | null;
		reason: string;
	};

	type CohortOption = {
		campaignId: string;
		cohortId: string;
		cohortFrozenAt: string;
		total: number;
		sendable: number;
		holdout: number;
		batches: string[];
	};

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	const selectedSequenceKey = $derived(data.selectedSequenceKey as SequenceKey);
	const selectedCopy = $derived((data.selectedCopy ?? null) as CopyOption | null);
	const copyOptions = $derived((data.copyOptions ?? []) as CopyOption[]);
	const groupedCopyOptions = $derived(groupCopyOptions(copyOptions));
	const selectedCopyParam = $derived($page.url.searchParams.get('copy'));
	const recipients = $derived(
		selectedSequenceKey === 'buildos_welcome'
			? ((data.welcome?.recipients ?? []) as RecipientRow[])
			: ((data.reactivation?.recipients ?? []) as RecipientRow[])
	);
	const selectedCohortBatches = $derived(
		(((data.reactivation?.cohortOptions ?? []) as CohortOption[]).find(
			(cohort) => cohort.cohortId === data.reactivation?.selectedCohortId
		)?.batches ?? []) as string[]
	);

	let copyModalOpen = $state(false);
	let activeCopyKey = $state<string | null>(selectedCopyParam);
	const modalCopy = $derived.by(() => {
		const key = activeCopyKey ?? selectedCopyParam;
		if (!key) {
			return selectedCopy;
		}

		return copyOptions.find((option) => copyKey(option) === key) ?? selectedCopy;
	});

	$effect(() => {
		if (selectedCopyParam) {
			activeCopyKey = selectedCopyParam;
			copyModalOpen = true;
		}
	});

	function groupCopyOptions(options: CopyOption[]): CopyGroup[] {
		const groups = new Map<string, CopyGroup>();

		for (const option of options) {
			const current =
				groups.get(option.stepKey) ??
				({
					stepKey: option.stepKey,
					sequencePosition: option.sequencePosition,
					stepLabel: option.stepLabel,
					triggerLabel: option.triggerLabel,
					triggerDetail: option.triggerDetail,
					options: []
				} satisfies CopyGroup);

			current.options.push(option);
			groups.set(option.stepKey, current);
		}

		return Array.from(groups.values()).sort(
			(left, right) => left.sequencePosition - right.sequencePosition
		);
	}

	function copyKey(option: CopyOption): string {
		return `${option.stepKey}:${option.variantKey}`;
	}

	function formatDate(value: string | null): string {
		if (!value) {
			return 'Manual';
		}

		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) {
			return value;
		}

		return new Date(parsed).toLocaleString();
	}

	function copyHref(option: CopyOption): string {
		const params = new URLSearchParams();
		params.set('sequence', selectedSequenceKey);
		params.set('copy', copyKey(option));

		if (data.reactivation?.selectedCampaignId) {
			params.set('campaign_id', data.reactivation.selectedCampaignId);
		}
		if (data.reactivation?.selectedCohortId) {
			params.set('cohort_id', data.reactivation.selectedCohortId);
		}
		if (data.reactivation?.selectedBatchId) {
			params.set('batch_id', data.reactivation.selectedBatchId);
		}

		return `/admin/email-sequences?${params.toString()}`;
	}

	function copyActionHref(actionName: 'saveCopy' | 'clearCopy', option: CopyOption): string {
		const href = copyHref(option);
		const query = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
		return `?/${actionName}${query ? `&${query}` : ''}`;
	}

	function openCopyModal(event: MouseEvent, option: CopyOption): void {
		event.preventDefault();
		activeCopyKey = copyKey(option);
		copyModalOpen = true;
		void goto(copyHref(option), { noScroll: true, keepFocus: true });
	}

	function closeCopyModal(): void {
		copyModalOpen = false;
		activeCopyKey = null;

		const url = new URL($page.url);
		url.searchParams.delete('copy');
		void goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function variantLabel(option: CopyOption): string {
		return option.variantKey.replaceAll('_', ' ');
	}

	function isActiveCopy(option: CopyOption): boolean {
		return Boolean(copyModalOpen && modalCopy && copyKey(option) === copyKey(modalCopy));
	}

	function statusClasses(status: string): string {
		if (status === 'override' || status === 'ready' || status === 'active') {
			return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		}
		if (status === 'waiting' || status === 'paused' || status === 'processing') {
			return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
		}
		return 'bg-muted text-muted-foreground';
	}
</script>

<div class="admin-page space-y-6">
	<AdminPageHeader
		title="Email Sequences"
		description="Sequence copy, previews, recipients, and send timing for lifecycle and reactivation flows."
		icon={Mail}
	/>

	{#if form?.error}
		<AdminCard tone="danger" padding="sm">
			<div class="flex items-start gap-3 text-sm text-destructive">
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
				<p>{form.error}</p>
			</div>
		</AdminCard>
	{:else if form?.success}
		<AdminCard tone="success" padding="sm">
			<div class="flex items-start gap-3 text-sm text-emerald-800">
				<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" />
				<p>{form.message}</p>
			</div>
		</AdminCard>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#each data.sequences as sequence}
			<a
				href={`/admin/email-sequences?sequence=${sequence.key}`}
				class="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors {selectedSequenceKey ===
				sequence.key
					? 'border-accent bg-accent text-accent-foreground'
					: 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}"
			>
				<Mail class="h-4 w-4" />
				{sequence.label}
			</a>
		{/each}
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<AdminCard tone="muted" padding="md">
			<div class="flex items-center gap-2">
				<Edit3 class="h-4 w-4 text-muted-foreground" />
				<p class="text-sm font-medium text-muted-foreground">Copy Variants</p>
			</div>
			<p class="mt-2 text-3xl font-bold text-foreground">{copyOptions.length}</p>
		</AdminCard>
		<AdminCard tone="info" padding="md">
			<div class="flex items-center gap-2">
				<Users class="h-4 w-4 text-sky-700" />
				<p class="text-sm font-medium text-muted-foreground">Upcoming Recipients</p>
			</div>
			<p class="mt-2 text-3xl font-bold text-foreground">{recipients.length}</p>
		</AdminCard>
		<AdminCard tone="success" padding="md">
			<div class="flex items-center gap-2">
				<Clock3 class="h-4 w-4 text-emerald-700" />
				<p class="text-sm font-medium text-muted-foreground">Ready Now</p>
			</div>
			<p class="mt-2 text-3xl font-bold text-foreground">
				{recipients.filter((row) => row.status === 'ready' || row.status === 'active')
					.length}
			</p>
		</AdminCard>
	</div>

	{#if selectedSequenceKey === 'buildos_reactivation_founder_pilot'}
		<AdminCard padding="md">
			<form method="GET" class="grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_auto] lg:items-end">
				<input type="hidden" name="sequence" value="buildos_reactivation_founder_pilot" />
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Cohort</span>
					<select
						name="cohort_id"
						class="h-10 rounded-md border border-border bg-background px-3 text-sm"
					>
						{#each data.reactivation?.cohortOptions ?? [] as cohort}
							<option
								value={cohort.cohortId}
								selected={cohort.cohortId === data.reactivation?.selectedCohortId}
							>
								{cohort.cohortId} ({cohort.sendable} sendable / {cohort.holdout} holdout)
							</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Campaign</span>
					<input
						name="campaign_id"
						value={data.reactivation?.selectedCampaignId}
						class="h-10 rounded-md border border-border bg-background px-3 text-sm"
					/>
				</label>
				<label class="grid gap-1 text-sm font-medium text-foreground">
					<span>Batch</span>
					<select
						name="batch_id"
						class="h-10 rounded-md border border-border bg-background px-3 text-sm"
					>
						<option value="" selected={!data.reactivation?.selectedBatchId}
							>All batches</option
						>
						{#each selectedCohortBatches as batch}
							<option
								value={batch}
								selected={batch === data.reactivation?.selectedBatchId}
								>{batch}</option
							>
						{/each}
					</select>
				</label>
				<button
					type="submit"
					class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					<RefreshCw class="h-4 w-4" />
					Load
				</button>
			</form>

			{#if data.reactivation?.error}
				<div
					class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{data.reactivation.error}
				</div>
			{/if}
		</AdminCard>
	{/if}

	<AdminCard padding="none" class="overflow-hidden">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">Sequence Map</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Variants are grouped under the step that sends them. Source copy is the fallback;
				overrides are used by send paths.
			</p>
		</div>
		<div class="divide-y divide-border">
			{#each groupedCopyOptions as group}
				<section class="grid gap-4 px-4 py-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
					<div class="min-w-0">
						<div class="flex items-center gap-3">
							<span
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background"
							>
								{group.sequencePosition}
							</span>
							<div class="min-w-0">
								<h3 class="text-sm font-semibold text-foreground">
									{group.stepLabel}
								</h3>
								<p class="text-xs text-muted-foreground">{group.stepKey}</p>
							</div>
						</div>
						<div class="mt-3 flex items-start gap-2 text-xs text-foreground">
							<Clock3 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<p class="font-medium">{group.triggerLabel}</p>
						</div>
						<p class="mt-1 pl-5 text-xs leading-relaxed text-muted-foreground">
							{group.triggerDetail}
						</p>
					</div>
					<div class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
						{#each group.options as option}
							<a
								href={copyHref(option)}
								onclick={(event) => openCopyModal(event, option)}
								class="block rounded-lg border px-3 py-3 transition-colors {isActiveCopy(
									option
								)
									? 'border-accent bg-accent/10'
									: 'border-border bg-background hover:bg-muted/60'}"
							>
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p
											class="truncate text-sm font-semibold capitalize text-foreground"
										>
											{variantLabel(option)}
										</p>
										<p
											class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
										>
											{option.description}
										</p>
									</div>
									<span
										class="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold uppercase {statusClasses(
											option.status
										)}"
									>
										{option.status}
									</span>
								</div>
								<p class="mt-3 line-clamp-2 text-sm font-medium text-foreground">
									{option.subject}
								</p>
							</a>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</AdminCard>

	<AdminCard padding="none" class="overflow-hidden">
		<div class="border-b border-border px-4 py-3">
			<h2 class="text-base font-semibold text-foreground">Recipients And Timing</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Upcoming rows based on the selected sequence and current queue/cohort state.
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-border text-sm">
				<thead class="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
					<tr>
						<th class="px-4 py-3 font-semibold">Recipient</th>
						<th class="px-4 py-3 font-semibold">Next Email</th>
						<th class="px-4 py-3 font-semibold">When</th>
						<th class="px-4 py-3 font-semibold">Status</th>
						<th class="px-4 py-3 font-semibold">Reason</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each recipients as recipient}
						<tr>
							<td class="px-4 py-3">
								<p class="font-medium text-foreground">{recipient.email}</p>
								{#if recipient.name || recipient.batchId}
									<p class="mt-1 text-xs text-muted-foreground">
										{recipient.name ?? recipient.batchId}
										{#if recipient.name && recipient.batchId}
											· {recipient.batchId}{/if}
									</p>
								{/if}
							</td>
							<td class="px-4 py-3 text-muted-foreground">
								{recipient.stepKey ?? 'none'}
								{#if recipient.variantKey}
									<span class="block text-xs">{recipient.variantKey}</span>
								{/if}
							</td>
							<td class="px-4 py-3">
								<p class="text-foreground">{formatDate(recipient.nextSendAt)}</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{recipient.dueLabel}
								</p>
							</td>
							<td class="px-4 py-3">
								<span
									class="rounded-md px-2 py-1 text-xs font-semibold {statusClasses(
										recipient.status
									)}"
								>
									{recipient.status}
								</span>
							</td>
							<td class="max-w-md px-4 py-3 text-muted-foreground">
								{recipient.reason}
							</td>
						</tr>
					{:else}
						<tr>
							<td
								colspan="5"
								class="px-4 py-8 text-center text-sm text-muted-foreground"
							>
								No upcoming recipients for this selection.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</div>

<Modal
	bind:isOpen={copyModalOpen}
	title={modalCopy ? `${modalCopy.stepLabel}: ${variantLabel(modalCopy)}` : 'Email Copy'}
	size="xl"
	customClasses="!max-w-[92rem] sm:!max-h-[92dvh]"
	onClose={closeCopyModal}
>
	{#if modalCopy}
		<div class="space-y-4 p-4 sm:p-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="rounded-md px-2 py-1 text-[11px] font-semibold uppercase {statusClasses(
								modalCopy.status
							)}"
						>
							{modalCopy.status}
						</span>
						<span class="text-sm font-medium text-muted-foreground">
							{modalCopy.stepKey} / {modalCopy.variantKey}
						</span>
					</div>
					<div
						class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
					>
						<span class="inline-flex items-center gap-1.5">
							<Clock3 class="h-4 w-4" />
							{modalCopy.triggerLabel}
						</span>
						<span>{modalCopy.description}</span>
					</div>
				</div>
				{#if modalCopy.updatedAt}
					<p class="text-xs text-muted-foreground">
						Updated {formatDate(modalCopy.updatedAt)}
					</p>
				{/if}
			</div>

			{#if form?.error}
				<div
					class="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				>
					<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
					<p>{form.error}</p>
				</div>
			{:else if form?.success}
				<div
					class="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800"
				>
					<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" />
					<p>{form.message}</p>
				</div>
			{/if}

			<div class="grid gap-4 xl:grid-cols-2">
				<div class="rounded-lg border border-border bg-card">
					<div class="border-b border-border px-4 py-3">
						<p class="text-xs font-semibold uppercase text-muted-foreground">
							Editable Copy
						</p>
					</div>
					<div class="p-4">
						<form method="POST" class="grid gap-4">
							<input
								type="hidden"
								name="sequence_key"
								value={modalCopy.sequenceKey}
							/>
							<input type="hidden" name="step_key" value={modalCopy.stepKey} />
							<input type="hidden" name="variant_key" value={modalCopy.variantKey} />
							<label class="grid gap-1 text-sm font-medium text-foreground">
								<span>Subject</span>
								<input
									name="subject"
									value={modalCopy.subject}
									required
									class="h-11 rounded-md border border-border bg-background px-3 text-sm"
								/>
							</label>
							<label class="grid gap-1 text-sm font-medium text-foreground">
								<span>Body</span>
								<textarea
									name="body"
									required
									rows="24"
									class="min-h-[520px] rounded-md border border-border bg-background px-3 py-3 font-mono text-xs leading-relaxed"
									value={modalCopy.body}
								></textarea>
							</label>
							<div class="rounded-md border border-border bg-muted/40 p-3">
								<p
									class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>
									Available tokens
								</p>
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each data.tokens as token}
										<code
											class="rounded bg-background px-2 py-1 text-[11px] text-foreground"
										>
											{token}
										</code>
									{/each}
								</div>
							</div>
							<div class="flex flex-wrap gap-2">
								<button
									type="submit"
									formaction={copyActionHref('saveCopy', modalCopy)}
									class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
								>
									<CheckCircle2 class="h-4 w-4" />
									Save Copy
								</button>
							</div>
						</form>

						{#if modalCopy.status === 'override'}
							<form method="POST" class="mt-3">
								<input
									type="hidden"
									name="sequence_key"
									value={modalCopy.sequenceKey}
								/>
								<input type="hidden" name="step_key" value={modalCopy.stepKey} />
								<input
									type="hidden"
									name="variant_key"
									value={modalCopy.variantKey}
								/>
								<button
									type="submit"
									formaction={copyActionHref('clearCopy', modalCopy)}
									class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
								>
									<RotateCcw class="h-4 w-4" />
									Restore Source Copy
								</button>
							</form>
						{/if}

						<details class="mt-4 rounded-md border border-border bg-muted/40 p-3">
							<summary
								class="cursor-pointer text-xs font-semibold uppercase text-muted-foreground"
							>
								Source Copy Reference
							</summary>
							<p class="mt-3 text-xs font-semibold uppercase text-muted-foreground">
								Subject
							</p>
							<p
								class="mt-1 rounded-md border border-border bg-background p-3 text-sm text-foreground"
							>
								{modalCopy.sourceSubject}
							</p>
							<p class="mt-4 text-xs font-semibold uppercase text-muted-foreground">
								Body
							</p>
							<pre
								class="mt-1 max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">{modalCopy.sourceBody}</pre>
						</details>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-card">
					<div
						class="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
					>
						<div class="flex items-center gap-2">
							<Eye class="h-4 w-4 text-muted-foreground" />
							<p class="text-xs font-semibold uppercase text-muted-foreground">
								Polished Preview
							</p>
						</div>
						<p class="text-xs text-muted-foreground">{modalCopy.triggerLabel}</p>
					</div>
					<div class="p-4">
						<iframe
							title="Email copy preview"
							srcdoc={modalCopy.previewHtml}
							class="h-[760px] w-full rounded-md border border-border bg-white"
						></iframe>
					</div>
				</div>
			</div>
		</div>
	{/if}
</Modal>
