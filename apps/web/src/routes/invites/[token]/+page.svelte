<!-- apps/web/src/routes/invites/[token]/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { AlertCircle, ArrowRight, CheckCircle2, Mail, UserPlus } from 'lucide-svelte';

	let { data } = $props();

	let accepting = $state(false);
	let declining = $state(false);
	let actionError = $state('');

	let invite = $derived(data?.invite ?? null);
	let localStatusOverride = $state<string | null>(null);
	let localStatus = $derived(localStatusOverride ?? invite?.status ?? null);
	let isPending = $derived(localStatus === 'pending');
	let inviterName = $derived(invite?.invited_by_name || invite?.invited_by_email || 'A teammate');
	let expiresLabel = $derived(
		invite?.expires_at ? new Date(invite.expires_at).toLocaleDateString() : null
	);
	let authRedirect = $derived((data?.redirectTo as string | undefined) ?? '/invites');
	let loginUrl = $derived(`/auth/login?redirect=${encodeURIComponent(authRedirect)}`);
	let registerUrl = $derived(`/auth/register?redirect=${encodeURIComponent(authRedirect)}`);
	let logoutUrl = $derived(`/auth/logout?redirect=${encodeURIComponent(loginUrl)}`);

	async function handleAccept() {
		if (!invite?.invite_id || accepting || declining) return;
		actionError = '';
		accepting = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/invites/${invite.invite_id}/accept`, {
				method: 'POST'
			});
			responseStatus = response.status;
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to accept invite');
			}

			toastService.success('Invite accepted');

			const projectId = payload?.data?.projectId ?? payload?.data?.project_id;
			const redirectPath = projectId
				? `/projects/${projectId}?message=${encodeURIComponent('Invite accepted')}`
				: `/projects?message=${encodeURIComponent('Invite accepted')}`;

			await goto(redirectPath);
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: `/api/onto/invites/${invite.invite_id}/accept`,
				method: 'POST',
				projectId: invite?.project_id ?? undefined,
				entityType: 'project_invite',
				entityId: invite?.invite_id ?? undefined,
				operation: 'project_invite_accept',
				metadata: {
					source: 'invite_token_page',
					status: responseStatus
				}
			});
			actionError = err instanceof Error ? err.message : 'Failed to accept invite';
		} finally {
			accepting = false;
		}
	}

	async function handleDecline() {
		if (!invite?.invite_id || accepting || declining) return;
		actionError = '';
		declining = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/invites/${invite.invite_id}/decline`, {
				method: 'POST'
			});
			responseStatus = response.status;
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to decline invite');
			}

			localStatusOverride = 'declined';
			toastService.success('Invite declined');
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: `/api/onto/invites/${invite.invite_id}/decline`,
				method: 'POST',
				projectId: invite?.project_id ?? undefined,
				entityType: 'project_invite',
				entityId: invite?.invite_id ?? undefined,
				operation: 'project_invite_decline',
				metadata: {
					source: 'invite_token_page',
					status: responseStatus
				}
			});
			actionError = err instanceof Error ? err.message : 'Failed to decline invite';
		} finally {
			declining = false;
		}
	}
</script>

<svelte:head>
	<title>Project Invite | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center px-4 py-8">
	<div class="w-full max-w-sm">
		{#if data?.status === 'error'}
			<div
				class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-static tx-weak"
			>
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/10"
					>
						<AlertCircle class="w-5 h-5 text-red-500" />
					</div>
					<div class="min-w-0 flex-1">
						<p
							class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-1"
						>
							Invite Error
						</p>
						<h1 class="text-base font-semibold text-foreground">Invite unavailable</h1>
						<p class="mt-1.5 text-sm text-muted-foreground">{data.message}</p>
					</div>
				</div>
				<div class="mt-4 pt-3 border-t border-border">
					<a
						href="/projects"
						class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90"
					>
						Go to projects
						<ArrowRight class="w-4 h-4" />
					</a>
				</div>
			</div>
		{:else}
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10"
					>
						<UserPlus class="w-5 h-5 text-accent" />
					</div>
					<div class="min-w-0 flex-1">
						<p
							class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-1"
						>
							Project Invite
						</p>
						<h1 class="text-base font-semibold text-foreground">
							{invite?.project_name || 'BuildOS project'}
						</h1>
						<p class="mt-1.5 text-sm text-muted-foreground">
							Invited by {inviterName}
						</p>
					</div>
				</div>

				<div class="mt-4 rounded-lg border border-border bg-background/60 px-3 py-2.5">
					<div class="flex items-center justify-between text-xs text-muted-foreground">
						<span class="uppercase tracking-[0.1em]">Role</span>
						<span class="font-semibold text-foreground">
							{invite?.role_key === 'editor' ? 'Editor' : 'Viewer'}
						</span>
					</div>
					{#if expiresLabel}
						<div
							class="mt-2 flex items-center justify-between text-xs text-muted-foreground"
						>
							<span class="uppercase tracking-[0.1em]">Expires</span>
							<span>{expiresLabel}</span>
						</div>
					{/if}
				</div>

				{#if actionError}
					<p class="mt-3 text-sm text-red-500">{actionError}</p>
				{/if}

				{#if data?.status === 'unauthenticated'}
					<div class="mt-4 space-y-2">
						<a
							href={loginUrl}
							class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90"
						>
							Sign in to accept
							<ArrowRight class="w-4 h-4" />
						</a>
						<a
							href={registerUrl}
							class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted"
						>
							Create account
							<UserPlus class="w-4 h-4" />
						</a>
					</div>
				{:else if data?.status === 'ready'}
					{#if !isPending}
						<div
							class="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
						>
							{#if localStatus === 'accepted'}Invite already accepted.{/if}
							{#if localStatus === 'expired'}This invite has expired.{/if}
							{#if localStatus === 'revoked'}This invite has been revoked.{/if}
							{#if localStatus === 'declined'}You declined this invite.{/if}
						</div>
						<div class="mt-4">
							<a
								href="/projects"
								class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90"
							>
								Go to projects
								<ArrowRight class="w-4 h-4" />
							</a>
						</div>
					{:else if !data?.emailMatches}
						<div
							class="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
						>
							This invite is for <strong>{invite?.invitee_email}</strong>. You're
							signed in as
							<strong>{data?.userEmail}</strong>.
						</div>
						<div class="mt-4">
							<a
								href={logoutUrl}
								class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90"
							>
								Switch account
								<Mail class="w-4 h-4" />
							</a>
						</div>
					{:else}
						<div class="mt-4 space-y-2">
							<button
								onclick={handleAccept}
								disabled={accepting || declining}
								class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 disabled:opacity-60"
							>
								{#if accepting}
									Accepting...
								{:else}
									Accept invite
								{/if}
								<CheckCircle2 class="w-4 h-4" />
							</button>
							<button
								onclick={handleDecline}
								disabled={accepting || declining}
								class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted disabled:opacity-60"
							>
								{#if declining}
									Declining...
								{:else}
									Decline invite
								{/if}
							</button>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
