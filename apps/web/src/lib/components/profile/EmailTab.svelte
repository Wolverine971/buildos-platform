<!-- apps/web/src/lib/components/profile/EmailTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import {
		CircleAlert,
		LockKeyhole,
		Mail,
		Pencil,
		Plus,
		RefreshCw,
		ShieldCheck,
		Trash2
	} from 'lucide-svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import type {
		GmailConnectionSummary,
		GmailConnectionsPayload
	} from '$lib/types/gmail-integration';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import GmailReadPanel from './GmailReadPanel.svelte';

	interface Props {
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	let { onsuccess, onerror }: Props = $props();

	let gmailData = $state.raw<GmailConnectionsPayload | null>(null);
	let loading = $state(false);
	let connecting = $state(false);
	let reconnectingId = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let editLabel = $state('');
	let savingLabel = $state(false);
	let pendingDisconnect = $state<GmailConnectionSummary | null>(null);
	let disconnecting = $state(false);

	const connections = $derived(gmailData?.connections ?? []);
	const canAddConnection = $derived(
		Boolean(gmailData?.available) && connections.length < (gmailData?.maxConnections ?? 0)
	);
	const gmailReadPanelKey = $derived(
		connections
			.map(
				(connection) =>
					`${connection.id}:${connection.status}:${connection.readEnabled}:${connection.lastVerifiedAt ?? ''}`
			)
			.join('|')
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

	function getReturnPath(): string {
		const returnUrl = new URL($page.url);
		returnUrl.searchParams.set('tab', 'email');
		returnUrl.searchParams.set('gmail', '1');
		returnUrl.searchParams.delete('success');
		returnUrl.searchParams.delete('error');
		returnUrl.searchParams.delete('connection');
		return `${returnUrl.pathname}${returnUrl.search}`;
	}

	async function loadConnections(options: { showError?: boolean } = {}) {
		if (loading) return;
		loading = true;
		try {
			const response = await fetch('/api/integrations/gmail/connections', {
				headers: { 'Cache-Control': 'no-cache' }
			});
			const responsePayload = await response.json().catch(() => null);
			if (!response.ok) {
				if (options.showError !== false) {
					onerror?.({
						message: getErrorMessage(
							responsePayload,
							'Failed to load Gmail connections'
						)
					});
				}
				return;
			}

			gmailData = unwrapPayload<GmailConnectionsPayload>(responsePayload);
		} catch {
			if (options.showError !== false) {
				onerror?.({ message: 'Failed to load Gmail connections' });
			}
		} finally {
			loading = false;
		}
	}

	async function startConnection(connectionId?: string) {
		if (connecting || reconnectingId) return;
		if (connectionId) reconnectingId = connectionId;
		else connecting = true;

		try {
			const response = await fetch('/api/integrations/gmail/connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					connectionId: connectionId ?? null,
					redirectPath: getReturnPath()
				})
			});
			const responsePayload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(
					getErrorMessage(responsePayload, 'Failed to start Gmail connection')
				);
			}

			const result = unwrapPayload<{ authorizationUrl: string }>(responsePayload);
			if (!result.authorizationUrl)
				throw new Error('Google authorization URL was not returned');
			window.location.assign(result.authorizationUrl);
		} catch (error) {
			onerror?.({
				message: error instanceof Error ? error.message : 'Failed to start Gmail connection'
			});
			connecting = false;
			reconnectingId = null;
		}
	}

	function beginRename(connection: GmailConnectionSummary) {
		editingId = connection.id;
		editLabel = connection.accountLabel;
	}

	function cancelRename() {
		if (savingLabel) return;
		editingId = null;
		editLabel = '';
	}

	async function saveRename(connectionId: string) {
		const normalized = editLabel.trim();
		if (!normalized || normalized.length > 60) {
			onerror?.({ message: 'Account label must be 1–60 characters' });
			return;
		}

		savingLabel = true;
		try {
			const response = await fetch(`/api/integrations/gmail/connections/${connectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountLabel: normalized })
			});
			const responsePayload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(getErrorMessage(responsePayload, 'Failed to rename Gmail account'));
			}

			editingId = null;
			editLabel = '';
			await loadConnections({ showError: false });
			onsuccess?.({ message: 'Gmail account label updated' });
		} catch (error) {
			onerror?.({
				message: error instanceof Error ? error.message : 'Failed to rename Gmail account'
			});
		} finally {
			savingLabel = false;
		}
	}

	async function disconnectConnection() {
		if (!pendingDisconnect || disconnecting) return;
		disconnecting = true;
		const connection = pendingDisconnect;

		try {
			const response = await fetch(`/api/integrations/gmail/connections/${connection.id}`, {
				method: 'DELETE'
			});
			const responsePayload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(
					getErrorMessage(responsePayload, 'Failed to disconnect Gmail account')
				);
			}

			const result = unwrapPayload<{ remoteRevocationSucceeded: boolean }>(responsePayload);
			pendingDisconnect = null;
			await loadConnections({ showError: false });
			onsuccess?.({
				message: result.remoteRevocationSucceeded
					? `${connection.accountLabel} disconnected and Google access revoked`
					: `${connection.accountLabel} disconnected. Review Google Account permissions because remote revocation could not be confirmed.`
			});
		} catch (error) {
			onerror?.({
				message:
					error instanceof Error ? error.message : 'Failed to disconnect Gmail account'
			});
		} finally {
			disconnecting = false;
		}
	}

	function statusBadge(connection: GmailConnectionSummary): {
		label: string;
		variant: 'success' | 'warning' | 'error';
	} {
		if (connection.status === 'active' && connection.readEnabled) {
			return { label: 'Read only', variant: 'success' };
		}
		if (connection.status === 'reconnect_required') {
			return { label: 'Reconnect required', variant: 'warning' };
		}
		return { label: 'Unavailable', variant: 'error' };
	}

	function formatDate(value: string | null): string {
		if (!value) return 'Not yet verified';
		return new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	$effect(() => {
		if (!browser) return;
		const params = $page.url.searchParams;
		if (params.get('gmail') !== '1') return;

		const success = params.get('success');
		const error = params.get('error');
		if (success === 'gmail_connected') {
			onsuccess?.({ message: 'Gmail connected with read-only access' });
		} else if (error) {
			const messages: Record<string, string> = {
				access_denied: 'Gmail access was not granted',
				invalid_state: 'The Gmail connection request expired. Please try again.',
				identity_verification_failed: 'Google account verification failed',
				scope_mismatch: 'Google did not return the required read-only permission',
				refresh_token_required: 'Google did not return offline access. Please reconnect.',
				account_mismatch: 'Reconnect using the same Google account',
				account_already_connected:
					'That Gmail account is connected to another BuildOS user',
				connection_limit_exceeded: 'You have reached the Gmail account limit',
				not_configured: 'Gmail connections are not configured yet'
			};
			onerror?.({ message: messages[error] ?? 'Gmail connection failed' });
		}

		const nextUrl = new URL($page.url);
		nextUrl.searchParams.delete('gmail');
		nextUrl.searchParams.delete('success');
		nextUrl.searchParams.delete('error');
		nextUrl.searchParams.delete('connection');
		const destination = `/profile?${nextUrl.searchParams.toString()}` as `/profile?${string}`;
		replaceState(resolve(destination), {});
	});

	onMount(() => {
		void loadConnections();
	});
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Mail}
		title="Email"
		description="Connect multiple Gmail accounts as read-only context for BuildOS."
	/>

	<div
		class="rounded-lg border border-info/30 bg-info/5 p-4 shadow-ink tx tx-static tx-weak"
		role="note"
	>
		<div class="flex items-start gap-3">
			<ShieldCheck class="mt-0.5 h-5 w-5 flex-shrink-0 text-info" />
			<div class="min-w-0">
				<h3 class="text-sm font-semibold text-foreground">Read-only by default</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					This connection cannot send, draft, delete, archive, label, or mark email as
					read. Future email actions require separate account permission and confirmation
					for the exact action.
				</p>
			</div>
		</div>
	</div>

	<SettingsCard
		title="Connected Gmail accounts"
		description="Each Google account has its own connection and permissions."
		icon={Mail}
		bodyClass="space-y-4"
	>
		{#snippet actions()}
			<Button
				onclick={() => startConnection()}
				variant="primary"
				size="sm"
				icon={Plus}
				loading={connecting}
				disabled={!canAddConnection || loading}
			>
				Connect Gmail
			</Button>
		{/snippet}

		{#if loading && !gmailData}
			<div class="py-10 text-center text-sm text-muted-foreground" aria-live="polite">
				Loading Gmail connections…
			</div>
		{:else if gmailData && !gmailData.available}
			<div class="rounded-lg border border-warning/30 bg-warning/5 p-4">
				<div class="flex items-start gap-3">
					<CircleAlert class="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
					<div>
						<p class="text-sm font-semibold text-foreground">
							Gmail setup is not configured
						</p>
						<p class="mt-1 text-sm text-muted-foreground">
							The dedicated read-only Google OAuth client and token key must be
							configured before accounts can connect.
						</p>
					</div>
				</div>
			</div>
		{:else if connections.length === 0}
			<div class="rounded-lg border border-dashed border-border px-4 py-10 text-center">
				<div
					class="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground"
				>
					<Mail class="h-5 w-5" />
				</div>
				<h3 class="mt-3 text-sm font-semibold text-foreground">
					No Gmail accounts connected
				</h3>
				<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
					Connect your first Gmail account with read-only access. You can add up to
					{gmailData?.maxConnections ?? 5} separate accounts.
				</p>
				<Button
					onclick={() => startConnection()}
					variant="primary"
					size="sm"
					icon={Plus}
					loading={connecting}
					class="mt-4"
				>
					Connect Gmail (read only)
				</Button>
			</div>
		{:else}
			<div class="space-y-3">
				{#each connections as connection (connection.id)}
					{@const status = statusBadge(connection)}
					<article class="rounded-lg border border-border bg-card p-4 shadow-ink">
						<div
							class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
						>
							<div class="flex min-w-0 items-start gap-3">
								<div
									class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
								>
									<Mail class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									{#if editingId === connection.id}
										<div class="flex max-w-md flex-col gap-2 sm:flex-row">
											<TextInput
												bind:value={editLabel}
												maxlength={60}
												aria-label="Account label"
												disabled={savingLabel}
											/>
											<div class="flex gap-2">
												<Button
													onclick={() => saveRename(connection.id)}
													size="sm"
													loading={savingLabel}
												>
													Save
												</Button>
												<Button
													onclick={cancelRename}
													variant="ghost"
													size="sm"
													disabled={savingLabel}
												>
													Cancel
												</Button>
											</div>
										</div>
									{:else}
										<div class="flex flex-wrap items-center gap-2">
											<h3
												class="truncate text-sm font-semibold text-foreground"
											>
												{connection.accountLabel}
											</h3>
											<Badge variant={status.variant} size="sm"
												>{status.label}</Badge
											>
										</div>
									{/if}
									<p class="mt-1 truncate text-sm text-muted-foreground">
										{connection.emailAddress}
									</p>
									<p class="mt-1 text-xs text-muted-foreground">
										Verified {formatDate(connection.lastVerifiedAt)}
									</p>
								</div>
							</div>

							<div class="flex flex-wrap gap-2 sm:justify-end">
								<Button
									onclick={() => beginRename(connection)}
									variant="ghost"
									size="sm"
									icon={Pencil}
									disabled={editingId !== null || disconnecting}
								>
									Rename
								</Button>
								<Button
									onclick={() => startConnection(connection.id)}
									variant="outline"
									size="sm"
									icon={RefreshCw}
									loading={reconnectingId === connection.id}
									disabled={reconnectingId !== null ||
										connecting ||
										disconnecting}
								>
									Reconnect
								</Button>
								<Button
									onclick={() => (pendingDisconnect = connection)}
									variant="ghost"
									size="sm"
									icon={Trash2}
									class="text-destructive hover:text-destructive"
									disabled={disconnecting}
								>
									Disconnect
								</Button>
							</div>
						</div>

						<div class="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
							<div
								class="flex items-center gap-2 rounded-md bg-success/5 px-3 py-2 text-xs"
							>
								<ShieldCheck class="h-4 w-4 text-success" />
								<span class="font-medium text-foreground">Reading enabled</span>
							</div>
							<div
								class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs"
							>
								<LockKeyhole class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-muted-foreground">Sending off</span>
							</div>
							<div
								class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs"
							>
								<LockKeyhole class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-muted-foreground"
									>Message changes off</span
								>
							</div>
						</div>
					</article>
				{/each}
			</div>

			{#if connections.length >= (gmailData?.maxConnections ?? 5)}
				<p class="text-xs text-muted-foreground">
					You have reached the current limit of {gmailData?.maxConnections ?? 5} Gmail accounts.
				</p>
			{/if}
		{/if}
	</SettingsCard>

	{#key gmailReadPanelKey}
		<GmailReadPanel {connections} />
	{/key}
</div>

<ConfirmationModal
	isOpen={pendingDisconnect !== null}
	title="Disconnect Gmail account?"
	confirmText="Disconnect account"
	confirmVariant="danger"
	icon="warning"
	loading={disconnecting}
	loadingText="Disconnecting…"
	onconfirm={disconnectConnection}
	oncancel={() => {
		if (!disconnecting) pendingDisconnect = null;
	}}
>
	{#if pendingDisconnect}
		Disconnect <strong>{pendingDisconnect.accountLabel}</strong>
		({pendingDisconnect.emailAddress})? BuildOS will revoke and delete its stored Gmail
		credentials. Other connected accounts are not affected.
	{/if}
</ConfirmationModal>
