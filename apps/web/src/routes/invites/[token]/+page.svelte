<!-- apps/web/src/routes/invites/[token]/+page.svelte -->
<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { browserPushService } from '$lib/services/browser-push.service';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { SITE_URL } from '$lib/constants/seo';
	import {
		AlertCircle,
		ArrowRight,
		Bell,
		CheckCircle2,
		LogIn,
		Mail,
		UserPlus
	} from '$lib/icons/lucide';
	import {
		inviteeRoleSentence,
		roleWithArticle,
		shortDate
	} from '$lib/components/people/people-copy';

	let { data } = $props();

	let accepting = $state(false);
	let declining = $state(false);
	let configuringNotifications = $state(false);
	let actionError = $state('');
	let acceptedRedirectPath = $state<string | null>(null);
	let showNotificationPrompt = $state(false);
	let localRecoverableUntil = $state<string | null>(null);

	let invite = $derived(data?.invite ?? null);
	let localStatusOverride = $state<string | null>(null);
	let localStatus = $derived(localStatusOverride ?? invite?.status ?? null);
	let isPending = $derived(localStatus === 'pending');
	let canAcceptInvite = $derived(
		isPending ||
			(localStatus === 'declined' &&
				(invite?.can_accept === true || Boolean(localRecoverableUntil)))
	);
	let inviterName = $derived(invite?.invited_by_name || invite?.invited_by_email || 'Someone');
	let expiresLabel = $derived(shortDate(invite?.expires_at) || null);
	let projectLabel = $derived(invite?.project_name?.trim() || 'this project');
	let alreadyMember = $derived(data?.status === 'ready' && data?.alreadyMember === true);
	let projectHref = $derived(invite?.project_id ? `/projects/${invite.project_id}` : '/projects');
	/** Why this invite can't be accepted, in the invitee's terms. */
	let closedMessage = $derived.by(() => {
		switch (localStatus) {
			case 'accepted':
				return 'You already accepted this invite.';
			case 'expired':
				return `This invite expired${expiresLabel ? ` on ${expiresLabel}` : ''}. Ask ${inviterName} to send a new one.`;
			case 'revoked':
				return `${inviterName} canceled this invite. Ask them if you think that’s a mistake.`;
			case 'declined':
				return 'You declined this invite, and it can’t be accepted anymore. Ask for a new one if you changed your mind.';
			default:
				return 'This invite can’t be accepted anymore.';
		}
	});
	let recoverableLabel = $derived.by(() => {
		const value = localRecoverableUntil ?? invite?.recoverable_until ?? null;
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	});
	let authRedirect = $derived((data?.redirectTo as string | undefined) ?? '/invites');
	let loginUrl = $derived(`/auth/login?redirect=${encodeURIComponent(authRedirect)}`);
	let registerUrl = $derived(`/auth/register?redirect=${encodeURIComponent(authRedirect)}`);
	let logoutUrl = $derived(`/auth/logout?redirect=${encodeURIComponent(loginUrl)}`);
	let inviteProjectName = $derived(
		typeof invite?.project_name === 'string' && invite.project_name.trim()
			? invite.project_name.trim()
			: null
	);
	let inviteTitle = $derived(
		inviteProjectName
			? `${inviteProjectName} | BuildOS Project Invite`
			: 'Project Invite | BuildOS'
	);
	let inviteDescription = $derived(
		inviteProjectName
			? `${inviterName} invited you to ${inviteProjectName} on BuildOS.`
			: 'You’ve been invited to a project on BuildOS.'
	);
	let inviteCanonical = $derived(`${SITE_URL}${authRedirect}`);

	async function updateNotificationPreferences(
		updates: Record<string, unknown>,
		context: string
	): Promise<void> {
		const response = await fetch('/api/notification-preferences', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updates)
		});

		if (!response.ok) {
			let errorMessage = `Failed to update notification preferences (${context})`;
			try {
				const payload = await response.json();
				errorMessage = payload?.error || payload?.message || errorMessage;
			} catch {
				// Keep default message if response is not JSON.
			}
			throw new Error(errorMessage);
		}
	}

	async function continueToAcceptedProject() {
		if (!acceptedRedirectPath) return;
		await goto(acceptedRedirectPath);
	}

	async function enableNotificationsAndContinue() {
		if (!acceptedRedirectPath || configuringNotifications) return;
		configuringNotifications = true;
		actionError = '';

		try {
			// Ensure collaboration notifications remain visible in-app.
			await updateNotificationPreferences({ in_app_enabled: true }, 'in-app');

			if (!browserPushService.isSupported()) {
				toastService.warning(
					'Push is not supported in this browser. In-app notifications enabled.'
				);
				await continueToAcceptedProject();
				return;
			}

			const granted = await browserPushService.requestPermission();
			if (!granted) {
				toastService.warning(
					'Push permission not granted. In-app notifications are enabled for project updates.'
				);
				await continueToAcceptedProject();
				return;
			}

			await browserPushService.subscribe();
			await updateNotificationPreferences(
				{
					in_app_enabled: true,
					push_enabled: true
				},
				'push'
			);

			toastService.success('Push notifications enabled for this device.');
			await continueToAcceptedProject();
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: '/api/notification-preferences',
				method: 'PUT',
				projectId: invite?.project_id ?? undefined,
				entityType: 'project_invite',
				entityId: invite?.invite_id ?? undefined,
				operation: 'project_invite_notification_opt_in',
				metadata: {
					source: 'invite_token_page'
				}
			});

			actionError =
				err instanceof Error
					? err.message
					: 'Failed to configure notifications. You can update later.';
		} finally {
			configuringNotifications = false;
		}
	}

	async function skipNotificationPrompt() {
		if (!acceptedRedirectPath || configuringNotifications) return;
		configuringNotifications = true;
		actionError = '';

		try {
			// Default to in-app for shared project activity visibility.
			await updateNotificationPreferences({ in_app_enabled: true }, 'in-app');
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: '/api/notification-preferences',
				method: 'PUT',
				projectId: invite?.project_id ?? undefined,
				entityType: 'project_invite',
				entityId: invite?.invite_id ?? undefined,
				operation: 'project_invite_notification_in_app_default',
				metadata: {
					source: 'invite_token_page'
				}
			});
			// Continue even if preference update fails; user can adjust in settings.
		} finally {
			configuringNotifications = false;
		}

		await continueToAcceptedProject();
	}

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
			void invalidate('app:invites');

			const projectId = payload?.data?.projectId ?? payload?.data?.project_id;
			acceptedRedirectPath = projectId
				? `/projects/${projectId}?message=${encodeURIComponent('Invite accepted')}`
				: `/projects?message=${encodeURIComponent('Invite accepted')}`;
			showNotificationPrompt = true;
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
			localRecoverableUntil = payload?.data?.recoverableUntil ?? null;
			toastService.success('Invite declined. You can still accept it for 48 hours.');
			void invalidate('app:invites');
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

