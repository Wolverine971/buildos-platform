<!-- apps/web/src/lib/components/onboarding-v3/PeopleStep.svelte -->
<!--
	Optional onboarding step: claim a handle so people can find you, then invite someone
	into the project you just made. This is the people layer's front door
	(docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AtSign,
		Bot,
		Check,
		CheckCircle2,
		Copy,
		Mail,
		Search,
		UserPlus,
		Users
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import ProjectInviteLinkPanel from '$lib/components/project/ProjectInviteLinkPanel.svelte';
	import { captureEvent } from '$lib/services/posthog';
	import {
		isValidHandle,
		normalizeHandleInput,
		takeSignupHandle
	} from '$lib/utils/onboarding-state';

	interface Props {
		projectId: string | null;
		projectName?: string | null;
		busy?: boolean;
		onNext: () => void | Promise<void>;
	}
	let { projectId, projectName = null, busy = false, onNext }: Props = $props();

	let loading = $state(true);
	let loadError = $state(false);
	let claimedHandle = $state<string | null>(null);
	let findable = $state(true);
	let profileName = $state<string | null>(null);
	let profileBio = $state<string | null>(null);
	let handleInput = $state('');
	let claiming = $state(false);
	let claimError = $state<string | null>(null);
	let copied = $state(false);

	let inviteEmail = $state('');
	let inviting = $state(false);
	let inviteError = $state<string | null>(null);
	let invitedEmails = $state<string[]>([]);
	let finishing = $state(false);

	const projectLabel = $derived(projectName?.trim() || 'your project');
	const normalizedHandle = $derived(normalizeHandleInput(handleInput));
	const handleLooksValid = $derived(isValidHandle(normalizedHandle));
	const previewHandle = $derived(handleLooksValid ? normalizedHandle : 'yourname');
	const previewInitial = $derived((profileName ?? previewHandle).charAt(0).toUpperCase());

	function suggestHandle(source: string): string {
		const slug = source
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '')
			.slice(0, 24);
		return slug.length >= 3 ? slug : '';
	}

	onMount(() => {
		void loadProfile();
	});

	async function loadProfile() {
		loading = true;
		loadError = false;
		try {
			const response = await fetch('/api/profile/me/username');
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) throw new Error('load failed');
			const data = result.data ?? {};
			claimedHandle = typeof data.username === 'string' ? data.username : null;
			findable = claimedHandle ? data.discoverability === 'handle' : true;
			profileName = typeof data.name === 'string' ? data.name : null;
			profileBio = typeof data.bio === 'string' ? data.bio : null;
			const signupHandle = takeSignupHandle();
			if (!claimedHandle) {
				handleInput =
					signupHandle ??
					(typeof data.derived_fallback === 'string'
						? suggestHandle(data.derived_fallback)
						: '');
			}
			loading = false;
			// They picked this on the signup page; claim it now that the account exists.
			if (!claimedHandle && signupHandle) await claimHandle(undefined, 'signup');
		} catch {
			loadError = true;
		} finally {
			loading = false;
		}
	}

	async function saveFindable(next: boolean): Promise<boolean> {
		const response = await fetch('/api/profile/me/discoverability', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ discoverability: next ? 'handle' : 'none' })
		});
		return response.ok;
	}

	async function claimHandle(
		event?: SubmitEvent,
		source: 'signup' | 'onboarding' = 'onboarding'
	) {
		event?.preventDefault();
		if (!handleLooksValid || claiming) return;
		claiming = true;
		claimError = null;
		try {
			const response = await fetch('/api/profile/me/username', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: normalizedHandle })
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) {
				claimError =
					response.status === 409
						? `@${normalizedHandle} is taken. Try another.`
						: typeof result?.error === 'string'
							? result.error
							: 'That handle could not be saved. Try again.';
				return;
			}
			claimedHandle =
				typeof result.data?.username === 'string' ? result.data.username : normalizedHandle;
			if (findable && !(await saveFindable(true))) {
				findable = false;
				claimError =
					'Your handle is saved, but finding you by it is still off. You can turn it on in your profile.';
			}
			captureEvent('onboarding_handle_claimed', { findable, source });
		} catch {
			claimError = 'That handle could not be saved. Try again.';
		} finally {
			claiming = false;
		}
	}

	async function toggleFindable() {
		const next = !findable;
		findable = next;
		if (claimedHandle && !(await saveFindable(next))) findable = !next;
	}

	async function copyHandle() {
		if (!claimedHandle) return;
		try {
			await navigator.clipboard.writeText(`@${claimedHandle}`);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	async function sendInvite(event?: SubmitEvent) {
		event?.preventDefault();
		const email = inviteEmail.trim();
		if (!projectId || !email || inviting) return;
		inviting = true;
		inviteError = null;
		try {
			const response = await fetch(`/api/onto/projects/${projectId}/invites`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, role_key: 'viewer', agent_access: 'read' })
			});
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) {
				inviteError =
					typeof result?.error === 'string'
						? result.error
						: 'The invite could not be sent. Try again.';
				return;
			}
			invitedEmails = [...invitedEmails, email];
			inviteEmail = '';
			captureEvent('onboarding_invite_sent', { invites_sent: invitedEmails.length });
		} catch {
			inviteError = 'The invite could not be sent. Try again.';
		} finally {
			inviting = false;
		}
	}

	async function finish(skipped: boolean) {
		if (finishing || busy) return;
		finishing = true;
		try {
			captureEvent('onboarding_people_step_completed', {
				skipped,
				claimed: Boolean(claimedHandle),
				findable: Boolean(claimedHandle) && findable,
				invites_sent: invitedEmails.length
			});
			await onNext();
		} finally {
			finishing = false;
		}
	}
