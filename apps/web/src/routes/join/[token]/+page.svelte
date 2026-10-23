<!-- apps/web/src/routes/join/[token]/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { SITE_URL } from '$lib/constants/seo';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { AlertCircle, ArrowRight, Link2, LogIn, UserPlus } from '$lib/icons/lucide';
	import {
		inviteLinkProblem,
		inviteeAgentSentence,
		inviteeRoleSentence,
		roleWithArticle,
		shortDate
	} from '$lib/components/people/people-copy';

	let { data } = $props();

	let joining = $state(false);
	let actionError = $state<string | null>(null);
	/** A status the join call came back with (the link changed after the page loaded). */
	let joinProblem = $state<{ status: string; projectName: string | null } | null>(null);

	const preview = $derived(data.preview);
	const active = $derived(preview.status === 'active' ? preview : null);
	const signedIn = $derived(Boolean(data.viewer));
	const projectName = $derived(active?.project_name?.trim() || 'this project');
	const inviter = $derived(active?.inviter_name ?? null);
	const until = $derived(shortDate(active?.expires_at));
	const problem = $derived(
		joinProblem
			? inviteLinkProblem(joinProblem.status, joinProblem.projectName)
			: active
				? null
				: data.loadError
					? {
							title: 'We couldn’t open this invite link',
							message: 'Refresh the page to try again.'
						}
					: inviteLinkProblem(preview.status)
	);

	const redirectTo = $derived(data.redirectTo || '/');
	const loginUrl = $derived(`/auth/login?redirect=${encodeURIComponent(redirectTo)}`);
	const registerUrl = $derived(`/auth/register?redirect=${encodeURIComponent(redirectTo)}`);
	const switchAccountUrl = $derived(`/auth/logout?redirect=${encodeURIComponent(loginUrl)}`);
	const homeUrl = $derived(signedIn ? '/projects' : '/');

	const pageTitle = $derived(
		active ? `${projectName} | Join on BuildOS` : 'Project invite | BuildOS'
	);
	const pageDescription = $derived(
		active
			? `${inviter ?? 'Someone'} invited you to join ${projectName} on BuildOS.`
			: 'A BuildOS project invite link.'
	);

	async function join() {
		if (!active || joining) return;
		joining = true;
		actionError = null;
		let responseStatus: number | null = null;

		try {
			const response = await fetch('/api/onto/invite-links/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ token: data.token })
			});
			responseStatus = response.status;
			const payload = await response.json().catch(() => null);

			if (response.status === 401) {
				await goto(loginUrl);
				return;
			}
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Joining didn’t work. Try again.');
			}

			const result = payload.data ?? {};
			const name = result.project_name || projectName;
			if (
				(result.status === 'joined' || result.status === 'already_member') &&
				result.project_id
			) {
				toastService.success(
					result.status === 'joined' ? `You joined ${name}` : `You’re already in ${name}`
				);
				await goto(`/projects/${result.project_id}`, { invalidateAll: true });
				return;
			}
			joinProblem = { status: String(result.status ?? 'not_found'), projectName: name };
		} catch (err) {
			void logOntologyClientError(err, {
				endpoint: '/api/onto/invite-links/join',
				method: 'POST',
				entityType: 'project_invite_link',
				operation: 'project_invite_link_join',
				metadata: { source: 'join_page', status: responseStatus }
			});
			actionError = err instanceof Error ? err.message : 'Joining didn’t work. Try again.';
		} finally {
			joining = false;
		}
	}
</script>

<SEOHead
	title={pageTitle}
	description={pageDescription}
	canonical={`${SITE_URL}${redirectTo}`}
	noindex={true}
/>

<main class="min-h-screen bg-background flex items-center justify-center px-4 py-8">
	<div class="w-full max-w-sm">
		{#if problem}
			<section
				class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-static tx-weak"
				aria-labelledby="join-problem-title"
			>
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-muted"
						aria-hidden="true"
					>
						<AlertCircle class="w-5 h-5 text-muted-foreground" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="micro-label text-muted-foreground">Invite link</p>
						<h1
							id="join-problem-title"
							class="mt-1 text-lg font-semibold text-foreground"
						>
							{problem.title}
						</h1>
						<p class="mt-1.5 text-sm text-muted-foreground">{problem.message}</p>
					</div>
				</div>
				<div class="mt-5 pt-4 border-t border-border">
					<a
						href={homeUrl}
						class="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{signedIn ? 'Go to your projects' : 'Go to BuildOS'}
						<ArrowRight class="w-4 h-4" />
					</a>
				</div>
			</section>
		{:else if active}
			<section
				class="rounded-lg border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak"
				aria-labelledby="join-title"
			>
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10"
						aria-hidden="true"
					>
						<Link2 class="w-5 h-5 text-accent" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="micro-label text-accent">Project invite</p>
						<h1 id="join-title" class="mt-1 text-xl font-semibold text-foreground">
							{#if inviter}
								{inviter} invited you to {projectName}
							{:else}
								You’re invited to {projectName}
							{/if}
						</h1>
					</div>
				</div>

				<div
					class="mt-4 rounded-lg border border-border bg-background px-3.5 py-3 shadow-ink-inner space-y-2"
				>
					<p class="text-sm text-foreground">
						<span class="font-semibold"
							>You’ll join as {roleWithArticle(active.role_key)}.</span
						>
						{inviteeRoleSentence(active.role_key)}
					</p>
					<p class="text-sm text-muted-foreground">
						{inviteeAgentSentence(active.agent_access)}
					</p>
					{#if until && !active.already_member}
						<p class="text-xs text-muted-foreground">This link works until {until}.</p>
					{/if}
				</div>

				{#if actionError}
					<p class="mt-3 text-sm text-destructive" role="alert">{actionError}</p>
				{/if}

				{#if active.already_member && active.project_id}
					<p class="mt-4 text-sm text-foreground">You’re already in {projectName}.</p>
					<a
						href={`/projects/${active.project_id}`}
						class="mt-3 inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Open {projectName}
						<ArrowRight class="w-4 h-4" />
					</a>
				{:else if !signedIn}
					<div class="mt-4 space-y-2">
						<a
							href={registerUrl}
							class="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<UserPlus class="w-4 h-4" />
							Create an account to join
						</a>
						<a
							href={loginUrl}
							class="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-ink pressable transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<LogIn class="w-4 h-4" />
							Sign in to join
						</a>
						<p class="pt-1 text-xs text-muted-foreground">
							After you sign in, you come right back here to finish joining.
						</p>
					</div>
				{:else}
					<div class="mt-4 space-y-2">
						<button
							type="button"
							onclick={join}
							disabled={joining}
							class="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
						>
							{joining ? 'Joining…' : `Join ${projectName}`}
							{#if !joining}<ArrowRight class="w-4 h-4" />{/if}
						</button>
						{#if data.viewer?.email}
							<p class="text-xs text-muted-foreground">
								Joining as <span class="font-medium text-foreground"
									>{data.viewer.email}</span
								>.
								<a
									href={switchAccountUrl}
									class="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
									>Not you? Switch account</a
								>
							</p>
						{/if}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
