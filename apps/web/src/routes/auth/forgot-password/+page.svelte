<!-- apps/web/src/routes/auth/forgot-password/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { validateEmailClient } from '$lib/utils/client-email-validation';

	let { form }: { form?: ActionData } = $props();

	let loading = $state(false);
	let email = $state(form?.email ?? '');
	let emailError = $state('');

	// Validate email on blur for instant feedback
	function validateEmail() {
		emailError = '';
		if (!email.trim()) {
			return;
		}

		const validation = validateEmailClient(email.trim());
		if (!validation.valid) {
			emailError = validation.error || 'Invalid email address';
		}
	}
</script>

<svelte:head>
	<title>Forgot Password - BuildOS</title>
</svelte:head>

<!-- Account for navbar height (64px = h-16) by using calc() -->
<div
	class="flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-background"
	style="min-height: calc(100vh - 64px);"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Logo/Brand Section -->
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<div
					class="w-16 h-16 rounded-lg flex items-center justify-center border border-border bg-card shadow-ink tx tx-bloom tx-weak"
				>
					<img src="/brain-bolt.png" alt="BuildOS Icon" class="w-12 h-12" />
				</div>
			</div>

			<h2 class="text-3xl font-bold text-foreground mb-2">Reset your password</h2>
			<p class="text-muted-foreground mb-8">
				Enter your email address and we'll send you a link to reset your password.
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
				{#if form?.error}
					<div
						class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3"
					>
						{form.error}
					</div>
				{/if}

				{#if form?.success}
					<div
						class="rounded-lg border border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300 px-4 py-3"
					>
						{form.message}
					</div>
				{/if}

				<div class="space-y-5">
					<FormField label="Email address" labelFor="email" required={true}>
						<TextInput
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							inputmode="email"
							enterkeyhint="send"
							required
							bind:value={email}
							placeholder="Enter your email"
							size="lg"
							onblur={validateEmail}
						/>
						{#if emailError}
							<p class="mt-1 text-sm text-destructive">{emailError}</p>
						{/if}
					</FormField>
				</div>

				<div>
					<Button
						type="submit"
						disabled={loading}
						{loading}
						fullWidth={true}
						variant="primary"
						size="lg"
					>
						{loading ? 'Sending reset link...' : 'Send reset link'}
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
