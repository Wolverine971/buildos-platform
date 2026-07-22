<!-- apps/web/src/lib/components/profile/GmailReadPanel.svelte -->
<script lang="ts">
	import { CircleAlert, Mail, Search, ShieldCheck } from '$lib/icons/lucide';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import type {
		GmailConnectionSummary,
		GmailMessageDetail,
		GmailMessageSearchPayload,
		GmailMessageSummary,
		GmailReadAccountResult
	} from '$lib/types/gmail-integration';
	import SettingsCard from './_shared/SettingsCard.svelte';

	interface Props {
		connections: GmailConnectionSummary[];
	}

	let { connections }: Props = $props();

	let selectedConnectionIds = $state<string[]>([]);
	let query = $state('');
	let searching = $state(false);
	let loadingMoreConnectionId = $state<string | null>(null);
	let searchError = $state<string | null>(null);
	let loadMoreError = $state<string | null>(null);
	let searchResult = $state.raw<GmailMessageSearchPayload | null>(null);
	let lastSearchQuery = $state('');
	let openingMessageKey = $state<string | null>(null);
	let messageError = $state<string | null>(null);
	let selectedMessage = $state.raw<GmailMessageDetail | null>(null);

	const readableConnections = $derived(
		connections.filter((connection) => connection.status === 'active' && connection.readEnabled)
	);
	const selectedReadableIds = $derived(
		selectedConnectionIds.filter((connectionId) =>
			readableConnections.some((connection) => connection.id === connectionId)
		)
	);
	const MAX_VISIBLE_MESSAGES = 100;
	const canSearch = $derived(
		selectedReadableIds.length > 0 &&
			query.trim().length > 0 &&
			!searching &&
			loadingMoreConnectionId === null
	);

	function unwrapPayload<T>(payload: unknown): T {
		if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
			return (payload as { data: T }).data;
		}
		return payload as T;
	}

	function getErrorMessage(payload: unknown, fallback: string): string {
		if (!payload || typeof payload !== 'object') return fallback;
		const candidate = payload as { error?: unknown; message?: unknown };
		if (typeof candidate.error === 'string') return candidate.error;
		if (typeof candidate.message === 'string') return candidate.message;
		return fallback;
	}

	function toggleConnection(connectionId: string) {
		selectedConnectionIds = selectedConnectionIds.includes(connectionId)
			? selectedConnectionIds.filter((id) => id !== connectionId)
			: [...selectedConnectionIds, connectionId];
		searchResult = null;
		lastSearchQuery = '';
		selectedMessage = null;
		searchError = null;
		loadMoreError = null;
		messageError = null;
	}

	function selectAllAccounts() {
		selectedConnectionIds = readableConnections.map((connection) => connection.id);
		searchResult = null;
		lastSearchQuery = '';
		selectedMessage = null;
		searchError = null;
		loadMoreError = null;
		messageError = null;
	}

	function clearAccounts() {
		selectedConnectionIds = [];
		searchResult = null;
		lastSearchQuery = '';
		selectedMessage = null;
		searchError = null;
		loadMoreError = null;
		messageError = null;
	}

	async function searchMessages(event: SubmitEvent) {
		event.preventDefault();
		if (!canSearch) return;

		searching = true;
		searchError = null;
		loadMoreError = null;
		messageError = null;
		selectedMessage = null;
		try {
			const response = await fetch('/api/integrations/gmail/messages/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					connectionIds: selectedReadableIds,
					query: query.trim(),
					maxResults: 12
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(getErrorMessage(payload, 'Unable to search Gmail'));
			}
			searchResult = unwrapPayload<GmailMessageSearchPayload>(payload);
			lastSearchQuery = query.trim();
		} catch (error) {
			searchResult = null;
			lastSearchQuery = '';
			searchError = error instanceof Error ? error.message : 'Unable to search Gmail';
		} finally {
			searching = false;
		}
	}

	function mergeMessagePages(
		current: GmailMessageSummary[],
		incoming: GmailMessageSummary[]
	): GmailMessageSummary[] {
		const byMessage = new Map(
			current.map((message) => [`${message.connectionId}:${message.messageId}`, message])
		);
		for (const message of incoming) {
			byMessage.set(`${message.connectionId}:${message.messageId}`, message);
		}
		return Array.from(byMessage.values())
			.sort(
				(left, right) =>
					right.internalDate.localeCompare(left.internalDate) ||
					left.connectionId.localeCompare(right.connectionId) ||
					left.messageId.localeCompare(right.messageId)
			)
			.slice(0, MAX_VISIBLE_MESSAGES);
	}

	async function loadMore(account: GmailReadAccountResult) {
		if (
			!searchResult ||
			!account.nextCursor ||
			!lastSearchQuery ||
			loadingMoreConnectionId ||
			searchResult.messages.length >= MAX_VISIBLE_MESSAGES
		) {
			return;
		}

		loadingMoreConnectionId = account.connectionId;
		loadMoreError = null;
		try {
			const response = await fetch('/api/integrations/gmail/messages/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					connectionIds: [account.connectionId],
					query: lastSearchQuery,
					maxResults: 10,
					cursor: account.nextCursor
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(getErrorMessage(payload, 'Unable to load more Gmail messages'));
			}

			const page = unwrapPayload<GmailMessageSearchPayload>(payload);
			const pageAccount = page.accounts[0];
			if (!pageAccount || pageAccount.connectionId !== account.connectionId) {
				throw new Error('Gmail returned an invalid account page');
			}
			searchResult = {
				...searchResult,
				accounts: searchResult.accounts.map((currentAccount) =>
					currentAccount.connectionId === account.connectionId
						? {
								...pageAccount,
								messageCount: currentAccount.messageCount + pageAccount.messageCount
							}
						: currentAccount
				),
				messages: mergeMessagePages(searchResult.messages, page.messages),
				fetchedAt: page.fetchedAt
			};
		} catch (error) {
			loadMoreError =
				error instanceof Error ? error.message : 'Unable to load more Gmail messages';
		} finally {
			loadingMoreConnectionId = null;
		}
	}

	async function openMessage(message: GmailMessageSummary) {
		const key = `${message.connectionId}:${message.messageId}`;
		if (openingMessageKey) return;
		openingMessageKey = key;
		messageError = null;
		selectedMessage = null;
		try {
			const response = await fetch('/api/integrations/gmail/messages/get', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					connectionId: message.connectionId,
					messageId: message.messageId
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(getErrorMessage(payload, 'Unable to open this Gmail message'));
			}
			selectedMessage = unwrapPayload<GmailMessageDetail>(payload);
		} catch (error) {
			messageError =
				error instanceof Error ? error.message : 'Unable to open this Gmail message';
		} finally {
			openingMessageKey = null;
		}
	}

	function formatDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown date';
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<SettingsCard
	title="Read Gmail"
	description="Search selected accounts on demand. BuildOS fetches only the messages you choose to open."
	icon={Mail}
	bodyClass="space-y-4"