</script>

<div class="max-w-xl mx-auto px-4 py-8 sm:py-12">
	<div class="text-center mb-8">
		<div class="flex justify-center mb-5">
			<div
				class="flex h-14 w-14 items-center justify-center rounded-lg bg-muted shadow-ink tx tx-bloom tx-weak"
			>
				<Users class="w-7 h-7 text-accent" />
			</div>
		</div>
		<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">
			{claimedHandle ? 'Bring someone in' : 'Claim your handle'}
		</h1>
		<p class="text-lg text-muted-foreground">
			{#if claimedHandle}
				Most things go better with one more person on them. Invite someone to {projectLabel},
				or share your handle so people can find you.
			{:else}
				Your handle is how people find you on BuildOS. Use it to bring others into what
				you're building, and to see what they're building. It's optional, and you decide
				what anyone sees.
			{/if}
		</p>
	</div>

	{#if loading}
		<p class="py-8 text-center text-sm text-muted-foreground" role="status">Loading…</p>
	{:else if loadError}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4" role="alert">
			<p class="mb-3 text-sm text-foreground">Your profile couldn't be loaded.</p>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={loadProfile}>Retry</Button>
				<Button variant="ghost" onclick={() => finish(true)} disabled={finishing || busy}
					>Skip for now</Button
				>
			</div>
		</div>
	{:else if !claimedHandle}
		<ul class="mb-8 space-y-3" aria-label="What a handle lets you do">
			<li class="flex gap-4 rounded-lg border border-border bg-card p-4 shadow-ink">
				<span
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-accent"
					aria-hidden="true"><Search class="h-5 w-5" /></span
				>
				<div class="min-w-0">
					<p class="font-semibold text-foreground">Find people you build with</p>
					<p class="text-sm text-muted-foreground">
						Look someone up by their handle and ask to see their projects.
					</p>
				</div>
			</li>
			<li class="flex gap-4 rounded-lg border border-border bg-card p-4 shadow-ink">
				<span
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-accent"
					aria-hidden="true"><UserPlus class="h-5 w-5" /></span
				>
				<div class="min-w-0">
					<p class="font-semibold text-foreground">Invite people into {projectLabel}</p>
					<p class="text-sm text-muted-foreground">
						A collaborator, a mentor, a friend who keeps you honest. You choose whether
						they can view or edit.
					</p>
				</div>
			</li>
			<li class="flex gap-4 rounded-lg border border-border bg-card p-4 shadow-ink">
				<span
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-accent"
					aria-hidden="true"><Bot class="h-5 w-5" /></span
				>
				<div class="min-w-0">
					<p class="font-semibold text-foreground">Let their agents pitch in</p>
					<p class="text-sm text-muted-foreground">
						When you work on something together, their AI agent can read the project
						too. Only if you allow it, and you can turn it off anytime.
					</p>
				</div>
			</li>
		</ul>

		<form onsubmit={claimHandle} class="space-y-4" novalidate>
			<div>
				<label
					for="onboarding-handle"
					class="mb-1.5 block text-sm font-medium text-foreground">Your handle</label
				>
				<TextInput
					id="onboarding-handle"
					bind:value={handleInput}
					icon={AtSign}
					placeholder="yourname"
					autocomplete="nickname"
					autocapitalize="none"
					spellcheck={false}
					disabled={claiming}
					aria-describedby="onboarding-handle-hint"
				/>
				<p id="onboarding-handle-hint" class="mt-1.5 text-xs text-muted-foreground">
					3 to 24 lowercase letters, numbers, or hyphens. You can change it later.
				</p>
			</div>

			<label
				class="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4"
			>
				<input
					type="checkbox"
					bind:checked={findable}
					disabled={claiming}
					class="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-accent focus:ring-2 focus:ring-ring"
				/>
				<span class="min-w-0">
					<span class="block font-medium text-foreground"
						>Let people find me by this handle</span
					>
					<span class="block text-sm text-muted-foreground"
						>They'll see your name, handle, and bio. Never your email.</span
					>
				</span>
			</label>

			{#if findable}
				<figure
					class="rounded-lg border border-dashed border-border p-4"
					aria-label="Preview of what people see when they look you up"
				>
					<figcaption class="micro-label mb-3 text-muted-foreground">
						What people see when they look you up
					</figcaption>
					<div class="flex items-center gap-3 rounded-lg bg-card p-3 shadow-ink">
						<span
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent"
							aria-hidden="true">{previewInitial}</span
						>
						<div class="min-w-0 flex-1">
							<p class="truncate font-semibold text-foreground">
								{profileName ?? `@${previewHandle}`}
							</p>
							<p class="stamp truncate text-xs text-muted-foreground">
								@{previewHandle}{#if profileBio}<span class="font-sans"
										>{` · ${profileBio}`}</span
									>{/if}
							</p>
						</div>
						<span
							class="hidden shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground sm:inline-flex"
							aria-hidden="true"><UserPlus class="h-3.5 w-3.5" /> Ask for access</span
						>
					</div>
				</figure>
			{/if}

			{#if claimError}
				<p
					class="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
					role="alert"
				>
					{claimError}
				</p>
			{/if}

			<div class="flex flex-col items-stretch gap-3 pt-2 sm:items-center">
				<Button
					type="submit"
					variant="primary"
					size="lg"
					loading={claiming}
					disabled={!handleLooksValid || claiming}
					class="w-full sm:w-auto sm:min-w-[240px]"
				>
					{handleLooksValid ? `Claim @${normalizedHandle}` : 'Claim your handle'}
				</Button>
				<Button
					type="button"
					variant="ghost"
					onclick={() => finish(true)}
					disabled={claiming || finishing || busy}>Skip for now</Button
				>
			</div>
		</form>
	{:else}
		<div class="mb-6 rounded-lg border border-success/30 bg-success/10 p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="flex items-center gap-2 font-semibold text-foreground">
					<CheckCircle2 class="h-5 w-5 shrink-0 text-success" />
					You're @{claimedHandle}
				</p>
				<Button variant="outline" size="sm" onclick={copyHandle}>
					{#if copied}<Check class="h-4 w-4" /> Copied{:else}<Copy class="h-4 w-4" /> Copy
						handle{/if}
				</Button>
			</div>
			<label class="mt-3 flex cursor-pointer items-center gap-3 text-sm text-foreground">
				<input
					type="checkbox"
					checked={findable}
					onchange={toggleFindable}
					class="h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-2 focus:ring-ring"
				/>
				Let people find me by this handle
			</label>
		</div>

		{#if projectId}
			<div class="mb-4 rounded-lg border border-border bg-card p-5 shadow-ink">
				<ProjectInviteLinkPanel {projectId} projectName={projectLabel} />
			</div>
			<section
				class="mb-8 rounded-lg border border-border bg-card p-5 shadow-ink"
				aria-labelledby="onboarding-invite-heading"
			>
				<h2 id="onboarding-invite-heading" class="text-lg font-semibold text-foreground">
					Or invite someone by email
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					They'll get an email with a link to join {projectLabel} as a viewer. Their agents
					can read it too. You can change either later in the project's sharing settings.
				</p>
				<form onsubmit={sendInvite} class="mt-4 flex flex-col gap-2 sm:flex-row" novalidate>
					<div class="min-w-0 flex-1">
						<label for="onboarding-invite-email" class="sr-only">Their email</label>
						<TextInput
							id="onboarding-invite-email"
							type="email"
							bind:value={inviteEmail}
							icon={Mail}
							placeholder="name@example.com"
							autocomplete="off"
							disabled={inviting}
						/>
					</div>
					<Button
						type="submit"
						variant="secondary"
						loading={inviting}
						disabled={inviting || !inviteEmail.trim()}>Send invite</Button
					>
				</form>
				{#if inviteError}
					<p class="mt-2 text-sm text-destructive" role="alert">{inviteError}</p>
				{/if}
				{#if invitedEmails.length > 0}
					<ul class="mt-3 space-y-1" aria-label="Invites sent">
						{#each invitedEmails as email (email)}
							<li class="flex items-center gap-2 text-sm text-foreground">
								<Check class="h-4 w-4 shrink-0 text-success" />
								Invite sent to {email}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<div class="flex flex-col items-stretch gap-3 sm:items-center">
			<Button
				variant="primary"
				size="lg"
				onclick={() => finish(false)}
				loading={finishing || busy}
				disabled={finishing || busy}
				class="w-full sm:w-auto sm:min-w-[240px]">Continue</Button
			>
		</div>
	{/if}
</div>
