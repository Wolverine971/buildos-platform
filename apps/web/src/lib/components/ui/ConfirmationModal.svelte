<!-- apps/web/src/lib/components/ui/ConfirmationModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { TriangleAlert, CircleAlert, Info, CircleCheck } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import type { ButtonVariant } from './Button.svelte';

	export let isOpen: boolean = false;
	export let title: string = 'Confirm Action';
	export let confirmText: string = 'Confirm';
	export let cancelText: string = 'Cancel';
	export let confirmVariant: ButtonVariant = 'primary';
	export let loading: boolean = false;
	export let loadingText: string = 'Processing...';
	export let icon: 'warning' | 'danger' | 'info' | 'success' | 'none' = 'warning';

	const dispatch = createEventDispatcher<{
		confirm: void;
		cancel: void;
	}>();

	function handleConfirm() {
		dispatch('confirm');
	}

	function handleCancel() {
		dispatch('cancel');
	}

	// Icon mapping
	const icons = {
		warning: TriangleAlert,
		danger: CircleAlert,
		info: Info,
		success: CircleCheck,
		none: null
	};

	// Icon colors
	const iconColors = {
		warning: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
		danger: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30',
		info: 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30',
		success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
		none: ''
	};

	$: IconComponent = icons[icon];
	$: iconClasses = iconColors[icon];
</script>

<Modal
	{isOpen}
	onClose={handleCancel}
	{title}
	size="sm"
	closeOnBackdrop={!loading}
	closeOnEscape={!loading}
	persistent={loading}
>
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
		<div class="sm:flex sm:items-start">
			<!-- Icon -->
			{#if IconComponent}
				<div
					class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full {iconClasses} sm:mx-0 sm:h-10 sm:w-10"
				>
					<IconComponent class="h-6 w-6" />
				</div>
			{/if}

			<!-- Content -->
			<div
				class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left {IconComponent
					? ''
					: 'w-full'}"
			>
				<!-- Main Content Slot -->
				<slot name="content">
					<p class="text-sm text-gray-500 dark:text-gray-400">
						Are you sure you want to proceed with this action?
					</p>
				</slot>

				<!-- Details Slot -->
				<slot name="details" />
			</div>
		</div>
	</div>

	<!-- Footer with Actions -->
	<div
		class="flex flex-col sm:flex-row gap-3 sm:justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		<Button
			onclick={handleCancel}
			disabled={loading}
			variant="secondary"
			size="md"
			class="order-2 sm:order-1 w-full sm:w-auto"
		>
			{cancelText}
		</Button>

		<Button
			onclick={handleConfirm}
			disabled={loading}
			{loading}
			variant={confirmVariant}
			size="md"
			class="order-1 sm:order-2 w-full sm:w-auto"
		>
			{loading ? loadingText : confirmText}
		</Button>
	</div>
</Modal>
