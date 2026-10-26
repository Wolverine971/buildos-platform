<!-- apps/web/src/lib/components/email-campaigns/SentLog.svelte -->
<!--
	Read-only log of every email row (one-off sends, campaign sends, and — when
	toggled on — automatic email like daily briefs and the welcome sequence).
-->
<script lang="ts">
	import { ChevronLeft, ChevronRight, Eye, Loader2, Mail, Search, Users } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import EmailPreview from '$lib/components/email/EmailPreview.svelte';
	import { formatDateTime } from '$lib/email-campaigns/ui-helpers';

	interface SentLogRequest {
		page: number;
		search: string;
		status: string;
		showAutomatic: boolean;
	}

	let emails = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let statusFilter = $state('all');
	let showAutomatic = $state(false);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let totalItems = $state(0);
	let viewing = $state<any | null>(null);
	let viewOpen = $state(false);

	let previousSearch = '';
	const request = $derived<SentLogRequest>({
		page: currentPage,
		search: searchQuery,
		status: statusFilter,
		showAutomatic
	});

	// The single owner of list requests: debounced for typing, aborted when superseded.
	$effect(() => {
		const current = request;
		const controller = new AbortController();
		const debounceMs = current.search !== previousSearch ? 250 : 0;
		previousSearch = current.search;
		const timer = window.setTimeout(() => void load(current, controller.signal), debounceMs);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	});

	async function load(current: SentLogRequest, signal: AbortSignal) {
		isLoading = true;
		error = null;
		try {
			const params = new URLSearchParams({
				page: String(current.page),
				limit: '20',
				search: current.search,
				sort_by: 'created_at',
				sort_order: 'desc'
			});
			if (!current.showAutomatic) params.set('hide_automatic', 'true');
			if (current.status !== 'all') params.set('status', current.status);

			const response = await fetch(`/api/admin/emails?${params}`, { signal });
			const payload = await response.json().catch(() => null);
			if (signal.aborted) return;
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || payload?.message || 'Failed to load emails');
			}
			emails = payload.data?.emails ?? [];
			totalPages = payload.data?.pagination?.total_pages || 1;
			totalItems = payload.data?.pagination?.total_items || 0;
		} catch (err) {
			if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
			error = err instanceof Error ? err.message : 'Failed to load emails';
		} finally {
			if (!signal.aborted) isLoading = false;
		}
	}

	function recipientsLabel(email: any): string {
		const list = Array.isArray(email.email_recipients) ? email.email_recipients : [];
		if (list.length === 1) return list[0].recipient_name || list[0].recipient_email;
		return `${list.length} people`;
	}

	function openCount(email: any): number {
		const list = Array.isArray(email.email_recipients) ? email.email_recipients : [];
		return list.filter((recipient: any) => recipient.opened_at).length;
	}

	const STATUS_STYLES: Record<string, string> = {
		draft: 'border-border bg-muted text-muted-foreground',
		scheduled: 'border-info/30 bg-info/10 text-info',
		sending: 'border-accent/30 bg-accent/10 text-accent',
		sent: 'border-success/30 bg-success/10 text-success',
		delivered: 'border-success/30 bg-success/10 text-success',
		failed: 'border-destructive/30 bg-destructive/10 text-destructive'
	};
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
		<div class="relative flex-1">
			<Search
				class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
			/>
			<label for="sent-log-search" class="sr-only">Search sent email</label>
			<input
				id="sent-log-search"
				type="search"
				bind:value={searchQuery}
				oninput={() => (currentPage = 1)}
				placeholder="Search emails by subject or content..."
				class="w-full rounded-lg border border-border-strong bg-background py-2 pl-9 pr-3 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent sm:text-sm"
			/>
		</div>
		<div class="flex items-center gap-2">
			<label for="sent-log-status" class="sr-only">Status</label>
			<select
				id="sent-log-status"
				bind:value={statusFilter}
				onchange={() => (currentPage = 1)}
				class="rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground sm:text-sm"
			>
				<option value="all">Any status</option>
				<option value="sent">Sent</option>
				<option value="failed">Failed</option>
				<option value="draft">Draft</option>
				<option value="scheduled">Scheduled</option>
			</select>
			<label
				class="flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground"
			>
				<input
					type="checkbox"
					bind:checked={showAutomatic}
					onchange={() => (currentPage = 1)}
					class="h-4 w-4 bg-background text-accent focus:ring-ring"
				/>
				Show automatic emails
			</label>
		</div>
	</div>
	<p class="text-xs text-muted-foreground">
		{#if showAutomatic}
			Everything, including daily briefs, welcome emails, notifications and each campaign
			email.
		{:else}
			One-off emails you sent by hand. Campaign emails live in each campaign's results.
		{/if}
		<span class="stamp">{totalItems}</span> total.
	</p>

	{#if error}
		<p
			class="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
			role="alert"
		>
			{error}
		</p>
	{/if}

	<div class="overflow-hidden rounded-xl border border-border bg-card shadow-ink">
		{#if isLoading && emails.length === 0}
			<div class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
				<Loader2 class="h-4 w-4 animate-spin" /> Loading emails…
			</div>
		{:else if emails.length === 0}
			<div class="py-12 text-center">
				<Mail class="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">
					{searchQuery ? 'Nothing matches that search.' : 'No emails here yet.'}
				</p>
			</div>
		{:else}
			<ul class="divide-y divide-border {isLoading ? 'opacity-60' : ''}">
				{#each emails as email (email.id)}
					<li>
						<button
							type="button"
							onclick={() => {
								viewing = email;
								viewOpen = true;
							}}
							class="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-foreground">
									{email.subject || '(no subject)'}
								</p>
								<p
									class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
								>
									<span class="inline-flex min-w-0 items-center gap-1">
										<Users class="h-3 w-3 shrink-0" />
										<span class="truncate">{recipientsLabel(email)}</span>
									</span>
									{#if email.category}
										<span class="truncate"
											>· {String(email.category).replaceAll('_', ' ')}</span
										>
									{/if}
									<span class="stamp"
										>· {formatDateTime(email.sent_at || email.created_at)}</span
									>
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if openCount(email) > 0}
									<span
										class="inline-flex items-center gap-1 text-2xs text-muted-foreground"
									>
										<Eye class="h-3 w-3" /><span class="stamp"
											>{openCount(email)}</span
										>
									</span>
								{/if}
								<span
									class="rounded-full border px-2 py-0.5 text-2xs font-medium {STATUS_STYLES[
										email.status
									] ?? STATUS_STYLES.draft}"
								>
									{email.status}
								</span>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if totalPages > 1}
		<div class="flex items-center justify-between gap-3">
			<button
				type="button"
				disabled={currentPage <= 1}
				onclick={() => (currentPage -= 1)}
				class="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
			>
				<ChevronLeft class="h-4 w-4" /> Newer
			</button>
			<span class="stamp text-xs text-muted-foreground"
				>Page {currentPage} of {totalPages}</span
			>
			<button
				type="button"
				disabled={currentPage >= totalPages}
				onclick={() => (currentPage += 1)}
				class="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
			>
				Older <ChevronRight class="h-4 w-4" />
			</button>
		</div>
	{/if}
</div>

<Modal
	bind:isOpen={viewOpen}
	title={viewing?.subject || 'Email'}
	size="lg"
	onClose={() => (viewOpen = false)}
>
	{#if viewing}
		<div class="p-4 sm:p-5">
			<EmailPreview
				emailData={{
					...viewing,
					recipients: viewing.email_recipients ?? []
				}}
			/>
		</div>
	{/if}
</Modal>
