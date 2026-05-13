<!-- apps/web/src/lib/components/ui/ConfirmationModal.svelte -->
<script lang="ts">
	import { TriangleAlert, CircleAlert, Info, CircleCheck } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import type { ButtonVariant } from './Button.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen?: boolean;
		title?: string;
		confirmText?: string;
		cancelText?: string;
		confirmVariant?: ButtonVariant;
		loading?: boolean;
		loadingText?: string;
		icon?: 'warning' | 'danger' | 'info' | 'success' | 'none';
		content?: Snippet;
		details?: Snippet;
		footer?: Snippet;
		children?: Snippet;
		onconfirm?: () => void;
		oncancel?: () => void;
	}

	let {
		isOpen = $bindable(false),
		title = 'Confirm Action',
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		confirmVariant = 'primary',
		loading = false,
		loadingText = 'Processing...',
		icon = 'warning',
		content,
		details,
		footer,
		children,
		onconfirm,
		oncancel
	}: Props = $props();

	function handleConfirm() {
		onconfirm?.();
	}

	function handleCancel() {
		oncancel?.();
	}

	// Icon mapping
	const icons = {
		warning: TriangleAlert,
		danger: CircleAlert,
		info: Info,
		success: CircleCheck,
		none: null
	};

	// Icon colors - semantic Inkprint tokens (no dark: overrides needed)
	const iconColors = {
		warning: 'text-warning bg-warning/15',
		danger: 'text-destructive bg-destructive/15',
		info: 'text-info bg-info/15',
		success: 'text-success bg-success/15',
		none: ''
	};

	let IconComponent = $derived(icons[icon]);
	let iconClasses = $derived(iconColors[icon]);
	// Destructive and warning confirmations should announce themselves to screen
	// readers immediately ("Delete project? This cannot be undone."). Other
	// confirmations use the standard dialog role.
	const dialogRole = $derived<'dialog' | 'alertdialog'>(
		icon === 'danger' || icon === 'warning' ? 'alertdialog' : 'dialog'
	);
</script>

<Modal
	bind:isOpen
	onClose={handleCancel}
	{title}
	size="sm"
	role={dialogRole}
	closeOnBackdrop={!loading}
	closeOnEscape={!loading}
	persistent={loading}
>
	{#snippet children()}
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
					<!-- Main Content Snippet -->
					{#if content}
						{@render content()}
					{:else if children}
						<p class="text-sm text-muted-foreground">
							{@render children()}
						</p>
					{:else}
						<p class="text-sm text-muted-foreground">
							Are you sure you want to proceed with this action?
						</p>
					{/if}

					<!-- Details Snippet -->
					{#if details}
						{@render details()}
					{/if}
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		{#if footer}
			{@render footer()}
		{:else}
			<div
				class="flex flex-col sm:flex-row gap-3 sm:justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border bg-muted/30"
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
		{/if}
	{/snippet}
</Modal>
