<!-- apps/web/src/lib/components/people/hub/YouSection.svelte -->
<!--
	Profile > People & agents > You: your @handle (also your public URL for
	published docs), whether people with it can find you, and whether requests
	sent by someone's agent reach you. Moved here from Account.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { AtSign } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import SettingsCard from '$lib/components/profile/_shared/SettingsCard.svelte';
	import { toastService } from '$lib/stores/toast.store';

	let {
		name,
		onchanged
	}: {
		/** Your display name, for the "what people see" preview. */
		name: string;
		/** Called after the handle or findability changes. */
		onchanged?: () => void;
	} = $props();

	let usernameValue = $state<string | null>(null);
	let usernameDraft = $state('');
	let derivedFallback = $state('user');
	let usernameLoading = $state(false);
	let usernameError = $state<string | null>(null);

	let discoverability = $state<'none' | 'handle'>('none');
	let acceptsAgentRequests = $state(true);
	let findingSaving = $state<'discoverability' | 'agents' | null>(null);
	let findingError = $state<string | null>(null);

	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	onMount(() => {
		void loadUsername();
	});

	async function loadUsername() {
		try {
			const res = await fetch('/api/profile/me/username');
			const payload = await res.json().catch(() => null);
			if (!res.ok) return;
			usernameValue =
				typeof payload?.data?.username === 'string' ? payload.data.username : null;
			derivedFallback =
				typeof payload?.data?.derived_fallback === 'string'
					? payload.data.derived_fallback
					: 'user';
			usernameDraft = usernameValue ?? '';
			discoverability = payload?.data?.discoverability === 'handle' ? 'handle' : 'none';
			acceptsAgentRequests = payload?.data?.accepts_agent_requests !== false;
		} catch {
			// The card keeps its defaults; a refresh catches up.
		}
	}

	async function saveUsername() {
		const trimmed = usernameDraft.trim().toLowerCase().replace(/^@+/, '');
		if (!trimmed || trimmed === (usernameValue ?? '')) return;
		usernameLoading = true;
		usernameError = null;
		try {
			const res = await fetch('/api/profile/me/username', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: trimmed })
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				usernameError =
					payload?.error || 'Could not update your handle. Try a different one.';
				return;
			}
			usernameValue = payload?.data?.username ?? trimmed;
			usernameDraft = usernameValue ?? '';
			toastService.success(`Your handle is @${usernameValue}`);
			onchanged?.();
		} catch (e) {
			usernameError = e instanceof Error ? e.message : 'Could not update your handle.';
		} finally {
			usernameLoading = false;
		}
	}

	async function saveFindingSetting(
		setting: 'discoverability' | 'agents',
		update: { discoverability?: 'none' | 'handle'; accepts_agent_requests?: boolean }
	) {
		if (findingSaving) return;
		findingSaving = setting;
		findingError = null;
		try {
			const res = await fetch('/api/profile/me/discoverability', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(update)
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				findingError = payload?.error || 'Could not save that setting. Try again.';
				return;
			}
			discoverability = payload?.data?.discoverability === 'handle' ? 'handle' : 'none';
			acceptsAgentRequests = payload?.data?.accepts_agent_requests !== false;
			if (setting === 'discoverability') {
				toastService.success(
					discoverability === 'handle'
						? 'People with your handle can now find you'
						: 'People can no longer find you by handle'
				);
			} else {
				toastService.success(
					acceptsAgentRequests
						? 'Requests sent by agents will reach you'
						: 'Requests sent by agents are turned off'
				);
			}
			onchanged?.();
		} catch {
			findingError = 'Could not save that setting. Try again.';
		} finally {
			findingSaving = null;
		}
	}

	function toggleDiscoverability() {
		if (!usernameValue) return;
		void saveFindingSetting('discoverability', {
			discoverability: discoverability === 'handle' ? 'none' : 'handle'
		});
	}

	function toggleAgentRequests() {
		void saveFindingSetting('agents', { accepts_agent_requests: !acceptsAgentRequests });
	}

	const switchClass = (on: boolean) =>
		`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
			on ? 'border-accent bg-accent' : 'border-border-strong bg-muted'
		}`;
	const knobClass = (on: boolean) =>
		`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-ink transition-transform motion-reduce:transition-none ${
			on ? 'translate-x-5' : 'translate-x-0'
		}`;
