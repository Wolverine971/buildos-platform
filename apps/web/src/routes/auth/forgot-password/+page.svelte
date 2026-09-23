<!-- apps/web/src/routes/auth/forgot-password/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { ActionData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import AnimatedBrainBolt from '$lib/components/layout/AnimatedBrainBolt.svelte';
	import { validateEmailClient } from '$lib/utils/client-email-validation';

	let { form }: { form?: ActionData } = $props();

	let loading = $state(false);
	let email = $state(untrack(() => form?.email ?? ''));
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

<AuthShell>
	<div class="text-center">
		<AnimatedBrainBolt class="mx-auto w-12 rounded-lg" />
		<h1 class="mt-5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
			Reset your password
		</h1>
		<p class="mt-2 text-sm text-muted-foreground sm:text-base">
			Enter your email and we'll send you a link to reset your password.
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
			{#if form?.error}
				<div
					class="rounded-lg border border-destructive/50 bg-destructive/10 text-foreground px-4 py-3"
				>
					{form.error}
				</div>
			{/if}

			{#if form?.success}
				<div
					class="rounded-lg border border-success/50 bg-success/10 text-foreground px-4 py-3"
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
</AuthShell>
