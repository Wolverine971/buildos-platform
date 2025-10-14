<!-- apps/web/src/lib/components/onboarding-v2/PhoneVerificationCard.svelte -->
<script lang="ts">
	import { Phone, Loader2, CheckCircle, AlertCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { smsService } from '$lib/services/sms.service';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
		onVerified: (phoneNumber: string) => void;
		onSkip: () => void;
	}

	let { userId, onVerified, onSkip }: Props = $props();

	let phoneNumber = $state('');
	let verificationCode = $state('');
	let codeSent = $state(false);
	let isVerifying = $state(false);
	let isSending = $state(false);
	let isLoadingExisting = $state(true);
	let verified = $state(false);
	let error = $state<string | null>(null);
	let resendCooldown = $state(0);
	let cooldownInterval: ReturnType<typeof setInterval> | null = null;

	// Format phone number as user types
	function formatPhoneNumber(value: string): string {
		// Remove all non-digits
		const digits = value.replace(/\D/g, '');

		// Format as (XXX) XXX-XXXX
		if (digits.length <= 3) {
			return digits;
		} else if (digits.length <= 6) {
			return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
		} else {
			return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
		}
	}

	function handlePhoneInput(num: string) {
		const formatted = formatPhoneNumber(num);
		phoneNumber = formatted;
		error = null;
	}

	// Extract raw phone number (remove formatting)
	function getRawPhoneNumber(formatted: string): string {
		const digits = formatted.replace(/\D/g, '');
		// Add +1 for US numbers if not already present
		return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
	}

	async function sendVerificationCode() {
		const rawPhone = getRawPhoneNumber(phoneNumber);

		if (rawPhone.length < 11) {
			// +1 + 10 digits
			error = 'Please enter a valid 10-digit phone number';
			return;
		}

		isSending = true;
		error = null;

		try {
			const result = await smsService.verifyPhoneNumber(rawPhone);

			if (result.success) {
				codeSent = true;
				toastService.success('Verification code sent! Check your phone.');

				// Start resend cooldown (60 seconds)
				resendCooldown = 60;
				cooldownInterval = setInterval(() => {
					resendCooldown--;
					if (resendCooldown <= 0 && cooldownInterval) {
						clearInterval(cooldownInterval);
						cooldownInterval = null;
					}
				}, 1000);
			} else {
				error = result.errors?.[0] || 'Failed to send verification code';
				toastService.error(error);
			}
		} catch (err) {
			error = 'Failed to send verification code. Please try again.';
			toastService.error(error);
			console.error('Verification error:', err);
		} finally {
			isSending = false;
		}
	}

	async function confirmVerification() {
		if (!verificationCode || verificationCode.length !== 6) {
			error = 'Please enter the 6-digit verification code';
			return;
		}

		const rawPhone = getRawPhoneNumber(phoneNumber);
		isVerifying = true;
		error = null;

		try {
			const result = await smsService.confirmVerification(rawPhone, verificationCode);

			if (result.success && result.data?.verified) {
				verified = true;
				toastService.success('🎉 Phone verified successfully!');

				// Clear cooldown if active
				if (cooldownInterval) {
					clearInterval(cooldownInterval);
					cooldownInterval = null;
				}

				// Call parent handler
				onVerified(rawPhone);
			} else {
				error = 'Invalid verification code. Please try again.';
				toastService.error(error);
			}
		} catch (err) {
			error = 'Verification failed. Please try again.';
			toastService.error(error);
			console.error('Confirmation error:', err);
		} finally {
			isVerifying = false;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		console.log(event);
		if (event.key === 'Enter') {
			if (!codeSent) {
				sendVerificationCode();
			} else if (!verified) {
				confirmVerification();
			}
		}
	}

	function changePhoneNumber() {
		codeSent = false;
		verificationCode = '';
		error = null;
		if (cooldownInterval) {
			clearInterval(cooldownInterval);
			cooldownInterval = null;
		}
		resendCooldown = 0;
	}

	// Load existing phone preferences on mount
	$effect(() => {
		async function loadExistingPhone() {
			try {
				const result = await smsService.getSMSPreferences(userId);
				if (result.success && result.data?.preferences) {
					const prefs = result.data.preferences;
					if (prefs.phone_verified && prefs.phone_number) {
						// Format the phone number for display
						phoneNumber = formatPhoneNumber(prefs.phone_number);
						verified = true;
						// Notify parent that phone is already verified
						onVerified(prefs.phone_number);
					}
				}
			} catch (err) {
				console.error('Failed to load existing phone preferences:', err);
				// Don't show error to user - just let them add phone normally
			} finally {
				isLoadingExisting = false;
			}
		}

		loadExistingPhone();
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (cooldownInterval) {
				clearInterval(cooldownInterval);
			}
		};
	});
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
>
	<div class="flex items-start gap-4">
		<div
			class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg flex items-center justify-center"
		>
			<Phone class="w-6 h-6 text-green-600 dark:text-green-400" />
		</div>

		<div class="flex-1">
			<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
				SMS Notifications
			</h4>
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
				Stay on track with text reminders before events, morning kickoffs with your
				schedule, and evening recaps
			</p>

			{#if isLoadingExisting}
				<!-- Loading State -->
				<div class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
					<Loader2 class="w-5 h-5 text-gray-400 animate-spin flex-shrink-0" />
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Checking for existing phone number...
					</p>
				</div>
			{:else if verified}
				<!-- Success State -->
				<div
					class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
				>
					<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
					<div class="flex-1">
						<p class="font-medium text-green-700 dark:text-green-300">
							Phone verified!
						</p>
						<p class="text-xs text-green-600 dark:text-green-400 mt-0.5">
							{phoneNumber}
						</p>
					</div>
				</div>
			{:else if !codeSent}
				<!-- Phone Input State -->
				<div class="space-y-3">
					<div>
						<label
							for="phone-number"
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
						>
							Phone Number
						</label>
						<TextInput
							id="phone-number"
							bind:value={phoneNumber}
							on:input={(e) => handlePhoneInput(e.detail)}
							on:keypress={(e) => handleKeyPress(e.detail)}
							type="tel"
							placeholder="(555) 123-4567"
							disabled={isSending}
							class="w-full"
							aria-label="Phone number"
						/>
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							We'll send a verification code to this number
						</p>
					</div>

					{#if error}
						<div
							class="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
						>
							<AlertCircle
								class="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
							/>
							<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
						</div>
					{/if}

					<div class="flex gap-2 flex-wrap">
						<Button
							variant="primary"
							on:click={sendVerificationCode}
							loading={isSending}
							disabled={phoneNumber.replace(/\D/g, '').length < 10}
							class="flex-1 min-w-[120px]"
						>
							{#if isSending}
								Sending...
							{:else}
								Send Code
							{/if}
						</Button>
						<Button variant="ghost" on:click={onSkip} disabled={isSending}>
							Skip for now
						</Button>
					</div>
				</div>
			{:else}
				<!-- Verification Code State -->
				<div class="space-y-3">
					<div>
						<div class="flex items-baseline justify-between mb-1">
							<label
								for="verification-code"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Verification Code
							</label>
							<button
								type="button"
								on:click={changePhoneNumber}
								class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
								disabled={isVerifying}
							>
								Change number
							</button>
						</div>
						<p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
							Enter the 6-digit code sent to {phoneNumber}
						</p>
						<TextInput
							id="verification-code"
							bind:value={verificationCode}
							on:keypress={(e) => handleKeyPress(e.detail)}
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							placeholder="123456"
							maxlength={6}
							disabled={isVerifying}
							class="w-full text-center text-lg tracking-widest font-mono"
							aria-label="Verification code"
						/>
					</div>

					{#if error}
						<div
							class="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
						>
							<AlertCircle
								class="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
							/>
							<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
						</div>
					{/if}

					<div class="flex gap-2 flex-wrap">
						<Button
							variant="primary"
							on:click={confirmVerification}
							loading={isVerifying}
							disabled={verificationCode.length !== 6}
							class="flex-1 min-w-[120px]"
						>
							{#if isVerifying}
								Verifying...
							{:else}
								Verify
							{/if}
						</Button>

						{#if resendCooldown > 0}
							<Button variant="ghost" disabled class="text-sm">
								Resend in {resendCooldown}s
							</Button>
						{:else}
							<Button
								variant="ghost"
								on:click={sendVerificationCode}
								disabled={isSending}
							>
								Resend Code
							</Button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
