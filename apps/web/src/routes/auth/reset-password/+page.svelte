<!-- apps/web/src/routes/auth/reset-password/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { form }: { form?: ActionData } = $props();

	let loading = $state(false);
</script>

<svelte:head>
	<title>Reset Password - BuildOS</title>
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
				{#if form?.error}
					<div
						class="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3"
					>
						{form.error}
					</div>
				{/if}

				<div class="space-y-5">
					<FormField label="New password" labelFor="password" size="md">
						<TextInput
							id="password"
							name="password"
							type="password"
							autocomplete="new-password"
							enterkeyhint="next"
							required
							placeholder="Enter your new password"
							size="lg"
						/>
					</FormField>

					<FormField label="Confirm new password" labelFor="confirmPassword" size="md">
						<TextInput
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							autocomplete="new-password"
							enterkeyhint="done"
							required
							placeholder="Confirm your new password"
							size="lg"
						/>
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
						{loading ? 'Updating password...' : 'Update password'}
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
