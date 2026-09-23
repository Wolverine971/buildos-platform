<!-- apps/web/src/routes/auth/reset-password/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import AnimatedBrainBolt from '$lib/components/layout/AnimatedBrainBolt.svelte';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let loading = $state(false);
	let canSubmit = $derived(data.hasRecoverySession);
</script>

<svelte:head>
	<title>Reset Password - BuildOS</title>
</svelte:head>

<AuthShell>
	<div class="text-center">
		<AnimatedBrainBolt class="mx-auto w-12 rounded-lg" />
		<h1 class="mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
			Set your new password
		</h1>
		<p class="mt-2 text-sm text-muted-foreground sm:text-base">
			Choose a strong password to keep your projects secure.
		</p>
	</div>

	<!-- Form Section -->
	<div
		class="mt-6 rounded-lg border border-border bg-card p-5 shadow-ink sm:p-6 tx tx-grain tx-weak"
	>
		<form
			method="POST"
			class="space-y-6"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					update();
				};
			}}
		>
			{#if data.recoveryError}
				<div
					class="rounded-lg border border-destructive/50 bg-destructive/10 text-foreground px-4 py-3"
				>
					{data.recoveryError}
				</div>
			{/if}

			{#if !canSubmit}
				<div
					class="rounded-lg border border-warning/50 bg-warning/10 text-foreground px-4 py-3"
				>
					Open the password reset link from your email to continue.
				</div>
			{/if}

			{#if form?.error}
				<div
					class="rounded-lg border border-destructive/50 bg-destructive/10 text-foreground px-4 py-3"
				>
					{form.error}
				</div>
			{/if}

			<div class="space-y-5">
				<FormField label="New password" labelFor="password">
					<TextInput
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						enterkeyhint="next"
						required
						disabled={!canSubmit || loading}
						placeholder="Enter your new password"
						size="lg"
					/>
				</FormField>

				<FormField label="Confirm new password" labelFor="confirmPassword">
					<TextInput
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						autocomplete="new-password"
						enterkeyhint="done"
						required
						disabled={!canSubmit || loading}
						placeholder="Confirm your new password"
						size="lg"
					/>
				</FormField>
			</div>

			<div>
				<Button
					type="submit"
					disabled={!canSubmit || loading}
					{loading}
					fullWidth={true}
					variant="primary"
					size="lg"
				>
					{loading
						? 'Updating password...'
						: canSubmit
							? 'Update password'
							: 'Open reset link from email'}
				</Button>
			</div>
		</form>

		<!-- Back to sign in link -->
		<div class="mt-6 text-center">
			<a
				href="/auth/login"
				class="text-sm font-medium text-accent hover:opacity-80 transition-opacity"
			>
				← Back to sign in
			</a>
		</div>
	</div>
</AuthShell>
