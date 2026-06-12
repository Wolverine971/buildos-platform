<!-- apps/web/src/routes/invites/+page.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { AlertCircle, ArrowRight, CheckCircle2, UserPlus, XCircle } from 'lucide-svelte';

	let { data } = $props();

	type InviteRow = {
		invite_id: string;
		project_id?: string | null;
		project_name: string;
		role_key?: string | null;
		status?: string | null;
		expires_at?: string | null;
		created_at?: string | null;
		declined_at?: string | null;
		recoverable_until?: string | null;
		can_accept?: boolean | null;
		invited_by_name?: string | null;
		invited_by_email?: string | null;
	};

	const initialInvites = untrack(() => (data?.invites as InviteRow[]) ?? []);

	let invites = $state<InviteRow[]>(initialInvites);
	let actionError = $state('');
	let processingId = $state<string | null>(null);

	function formatDate(value: string | null | undefined) {
		if (!value) return 'Unknown';
		return new Date(value).toLocaleDateString();
	}

	function formatShortDate(value: string | null | undefined) {
		if (!value) return 'Unknown';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function canAcceptInvite(invite: InviteRow) {
		return (
			invite.status === 'pending' ||
			(invite.status === 'declined' && invite.can_accept === true)
		);
	}

	async function handleAccept(inviteId: string, projectId?: string | null) {
		if (!inviteId || processingId) return;
		actionError = '';
		processingId = inviteId;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/invites/${inviteId}/accept`, {
				method: 'POST'
			});
			responseStatus = response.status;
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to accept invite');
			}

			toastService.success('Invite accepted');
			await invalidate('app:invites');

			const resolvedProjectId =
				payload?.data?.projectId ?? payload?.data?.project_id ?? projectId;
			const redirectPath = resolvedProjectId
				? `/projects/${resolvedProjectId}?message=${encodeURIComponent('Invite accepted')}`
				: `/projects?message=${encodeURIComponent('Invite accepted')}`;

			await goto(redirectPath);
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: `/api/onto/invites/${inviteId}/accept`,
				method: 'POST',
				projectId: projectId ?? undefined,
				entityType: 'project_invite',
				entityId: inviteId,
				operation: 'project_invite_accept',
				metadata: {
					source: 'invite_page',
					status: responseStatus
				}
			});
			actionError = err instanceof Error ? err.message : 'Failed to accept invite';
		} finally {
			processingId = null;
		}
	}

	async function handleDecline(inviteId: string) {
		if (!inviteId || processingId) return;
		actionError = '';
		processingId = inviteId;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/invites/${inviteId}/decline`, {
				method: 'POST'
			});
			responseStatus = response.status;
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to decline invite');
			}

			const declinedAt = payload?.data?.declinedAt ?? new Date().toISOString();
			const recoverableUntil = payload?.data?.recoverableUntil ?? null;
			invites = invites.map((invite) =>
				invite.invite_id === inviteId
					? {
							...invite,
							status: 'declined',
							declined_at: declinedAt,
							recoverable_until: recoverableUntil,
							can_accept: true
						}
					: invite
			);
			toastService.success('Invite declined. You can still accept it for 48 hours.');
			void invalidate('app:invites');
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: `/api/onto/invites/${inviteId}/decline`,
				method: 'POST',
				entityType: 'project_invite',
				entityId: inviteId,
				operation: 'project_invite_decline',
				metadata: {
					source: 'invite_page',
					status: responseStatus
				}
			});
			actionError = err instanceof Error ? err.message : 'Failed to decline invite';
		} finally {
			processingId = null;
		}
	}
</script>

<svelte:head>
	<title>Project Invites | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background px-4 py-10">
	<div class="mx-auto w-full max-w-2xl">
		<div class="mb-6">
			<h1 class="text-2xl font-semibold text-foreground">Project invites</h1>
			<p class="text-sm text-muted-foreground">
				Accept, decline, or recover recently declined project invitations.
			</p>
		</div>

		{#if data?.status === 'error'}
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-destructive/10"
					>
						<AlertCircle class="w-5 h-5 text-destructive" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-1">
							Invite Error
						</p>
						<h2 class="text-base font-semibold text-foreground">
							Unable to load invites
						</h2>
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
		{:else if invites.length === 0}
			<div class="rounded-lg border border-border bg-card p-6 text-center shadow-ink">
				<div
					class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10"
				>
					<UserPlus class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold text-foreground">No pending invites</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					You're all caught up. New and recently declined invitations will show up here.
				</p>
				<a
					href="/projects"
					class="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90"
				>
					Browse projects
					<ArrowRight class="w-4 h-4" />
				</a>
			</div>
		{:else}
			{#if actionError}
				<p class="mb-4 text-sm text-destructive">{actionError}</p>
			{/if}
			<div class="space-y-4">
				{#each invites as invite (invite.invite_id)}
					<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p
									class="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-1"
								>
									Project Invite
								</p>
								<h2 class="text-base font-semibold text-foreground">
									{invite.project_name}
								</h2>
								<p class="mt-1 text-sm text-muted-foreground">
									Invited by {invite.invited_by_name ||
										invite.invited_by_email ||
										'A teammate'}
								</p>
							</div>
							<div
								class="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground"
							>
								{invite.role_key === 'editor' ? 'Editor' : 'Viewer'}
							</div>
						</div>
						{#if invite.status === 'declined'}
							<div
								class="mt-3 rounded-md border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent"
							>
								Declined · recoverable until {formatShortDate(
									invite.recoverable_until
								)}
							</div>
						{/if}
						<div
							class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
						>
							<span>Expires {formatDate(invite.expires_at)}</span>
							<span>Invited {formatDate(invite.created_at)}</span>
						</div>
						<div class="mt-4 flex flex-wrap gap-2">
							{#if canAcceptInvite(invite)}
								<button
									onclick={() =>
										handleAccept(invite.invite_id, invite.project_id)}
									disabled={processingId === invite.invite_id}
									class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 disabled:opacity-60"
								>
									{invite.status === 'declined' ? 'Accept anyway' : 'Accept'}
									<CheckCircle2 class="w-4 h-4" />
								</button>
							{/if}
							{#if invite.status === 'pending'}
								<button
									onclick={() => handleDecline(invite.invite_id)}
									disabled={processingId === invite.invite_id}
									class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted disabled:opacity-60"
								>
									Decline
									<XCircle class="w-4 h-4" />
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