</script>

<SettingsCard
	title="You"
	description="How people, and their agents, reach you."
	icon={AtSign}
	labelledById="hub-you-heading"
>
	<div class="flex flex-col gap-5 lg:flex-row lg:items-start">
		<div class="min-w-0 flex-1 space-y-4">
			<FormField
				label="Handle"
				labelFor="hub-handle"
				hint="People add you to projects with it. It's also your public URL: build-os.com/p/{usernameValue ||
					derivedFallback}/…"
			>
				<div class="flex flex-col gap-2 sm:flex-row">
					<div
						class="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-border-strong bg-background focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
					>
						<span
							class="inline-flex items-center border-r border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground"
							aria-hidden="true">@</span
						>
						<input
							id="hub-handle"
							type="text"
							bind:value={usernameDraft}
							placeholder={derivedFallback}
							minlength="3"
							maxlength="24"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							class="min-h-[44px] min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-base focus:outline-none disabled:opacity-50 sm:text-sm"
							disabled={usernameLoading}
						/>
					</div>
					<Button
						type="button"
						onclick={saveUsername}
						disabled={usernameLoading ||
							!usernameDraft.trim() ||
							usernameDraft.trim().replace(/^@+/, '') === (usernameValue ?? '')}
						variant="primary"
						size="sm"
						loading={usernameLoading}
						class="shadow-ink pressable sm:self-stretch"
					>
						{usernameValue ? 'Save' : 'Claim handle'}
					</Button>
				</div>
			</FormField>
			{#if usernameError}
				<p class="text-xs text-destructive" role="alert">{usernameError}</p>
			{/if}

			<div class="flex items-start justify-between gap-4 border-t border-border pt-4">
				<div class="min-w-0 space-y-0.5">
					<p id="hub-findable-label" class="text-sm font-medium text-foreground">
						People with my handle can find me
					</p>
					<p id="hub-findable-hint" class="text-xs text-muted-foreground">
						{#if !usernameValue}
							Claim a handle first. People find you by it.
						{:else if discoverability === 'handle'}
							Anyone who types @{usernameValue} can ask you for access. You choose what
							to share.
						{:else}
							Off. Only people you invite can reach you.
						{/if}
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={discoverability === 'handle'}
					aria-labelledby="hub-findable-label"
					aria-describedby="hub-findable-hint"
					disabled={!usernameValue || findingSaving !== null}
					onclick={toggleDiscoverability}
					class={switchClass(discoverability === 'handle')}
				>
					<span class={knobClass(discoverability === 'handle')}></span>
				</button>
			</div>

			<div class="flex items-start justify-between gap-4 border-t border-border pt-4">
				<div class="min-w-0 space-y-0.5">
					<p id="hub-agent-requests-label" class="text-sm font-medium text-foreground">
						Accept requests sent by agents
					</p>
					<p id="hub-agent-requests-hint" class="text-xs text-muted-foreground">
						Someone's agent can ask you for access on their behalf. You still decide.
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={acceptsAgentRequests}
					aria-labelledby="hub-agent-requests-label"
					aria-describedby="hub-agent-requests-hint"
					disabled={findingSaving !== null}
					onclick={toggleAgentRequests}
					class={switchClass(acceptsAgentRequests)}
				>
					<span class={knobClass(acceptsAgentRequests)}></span>
				</button>
			</div>

			{#if findingError}
				<p class="text-xs text-destructive" role="alert">{findingError}</p>
			{/if}
		</div>

		<div
			class="w-full shrink-0 space-y-2 rounded-lg border border-dashed border-border-strong bg-background p-3.5 lg:w-64"
		>
			<p class="micro-label">What people see</p>
			<div class="flex items-center gap-2.5">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
					aria-hidden="true">{initials}</span
				>
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold text-foreground">{name}</p>
					<p class="truncate font-mono text-xs text-muted-foreground">
						{usernameValue ? `@${usernameValue}` : 'No handle yet'}
					</p>
				</div>
			</div>
			<p class="text-xs text-muted-foreground">
				Never your email. Never your projects until you share one.
			</p>
		</div>
	</div>
</SettingsCard>