<SEOHead
	title={inviteTitle}
	description={inviteDescription}
	canonical={inviteCanonical}
	noindex={true}
/>

<div class="min-h-screen bg-background flex items-center justify-center px-4 py-8">
	<div class="w-full max-w-sm">
		{#if data?.status === 'error'}
			<div
				class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-static tx-weak"
			>
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-destructive/10"
					>
						<AlertCircle class="w-5 h-5 text-destructive" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="micro-label text-muted-foreground">Project invite</p>
						<h1 class="mt-1 text-lg font-semibold text-foreground">
							{data.title ?? 'This invite isn’t available'}
						</h1>
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
						<p class="micro-label text-accent">Project invite</p>
						<h1 class="mt-1 text-xl font-semibold text-foreground">
							{inviterName} invited you to {projectLabel}
						</h1>
					</div>
				</div>

				<div
					class="mt-4 rounded-lg border border-border bg-background px-3.5 py-3 shadow-ink-inner space-y-2"
				>
					<p class="text-sm text-foreground">
						<span class="font-semibold"
							>You’ll join as {roleWithArticle(invite?.role_key)}.</span
						>
						{inviteeRoleSentence(invite?.role_key)}
					</p>
					{#if expiresLabel && isPending && !alreadyMember}
						<p class="text-xs text-muted-foreground">
							This invite works until {expiresLabel}.
						</p>
					{/if}
				</div>

				{#if actionError}
					<p class="mt-3 text-sm text-destructive">{actionError}</p>
				{/if}

				{#if data?.status === 'unauthenticated'}
					<div class="mt-4 space-y-2">
						<a
							href={registerUrl}
							class="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<UserPlus class="w-4 h-4" />
							Create account to accept
						</a>
						<a
							href={loginUrl}
							class="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<LogIn class="w-4 h-4" />
							Sign in to accept
						</a>
						<p class="pt-1 text-xs text-muted-foreground">
							Use the email this invite was sent to. After you sign in, you come right
							back here.
						</p>
					</div>
				{:else if data?.status === 'ready'}
					{#if alreadyMember && !showNotificationPrompt}
						<p class="mt-4 text-sm text-foreground">
							You’re already in {projectLabel}.
						</p>
						<div class="mt-3">
							<a
								href={projectHref}
								class="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Open {projectLabel}
								<ArrowRight class="w-4 h-4" />
							</a>
						</div>
					{:else if !canAcceptInvite}
						<div
							class="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
							role="status"
						>
							{closedMessage}
						</div>
						<div class="mt-4">
							<a
								href="/projects"
								class="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Go to your projects
								<ArrowRight class="w-4 h-4" />
							</a>
						</div>
					{:else if !data?.emailMatches}
						<div
							class="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
							role="status"
						>
							This invite was sent to <strong class="text-foreground"
								>{data?.inviteeEmailHint ?? 'a different email'}</strong
							>, and you’re signed in as
							<strong class="text-foreground">{data?.userEmail}</strong>. Switch to
							the invited account to accept it.
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
							{#if showNotificationPrompt && acceptedRedirectPath}
								<div class="rounded-lg border border-border bg-background/70 p-3">
									<div class="flex items-start gap-2">
										<div
											class="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-accent/10"
										>
											<Bell class="w-4 h-4 text-accent" />
										</div>
										<div class="min-w-0">
											<p class="text-sm font-semibold text-foreground">
												Stay updated?
											</p>
											<p class="mt-1 text-xs text-muted-foreground">
												Enable notifications for activity in
												<strong
													>{invite?.project_name ||
														'this project'}</strong
												>.
											</p>
										</div>
									</div>
								</div>
								<button
									onclick={enableNotificationsAndContinue}
									disabled={configuringNotifications}
									class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 disabled:opacity-60"
								>
									{#if configuringNotifications}
										Enabling...
									{:else}
										Enable push notifications
									{/if}
									<Bell class="w-4 h-4" />
								</button>
								<button
									onclick={skipNotificationPrompt}
									disabled={configuringNotifications}
									class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted disabled:opacity-60"
								>
									Continue without push
								</button>
							{:else}
								{#if localStatus === 'declined'}
									<div
										class="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-accent"
									>
										Declined · recoverable{recoverableLabel
											? ` until ${recoverableLabel}`
											: ' for 48 hours'}
									</div>
								{/if}
								<button
									onclick={handleAccept}
									disabled={accepting || declining}
									class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 disabled:opacity-60"
								>
									{#if accepting}
										Accepting...
									{:else}
										{localStatus === 'declined'
											? 'Accept anyway'
											: 'Accept invite'}
									{/if}
									<CheckCircle2 class="w-4 h-4" />
								</button>
								{#if isPending}
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
								{/if}
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
