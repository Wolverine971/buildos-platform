<!-- apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		CheckCircle,
		ArrowRight,
		ArrowLeft,
		FolderOpen,
		MessageCircle,
		Mail,
		Globe,
		Check
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import type { OnboardingIntent, OnboardingStakes } from '$lib/config/onboarding.config';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		userId: string;
		summary: {
			intent: OnboardingIntent | null;
			stakes: OnboardingStakes | null;
			projectsCreated: number;
			tasksCreated: number;
			goalsCreated: number;
			smsEnabled: boolean;
			emailEnabled: boolean;
		};
		onBack?: () => void;
		onboardingStartedAtMs?: number;
	}

	let { userId, summary, onBack, onboardingStartedAtMs }: Props = $props();

	let isCompleting = $state(false);

	// Username claim state — lets the user lock in their `/p/{username}/...`
	// public URL prefix during onboarding so their first share has a clean link.
	// Skippable; defaults to derived-from-name if skipped.
	let usernameValue = $state<string | null>(null);
	let usernameDraft = $state('');
	let derivedFallback = $state('user');
	let usernameLoading = $state(false);
	let usernameError = $state<string | null>(null);
	let usernameLoaded = $state(false);
	let usernameSaved = $state(false);

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
			// Pre-fill draft from the derived value — friendlier than an empty
			// field. User can accept it or type something else.
			usernameDraft = usernameValue ?? derivedFallback;
			usernameSaved = usernameValue !== null;
		} catch {
			// Best-effort; the profile tab offers the same editor later.
		} finally {
			usernameLoaded = true;
		}
	}

	async function saveUsername() {
		const trimmed = usernameDraft.trim().toLowerCase();
		if (!trimmed) {
			usernameError = 'Please enter a username or skip.';
			return;
		}
		if (trimmed === (usernameValue ?? '')) {
			usernameSaved = true;
			return;
		}
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
					payload?.error || 'That username is not available. Try another one.';
				return;
			}
			usernameValue = payload?.data?.username ?? trimmed;
			usernameDraft = usernameValue ?? '';
			usernameSaved = true;
		} catch (e) {
			usernameError = e instanceof Error ? e.message : 'Failed to save username.';
		} finally {
			usernameLoading = false;
		}
	}

	// Stats to display (only non-zero)
	const stats = $derived(
		[
			{ count: summary.projectsCreated, label: 'project', plural: 'projects' },
			{ count: summary.tasksCreated, label: 'task', plural: 'tasks' },
			{ count: summary.goalsCreated, label: 'goal', plural: 'goals' }
		].filter((s) => s.count > 0)
	);

	const hasNotifications = $derived(summary.smsEnabled || summary.emailEnabled);

	async function completeOnboarding() {
		isCompleting = true;
		const timeSpentSeconds =
			onboardingStartedAtMs != null
				? Math.max(0, Math.round((Date.now() - onboardingStartedAtMs) / 1000))
				: undefined;

		try {
			const response = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'complete_v3',
					onboardingData: {
						intent: summary.intent,
						stakes: summary.stakes,
						projectsCreated: summary.projectsCreated,
						tasksCreated: summary.tasksCreated,
						goalsCreated: summary.goalsCreated,
						smsEnabled: summary.smsEnabled,
						emailEnabled: summary.emailEnabled,
						timeSpentSeconds
					}
				})
			});

			const result = await response.json();
			if (!response.ok || !result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to complete');
			}

			toastService.success('Welcome to BuildOS!');
			await invalidateAll();
			setTimeout(() => goto('/'), 1000);
		} catch (error) {
			console.error('Failed to complete onboarding:', error);
			toastService.error('Failed to complete setup. Please try again.');
			isCompleting = false;
		}
	}
</script>

