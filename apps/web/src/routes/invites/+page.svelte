<!-- apps/web/src/routes/invites/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { AlertCircle, ArrowRight, CheckCircle2, Mail, UserPlus } from 'lucide-svelte';

	let { data } = $props();

	let invites = $state((data?.invites as any[]) ?? []);
	let actionError = $state('');
	let processingId = $state<string | null>(null);

	function formatDate(value: string | null | undefined) {
		if (!value) return 'Unknown';
		return new Date(value).toLocaleDateString();
	}

	async function handleAccept(inviteId: string, projectId?: string | null) {
		if (!inviteId || processingId) return;
		actionError = '';
		processingId = inviteId;

		try {
			const response = await fetch(`/api/onto/invites/${inviteId}/accept`, {
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to accept invite');
			}

			toastService.success('Invite accepted');

			const resolvedProjectId =
				payload?.data?.projectId ?? payload?.data?.project_id ?? projectId;
			const redirectPath = resolvedProjectId
				? `/projects/${resolvedProjectId}?message=${encodeURIComponent('Invite accepted')}`
				: `/projects?message=${encodeURIComponent('Invite accepted')}`;

			await goto(redirectPath);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to accept invite';
		} finally {
			processingId = null;
		}
	}

	async function handleDecline(inviteId: string) {
		if (!inviteId || processingId) return;
		actionError = '';
		processingId = inviteId;

		try {
			const response = await fetch(`/api/onto/invites/${inviteId}/decline`, {
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to decline invite');
			}

			invites = invites.filter((invite) => invite.invite_id !== inviteId);
			toastService.success('Invite declined');
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to decline invite';
		} finally {
			processingId = null;
		}
	}
</script>

<svelte:head>
	<title>Pending Invites | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background px-4 py-10">
	<div class="mx-auto w-full max-w-2xl">
		<div class="mb-6">
			<h1 class="text-2xl font-semibold text-foreground">Pending invites</h1>
			<p class="text-sm text-muted-foreground">
				Accept or decline invitations sent to your email address.
			</p>
		</div>

		{#if data?.status === 'error'}
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink">
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/10"
					>
						<AlertCircle class="w-5 h-5 text-red-500" />
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
					You're all caught up. New project invitations will show up here.
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
				<p class="mb-4 text-sm text-red-500">{actionError}</p>
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
						<div
							class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
						>
							<span>Expires {formatDate(invite.expires_at)}</span>
							<span>Invited {formatDate(invite.created_at)}</span>
						</div>
						<div class="mt-4 flex flex-wrap gap-2">
							<button
								onclick={() => handleAccept(invite.invite_id, invite.project_id)}
								disabled={processingId === invite.invite_id}
								class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 disabled:opacity-60"
							>
								Accept
								<CheckCircle2 class="w-4 h-4" />
							</button>
							<button
								onclick={() => handleDecline(invite.invite_id)}
								disabled={processingId === invite.invite_id}
								class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted disabled:opacity-60"
							>
								Decline
								<Mail class="w-4 h-4" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
