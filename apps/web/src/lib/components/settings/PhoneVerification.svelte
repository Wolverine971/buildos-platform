<!-- src/lib/components/settings/PhoneVerification.svelte -->
<script lang="ts">
	import { smsService } from '$lib/services/sms.service';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import { Phone, Check, Loader } from 'lucide-svelte';

	let phoneNumber = $state('');
	let verificationCode = $state('');
	let verificationSent = $state(false);
	let isVerifying = $state(false);
	let isLoading = $state(false);

	async function sendVerification() {
		if (!phoneNumber) {
			toastService.error('Please enter a phone number');
			return;
		}

		isLoading = true;
		const result = await smsService.verifyPhoneNumber(phoneNumber);

		if (result.success) {
			verificationSent = true;
			toastService.success('Verification code sent! Please check your phone.');
		} else {
			toastService.error(result.errors?.[0] || 'Failed to send verification');
		}
		isLoading = false;
	}

	async function confirmVerification() {
		if (!verificationCode) {
			toastService.error('Please enter the verification code');
			return;
		}

		isVerifying = true;
		const result = await smsService.confirmVerification(phoneNumber, verificationCode);

		if (result.success) {
			toastService.success('Phone number verified successfully!');
			// Refresh the page or emit an event to update parent component
			window.location.reload();
		} else {
			toastService.error(result.errors?.[0] || 'Invalid verification code');
		}
		isVerifying = false;
	}

	function resetVerification() {
		verificationSent = false;
		verificationCode = '';
	}

	function formatPhoneInput(value: string) {
		// Remove all non-numeric characters
		const cleaned = value.replace(/\D/g, '');

		// Format as US phone number if 10 digits
		if (cleaned.length <= 10) {
			const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
			if (match) {
				let formatted = '';
				if (match[1]) {
					formatted = match[1];
					if (match[2]) {
						formatted = `(${match[1]}) ${match[2]}`;
						if (match[3]) {
							formatted = `(${match[1]}) ${match[2]}-${match[3]}`;
						}
					}
				}
				return formatted;
			}
		}

		return value;
	}

	$effect(() => {
		if (phoneNumber) {
			phoneNumber = formatPhoneInput(phoneNumber);
		}
	});
</script>

<div class="space-y-6">
	{#if !verificationSent}
		<div
			class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800"
		>
			<FormField
				label="Phone Number"
				labelFor="phone"
				hint="Enter your phone number to receive SMS notifications"
			>
				<div class="flex gap-2">
					<TextInput
						type="tel"
						id="phone"
						bind:value={phoneNumber}
						placeholder="(555) 123-4567"
						disabled={isLoading}
						class="flex-1"
						autocomplete="tel"
						icon={Phone}
						iconPosition="left"
					/>
					<Button
						on:click={sendVerification}
						disabled={isLoading || !phoneNumber}
						variant="primary"
						loading={isLoading}
						icon={isLoading ? Loader : undefined}
					>
						{isLoading ? 'Sending...' : 'Send Code'}
					</Button>
				</div>
			</FormField>
		</div>
	{:else}
		<div
			class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-6 border border-green-200 dark:border-green-800"
		>
			<div class="mb-4">
				<div class="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
					<Check class="w-5 h-5" />
					<span class="font-semibold">Code sent to {phoneNumber}</span>
				</div>
			</div>

			<FormField
				label="Verification Code"
				labelFor="code"
				hint="Enter the 6-digit code from your SMS"
			>
				<div class="flex gap-2">
					<TextInput
						type="text"
						id="code"
						bind:value={verificationCode}
						placeholder="123456"
						maxlength="6"
						disabled={isVerifying}
						class="flex-1 font-mono text-lg text-center"
						autocomplete="one-time-code"
					/>
					<Button
						on:click={confirmVerification}
						disabled={isVerifying || !verificationCode}
						variant="success"
						loading={isVerifying}
						icon={isVerifying ? Loader : Check}
					>
						{isVerifying ? 'Verifying...' : 'Verify'}
					</Button>
				</div>
			</FormField>

			<div class="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
				<button
					on:click={resetVerification}
					class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
					type="button"
				>
					← Use a different number
				</button>
			</div>
		</div>
	{/if}
</div>
