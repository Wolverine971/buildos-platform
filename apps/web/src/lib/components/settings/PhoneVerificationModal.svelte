<!-- apps/web/src/lib/components/settings/PhoneVerificationModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import PhoneVerification from './PhoneVerification.svelte';
	import { Smartphone } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onVerified?: () => void;
	}

	let { isOpen = $bindable(), onClose, onVerified }: Props = $props();

	function handleVerified() {
		isOpen = false;
		onVerified?.();
	}
</script>

<Modal {isOpen} {onClose} title="Verify Phone Number" size="md">
	<div class="p-6 space-y-4">
		<div class="flex items-start gap-3 mb-4">
			<div
				class="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg flex items-center justify-center"
			>
				<Smartphone class="w-6 h-6 text-green-600 dark:text-green-400" />
			</div>
			<div class="flex-1">
				<h3 class="font-semibold text-gray-900 dark:text-white mb-1">
					SMS Notifications Require Verification
				</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
					To receive SMS notifications, you need to verify your phone number first. We'll
					send you a verification code to confirm your number.
				</p>
				<p class="text-xs text-gray-500 dark:text-gray-500 italic">
					By verifying, you consent to receive SMS reminders about your BuildOS schedule. Message & data rates may apply. Reply STOP to unsubscribe at any time.
				</p>
			</div>
		</div>

		<PhoneVerification onVerified={handleVerified} />
	</div>
</Modal>
