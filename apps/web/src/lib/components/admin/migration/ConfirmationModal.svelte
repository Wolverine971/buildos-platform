<!-- apps/web/src/lib/components/admin/migration/ConfirmationModal.svelte -->
<!-- Confirmation dialog for destructive actions (platform-wide migration, rollback, etc.) -->
<script lang="ts">
	import { AlertTriangle, Info, CheckCircle, DollarSign, Clock, Zap } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type ConfirmationType = 'danger' | 'warning' | 'info';

	export interface CostEstimate {
		tokens: number;
		cost: number;
		estimatedDuration: string;
		model?: string;
	}

	let {
		isOpen = $bindable(false),
		type = 'warning',
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmText = '',
		isLoading = false,
		details,
		costEstimate,
		showCostEstimate = false,
		onConfirm,
		onCancel
	}: {
		isOpen?: boolean;
		type?: ConfirmationType;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmText?: string; // If set, user must type this to confirm
		isLoading?: boolean;
		details?: { label: string; value: string | number }[];
		costEstimate?: CostEstimate | null;
		showCostEstimate?: boolean;
		onConfirm: () => void;
		onCancel?: () => void;
	} = $props();

	let inputValue = $state('');

	const canConfirm = $derived(!confirmText || inputValue === confirmText);

	function handleConfirm() {
		if (canConfirm && !isLoading) {
			onConfirm();
		}
	}

	function handleCancel() {
		inputValue = '';
		isOpen = false;
		onCancel?.();
	}

	function getIcon() {
		switch (type) {
			case 'danger':
				return AlertTriangle;
			case 'warning':
				return AlertTriangle;
			case 'info':
				return Info;
			default:
				return CheckCircle;
		}
	}

	function getIconColor() {
		switch (type) {
			case 'danger':
				return 'text-rose-600 dark:text-rose-400';
			case 'warning':
				return 'text-amber-600 dark:text-amber-400';
			case 'info':
				return 'text-blue-600 dark:text-blue-400';
			default:
				return 'text-emerald-600 dark:text-emerald-400';
		}
	}

	function getConfirmButtonVariant(): 'primary' | 'danger' {
		return type === 'danger' ? 'danger' : 'primary';
	}

	const Icon = $derived(getIcon());
</script>

<Modal bind:isOpen size="md" title="" variant="center" onClose={handleCancel}>
	<div class="p-6 text-center">
		<!-- Icon -->
		<div
			class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full {type ===
			'danger'
				? 'bg-rose-100 dark:bg-rose-900/30'
				: type === 'warning'
					? 'bg-amber-100 dark:bg-amber-900/30'
					: 'bg-blue-100 dark:bg-blue-900/30'}"
		>
			<Icon class="h-6 w-6 {getIconColor()}" />
		</div>

		<!-- Title -->
		<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
			{title}
		</h3>

		<!-- Message -->
		<p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
			{message}
		</p>

		<!-- Details -->
		{#if details && details.length > 0}
			<div
				class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="space-y-2 text-left">
					{#each details as detail}
						<div class="flex justify-between text-sm">
							<span class="text-gray-600 dark:text-gray-400">{detail.label}</span>
							<span class="font-medium text-gray-900 dark:text-gray-100">
								{typeof detail.value === 'number'
									? detail.value.toLocaleString()
									: detail.value}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Cost Estimate -->
		{#if showCostEstimate && costEstimate}
			<div
				class="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20"
			>
				<div class="flex items-center justify-center gap-2 mb-2">
					<DollarSign class="h-4 w-4 text-purple-600 dark:text-purple-400" />
					<span class="text-sm font-medium text-purple-900 dark:text-purple-100">
						LLM Cost Estimate
					</span>
				</div>
				<div class="grid grid-cols-3 gap-3 text-center">
					<div>
						<div
							class="flex items-center justify-center gap-1 text-xs text-purple-600 dark:text-purple-400"
						>
							<Zap class="h-3 w-3" />
							Tokens
						</div>
						<p class="font-semibold text-purple-900 dark:text-purple-100">
							{costEstimate.tokens.toLocaleString()}
						</p>
					</div>
					<div>
						<div
							class="flex items-center justify-center gap-1 text-xs text-purple-600 dark:text-purple-400"
						>
							<DollarSign class="h-3 w-3" />
							Cost
						</div>
						<p class="font-semibold text-purple-900 dark:text-purple-100">
							${costEstimate.cost.toFixed(2)}
						</p>
					</div>
					<div>
						<div
							class="flex items-center justify-center gap-1 text-xs text-purple-600 dark:text-purple-400"
						>
							<Clock class="h-3 w-3" />
							Time
						</div>
						<p class="font-semibold text-purple-900 dark:text-purple-100">
							{costEstimate.estimatedDuration}
						</p>
					</div>
				</div>
				{#if costEstimate.model}
					<p class="mt-2 text-xs text-center text-purple-600 dark:text-purple-400">
						Using {costEstimate.model}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Confirmation Input -->
		{#if confirmText}
			<div class="mb-4">
				<p class="mb-2 text-sm text-gray-600 dark:text-gray-400">
					Type <strong class="text-gray-900 dark:text-gray-100">{confirmText}</strong> to confirm:
				</p>
				<input
					type="text"
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-purple-800"
					placeholder={confirmText}
					bind:value={inputValue}
					onkeydown={(e) => e.key === 'Enter' && handleConfirm()}
				/>
			</div>
		{/if}

		<!-- Buttons -->
		<div class="flex justify-center gap-3">
			<Button variant="outline" onclick={handleCancel} disabled={isLoading}>
				{cancelLabel}
			</Button>
			<Button
				variant={getConfirmButtonVariant()}
				onclick={handleConfirm}
				disabled={!canConfirm}
				loading={isLoading}
			>
				{confirmLabel}
			</Button>
		</div>
	</div>
</Modal>