>
	<div class="rounded-lg border border-info/30 bg-info/5 p-3" role="note">
		<div class="flex items-start gap-2">
			<ShieldCheck class="mt-0.5 h-4 w-4 flex-shrink-0 text-info" />
			<p class="text-xs text-muted-foreground">
				Read-only preview. This surface cannot send, draft, archive, label, delete, or mark
				messages as read. Attachments and remote images are not loaded.
			</p>
		</div>
	</div>

	{#if readableConnections.length === 0}
		<div class="rounded-lg border border-dashed border-border px-4 py-8 text-center">
			<p class="text-sm font-medium text-foreground">
				No readable Gmail account is available
			</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Connect or reconnect a Gmail account above to use read-only search.
			</p>
		</div>
	{:else}
		<div>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-sm font-medium text-foreground">Choose accounts</p>
				<div class="flex gap-2">
					<button
						type="button"
						class="text-xs font-medium text-accent hover:underline"
						onclick={selectAllAccounts}>Select all</button
					>
					<button
						type="button"
						class="text-xs font-medium text-muted-foreground hover:text-foreground"
						onclick={clearAccounts}>Clear</button
					>
				</div>
			</div>
			<div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each readableConnections as connection (connection.id)}
					<label
						class="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 hover:border-accent/40"
					>
						<input
							type="checkbox"
							class="mt-0.5 h-4 w-4 rounded border-border accent-accent"
							checked={selectedReadableIds.includes(connection.id)}
							onchange={() => toggleConnection(connection.id)}
						/>
						<span class="min-w-0">
							<span class="block truncate text-sm font-medium text-foreground">
								{connection.accountLabel}
							</span>
							<span class="block truncate text-xs text-muted-foreground">
								{connection.emailAddress}
							</span>
						</span>
					</label>
				{/each}
			</div>
		</div>

		<form class="flex flex-col gap-2 sm:flex-row" onsubmit={searchMessages}>
			<div class="min-w-0 flex-1">
				<TextInput
					bind:value={query}
					placeholder="Search Gmail, for example: newer_than:7d from:client@example.com"
					maxlength={300}
					aria-label="Gmail search query"
				/>
			</div>
			<Button
				type="submit"
				variant="primary"
				icon={Search}
				loading={searching}
				disabled={!canSearch}
			>
				Search selected accounts
			</Button>
		</form>

		{#if selectedReadableIds.length === 0}
			<p class="text-xs text-muted-foreground">Select at least one account to search.</p>
		{/if}

		{#if searchError}
			<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
				<div class="flex items-start gap-2">
					<CircleAlert class="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
					<p class="text-sm text-foreground">{searchError}</p>
				</div>
			</div>
		{/if}

		{#if searchResult}
			{@const unavailableAccounts = searchResult.accounts.filter(
				(account) => account.status !== 'success'
			)}
			{@const pageableAccounts = searchResult.accounts.filter(
				(account) => account.status === 'success' && account.nextCursor
			)}
			<div class="space-y-3" aria-live="polite">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<p class="text-sm font-medium text-foreground">
						{searchResult.messages.length} message{searchResult.messages.length === 1
							? ''
							: 's'}
					</p>
					<p class="text-xs text-muted-foreground">
						Fetched {formatDate(searchResult.fetchedAt)}
					</p>
				</div>

				{#if unavailableAccounts.length > 0}
					<div class="rounded-lg border border-warning/30 bg-warning/5 p-3">
						<p class="text-xs text-muted-foreground">
							Some accounts could not be searched:
							{unavailableAccounts.map((account) => account.accountLabel).join(', ')}.
							Reconnect them above if the issue continues.
						</p>
					</div>
				{/if}

				{#if searchResult.messages.length === 0}
					<div
						class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
					>
						<p class="text-sm font-medium text-foreground">No matching messages</p>
						<p class="mt-1 text-sm text-muted-foreground">
							Try a broader Gmail search query or another selected account.
						</p>
					</div>
				{:else}
					<div
						class="divide-y divide-border overflow-hidden rounded-lg border border-border"
					>
						{#each searchResult.messages as message (`${message.connectionId}:${message.messageId}`)}
							<button
								type="button"
								class="block w-full bg-card px-4 py-3 text-left hover:bg-muted/50 disabled:cursor-wait"
								disabled={openingMessageKey !== null}
								onclick={() => openMessage(message)}
							>
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="info" size="sm">{message.accountLabel}</Badge>
									<span class="truncate text-sm font-medium text-foreground">
										{message.from}
									</span>
									<span class="ml-auto text-xs text-muted-foreground">
										{formatDate(message.internalDate)}
									</span>
								</div>
								<p class="mt-1 truncate text-sm font-semibold text-foreground">
									{message.subject}
								</p>
								<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
									{message.snippet || 'No preview available'}
								</p>
								<p class="mt-2 text-[11px] text-muted-foreground">
									{message.emailAddress} · Read only
								</p>
							</button>
						{/each}
					</div>
				{/if}

				{#if searchResult.messages.length >= MAX_VISIBLE_MESSAGES}
					<p class="text-xs text-muted-foreground">
						Showing the first {MAX_VISIBLE_MESSAGES} messages for this search. Refine the
						query to continue safely.
					</p>
				{:else if pageableAccounts.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each pageableAccounts as account (account.connectionId)}
							<button
								type="button"
								class="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:border-accent/40 hover:bg-muted/50 disabled:cursor-wait disabled:opacity-60"
								disabled={loadingMoreConnectionId !== null || searching}
								onclick={() => loadMore(account)}
							>
								{loadingMoreConnectionId === account.connectionId
									? `Loading more from ${account.accountLabel}…`
									: `Load more from ${account.accountLabel}`}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if loadMoreError}
			<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
				<p class="text-sm text-foreground">{loadMoreError}</p>
			</div>
		{/if}

		{#if messageError}
			<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
				<p class="text-sm text-foreground">{messageError}</p>
			</div>
		{/if}

		{#if selectedMessage}
			<article class="rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="info" size="sm">{selectedMessage.accountLabel}</Badge>
					<Badge variant="success" size="sm">Read only</Badge>
					<span class="ml-auto text-xs text-muted-foreground">
						Fetched {formatDate(selectedMessage.fetchedAt)}
					</span>
				</div>
				<h3 class="mt-3 text-base font-semibold text-foreground">
					{selectedMessage.subject}
				</h3>
				<dl class="mt-3 grid gap-2 text-xs sm:grid-cols-[5rem_1fr]">
					<dt class="font-medium text-muted-foreground">From</dt>
					<dd class="min-w-0 break-words text-foreground">{selectedMessage.from}</dd>
					<dt class="font-medium text-muted-foreground">To</dt>
					<dd class="min-w-0 break-words text-foreground">
						{selectedMessage.to || 'Not available'}
					</dd>
					{#if selectedMessage.cc}
						<dt class="font-medium text-muted-foreground">CC</dt>
						<dd class="min-w-0 break-words text-foreground">{selectedMessage.cc}</dd>
					{/if}
					<dt class="font-medium text-muted-foreground">Account</dt>
					<dd class="min-w-0 break-words text-foreground">
						{selectedMessage.accountLabel} ({selectedMessage.emailAddress})
					</dd>
				</dl>

				<div class="mt-4 border-t border-border pt-4">
					<p class="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
						{selectedMessage.bodyText || 'No supported text body was available.'}
					</p>
				</div>

				{#if selectedMessage.bodyTruncated || selectedMessage.hasUnsupportedAttachments}
					<div class="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
						{#if selectedMessage.bodyTruncated}
							The displayed body was shortened to the safe preview limit.
						{/if}
						{#if selectedMessage.hasUnsupportedAttachments}
							Attachments are present but were not downloaded.
						{/if}
					</div>
				{/if}
			</article>
		{/if}
	{/if}
</SettingsCard>