<div class="max-w-2xl mx-auto px-4 py-8 sm:py-16">
	{#if onBack}
		<button
			class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
			onclick={onBack}
		>
			<ArrowLeft class="w-4 h-4" />
			Back
		</button>
	{/if}

	<!-- Success icon -->
	<div class="text-center mb-10" in:scale={{ duration: 400, start: 0.8 }}>
		<div class="flex justify-center mb-6">
			<div class="relative">
				<div
					class="absolute inset-0 bg-emerald-500/20 blur-2xl opacity-40 animate-pulse"
				></div>
				<div
					class="relative w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center shadow-ink-strong tx tx-bloom tx-weak"
				>
					<CheckCircle class="w-10 h-10 text-white" />
				</div>
			</div>
		</div>

		<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">You're set up!</h1>

		{#if stats.length > 0}
			<p class="text-lg text-muted-foreground" in:fade={{ delay: 200, duration: 300 }}>
				Here's what we created:
			</p>
		{:else}
			<p class="text-lg text-muted-foreground" in:fade={{ delay: 200, duration: 300 }}>
				You're ready to start using BuildOS
			</p>
		{/if}
	</div>

	<!-- Stats row -->
	{#if stats.length > 0}
		<div
			class="flex justify-center gap-6 sm:gap-10 mb-12"
			in:fade={{ delay: 300, duration: 300 }}
		>
			{#each stats as stat}
				<div class="text-center">
					<div class="text-3xl sm:text-4xl font-bold text-accent">{stat.count}</div>
					<div class="text-sm text-muted-foreground mt-1">
						{stat.count === 1 ? stat.label : stat.plural}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Public URL / username claim (optional, skippable) -->
	{#if usernameLoaded}
		<div
			class="bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak mb-6"
			in:fade={{ delay: 350, duration: 300 }}
		>
			<div class="flex items-start gap-3 mb-3">
				<div
					class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent shrink-0"
				>
					<Globe class="w-4 h-4" />
				</div>
				<div class="min-w-0">
					<h3 class="text-base font-semibold text-foreground">Claim your public URL</h3>
					<p class="text-xs text-muted-foreground leading-relaxed mt-0.5">
						When you share a project doc publicly, your link will start with your
						username. You can change this any time in profile settings.
					</p>
				</div>
			</div>

			{#if usernameSaved}
				<div
					class="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-400"
				>
					<Check class="w-4 h-4 shrink-0" />
					<span>
						Your public URL is
						<span class="font-mono font-semibold"
							>build-os.com/p/{usernameValue}/…</span
						>
					</span>
				</div>
			{:else}
				<div class="flex flex-wrap items-stretch gap-2">
					<div
						class="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 text-[13px] font-mono text-muted-foreground"
					>
						build-os.com/p/
					</div>
					<input
						type="text"
						bind:value={usernameDraft}
						placeholder={derivedFallback}
						minlength="3"
						maxlength="24"
						class="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
						disabled={usernameLoading}
						aria-label="Public username"
					/>
				</div>
				{#if usernameError}
					<p class="mt-2 text-xs text-destructive">{usernameError}</p>
				{/if}
				<div class="mt-3 flex flex-wrap items-center gap-3">
					<Button
						type="button"
						onclick={saveUsername}
						disabled={usernameLoading || !usernameDraft.trim()}
						loading={usernameLoading}
						variant="primary"
						size="sm"
					>
						Claim username
					</Button>
					<button
						type="button"
						onclick={() => (usernameSaved = true)}
						disabled={usernameLoading}
						class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
					>
						Skip for now
					</button>
				</div>
				<p class="mt-2 text-[11px] text-muted-foreground">
					3–24 characters, lowercase letters, numbers, and hyphens. If you skip, your URL
					defaults to <span class="font-mono text-foreground">{derivedFallback}</span>.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Next actions -->
	<div
		class="bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak mb-10"
		in:fade={{ delay: 400, duration: 300 }}
	>
		<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
			What to do next
		</h3>
		<div class="space-y-3">
			{#if summary.projectsCreated > 0}
				<div class="flex items-center gap-3 text-foreground">
					<FolderOpen class="w-5 h-5 text-accent flex-shrink-0" />
					<span>Open a project to see your tasks</span>
				</div>
			{/if}
			<div class="flex items-center gap-3 text-foreground">
				<MessageCircle class="w-5 h-5 text-accent flex-shrink-0" />
				<span>Chat with BuildOS to update anything</span>
			</div>
			{#if hasNotifications}
				<div class="flex items-center gap-3 text-foreground">
					<Mail class="w-5 h-5 text-accent flex-shrink-0" />
					<span>Check your daily brief tomorrow morning</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- CTA -->
	<div class="text-center" in:fade={{ delay: 500, duration: 300 }}>
		<Button
			variant="primary"
			size="lg"
			onclick={completeOnboarding}
			loading={isCompleting}
			disabled={isCompleting}
			class="px-10 py-4 text-lg shadow-ink-strong pressable"
		>
			{#if isCompleting}
				Preparing Your Workspace...
			{:else}
				Go to Dashboard
				<ArrowRight class="w-5 h-5 ml-2" />
			{/if}
		</Button>
	</div>
</div>
