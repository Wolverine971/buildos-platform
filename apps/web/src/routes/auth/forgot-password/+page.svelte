<!-- apps/web/src/routes/auth/forgot-password/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let form: ActionData;

	let loading = false;
</script>

<svelte:head>
	<title>Forgot Password - BuildOS</title>
</svelte:head>

<!-- Account for navbar height (64px = h-16) by using calc() -->
<div
	class="flex items-center justify-center px-4 sm:px-6 lg:px-8"
	style="min-height: calc(100vh - 64px);"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Logo/Brand Section -->
		<div class="text-center">
			<div class="flex justify-center mb-6">
				<img src="/brain-bolt.png" alt="BuildOS Icon" class="w-16 h-16" />
			</div>

			<h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
				Reset your password
			</h2>
			<p class="text-gray-600 dark:text-gray-400 mb-8">
				Enter your email address and we'll send you a link to reset your password.
			</p>
		</div>

		<!-- Form Section -->
		<div class="bg-white dark:bg-gray-800 py-8 px-6 shadow-sm rounded-lg">
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
						class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg"
					>
						{form.error}
					</div>
				{/if}

				{#if form?.success}
					<div
						class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg"
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
							required
							value={form?.email ?? ''}
							placeholder="Enter your email"
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
						class="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg"
					>
						{loading ? 'Sending reset link...' : 'Send reset link'}
					</Button>
				</div>
			</form>

			<!-- Back to sign in link -->
			<div class="mt-6 text-center">
				<a
					href="/auth/login"
					class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
				>
					← Back to sign in
				</a>
			</div>
		</div>
	</div>
</div>
