<!-- apps/web/src/lib/components/profile/GoogleAgentAccess.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';

	type ConnectionKind = 'gmail' | 'calendar' | 'calendar_legacy';
	type AgentAccess = {
		configured: boolean;
		status: 'not_connected' | 'active' | 'reconnect_required';
	};
	interface Props {
		kind: ConnectionKind;
		connectionId?: string;
		accountLabel?: string;
	}

	let { kind, connectionId, accountLabel }: Props = $props();
	let access = $state<AgentAccess | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let pendingAction = $state<'connect' | 'disconnect' | null>(null);
	let refreshVersion = $state(0);
	let showCallback = $state(true);
	const endpoint = '/api/integrations/google/agent-access';

	const callbackMatches = $derived(
		showCallback &&
			page.url.searchParams.get('google_agent_kind') === kind &&
			(kind === 'calendar_legacy' ||
				page.url.searchParams.get('google_agent_connection') === connectionId)
	);
	const callbackError = $derived(
		callbackMatches && page.url.searchParams.get('google_agent') === 'error'
			? consentErrorMessage(page.url.searchParams.get('google_agent_error'))
			: null
	);
	const callbackConnected = $derived(
		callbackMatches && page.url.searchParams.get('google_agent') === 'connected'
	);

	function consentErrorMessage(code: string | null): string {
		switch (code) {
			case 'access_denied':
				return 'Agent access was not approved. You can enable it when you are ready.';
			case 'account_mismatch':
				return 'Choose the same Google account when approving agent access.';
			case 'invalid_state':
				return 'The approval request expired. Try enabling agent access again.';
			case 'not_configured':
				return 'Agent access is not available yet.';
			case 'scope_mismatch':
				return 'Approve the requested Google permissions to enable agent access.';
			default:
				return 'Agent access could not be enabled. Please try again.';
		}
	}

	async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
		const response = await fetch(url, init);
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			const message =
				typeof body?.message === 'string'
					? body.message
					: typeof body?.error === 'string'
						? body.error
						: 'Unable to update agent access. Please try again.';
			throw new Error(message);
		}
		return (body?.data ?? body) as T;
	}

	async function loadAccess(
		requestKind: ConnectionKind,
		requestConnectionId: string | undefined,
		signal: AbortSignal
	) {
		loading = true;
		error = null;
		access = null;
		try {
			const params = new URLSearchParams({ kind: requestKind });
			if (requestConnectionId) params.set('connectionId', requestConnectionId);
			const result = await requestJson<AgentAccess>(`${endpoint}?${params}`, { signal });
			if (!signal.aborted) access = result;
		} catch (cause) {
			if (!signal.aborted) {
				error = cause instanceof Error ? cause.message : 'Unable to load agent access.';
			}
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	// Synchronize remote authorization state with the displayed account; cancel stale reads.
	$effect(() => {
		void refreshVersion;
		const controller = new AbortController();
		void loadAccess(kind, connectionId, controller.signal);
		return () => controller.abort();
	});

	async function changeAccess(action: 'connect' | 'disconnect') {
		if (pendingAction || loading) return;
		pendingAction = action;
		error = null;
		showCallback = false;
		try {
			const result = await requestJson<{ url?: string }>(endpoint, {
				method: action === 'connect' ? 'POST' : 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, connectionId })
			});
			if (action === 'connect') {
				if (!result?.url)
					throw new Error('Google approval could not be opened. Try again.');
				const authorizationUrl = new URL(result.url);
				if (authorizationUrl.origin !== 'https://accounts.google.com') {
					throw new Error('Google approval could not be opened. Try again.');
				}
				window.location.assign(authorizationUrl.href);
			} else {
				refreshVersion += 1;
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to update agent access.';
		} finally {
			pendingAction = null;
		}
	}
</script>

<div class="rounded-lg border border-border bg-muted/30 px-3 py-3">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0">
			<p class="text-sm font-medium text-foreground">Agent access</p>
			{#if accountLabel}
				<p class="mt-0.5 truncate text-xs text-muted-foreground">{accountLabel}</p>
			{/if}
			<p class="mt-1 text-xs text-muted-foreground">
				Approve Google access separately for BuildOS agents
				{kind === 'gmail' ? 'to read email.' : 'to read and manage your calendar.'}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2" aria-live="polite">
			{#if loading}
				<span class="text-xs text-muted-foreground">Checking access…</span>
			{:else if access}
				{#if access.status === 'active'}
					<span class="text-xs text-success">Enabled</span>
				{:else if access.configured}
					<Button
						variant="outline"
						size="sm"
						disabled={pendingAction !== null}
						loading={pendingAction === 'connect'}
						onclick={() => changeAccess('connect')}
					>
						{access.status === 'reconnect_required' ? 'Reconnect' : 'Enable'}
					</Button>
				{:else}
					<span class="text-xs text-muted-foreground">Not available yet</span>
				{/if}
				{#if access.status !== 'not_connected'}
					<Button
						variant="ghost"
						size="sm"
						disabled={pendingAction !== null}
						loading={pendingAction === 'disconnect'}
						onclick={() => changeAccess('disconnect')}
					>
						Disable
					</Button>
				{/if}
			{:else}
				<Button variant="ghost" size="sm" onclick={() => (refreshVersion += 1)}>
					Try again
				</Button>
			{/if}
		</div>
	</div>
	{#if !loading && access?.status === 'reconnect_required'}
		<p class="mt-2 text-xs text-muted-foreground">Approve agent access again to resume.</p>
	{/if}
	{#if error || callbackError}
		<p class="mt-2 text-xs text-destructive" role="alert">{error || callbackError}</p>
	{:else if callbackConnected && access?.status === 'active'}
		<p class="mt-2 text-xs text-success" role="status">Agent access approved.</p>
	{/if}
</div>
