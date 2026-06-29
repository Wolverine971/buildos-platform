<!-- apps/web/src/routes/admin/ontology/public-pages/+page.svelte -->
<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Globe, ShieldAlert, CheckCircle2 } from 'lucide-svelte';

	let { data, form }: { data: PageData; form?: ActionData } = $props();
	let reviewFilter = $state<'all' | 'flagged'>('all');

	const filteredReviews = $derived.by(() =>
		reviewFilter === 'flagged'
			? data.reviews.filter((review) => review.status === 'flagged')
			: data.reviews
	);

	function formatDate(value: string | null | undefined): string {
		if (!value) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		return date.toLocaleString();
	}

	function statusTone(status: string): string {
		if (status === 'flagged') return 'text-destructive bg-destructive/10 border-destructive/30';
		if (status === 'passed') return 'text-success bg-success/10 border-success/30';
		return 'text-warning bg-warning/10 border-warning/30';
	}

	function decisionTone(decision: string | null): string {
		if (decision === 'approved') return 'text-success bg-success/10 border-success/30';
		if (decision === 'rejected')
			return 'text-destructive bg-destructive/10 border-destructive/30';
		return 'text-warning bg-warning/10 border-warning/30';
	}
</script>

<svelte:head>
	<title>Public Pages - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="space-y-6">
	<AdminPageHeader
		title="Public Pages"
		description="Monitor published pages, flagged content, and override decisions."
		icon={Globe}
		backHref="/admin/ontology/graph"
		backLabel="Ontology Graph"
	/>

	{#if form?.error}
		<div
			class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{:else if form?.success}
		<div
			class="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
		>
			Review decision saved.
		</div>
	{/if}

	<div class="grid gap-3 md:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Total Pages</p>
			<p class="mt-2 text-2xl font-semibold text-foreground">{data.stats.total_pages}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Live Pages</p>
			<p class="mt-2 text-2xl font-semibold text-foreground">{data.stats.live_pages}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Review Attempts</p>
			<p class="mt-2 text-2xl font-semibold text-foreground">{data.stats.total_reviews}</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
			<p class="text-xs uppercase tracking-wide text-muted-foreground">Flagged (7d)</p>
			<p class="mt-2 text-2xl font-semibold text-destructive">
				{data.stats.flagged_reviews_7d}
			</p>
		</div>
	</div>

	<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
		<div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
			<div>
				<h2 class="text-base font-semibold text-foreground">Published Pages</h2>
				<p class="text-xs text-muted-foreground">Current public page inventory.</p>
			</div>
		</div>
		<!-- Mobile card list — mirrors the Content Review Attempts treatment below. -->
		<div class="space-y-3 p-3 lg:hidden">
			{#if data.pages.length === 0}
				<p class="px-1 py-6 text-center text-sm text-muted-foreground">
					No public pages found.
				</p>
			{:else}
				{#each data.pages as page}
					<div class="space-y-3 rounded-lg border border-border bg-background/40 p-3">
						<!-- Page -->
						<div>
							<p class="font-medium text-foreground">
								{page.title || 'Untitled'}
							</p>
							<p class="font-mono text-xs text-muted-foreground break-all">
								{page.url_path}
							</p>
						</div>

						<!-- Project / Document -->
						<div>
							<p class="text-sm text-foreground">{page.project_name}</p>
							<p class="text-xs text-muted-foreground">{page.document_title}</p>
						</div>

						<!-- Status + Live Sync -->
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div>
								<p class="text-sm text-foreground">{page.status}</p>
								<p class="text-xs text-muted-foreground">{page.public_status}</p>
							</div>
							<div class="text-right">
								<p class="text-sm text-foreground">
									{page.live_sync_enabled ? 'Enabled' : 'Paused'}
								</p>
								{#if page.last_live_sync_error}
									<p class="text-xs text-warning">
										{page.last_live_sync_error}
									</p>
								{/if}
							</div>
						</div>

						<!-- Updated -->
						<div class="border-t border-border pt-3 text-xs text-muted-foreground">
							<p>Updated: {formatDate(page.updated_at)}</p>
							<p>Published: {formatDate(page.published_at)}</p>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="hidden overflow-x-auto lg:block">
			<table class="min-w-full text-sm">
				<thead class="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="px-4 py-2 text-left">Page</th>
						<th class="px-4 py-2 text-left">Project</th>
						<th class="px-4 py-2 text-left">Status</th>
						<th class="px-4 py-2 text-left">Live Sync</th>
						<th class="px-4 py-2 text-left">Updated</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#if data.pages.length === 0}
						<tr>
							<td colspan="5" class="px-4 py-6 text-center text-muted-foreground">
								No public pages found.
							</td>
						</tr>
					{:else}
						{#each data.pages as page}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 align-top">
									<p class="font-medium text-foreground">
										{page.title || 'Untitled'}
									</p>
									<p class="text-xs text-muted-foreground font-mono">
										{page.url_path}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="text-foreground">{page.project_name}</p>
									<p class="text-xs text-muted-foreground">
										{page.document_title}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="text-foreground">{page.status}</p>
									<p class="text-xs text-muted-foreground">
										{page.public_status}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="text-foreground">
										{page.live_sync_enabled ? 'Enabled' : 'Paused'}
									</p>
									{#if page.last_live_sync_error}
										<p class="text-xs text-warning">
											{page.last_live_sync_error}
										</p>
									{/if}
								</td>
								<td class="px-4 py-3 align-top text-xs text-muted-foreground">
									<p>{formatDate(page.updated_at)}</p>
									<p>Published: {formatDate(page.published_at)}</p>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
		<div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
			<div>
				<h2 class="text-base font-semibold text-foreground">Content Review Attempts</h2>
				<p class="text-xs text-muted-foreground">
					Audit trail for publish checks and live-sync moderation.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant={reviewFilter === 'all' ? 'primary' : 'outline'}
					size="sm"
					onclick={() => (reviewFilter = 'all')}
					class="text-xs"
				>
					<CheckCircle2 class="w-3.5 h-3.5" />
					All
				</Button>
				<Button
					type="button"
					variant={reviewFilter === 'flagged' ? 'primary' : 'outline'}
					size="sm"
					onclick={() => (reviewFilter = 'flagged')}
					class="text-xs"
				>
					<ShieldAlert class="w-3.5 h-3.5" />
					Flagged
				</Button>
			</div>
		</div>
		<!-- Mobile card list — keeps the decide-form usable without a cramped horizontal scroll. -->
		<div class="space-y-3 p-3 lg:hidden">
			{#if filteredReviews.length === 0}
				<p class="px-1 py-6 text-center text-sm text-muted-foreground">
					No review attempts for this filter.
				</p>
			{:else}
				{#each filteredReviews as review}
					<div class="space-y-3 rounded-lg border border-border bg-background/40 p-3">
						<!-- Result + When -->
						<div class="flex items-start justify-between gap-2">
							<div>
								<span
									class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(review.status)}`}
								>
									{review.status}
								</span>
								<p class="mt-1 text-xs text-muted-foreground">{review.source}</p>
							</div>
							<p class="shrink-0 text-xs text-muted-foreground">
								{formatDate(review.created_at)}
							</p>
						</div>

						<!-- Page -->
						<div>
							<p class="font-mono text-xs text-foreground break-all">
								{review.page_url_path || 'Draft/Unpublished'}
							</p>
							<p class="text-xs text-muted-foreground">
								policy: {review.policy_version}
							</p>
						</div>

						<!-- Project / Document -->
						<div>
							<p class="text-sm text-foreground">{review.project_name}</p>
							<p class="text-xs text-muted-foreground">{review.document_title}</p>
							<p class="text-xs text-muted-foreground">by {review.created_by_name}</p>
						</div>

						<!-- Summary -->
						<div>
							<p class="text-sm text-foreground">{review.summary || 'No summary'}</p>
							{#if review.reasons.length > 0}
								<ul
									class="mt-1 list-disc pl-4 text-xs text-muted-foreground space-y-0.5"
								>
									{#each review.reasons.slice(0, 2) as reason}
										<li>{reason}</li>
									{/each}
								</ul>
							{/if}
							<p class="mt-1 text-xs text-muted-foreground">
								Text findings: {review.text_findings_count} | Image findings:
								{review.image_findings_count}
							</p>
						</div>

						<!-- Admin Review -->
						<div class="border-t border-border pt-3">
							<span
								class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${decisionTone(review.admin_decision)}`}
							>
								{review.admin_decision === 'approved'
									? 'OK to Publish'
									: review.admin_decision === 'rejected'
										? 'Not OK'
										: 'Pending'}
							</span>
							{#if review.admin_decision_at}
								<p class="mt-1 text-xs text-muted-foreground">
									{formatDate(review.admin_decision_at)}
								</p>
							{/if}
							{#if review.admin_decision_by_name}
								<p class="text-xs text-muted-foreground">
									by {review.admin_decision_by_name}
								</p>
							{/if}
							{#if review.admin_decision_reason}
								<p class="mt-1 text-xs text-muted-foreground">
									{review.admin_decision_reason}
								</p>
							{/if}
							{#if review.status === 'flagged'}
								<form method="POST" action="?/decide" class="mt-3 space-y-2">
									<input type="hidden" name="review_id" value={review.id} />
									<input
										type="text"
										name="decision_note"
										placeholder="Optional decision note"
										class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									/>
									<div class="flex gap-2">
										<Button
											type="submit"
											name="decision"
											value="approved"
											variant="success"
											class="flex-1 min-h-11"
										>
											Mark OK
										</Button>
										<Button
											type="submit"
											name="decision"
											value="rejected"
											variant="danger"
											class="flex-1 min-h-11"
										>
											Mark Not OK
										</Button>
									</div>
								</form>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="hidden overflow-x-auto lg:block">
			<table class="min-w-full text-sm">
				<thead class="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
					<tr>
						<th class="px-4 py-2 text-left">Result</th>
						<th class="px-4 py-2 text-left">Page</th>
						<th class="px-4 py-2 text-left">Project / Document</th>
						<th class="px-4 py-2 text-left">Summary</th>
						<th class="px-4 py-2 text-left">Admin Review</th>
						<th class="px-4 py-2 text-left">When</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#if filteredReviews.length === 0}
						<tr>
							<td colspan="6" class="px-4 py-6 text-center text-muted-foreground">
								No review attempts for this filter.
							</td>
						</tr>
					{:else}
						{#each filteredReviews as review}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 align-top">
									<span
										class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(review.status)}`}
									>
										{review.status}
									</span>
									<p class="mt-1 text-xs text-muted-foreground">
										{review.source}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="font-mono text-xs text-foreground">
										{review.page_url_path || 'Draft/Unpublished'}
									</p>
									<p class="text-xs text-muted-foreground">
										policy: {review.policy_version}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="text-foreground">{review.project_name}</p>
									<p class="text-xs text-muted-foreground">
										{review.document_title}
									</p>
									<p class="text-xs text-muted-foreground">
										by {review.created_by_name}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="text-foreground">
										{review.summary || 'No summary'}
									</p>
									{#if review.reasons.length > 0}
										<ul
											class="mt-1 list-disc pl-4 text-xs text-muted-foreground space-y-0.5"
										>
											{#each review.reasons.slice(0, 2) as reason}
												<li>{reason}</li>
											{/each}
										</ul>
									{/if}
									<p class="mt-1 text-xs text-muted-foreground">
										Text findings: {review.text_findings_count} | Image findings:
										{review.image_findings_count}
									</p>
								</td>
								<td class="px-4 py-3 align-top">
									<span
										class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${decisionTone(review.admin_decision)}`}
									>
										{review.admin_decision === 'approved'
											? 'OK to Publish'
											: review.admin_decision === 'rejected'
												? 'Not OK'
												: 'Pending'}
									</span>
									{#if review.admin_decision_at}
										<p class="mt-1 text-xs text-muted-foreground">
											{formatDate(review.admin_decision_at)}
										</p>
									{/if}
									{#if review.admin_decision_by_name}
										<p class="text-xs text-muted-foreground">
											by {review.admin_decision_by_name}
										</p>
									{/if}
									{#if review.admin_decision_reason}
										<p class="mt-1 text-xs text-muted-foreground">
											{review.admin_decision_reason}
										</p>
									{/if}
									{#if review.status === 'flagged'}
										<form
											method="POST"
											action="?/decide"
											class="mt-2 space-y-2"
										>
											<input
												type="hidden"
												name="review_id"
												value={review.id}
											/>
											<input
												type="text"
												name="decision_note"
												placeholder="Optional decision note"
												class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
											<div class="flex gap-2">
												<Button
													type="submit"
													name="decision"
													value="approved"
													size="sm"
													variant="success"
													class="text-xs"
												>
													Mark OK
												</Button>
												<Button
													type="submit"
													name="decision"
													value="rejected"
													size="sm"
													variant="danger"
													class="text-xs"
												>
													Mark Not OK
												</Button>
											</div>
										</form>
									{/if}
								</td>
								<td class="px-4 py-3 align-top text-xs text-muted-foreground">
									{formatDate(review.created_at)}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>
</div>
