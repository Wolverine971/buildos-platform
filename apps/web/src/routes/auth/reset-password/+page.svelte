<!-- apps/web/src/routes/auth/reset-password/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let loading = $state(false);
	let canSubmit = $derived(data.hasRecoverySession);
</script>

<svelte:head>
	<title>Reset Password - BuildOS</title>
</svelte:head>

<!-- Account for navbar height (h-16 = 4rem). Use 100dvh so iOS Safari's dynamic toolbar doesn't push content beyond the visible viewport. min-h-[calc(100vh-...)] is kept as a fallback for browsers without dvh support. -->
<div
	class="flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-background min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)]"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Logo/Brand Section -->
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded-lg flex items-center justify-center border border-border bg-card shadow-ink tx tx-bloom tx-weak"
				>
					<img src="/brain-bolt.webp" alt="BuildOS Icon" class="w-12 h-12" />
				</div>
			</div>

			<h2 class="text-3xl font-bold text-foreground mb-2">Set your new password</h2>
			<p class="text-muted-foreground mb-8">
				Choose a strong password to secure your AI thought partner.
			</p>
		</div>

		<!-- Form Section -->
		<div
			class="rounded-lg border border-border bg-card py-8 px-6 shadow-ink tx tx-grain tx-weak"
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
						class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3"
					>
						{data.recoveryError}
					</div>
				{/if}

				{#if !canSubmit}
					<div
						class="rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-3"
					>
						Open the password reset link from your email to continue.
					</div>
				{/if}

				{#if form?.error}
					<div
						class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3"
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
	</div>
</div>
